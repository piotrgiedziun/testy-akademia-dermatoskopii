import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button, Modal } from '@/components/ui';
import { ImageViewer } from '@/components/image-viewer';
import { Timer } from '@/components/timer';
import type { Test, Case, TestAnswer } from '@/types';

interface QuizQuestionProps {
  test: Test;
  currentCase: Case;
  currentIndex: number;
  totalQuestions: number;
  answers: TestAnswer[];
  selectedAnswers: string[];
  onSelectAnswer: (answers: string[]) => void;
  onSubmit: () => void;
  onImageLoad: () => void;
  timeRemaining: number;
  timeSpent: number;
  timerActive: boolean;
  onTimeUpdate: (timeRemaining: number, timeSpent: number) => void;
  onTimeout: () => void;
}

export function QuizQuestion({
  test,
  currentCase,
  currentIndex,
  totalQuestions,
  answers,
  selectedAnswers,
  onSelectAnswer,
  onSubmit,
  onImageLoad,
  timeRemaining,
  timeSpent,
  timerActive,
  onTimeUpdate,
  onTimeout,
}: QuizQuestionProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [showAnswerModal, setShowAnswerModal] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const getLocalizedText = (text: { pl: string; en: string }) => {
    return i18n.language === 'pl' ? text.pl : text.en;
  };

  const handleAnswerSelect = (answerId: string) => {
    if (test.answerType === 'single') {
      onSelectAnswer([answerId]);
    } else {
      if (selectedAnswers.includes(answerId)) {
        onSelectAnswer(selectedAnswers.filter((id) => id !== answerId));
      } else {
        onSelectAnswer([...selectedAnswers, answerId]);
      }
    }
  };

  const handleSubmit = () => {
    setShowAnswerModal(false);
    onSubmit();
  };

  const handleExit = () => {
    setShowExitConfirm(true);
  };

  const confirmExit = () => {
    navigate('/levels');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm px-4 py-3 safe-area-inset-top">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            onClick={handleExit}
            className="p-2 -ml-2 text-gray-500 hover:text-charcoal"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="text-center" data-testid="quiz-progress">
            <span className="text-sm text-gray-500">
              {t('quiz.question')} {currentIndex + 1} {t('quiz.of')} {totalQuestions}
            </span>
          </div>

          <div className="w-10" />
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-gray-200 h-1">
        <div
          className="bg-primary h-full transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / totalQuestions) * 100}%` }}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-4">
          {/* Timer */}
          {test.timerMode !== 'none' && (
            <div className="mb-4">
              <Timer
                mode={test.timerMode}
                initialTime={test.timePerQuestion}
                timeRemaining={timeRemaining}
                timeSpent={timeSpent}
                isActive={timerActive}
                onTimeUpdate={onTimeUpdate}
                onTimeout={onTimeout}
              />
            </div>
          )}

          {/* Image viewer */}
          <div data-testid="case-image">
            <ImageViewer images={currentCase.images} onImageLoad={onImageLoad} />
          </div>

          {/* Answer button */}
          <div className="mt-4">
            <Button fullWidth size="lg" onClick={() => setShowAnswerModal(true)}>
              {t('quiz.showAnswers')}
            </Button>
          </div>
        </div>
      </div>

      {/* Answer selection modal */}
      <Modal
        isOpen={showAnswerModal}
        onClose={() => setShowAnswerModal(false)}
        title={t('quiz.selectAnswer')}
        size="lg"
      >
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {answers.map((answer) => {
            const isSelected = selectedAnswers.includes(answer.id);
            return (
              <button
                key={answer.id}
                onClick={() => handleAnswerSelect(answer.id)}
                data-testid="answer-option"
                className={`
                  w-full text-left p-3 rounded-lg border-2 transition-all
                  ${isSelected
                    ? 'border-primary bg-primary bg-opacity-5'
                    : 'border-gray-200 hover:border-gray-300'
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`
                      w-5 h-5 rounded-full border-2 flex items-center justify-center
                      ${isSelected ? 'border-primary bg-primary' : 'border-gray-300'}
                    `}
                  >
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                  <span className="font-medium">{getLocalizedText(answer.name)}</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <Button
            fullWidth
            size="lg"
            onClick={handleSubmit}
            disabled={selectedAnswers.length === 0}
          >
            {t('quiz.submit')}
          </Button>
        </div>
      </Modal>

      {/* Exit confirmation modal */}
      <Modal
        isOpen={showExitConfirm}
        onClose={() => setShowExitConfirm(false)}
        title={t('common.confirm')}
        size="sm"
      >
        <p className="text-gray-600 mb-4">{t('quiz.exitConfirm')}</p>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            fullWidth
            onClick={() => setShowExitConfirm(false)}
          >
            {t('common.cancel')}
          </Button>
          <Button variant="danger" fullWidth onClick={confirmExit}>
            {t('common.yes')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
