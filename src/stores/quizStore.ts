import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Test, Case, UserAnswer, TestAnswer } from '@/types';
import {
  getTest,
  getCasesByTest,
  createTestAttempt,
  addAnswerToAttempt,
  getTestAttempt,
  completeTestAttempt,
} from '@/services/firebase/firestore';

interface QuizState {
  // Current quiz state
  testId: string | null;
  attemptId: string | null;
  test: Test | null;
  cases: Case[];
  answers: TestAnswer[]; // answers from test document
  currentCaseIndex: number;
  userAnswers: UserAnswer[];

  // UI state
  isLoading: boolean;
  imagesPreloaded: boolean;
  showFeedback: boolean;
  currentAnswer: UserAnswer | null;

  // Timer state
  timeRemaining: number;
  timeSpent: number;
  timerActive: boolean;

  // Actions
  startQuiz: (testId: string, userId: string) => Promise<void>;
  resumeQuiz: (testId: string, attemptId: string, userId: string) => Promise<void>;
  setImagesPreloaded: (preloaded: boolean) => void;
  submitAnswer: (selectedAnswers: string[], timeSpent: number, userId: string) => Promise<void>;
  nextQuestion: () => void;
  finishQuiz: (userId: string) => Promise<void>;
  resetQuiz: () => void;

  // Timer actions
  startTimer: () => void;
  stopTimer: () => void;
  setTimeRemaining: (time: number) => void;
  setTimeSpent: (time: number) => void;
  handleTimeout: (userId: string) => Promise<void>;
}

const initialState = {
  testId: null,
  attemptId: null,
  test: null,
  cases: [],
  answers: [],
  currentCaseIndex: 0,
  userAnswers: [],
  isLoading: false,
  imagesPreloaded: false,
  showFeedback: false,
  currentAnswer: null,
  timeRemaining: 0,
  timeSpent: 0,
  timerActive: false,
};

export const useQuizStore = create<QuizState>()(
  persist(
    (set, get) => ({
      ...initialState,

      startQuiz: async (testId: string, userId: string) => {
        set({ isLoading: true });
        try {
          const [test, cases] = await Promise.all([
            getTest(testId),
            getCasesByTest(testId),
          ]);

          if (!test) throw new Error('Test not found');

          const attemptId = await createTestAttempt(userId, testId);

          set({
            testId,
            attemptId,
            test,
            cases,
            answers: test.answers || [],
            currentCaseIndex: 0,
            userAnswers: [],
            isLoading: false,
            imagesPreloaded: false,
            showFeedback: false,
            currentAnswer: null,
            timeRemaining: test.timerMode === 'countdown' ? test.timePerQuestion : 0,
            timeSpent: 0,
            timerActive: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      resumeQuiz: async (testId: string, attemptId: string, userId: string) => {
        set({ isLoading: true });
        try {
          const [test, cases, attempt] = await Promise.all([
            getTest(testId),
            getCasesByTest(testId),
            getTestAttempt(userId, attemptId),
          ]);

          if (!test || !attempt) throw new Error('Test or attempt not found');

          const answeredCaseIds = new Set(attempt.answers.map((a) => a.caseId));
          const currentCaseIndex = cases.findIndex((c) => !answeredCaseIds.has(c.id));

          set({
            testId,
            attemptId,
            test,
            cases,
            answers: test.answers || [],
            currentCaseIndex: currentCaseIndex >= 0 ? currentCaseIndex : cases.length,
            userAnswers: attempt.answers,
            isLoading: false,
            imagesPreloaded: false,
            showFeedback: false,
            currentAnswer: null,
            timeRemaining: test.timerMode === 'countdown' ? test.timePerQuestion : 0,
            timeSpent: 0,
            timerActive: false,
          });
        } catch (error) {
          set({ isLoading: false });
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

      submitAnswer: async (selectedAnswers: string[], timeSpent: number, userId: string) => {
        const { cases, currentCaseIndex, userAnswers, test, attemptId } = get();
        if (!test || !attemptId) return;

        const currentCase = cases[currentCaseIndex];
        const isCorrect =
          selectedAnswers.length === currentCase.correctAnswers.length &&
          selectedAnswers.every((a) => currentCase.correctAnswers.includes(a));

        const answer: UserAnswer = {
          caseId: currentCase.id,
          selectedAnswers,
          timeSpent,
          correct: isCorrect,
          timedOut: false,
        };

        await addAnswerToAttempt(userId, attemptId, answer, userAnswers, test.pointsPerCorrect);

        set({
          currentAnswer: answer,
          userAnswers: [...userAnswers, answer],
          showFeedback: true,
          timerActive: false,
        });
      },

      nextQuestion: () => {
        const { currentCaseIndex, cases, test } = get();
        const nextIndex = currentCaseIndex + 1;

        if (nextIndex >= cases.length) {
          // Quiz finished, handled by finishQuiz
          return;
        }

        set({
          currentCaseIndex: nextIndex,
          showFeedback: false,
          currentAnswer: null,
          imagesPreloaded: false,
          timeRemaining: test?.timerMode === 'countdown' ? test.timePerQuestion : 0,
          timeSpent: 0,
          timerActive: false,
        });
      },

      finishQuiz: async (userId: string) => {
        const { attemptId, userAnswers, test } = get();
        if (!attemptId || !test) return;

        await completeTestAttempt(userId, attemptId, userAnswers, test.pointsPerCorrect);

        set(initialState);
      },

      resetQuiz: () => {
        set(initialState);
      },

      startTimer: () => set({ timerActive: true }),
      stopTimer: () => set({ timerActive: false }),
      setTimeRemaining: (time: number) => set({ timeRemaining: time }),
      setTimeSpent: (time: number) => set({ timeSpent: time }),

      handleTimeout: async (userId: string) => {
        const { cases, currentCaseIndex, userAnswers, test, attemptId, timeSpent } = get();
        if (!test || !attemptId) return;

        const currentCase = cases[currentCaseIndex];

        const answer: UserAnswer = {
          caseId: currentCase.id,
          selectedAnswers: [],
          timeSpent,
          correct: false,
          timedOut: true,
        };

        await addAnswerToAttempt(userId, attemptId, answer, userAnswers, test.pointsPerCorrect);

        set({
          currentAnswer: answer,
          userAnswers: [...userAnswers, answer],
          showFeedback: true,
          timerActive: false,
        });
      },
    }),
    {
      name: 'quiz-storage',
      partialize: (state) => ({
        testId: state.testId,
        attemptId: state.attemptId,
        currentCaseIndex: state.currentCaseIndex,
        userAnswers: state.userAnswers,
      }),
    }
  )
);
