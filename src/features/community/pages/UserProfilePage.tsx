import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Layout } from '@/components/layout';
import { Card, Loading } from '@/components/ui';
import { CaseCard } from '../components';
import {
  getUserById,
  getUserCases,
  getUserCommunityStats,
} from '@/services/firebase/communityFirestore';
import type { User, CommunityCase, UserCommunityStats } from '@/types';

export function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [cases, setCases] = useState<CommunityCase[]>([]);
  const [stats, setStats] = useState<UserCommunityStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!userId) return;

    try {
      const [userData, userCases, userStats] = await Promise.all([
        getUserById(userId),
        getUserCases(userId),
        getUserCommunityStats(userId),
      ]);

      setUser(userData);
      setCases(userCases.filter((c) => c.status === 'active'));
      setStats(userStats);
    } catch (error) {
      console.error('Error fetching user profile:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('default', {
      month: 'long',
      year: 'numeric',
    }).format(date);
  };

  if (isLoading) {
    return (
      <Layout>
        <Loading size="lg" text={t('common.loading')} />
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout>
        <Card>
          <p className="text-center text-gray-500">{t('community.userNotFound')}</p>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Back button */}
        <Link
          to="/community"
          className="inline-flex items-center text-gray-600 hover:text-primary"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 mr-1"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
              clipRule="evenodd"
            />
          </svg>
          {t('common.back')}
        </Link>

        {/* Profile header */}
        <Card>
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <div className="w-24 h-24 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-4xl">
                {user.displayName.charAt(0).toUpperCase()}
              </span>
            </div>

            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-2xl font-bold text-charcoal">{user.displayName}</h1>
              <p className="text-gray-500 mt-1">
                {t('community.memberSince')} {formatDate(user.createdAt)}
              </p>

              {/* Stats */}
              {stats && (
                <div className="flex flex-wrap justify-center sm:justify-start gap-6 mt-4">
                  <div>
                    <p className="text-2xl font-bold text-primary">{stats.casesPosted}</p>
                    <p className="text-sm text-gray-500">{t('community.casesPosted')}</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-primary">{stats.commentsPosted}</p>
                    <p className="text-sm text-gray-500">{t('community.commentsPosted')}</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-primary">
                      {stats.casesPosted + stats.commentsPosted}
                    </p>
                    <p className="text-sm text-gray-500">{t('community.totalContributions')}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* User's cases */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-charcoal">
            {t('community.userCases')} ({cases.length})
          </h2>

          {cases.length > 0 ? (
            <div className="space-y-4">
              {cases.map((case_) => (
                <CaseCard key={case_.id} case_={case_} />
              ))}
            </div>
          ) : (
            <Card>
              <p className="text-center text-gray-500 py-8">
                {t('community.noUserCases')}
              </p>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
}
