import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTournamentStore } from '@/stores';
import { Loading } from '@/components/ui';
import { QuizQuestion } from '@/features/quiz/QuizQuestion';

export function TournamentQuizPage() {
  const { t } = useTranslation();
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();

  const {
    test,
    cases,
    currentCaseIndex,
    isLoading,
    answers,
    tournamentId,
    attemptId,
    timeRemaining,
    timeSpent,
    timerActive,
    setTimeRemaining,
    setTimeSpent,
    setImagesPreloaded,
    submitAnswer,
    handleTimeout,
    resumeTournamentQuiz,
  } = useTournamentStore();

  const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!uuid) {
      navigate('/');
      return;
    }

    if (!attemptId) {
      // No active attempt — redirect to entry
      navigate(`/tournament/${uuid}`);
      return;
    }

    // If we have persisted state but no test loaded (page refresh), resume
    if (tournamentId === uuid && attemptId && !test) {
      resumeTournamentQuiz().catch(() => {
        navigate(`/tournament/${uuid}`);
      });
    }
  }, [uuid, attemptId, test, tournamentId]);

  const handleTimeUpdate = useCallback(
    (newTimeRemaining: number, newTimeSpent: number) => {
      setTimeRemaining(newTimeRemaining);
      setTimeSpent(newTimeSpent);
    },
    [setTimeRemaining, setTimeSpent]
  );

  const handleTimeoutCallback = useCallback(async () => {
    await handleTimeout();
    // No feedback — auto-advance
    await advanceOrFinish();
  }, [handleTimeout]);

  const advanceOrFinish = async () => {
    const state = useTournamentStore.getState();
    if (state.currentCaseIndex >= state.cases.length - 1) {
      await state.finishQuiz();
      navigate(
        `/tournament/${uuid}/results/${state.attemptId}`
      );
    } else {
      state.nextQuestion();
    }
  };

  const handleSubmitAnswer = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await submitAnswer(selectedAnswers, timeSpent);
      setSelectedAnswers([]);
      // No feedback — auto-advance to next question or finish
      await advanceOrFinish();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImageLoad = useCallback(() => {
    setImagesPreloaded(true);
  }, [setImagesPreloaded]);

  const handleExit = () => {
    useTournamentStore.getState().resetTournament();
    navigate(`/tournament/${uuid}`);
  };

  if (isLoading || !test || cases.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loading size="lg" text={t('common.loading')} />
      </div>
    );
  }

  const currentCase = cases[currentCaseIndex];
  if (!currentCase) {
    // All questions answered, finishing
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loading size="lg" text={t('common.loading')} />
      </div>
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
      onExit={handleExit}
    />
  );
}
