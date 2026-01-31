import type { UserAnswer } from '@/types';

export function calculateScore(answers: UserAnswer[], pointsPerCorrect: number): number {
  return answers.filter((a) => a.correct).length * pointsPerCorrect;
}

export function calculateAccuracy(answers: UserAnswer[]): number {
  if (answers.length === 0) return 0;
  const correct = answers.filter((a) => a.correct).length;
  return Math.round((correct / answers.length) * 100);
}

export function getCorrectCount(answers: UserAnswer[]): number {
  return answers.filter((a) => a.correct).length;
}

export function getIncorrectCount(answers: UserAnswer[]): number {
  return answers.filter((a) => !a.correct && !a.timedOut).length;
}

export function getTimedOutCount(answers: UserAnswer[]): number {
  return answers.filter((a) => a.timedOut).length;
}

export function getMissedCases(answers: UserAnswer[]): string[] {
  return answers.filter((a) => !a.correct).map((a) => a.caseId);
}
