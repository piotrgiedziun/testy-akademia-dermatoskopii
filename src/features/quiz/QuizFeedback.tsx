import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card } from '@/components/ui';
import { ImageViewer } from '@/components/image-viewer';
import { AnnotationOverlay } from '@/components/annotations';
import type { Case, UserAnswer, TestAnswer, Test } from '@/types';

interface QuizFeedbackProps {
  currentCase: Case;
  userAnswer: UserAnswer;
  answers: TestAnswer[];
  test: Test;
  onNext: () => void;
  isLastQuestion: boolean;
  currentIndex: number;
  totalQuestions: number;
}

export function QuizFeedback({
  currentCase,
  userAnswer,
  answers,
  test,
  onNext,
  isLastQuestion,
  currentIndex,
  totalQuestions,
}: QuizFeedbackProps) {
  const { t, i18n } = useTranslation();
  const [showAnnotations, setShowAnnotations] = useState(true);  // Default to visible
  const [showExplanation, setShowExplanation] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [showFeedbackBanner, setShowFeedbackBanner] = useState(true);

  // Auto-hide feedback banner after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowFeedbackBanner(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  // Load actual image dimensions for accurate annotation overlay
  useEffect(() => {
    const imageUrl = currentCase.images[0]?.url;
    if (!imageUrl) return;

    const img = new Image();
    img.onload = () => {
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = imageUrl;
  }, [currentCase.images]);

  const getLocalizedText = (text: { pl: string; en: string }) => {
    return i18n.language === 'pl' ? text.pl : text.en;
  };

  const getAnswerName = (id: string) => {
    const answer = answers.find((a) => a.id === id);
    return answer ? getLocalizedText(answer.name) : id;
  };

  const correctAnswerNames = currentCase.correctAnswers.map(getAnswerName);
  const selectedAnswerNames = userAnswer.selectedAnswers.map(getAnswerName);

  const pointsEarned = userAnswer.correct ? test.pointsPerCorrect : 0;

  const hasAnnotations = currentCase.annotations && currentCase.annotations.length > 0;

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="quiz-feedback">
      {/* Header */}
      <div className="bg-white shadow-sm px-4 py-3 safe-area-inset-top">
        <div className="max-w-4xl mx-auto flex items-center justify-center">
          <div className="text-center" data-testid="quiz-progress">
            <span className="text-sm text-gray-500">
              {t('quiz.question')} {currentIndex + 1} {t('quiz.of')} {totalQuestions}
            </span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-gray-200 h-1">
        <div
          className="bg-primary h-full transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / totalQuestions) * 100}%` }}
        />
      </div>

      {/* Feedback Toast Overlay */}
      <div
        className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ease-out ${
          showFeedbackBanner
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 -translate-y-4 pointer-events-none'
        }`}
        data-testid={userAnswer.timedOut ? 'feedback-timeout' : userAnswer.correct ? 'feedback-correct' : 'feedback-incorrect'}
      >
        <div
          className={`flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg backdrop-blur-sm ${
            userAnswer.timedOut
              ? 'bg-orange-500/95 text-white'
              : userAnswer.correct
              ? 'bg-green-500/95 text-white'
              : 'bg-red-500/95 text-white'
          }`}
        >
          {/* Icon */}
          <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
            userAnswer.timedOut
              ? 'bg-orange-400/50'
              : userAnswer.correct
              ? 'bg-green-400/50'
              : 'bg-red-400/50'
          }`}>
            {userAnswer.timedOut ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : userAnswer.correct ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>

          {/* Text */}
          <div className="flex flex-col">
            <span className="font-semibold text-base">
              {userAnswer.timedOut
                ? t('quiz.timedOut')
                : userAnswer.correct
                ? t('quiz.correct')
                : t('quiz.incorrect')}
            </span>
            <span className="text-sm opacity-90">
              +{pointsEarned} {t('quiz.points', { count: pointsEarned })}
            </span>
          </div>

          {/* Dismiss button */}
          <button
            onClick={() => setShowFeedbackBanner(false)}
            className="flex-shrink-0 ml-2 p-1.5 hover:bg-white/20 rounded-lg transition-colors"
            aria-label={t('common.close')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-4 space-y-4">
          {/* Image with annotations */}
          <div className="relative">
            <ImageViewer
              images={currentCase.images}
              controls={
                hasAnnotations && imageDimensions ? (
                  <button
                    onClick={() => setShowAnnotations(!showAnnotations)}
                    className="p-2 bg-white bg-opacity-90 rounded-lg shadow hover:bg-opacity-100 transition-colors"
                    aria-label={showAnnotations ? t('quiz.hideAnnotations') : t('quiz.showAnnotations')}
                    data-testid="annotation-toggle"
                  >
                    {showAnnotations ? (
                      <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                ) : undefined
              }
            >
              {hasAnnotations && imageDimensions && (
                <AnnotationOverlay
                  annotations={currentCase.annotations || []}
                  visible={showAnnotations}
                  imageWidth={imageDimensions.width}
                  imageHeight={imageDimensions.height}
                />
              )}
            </ImageViewer>
          </div>

          {/* Answer summary */}
          <Card>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500 mb-1">{t('quiz.correctAnswer')}</p>
                <p className="font-semibold text-charcoal">
                  {correctAnswerNames.join(', ')}
                </p>
              </div>

              {!userAnswer.timedOut && (
                <div>
                  <p className="text-sm text-gray-500 mb-1">{t('quiz.yourAnswer')}</p>
                  <p
                    className={`font-semibold ${
                      userAnswer.correct ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {selectedAnswerNames.length > 0
                      ? selectedAnswerNames.join(', ')
                      : '-'}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Explanation toggle */}
          <Button
            variant="ghost"
            fullWidth
            onClick={() => setShowExplanation(!showExplanation)}
            className="flex items-center justify-between"
          >
            <span>{t('quiz.explain')}</span>
            <svg
              className={`w-5 h-5 transition-transform ${showExplanation ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </Button>

          {/* Explanation content */}
          {showExplanation && (
            <Card className="space-y-4" data-testid="explanation">
              {/* Main explanation */}
              <div>
                <p className="text-gray-700">{getLocalizedText(currentCase.explanation)}</p>
              </div>

              {/* Features */}
              {currentCase.features.length > 0 && (
                <div data-testid="features">
                  <h4 className="font-semibold text-charcoal mb-2">{t('quiz.features')}</h4>
                  <ul className="list-disc list-inside space-y-1 text-gray-700">
                    {currentCase.features.map((feature, index) => (
                      <li key={index}>{getLocalizedText(feature)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Differentials */}
              {currentCase.differentials.length > 0 && (
                <div>
                  <h4 className="font-semibold text-charcoal mb-2">
                    {t('quiz.differentials')}
                  </h4>
                  <ul className="list-disc list-inside space-y-1 text-gray-700">
                    {currentCase.differentials.map((diff, index) => (
                      <li key={index}>{getLocalizedText(diff)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Pitfall */}
              {currentCase.pitfall && (
                <div className="bg-orange-50 p-3 rounded-lg border border-orange-200">
                  <h4 className="font-semibold text-orange-800 mb-1">{t('quiz.pitfall')}</h4>
                  <p className="text-orange-700">{getLocalizedText(currentCase.pitfall)}</p>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-gray-100 p-4 mb-6 safe-area-inset-bottom">
        <div className="max-w-4xl mx-auto">
          <Button fullWidth size="lg" onClick={onNext}>
            {isLastQuestion ? t('quiz.finish') : t('quiz.next')}
          </Button>
        </div>
      </div>
    </div>
  );
}
