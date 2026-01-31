import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Layout } from '@/components/layout';
import { Card, Loading } from '@/components/ui';
import { getLevels, getTestsByLevel } from '@/services/firebase/firestore';
import type { Level, Test } from '@/types';

interface LevelWithTests extends Level {
  tests: Test[];
}

export function LevelsPage() {
  const { t, i18n } = useTranslation();
  const [levels, setLevels] = useState<LevelWithTests[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchLevels = async () => {
      try {
        const levelsData = await getLevels();
        const levelsWithTests = await Promise.all(
          levelsData.map(async (level) => {
            const tests = await getTestsByLevel(level.id);
            return { ...level, tests };
          })
        );
        setLevels(levelsWithTests);
      } catch (error) {
        console.error('Error fetching levels:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLevels();
  }, []);

  const getLocalizedText = (text: { pl: string; en: string }) => {
    return i18n.language === 'pl' ? text.pl : text.en;
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center py-12">
          <Loading size="lg" text={t('common.loading')} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-charcoal">{t('levels.title')}</h1>
      </div>

      {levels.length === 0 ? (
        <Card>
          <p className="text-center text-gray-500 py-8">{t('common.noResults')}</p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {levels.map((level) => (
            <Link key={level.id} to={`/levels/${level.id}`} data-testid="level-card">
              <Card hoverable className="h-full">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-lg">{level.order}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-charcoal mb-1">
                      {t('levels.level')} {level.order}
                    </h2>
                    <p className="text-sm text-gray-600 mb-2">
                      {getLocalizedText(level.title)}
                    </p>
                    <p className="text-xs text-gray-400">
                      {t('levels.testsCount')}: {level.tests.length}
                    </p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  );
}
