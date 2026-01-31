import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Layout } from '@/components/layout';
import { Card, Loading } from '@/components/ui';
import { getMonthlyLeaderboard } from '@/services/firebase/communityFirestore';
import { useAuthStore } from '@/stores';
import type { MonthlyLeaderboard } from '@/types';

export function LeaderboardPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const [leaderboard, setLeaderboard] = useState<MonthlyLeaderboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const data = await getMonthlyLeaderboard();
        setLeaderboard(data);
      } catch (error) {
        console.error('Error fetching leaderboard:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLeaderboard();
  }, []);

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return new Intl.DateTimeFormat(i18n.language, {
      month: 'long',
      year: 'numeric',
    }).format(date);
  };

  const getRankBadge = (rank: number) => {
    switch (rank) {
      case 1:
        return (
          <span className="text-2xl" role="img" aria-label="Gold">
            🥇
          </span>
        );
      case 2:
        return (
          <span className="text-2xl" role="img" aria-label="Silver">
            🥈
          </span>
        );
      case 3:
        return (
          <span className="text-2xl" role="img" aria-label="Bronze">
            🥉
          </span>
        );
      default:
        return (
          <span className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600">
            {rank}
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <Loading size="lg" text={t('common.loading')} />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            to="/community"
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
                clipRule="evenodd"
              />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-charcoal">{t('community.leaderboard')}</h1>
            {leaderboard && (
              <p className="text-gray-500">{formatMonth(leaderboard.month)}</p>
            )}
          </div>
        </div>

        {/* Top 3 podium */}
        {leaderboard && leaderboard.entries.length >= 3 && (
          <div className="grid grid-cols-3 gap-4">
            {/* Second place */}
            <div className="mt-8">
              <Card className="text-center">
                <div className="mb-2">{getRankBadge(2)}</div>
                <Link to={`/community/user/${leaderboard.entries[1].userId}`}>
                  <p className="font-semibold text-charcoal hover:text-primary">
                    {leaderboard.entries[1].displayName}
                  </p>
                </Link>
                <p className="text-2xl font-bold text-primary mt-2">
                  {leaderboard.entries[1].totalContributions}
                </p>
                <p className="text-xs text-gray-500">{t('community.contributions')}</p>
              </Card>
            </div>

            {/* First place */}
            <div>
              <Card className="text-center bg-primary/5 border-primary/20">
                <div className="mb-2">{getRankBadge(1)}</div>
                <Link to={`/community/user/${leaderboard.entries[0].userId}`}>
                  <p className="font-semibold text-charcoal hover:text-primary">
                    {leaderboard.entries[0].displayName}
                  </p>
                </Link>
                <p className="text-3xl font-bold text-primary mt-2">
                  {leaderboard.entries[0].totalContributions}
                </p>
                <p className="text-xs text-gray-500">{t('community.contributions')}</p>
              </Card>
            </div>

            {/* Third place */}
            <div className="mt-12">
              <Card className="text-center">
                <div className="mb-2">{getRankBadge(3)}</div>
                <Link to={`/community/user/${leaderboard.entries[2].userId}`}>
                  <p className="font-semibold text-charcoal hover:text-primary">
                    {leaderboard.entries[2].displayName}
                  </p>
                </Link>
                <p className="text-2xl font-bold text-primary mt-2">
                  {leaderboard.entries[2].totalContributions}
                </p>
                <p className="text-xs text-gray-500">{t('community.contributions')}</p>
              </Card>
            </div>
          </div>
        )}

        {/* Full leaderboard */}
        <Card>
          <div className="divide-y">
            {leaderboard && leaderboard.entries.length > 0 ? (
              leaderboard.entries.map((entry) => (
                <div
                  key={entry.userId}
                  className={`flex items-center gap-4 py-3 ${
                    user?.uid === entry.userId ? 'bg-primary/5 -mx-4 px-4 rounded-lg' : ''
                  }`}
                >
                  <div className="w-10 flex justify-center">{getRankBadge(entry.rank)}</div>

                  <Link
                    to={`/community/user/${entry.userId}`}
                    className="flex-1 flex items-center gap-3 min-w-0"
                  >
                    <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-bold">
                        {entry.displayName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-charcoal truncate hover:text-primary">
                        {entry.displayName}
                        {user?.uid === entry.userId && (
                          <span className="text-primary ml-2">({t('community.you')})</span>
                        )}
                      </p>
                      <p className="text-sm text-gray-500">
                        {entry.casesPosted} {t('community.cases').toLowerCase()},{' '}
                        {entry.commentsPosted} {t('community.comments').toLowerCase()}
                      </p>
                    </div>
                  </Link>

                  <div className="text-right">
                    <p className="text-xl font-bold text-primary">
                      {entry.totalContributions}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-gray-500 py-8">
                {t('community.noLeaderboardData')}
              </p>
            )}
          </div>
        </Card>
      </div>
    </Layout>
  );
}
