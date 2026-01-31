import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuizStore, useAuthStore } from '@/stores';
import { Loading } from '@/components/ui';
import { QuizQuestion } from './QuizQuestion';
import { QuizFeedback } from './QuizFeedback';

export function QuizPage() {
  const { t } = useTranslation();
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    test,
    cases,
    currentCaseIndex,
    isLoading,
    showFeedback,
    currentAnswer,
    startQuiz,
    nextQuestion,
    finishQuiz,
    timeRemaining,
    timeSpent,
    setTimeRemaining,
    setTimeSpent,
    timerActive,
    setImagesPreloaded,
    submitAnswer,
    handleTimeout,
    answers,
  } = useQuizStore();

  const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);

  useEffect(() => {
    if (!testId || !user) {
      navigate('/levels');
      return;
    }

    startQuiz(testId, user.uid).catch((error) => {
      console.error('Error starting quiz:', error);
      navigate('/levels');
    });
  }, [testId, user, navigate, startQuiz]);

  const handleTimeUpdate = useCallback(
    (newTimeRemaining: number, newTimeSpent: number) => {
      setTimeRemaining(newTimeRemaining);
      setTimeSpent(newTimeSpent);
    },
    [setTimeRemaining, setTimeSpent]
  );

  const handleTimeoutCallback = useCallback(async () => {
    if (!user) return;
    await handleTimeout(user.uid);
  }, [user, handleTimeout]);

  const handleSubmitAnswer = async () => {
    if (!user) return;
    await submitAnswer(selectedAnswers, timeSpent, user.uid);
    setSelectedAnswers([]);
  };

  const handleNext = async () => {
    if (!user) return;

    if (currentCaseIndex >= cases.length - 1) {
      await finishQuiz(user.uid);
      navigate(`/results/${useQuizStore.getState().attemptId}`);
    } else {
      nextQuestion();
    }
  };

  const handleImageLoad = useCallback(() => {
    setImagesPreloaded(true);
  }, [setImagesPreloaded]);

  if (isLoading || !test || cases.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loading size="lg" text={t('common.loading')} />
      </div>
    );
  }

  const currentCase = cases[currentCaseIndex];

  if (showFeedback && currentAnswer) {
    return (
      <QuizFeedback
        currentCase={currentCase}
        userAnswer={currentAnswer}
        answers={answers}
        test={test}
        onNext={handleNext}
        isLastQuestion={currentCaseIndex >= cases.length - 1}
      />
    );
  }

  return (
    <QuizQuestion
      test={test}
      currentCase={currentCase}
      currentIndex={currentCaseIndex}
      totalQuestions={cases.length}
      answers={answers}
      selectedAnswers={selectedAnswers}
      onSelectAnswer={setSelectedAnswers}
      onSubmit={handleSubmitAnswer}
      onImageLoad={handleImageLoad}
      timeRemaining={timeRemaining}
      timeSpent={timeSpent}
      timerActive={timerActive}
      onTimeUpdate={handleTimeUpdate}
      onTimeout={handleTimeoutCallback}
    />
  );
}
