import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTime } from '@/utils/time';

interface TimerProps {
  mode: 'countdown' | 'stopwatch' | 'none';
  initialTime: number;
  timeRemaining: number;
  timeSpent: number;
  isActive: boolean;
  onTimeUpdate: (timeRemaining: number, timeSpent: number) => void;
  onTimeout?: () => void;
}

export function Timer({
  mode,
  initialTime,
  timeRemaining,
  timeSpent,
  isActive,
  onTimeUpdate,
  onTimeout,
}: TimerProps) {
  const { t } = useTranslation();
  const intervalRef = useRef<number | null>(null);
  const hasTimedOut = useRef(false);

  useEffect(() => {
    if (mode === 'none' || !isActive) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = window.setInterval(() => {
      if (mode === 'countdown') {
        const newTimeRemaining = Math.max(0, timeRemaining - 1);
        onTimeUpdate(newTimeRemaining, timeSpent + 1);

        if (newTimeRemaining === 0 && !hasTimedOut.current) {
          hasTimedOut.current = true;
          onTimeout?.();
        }
      } else {
        onTimeUpdate(timeRemaining, timeSpent + 1);
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [mode, isActive, timeRemaining, timeSpent, onTimeUpdate, onTimeout]);

  useEffect(() => {
    hasTimedOut.current = false;
  }, [initialTime]);

  if (mode === 'none') {
    return null;
  }

  const displayTime = mode === 'countdown' ? timeRemaining : timeSpent;
  const progress = mode === 'countdown' ? (timeRemaining / initialTime) * 100 : 0;
  const isLowTime = mode === 'countdown' && timeRemaining <= 10;

  return (
    <div className="flex flex-col gap-2" data-testid="quiz-timer">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">
          {mode === 'countdown' ? t('quiz.timeRemaining') : t('quiz.timeSpent')}
        </span>
        <span
          className={`text-lg font-mono font-semibold ${
            isLowTime ? 'text-red-500 animate-pulse' : 'text-charcoal'
          }`}
        >
          {formatTime(displayTime)}
        </span>
      </div>

      {mode === 'countdown' && (
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 ease-linear ${
              isLowTime ? 'bg-red-500' : 'bg-primary'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
