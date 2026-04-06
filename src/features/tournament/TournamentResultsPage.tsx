import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Layout } from '@/components/layout';
import { Card, Button, Loading } from '@/components/ui';
import { useTournamentStore } from '@/stores';
import { getTournamentAttempt, getTournament } from '@/services/firebase/tournamentFirestore';
import { getTest } from '@/services/firebase/firestore';
import type { TournamentAttempt, Tournament, Test } from '@/types';

export function TournamentResultsPage() {
  const { t, i18n } = useTranslation();
  const { uuid, attemptId } = useParams<{ uuid: string; attemptId: string }>();
  const navigate = useNavigate();
  const { resetTournament } = useTournamentStore();

  const [attempt, setAttempt] = useState<TournamentAttempt | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [test, setTest] = useState<Test | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getLocalizedText = (text: { pl: string; en: string }) => {
    return i18n.language === 'pl' ? text.pl : text.en;
  };

  useEffect(() => {
    if (!uuid || !attemptId) return;

    const fetchData = async () => {
      try {
        const [tournamentData, attemptData] = await Promise.all([
          getTournament(uuid),
          getTournamentAttempt(uuid, attemptId),
        ]);

        if (!tournamentData || !attemptData) {
          navigate(`/tournament/${uuid}`);
          return;
        }

        const testData = await getTest(tournamentData.testId);

        setTournament(tournamentData);
        setAttempt(attemptData);
        setTest(testData);
      } catch (error) {
        console.error('Error fetching results:', error);
        navigate(`/tournament/${uuid}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [uuid, attemptId, navigate]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handlePlayAgain = () => {
    resetTournament();
    navigate(`/tournament/${uuid}`);
  };

  if (isLoading) {
    return (
      <Layout>
        <Loading fullScreen />
      </Layout>
    );
  }

  if (!attempt || !tournament || !test) return null;

  const correctCount = attempt.answers.filter((a) => a.correct).length;
  const totalQuestions = attempt.answers.length;

  return (
    <Layout>
      <div className="max-w-lg mx-auto mt-8">
        <Card>
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-charcoal">
                {getLocalizedText(tournament.name)}
              </h1>
              <p className="text-gray-500 mt-1">
                {attempt.participantName}
              </p>
            </div>

            <div className="text-center">
              <p className="text-5xl font-bold text-primary">
                {parseFloat(attempt.accuracy.toFixed(2))}%
              </p>
              <p className="text-gray-500 mt-2">
                {t('results.score')}: {attempt.score}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-semibold text-green-600">
                  {correctCount}
                </p>
                <p className="text-xs text-gray-500">{t('results.correct')}</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-red-500">
                  {totalQuestions - correctCount}
                </p>
                <p className="text-xs text-gray-500">
                  {t('results.incorrect')}
                </p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-charcoal">
                  {formatTime(attempt.totalTimeMs)}
                </p>
                <p className="text-xs text-gray-500">{t('tournament.time')}</p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Button
                fullWidth
                onClick={() => navigate(`/tournament/${uuid}/ranking`)}
              >
                {t('tournament.viewRanking')}
              </Button>
              <Button
                variant="secondary"
                fullWidth
                onClick={handlePlayAgain}
              >
                {t('tournament.playAgain')}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
