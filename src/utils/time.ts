export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (secs === 0) {
    return `${mins}m`;
  }
  return `${mins}m ${secs}s`;
}

export function getTotalTimeSpent(answers: { timeSpent: number }[]): number {
  return answers.reduce((total, answer) => total + answer.timeSpent, 0);
}

export function getAverageTimePerQuestion(answers: { timeSpent: number }[]): number {
  if (answers.length === 0) return 0;
  return Math.round(getTotalTimeSpent(answers) / answers.length);
}
