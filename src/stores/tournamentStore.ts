import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Test, Case, UserAnswer, TestAnswer, Tournament } from '@/types';
import { getTest, getCasesByTest } from '@/services/firebase/firestore';
import {
  getTournament,
  createTournamentAttempt,
  addTournamentAnswer,
  completeTournamentAttempt,
  getTournamentAttempt,
} from '@/services/firebase/tournamentFirestore';

interface TournamentQuizState {
  // Tournament context
  tournamentId: string | null;
  tournament: Tournament | null;
  participantName: string | null;

  // Quiz state
  attemptId: string | null;
  test: Test | null;
  cases: Case[];
  answers: TestAnswer[];
  currentCaseIndex: number;
  userAnswers: UserAnswer[];

  // UI state
  isLoading: boolean;
  imagesPreloaded: boolean;

  // Timer state
  timeRemaining: number;
  timeSpent: number;
  timerActive: boolean;

  // Actions
  loadTournament: (uuid: string) => Promise<Tournament | null>;
  startTournamentQuiz: (participantName: string) => Promise<void>;
  resumeTournamentQuiz: () => Promise<void>;
  setImagesPreloaded: (preloaded: boolean) => void;
  submitAnswer: (selectedAnswers: string[], timeSpent: number) => Promise<void>;
  nextQuestion: () => void;
  finishQuiz: () => Promise<void>;
  resetTournament: () => void;
  handleTimeout: () => Promise<void>;

  // Timer actions
  startTimer: () => void;
  stopTimer: () => void;
  setTimeRemaining: (time: number) => void;
  setTimeSpent: (time: number) => void;
}

const initialState = {
  tournamentId: null,
  tournament: null,
  participantName: null,
  attemptId: null,
  test: null,
  cases: [],
  answers: [],
  currentCaseIndex: 0,
  userAnswers: [],
  isLoading: false,
  imagesPreloaded: false,
  timeRemaining: 0,
  timeSpent: 0,
  timerActive: false,
};

