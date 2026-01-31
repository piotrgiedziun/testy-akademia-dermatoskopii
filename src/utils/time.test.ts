import { describe, it, expect } from 'vitest';
import { formatTime, formatDuration, getTotalTimeSpent, getAverageTimePerQuestion } from './time';

describe('formatTime', () => {
  it('should format seconds to MM:SS', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(30)).toBe('00:30');
    expect(formatTime(60)).toBe('01:00');
    expect(formatTime(90)).toBe('01:30');
    expect(formatTime(600)).toBe('10:00');
  });
});

describe('formatDuration', () => {
  it('should format short durations in seconds', () => {
    expect(formatDuration(30)).toBe('30s');
    expect(formatDuration(59)).toBe('59s');
  });

  it('should format longer durations in minutes', () => {
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(120)).toBe('2m');
  });

  it('should format mixed durations', () => {
    expect(formatDuration(90)).toBe('1m 30s');
    expect(formatDuration(150)).toBe('2m 30s');
  });
});

describe('getTotalTimeSpent', () => {
  it('should return 0 for empty array', () => {
    expect(getTotalTimeSpent([])).toBe(0);
  });

  it('should sum all timeSpent values', () => {
    const answers = [
      { timeSpent: 10 },
      { timeSpent: 20 },
      { timeSpent: 30 },
    ];
    expect(getTotalTimeSpent(answers)).toBe(60);
  });
});

describe('getAverageTimePerQuestion', () => {
  it('should return 0 for empty array', () => {
    expect(getAverageTimePerQuestion([])).toBe(0);
  });

  it('should calculate average correctly', () => {
    const answers = [
      { timeSpent: 10 },
      { timeSpent: 20 },
      { timeSpent: 30 },
    ];
    expect(getAverageTimePerQuestion(answers)).toBe(20);
  });

  it('should round to nearest integer', () => {
    const answers = [
      { timeSpent: 10 },
      { timeSpent: 11 },
    ];
    expect(getAverageTimePerQuestion(answers)).toBe(11);
  });
});
