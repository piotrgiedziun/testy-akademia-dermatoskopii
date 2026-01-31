import { describe, it, expect } from 'vitest';
import {
  calculateScore,
  calculateAccuracy,
  getCorrectCount,
  getIncorrectCount,
  getTimedOutCount,
  getMissedCases,
} from './scoring';
import type { UserAnswer } from '@/types';

const createAnswer = (overrides: Partial<UserAnswer> = {}): UserAnswer => ({
  caseId: 'case1',
  selectedAnswers: [],
  timeSpent: 10,
  correct: false,
  timedOut: false,
  ...overrides,
});

describe('calculateScore', () => {
  it('should return 0 for empty answers', () => {
    expect(calculateScore([], 10)).toBe(0);
  });

  it('should calculate score based on correct answers', () => {
    const answers = [
      createAnswer({ correct: true }),
      createAnswer({ correct: false }),
      createAnswer({ correct: true }),
    ];
    expect(calculateScore(answers, 10)).toBe(20);
  });

  it('should use custom points per correct', () => {
    const answers = [
      createAnswer({ correct: true }),
      createAnswer({ correct: true }),
    ];
    expect(calculateScore(answers, 5)).toBe(10);
  });
});

describe('calculateAccuracy', () => {
  it('should return 0 for empty answers', () => {
    expect(calculateAccuracy([])).toBe(0);
  });

  it('should calculate percentage correctly', () => {
    const answers = [
      createAnswer({ correct: true }),
      createAnswer({ correct: true }),
      createAnswer({ correct: false }),
      createAnswer({ correct: false }),
    ];
    expect(calculateAccuracy(answers)).toBe(50);
  });

  it('should round to nearest integer', () => {
    const answers = [
      createAnswer({ correct: true }),
      createAnswer({ correct: false }),
      createAnswer({ correct: false }),
    ];
    expect(calculateAccuracy(answers)).toBe(33);
  });
});

describe('getCorrectCount', () => {
  it('should return 0 for empty answers', () => {
    expect(getCorrectCount([])).toBe(0);
  });

  it('should count correct answers', () => {
    const answers = [
      createAnswer({ correct: true }),
      createAnswer({ correct: false }),
      createAnswer({ correct: true }),
    ];
    expect(getCorrectCount(answers)).toBe(2);
  });
});

describe('getIncorrectCount', () => {
  it('should count incorrect non-timed-out answers', () => {
    const answers = [
      createAnswer({ correct: false, timedOut: false }),
      createAnswer({ correct: false, timedOut: true }),
      createAnswer({ correct: true }),
    ];
    expect(getIncorrectCount(answers)).toBe(1);
  });
});

describe('getTimedOutCount', () => {
  it('should count timed out answers', () => {
    const answers = [
      createAnswer({ timedOut: true }),
      createAnswer({ timedOut: false }),
      createAnswer({ timedOut: true }),
    ];
    expect(getTimedOutCount(answers)).toBe(2);
  });
});

describe('getMissedCases', () => {
  it('should return case IDs of incorrect answers', () => {
    const answers = [
      createAnswer({ caseId: 'case1', correct: true }),
      createAnswer({ caseId: 'case2', correct: false }),
      createAnswer({ caseId: 'case3', correct: false, timedOut: true }),
    ];
    expect(getMissedCases(answers)).toEqual(['case2', 'case3']);
  });
});