export const useTournamentStore = create<TournamentQuizState>()(
  persist(
    (set, get) => ({
      ...initialState,

      loadTournament: async (uuid: string) => {
        set({ isLoading: true });
        try {
          const tournament = await getTournament(uuid);
          if (!tournament) {
            set({ isLoading: false });
            return null;
          }

          const [test, cases] = await Promise.all([
            getTest(tournament.testId),
            getCasesByTest(tournament.testId),
          ]);

          set({
            tournamentId: uuid,
            tournament,
            test,
            cases,
            answers: test?.answers || [],
            isLoading: false,
          });

          return tournament;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      startTournamentQuiz: async (participantName: string) => {
        const { tournamentId, test } = get();
        if (!tournamentId || !test) return;

        const attemptId = await createTournamentAttempt(
          tournamentId,
          participantName
        );

        set({
          participantName,
          attemptId,
          currentCaseIndex: 0,
          userAnswers: [],
          imagesPreloaded: false,
          timeRemaining:
            test.timerMode === 'countdown' ? test.timePerQuestion : 0,
          timeSpent: 0,
          timerActive: false,
        });
      },

      resumeTournamentQuiz: async () => {
        const { tournamentId, attemptId } = get();
        if (!tournamentId || !attemptId) return;

        set({ isLoading: true });
        try {
          const [tournament, attempt] = await Promise.all([
            getTournament(tournamentId),
            getTournamentAttempt(tournamentId, attemptId),
          ]);

          if (!tournament || !attempt || attempt.completedAt) {
            set(initialState);
            return;
          }

          const [test, cases] = await Promise.all([
            getTest(tournament.testId),
            getCasesByTest(tournament.testId),
          ]);

          if (!test) {
            set(initialState);
            return;
          }

          const answeredCaseIds = new Set(
            attempt.answers.map((a) => a.caseId)
          );
          const currentCaseIndex = cases.findIndex(
            (c) => !answeredCaseIds.has(c.id)
          );

          set({
            tournament,
            test,
            cases,
            answers: test.answers || [],
            userAnswers: attempt.answers,
            participantName: attempt.participantName,
            currentCaseIndex:
              currentCaseIndex >= 0 ? currentCaseIndex : cases.length,
            isLoading: false,
            imagesPreloaded: false,
            timeRemaining:
              test.timerMode === 'countdown' ? test.timePerQuestion : 0,
            timeSpent: 0,
            timerActive: false,
          });
        } catch (error) {
          set({ ...initialState });
          throw error;
        }
      },

      setImagesPreloaded: (preloaded: boolean) => {
        set({ imagesPreloaded: preloaded });
        if (preloaded) {
          const { test } = get();
          if (test?.timerMode !== 'none') {
            set({ timerActive: true });
          }
        }
      },

      submitAnswer: async (
        selectedAnswers: string[],
        timeSpent: number
      ) => {
        const {
          cases,
          currentCaseIndex,
          userAnswers,
          test,
          attemptId,
          tournamentId,
        } = get();
        if (!test || !attemptId || !tournamentId) return;

        const currentCase = cases[currentCaseIndex];
        const isCorrect =
          selectedAnswers.length === currentCase.correctAnswers.length &&
          selectedAnswers.every((a) =>
            currentCase.correctAnswers.includes(a)
          );

        const answer: UserAnswer = {
          caseId: currentCase.id,
          selectedAnswers,
          timeSpent,
          correct: isCorrect,
          timedOut: false,
        };

        await addTournamentAnswer(
          tournamentId,
          attemptId,
          answer,
          userAnswers,
          test.pointsPerCorrect
        );

        const newAnswers = [...userAnswers, answer];
        set({
          userAnswers: newAnswers,
          timerActive: false,
        });
      },

      nextQuestion: () => {
        const { currentCaseIndex, cases, test } = get();
        const nextIndex = currentCaseIndex + 1;

        if (nextIndex >= cases.length) return;

        set({
          currentCaseIndex: nextIndex,
          imagesPreloaded: false,
          timeRemaining:
            test?.timerMode === 'countdown' ? test.timePerQuestion : 0,
          timeSpent: 0,
          timerActive: false,
        });
      },

      finishQuiz: async () => {
        const { attemptId, userAnswers, test, tournamentId } = get();
        if (!attemptId || !test || !tournamentId) return;

        await completeTournamentAttempt(
          tournamentId,
          attemptId,
          userAnswers,
          test.pointsPerCorrect
        );
      },

      resetTournament: () => {
        set(initialState);
      },

      handleTimeout: async () => {
        const {
          cases,
          currentCaseIndex,
          userAnswers,
          test,
          attemptId,
          tournamentId,
          timeSpent,
        } = get();
        if (!test || !attemptId || !tournamentId) return;

        const currentCase = cases[currentCaseIndex];
        const answer: UserAnswer = {
          caseId: currentCase.id,
          selectedAnswers: [],
          timeSpent,
          correct: false,
          timedOut: true,
        };

        await addTournamentAnswer(
          tournamentId,
          attemptId,
          answer,
          userAnswers,
          test.pointsPerCorrect
        );

        const newAnswers = [...userAnswers, answer];
        set({
          userAnswers: newAnswers,
          timerActive: false,
        });
      },

      startTimer: () => set({ timerActive: true }),
      stopTimer: () => set({ timerActive: false }),
      setTimeRemaining: (time: number) => set({ timeRemaining: time }),
      setTimeSpent: (time: number) => set({ timeSpent: time }),
    }),
    {
      name: 'tournament-storage',
      partialize: (state) => ({
        tournamentId: state.tournamentId,
        attemptId: state.attemptId,
        participantName: state.participantName,
        currentCaseIndex: state.currentCaseIndex,
        userAnswers: state.userAnswers,
      }),
    }
  )
);
