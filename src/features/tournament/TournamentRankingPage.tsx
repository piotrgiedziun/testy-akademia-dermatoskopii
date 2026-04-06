import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Layout } from '@/components/layout';
import { Card, Button, Loading } from '@/components/ui';
import { getTournament, getTournamentRanking } from '@/services/firebase/tournamentFirestore';
import type { Tournament, TournamentRankingEntry } from '@/types';

export function TournamentRankingPage() {
  const { t, i18n } = useTranslation();
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [ranking, setRanking] = useState<TournamentRankingEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const getLocalizedText = (text: { pl: string; en: string }) => {
    return i18n.language === 'pl' ? text.pl : text.en;
  };

  useEffect(() => {
    if (!uuid) return;

    const fetchData = async () => {
      try {
        const [tournamentData, rankingData] = await Promise.all([
          getTournament(uuid),
          getTournamentRanking(uuid),
        ]);

        if (!tournamentData) {
          setError(true);
          return;
        }

        setTournament(tournamentData);
        setRanking(rankingData);
      } catch (err) {
        console.error('Error fetching ranking:', err);
        setError(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [uuid]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getRankBadge = (rank: number) => {
    switch (rank) {
      case 1:
        return <span className="text-xl">🥇</span>;
      case 2:
        return <span className="text-xl">🥈</span>;
      case 3:
        return <span className="text-xl">🥉</span>;
      default:
        return (
          <span className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600">
            {rank}
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <Loading fullScreen />
      </Layout>
    );
  }

  if (error || !tournament) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto mt-12">
          <Card>
            <div className="text-center py-8">
              <p className="text-lg text-gray-500">
                {t('tournament.notFound')}
              </p>
            </div>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto mt-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-charcoal">
            {getLocalizedText(tournament.name)}
          </h1>
          <p className="text-gray-500 mt-1">{t('tournament.ranking')}</p>
        </div>

        {ranking.length === 0 ? (
          <Card>
            <div className="text-center py-8">
              <p className="text-gray-500">{t('tournament.noAttempts')}</p>
            </div>
          </Card>
        ) : (
          <Card>
            {/* Table header */}
            <div className="grid grid-cols-[3rem_1fr_4rem_4.5rem] gap-2 px-3 py-2 text-xs font-medium text-gray-400 uppercase border-b">
              <span>#</span>
              <span>{t('tournament.participant')}</span>
              <span className="text-right">{t('tournament.score')}</span>
              <span className="text-right">{t('tournament.time')}</span>
            </div>

            {/* Ranking rows */}
            <div className="divide-y">
              {ranking.map((entry) => (
                <div
                  key={`${entry.participantName}-${entry.completedAt.getTime()}`}
                  className={`grid grid-cols-[3rem_1fr_4rem_4.5rem] gap-2 px-3 py-3 items-center ${
                    entry.rank <= 3 ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="flex items-center justify-center">
                    {getRankBadge(entry.rank)}
                  </div>
                  <div className="font-medium text-charcoal truncate">
                    {entry.participantName}
                  </div>
                  <div className="text-right font-semibold text-primary">
                    {entry.score}
                  </div>
                  <div className="text-right text-sm text-gray-500">
                    {formatTime(entry.totalTimeMs)}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="text-center mt-6">
          <Button onClick={() => navigate(`/tournament/${uuid}`)}>
            {t('tournament.playAgain')}
          </Button>
        </div>
      </div>
    </Layout>
  );
}
