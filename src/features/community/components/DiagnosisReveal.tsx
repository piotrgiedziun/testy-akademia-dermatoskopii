import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Button } from '@/components/ui';
import { useAuthStore } from '@/stores';
import { incrementDiagnosisReveal } from '@/services/firebase/communityFirestore';

interface DiagnosisRevealProps {
  caseId: string;
  diagnosis: {
    text: string;
    histopathologyResult?: string;
    addedAt: Date;
  };
}

const REVEAL_DELAY_MS = 48 * 60 * 60 * 1000; // 48 hours

export function DiagnosisReveal({ caseId, diagnosis }: DiagnosisRevealProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [isRevealed, setIsRevealed] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  // Check localStorage for reveal state
  useEffect(() => {
    const revealedCases = JSON.parse(localStorage.getItem('revealedCases') || '{}');
    if (revealedCases[caseId]) {
      setIsRevealed(true);
    } else {
      // Calculate time remaining until auto-reveal
      const timeSinceAdded = Date.now() - diagnosis.addedAt.getTime();
      if (timeSinceAdded >= REVEAL_DELAY_MS) {
        setIsRevealed(true);
      } else {
        setTimeRemaining(REVEAL_DELAY_MS - timeSinceAdded);
      }
    }
  }, [caseId, diagnosis.addedAt]);

  // Countdown timer
  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0 || isRevealed) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 1000) {
          setIsRevealed(true);
          return null;
        }
        return prev - 1000;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timeRemaining, isRevealed]);

  const handleReveal = async () => {
    // Save to localStorage
    const revealedCases = JSON.parse(localStorage.getItem('revealedCases') || '{}');
    revealedCases[caseId] = Date.now();
    localStorage.setItem('revealedCases', JSON.stringify(revealedCases));

    // Track reveal in stats
    if (user) {
      try {
        await incrementDiagnosisReveal(user.uid, user.displayName);
      } catch (error) {
        console.error('Error tracking diagnosis reveal:', error);
      }
    }

    setIsRevealed(true);
  };

  const formatTimeRemaining = (ms: number) => {
    const hours = Math.floor(ms / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));

    if (hours > 0) {
      return t('community.hoursRemaining', { hours, minutes });
    }
    return t('community.minutesRemaining', { minutes });
  };

  return (
    <Card className="bg-primary/5 border-primary/20">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 text-primary"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <h3 className="font-semibold text-primary">{t('community.diagnosis')}</h3>
        </div>

        {isRevealed ? (
          <div className="space-y-2">
            <p className="text-charcoal font-medium">{diagnosis.text}</p>

            {diagnosis.histopathologyResult && (
              <div className="pt-2 border-t border-primary/20">
                <p className="text-sm text-gray-500 mb-1">{t('community.histopathology')}</p>
                <p className="text-charcoal">{diagnosis.histopathologyResult}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-gray-600 mb-3">{t('community.diagnosisHidden')}</p>

            {timeRemaining !== null && (
              <p className="text-sm text-gray-500 mb-4">
                {t('community.autoRevealIn')} {formatTimeRemaining(timeRemaining)}
              </p>
            )}

            <Button onClick={handleReveal} variant="primary">
              {t('community.revealNow')}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
