import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Layout } from '@/components/layout';
import { Card, Loading } from '@/components/ui';
import { useAuthStore } from '@/stores';
import { getUserProgressStats } from '@/services/firebase/firestore';
import { formatDuration } from '@/utils';
import type { UserProgressStats } from '@/types';

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const [stats, setStats] = useState<UserProgressStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      if (!user) return;

      try {
        const data = await getUserProgressStats(user.uid);
        setStats(data);
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [user]);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center py-12">
          <Loading size="lg" text={t('common.loading')} />
        </div>
      </Layout>
    );
  }

  const totalPoints = stats?.totalPoints || 0;
  const testsCompleted = stats?.testsCompleted || 0;
  const avgAccuracy = testsCompleted > 0
    ? Math.round((stats?.totalAccuracySum || 0) / testsCompleted)
    : 0;
  const avgTimePerQuestion = stats?.totalQuestions && stats.totalQuestions > 0
    ? Math.round(stats.totalTimeMs / stats.totalQuestions)
    : 0;

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-charcoal mb-6">{t('profile.title')}</h1>

        {/* User info */}
        <Card className="mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
              <span className="text-white text-2xl font-bold">
                {user?.displayName?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-charcoal" data-testid="profile-name">
                {user?.displayName}
              </h2>
              <p className="text-gray-500" data-testid="profile-email">{user?.email}</p>
            </div>
          </div>
        </Card>

        {/* Statistics */}
        <h2 className="text-lg font-semibold text-charcoal mb-3">
          {t('profile.statistics')}
        </h2>
        <Card className="mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-xl">
              <p className="text-2xl font-bold text-primary" data-testid="profile-points">{totalPoints}</p>
              <p className="text-sm text-gray-500">{t('profile.totalPoints')}</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-xl">
              <p className="text-2xl font-bold text-primary" data-testid="profile-tests">{testsCompleted}</p>
              <p className="text-sm text-gray-500">{t('profile.testsCompleted')}</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-xl">
              <p className="text-2xl font-bold text-primary" data-testid="profile-accuracy">{avgAccuracy}%</p>
              <p className="text-sm text-gray-500">{t('profile.avgAccuracy')}</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-xl">
              <p className="text-2xl font-bold text-primary">
                {formatDuration(avgTimePerQuestion)}
              </p>
              <p className="text-sm text-gray-500">{t('profile.avgTime')}</p>
            </div>
          </div>
        </Card>

        {/* Settings */}
        <h2 className="text-lg font-semibold text-charcoal mb-3">
          {t('profile.settings')}
        </h2>
        <Card>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">{t('profile.language')}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => handleLanguageChange('pl')}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    i18n.language === 'pl'
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  PL
                </button>
                <button
                  onClick={() => handleLanguageChange('en')}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    i18n.language === 'en'
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  EN
                </button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
