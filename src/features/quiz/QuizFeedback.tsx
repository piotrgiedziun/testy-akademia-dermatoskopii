import { useState } from 'react';
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
}

export function QuizFeedback({
  currentCase,
  userAnswer,
  answers,
  test,
  onNext,
  isLastQuestion,
}: QuizFeedbackProps) {
  const { t, i18n } = useTranslation();
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);

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
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div
        className={`px-4 py-4 safe-area-inset-top ${
          userAnswer.timedOut
            ? 'bg-orange-500'
            : userAnswer.correct
            ? 'bg-green-500'
            : 'bg-red-500'
        }`}
      >
        <div className="max-w-4xl mx-auto text-center text-white">
          <div className="text-2xl font-bold mb-1">
            {userAnswer.timedOut
              ? t('quiz.timedOut')
              : userAnswer.correct
              ? t('quiz.correct')
              : t('quiz.incorrect')}
          </div>
          <div className="text-lg opacity-90">
            +{pointsEarned} {t('quiz.points')}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-4 space-y-4">
          {/* Image with annotations */}
          <div className="relative">
            <ImageViewer images={currentCase.images}>
              {hasAnnotations && (
                <AnnotationOverlay
                  annotations={currentCase.annotations || []}
                  visible={showAnnotations}
                  imageWidth={1000}
                  imageHeight={1000}
                />
              )}
            </ImageViewer>

            {hasAnnotations && (
              <div className="mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAnnotations(!showAnnotations)}
                >
                  {showAnnotations ? t('quiz.hideAnnotations') : t('quiz.showAnnotations')}
                </Button>
              </div>
            )}
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
            <Card className="space-y-4">
              {/* Main explanation */}
              <div>
                <p className="text-gray-700">{getLocalizedText(currentCase.explanation)}</p>
              </div>

              {/* Features */}
              {currentCase.features.length > 0 && (
                <div>
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
