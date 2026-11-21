import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, Loading } from '@/components/ui';
import { LENS_ROUTE } from '@/features/lens/lensBridge';
import { getLevels } from '@/services/firebase/firestore';
import { collection, getCountFromServer } from 'firebase/firestore';
import { db } from '@/services/firebase/config';

export function AdminDashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState({
    levels: 0,
    tests: 0,
    cases: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [levels, testsSnapshot, casesSnapshot] = await Promise.all([
          getLevels(),
          getCountFromServer(collection(db, 'tests')),
          getCountFromServer(collection(db, 'cases')),
        ]);

        setStats({
          levels: levels.length,
          tests: testsSnapshot.data().count,
          cases: casesSnapshot.data().count,
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (isLoading) {
    return <Loading size="lg" text={t('common.loading')} />;
  }

  const statCards = [
    { label: t('admin.levels'), value: stats.levels, color: 'bg-blue-500' },
    { label: t('admin.tests'), value: stats.tests, color: 'bg-green-500' },
    { label: t('admin.cases'), value: stats.cases, color: 'bg-purple-500' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-charcoal mb-6">{t('admin.dashboard')}</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 ${stat.color} rounded-xl flex items-center justify-center`}>
                <span className="text-white font-bold text-lg">{stat.value}</span>
              </div>
              <span className="text-gray-600 font-medium">{stat.label}</span>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-charcoal">{t('lens.admin.title')}</h2>
        <p className="mt-1 max-w-2xl text-gray-600">{t('lens.admin.description')}</p>
        <Link
          to={LENS_ROUTE}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-white transition-colors hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          {t('lens.admin.open')}
        </Link>
      </Card>
    </div>
  );
}
