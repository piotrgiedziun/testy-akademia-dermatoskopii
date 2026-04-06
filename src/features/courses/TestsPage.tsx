import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Layout } from '@/components/layout';
import { Card, Button, Loading } from '@/components/ui';
import {
  getLevel,
  getTestsByLevel,
  getCasesByTest,
  getUserProgressForTest,
} from '@/services/firebase/firestore';
import { useAuthStore } from '@/stores';
import type { Level, Test, UserProgress } from '@/types';

interface TestWithProgress extends Test {
  caseCount: number;
  progress: UserProgress | null;
}

export function TestsPage() {
  const { t, i18n } = useTranslation();
  const { levelId } = useParams<{ levelId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [level, setLevel] = useState<Level | null>(null);
  const [tests, setTests] = useState<TestWithProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!levelId) return;

      try {
        const [levelData, testsData] = await Promise.all([
          getLevel(levelId),
          getTestsByLevel(levelId),
        ]);

        setLevel(levelData);

        const activeTests = testsData.filter((test) => test.active !== false);
        const testsWithProgress = await Promise.all(
          activeTests.map(async (test) => {
            const cases = await getCasesByTest(test.id);
            const progress = user
              ? await getUserProgressForTest(user.uid, test.id)
              : null;
            return { ...test, caseCount: cases.length, progress };
          })
        );

        setTests(testsWithProgress);
      } catch (error) {
        console.error('Error fetching tests:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [levelId, user]);

  const getLocalizedText = (text: { pl: string; en: string }) => {
    return i18n.language === 'pl' ? text.pl : text.en;
  };

  const getTimerModeText = (test: Test) => {
    switch (test.timerMode) {
      case 'countdown':
        return t('tests.timerMode.countdown', { time: test.timePerQuestion });
      case 'stopwatch':
        return t('tests.timerMode.stopwatch');
      default:
        return t('tests.timerMode.none');
    }
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

  if (!level) {
    return (
      <Layout>
        <Card>
          <p className="text-center text-gray-500 py-8">{t('errors.notFound')}</p>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6">
        <Link
          to="/levels"
          className="text-primary hover:underline text-sm mb-2 inline-block"
        >
          &larr; {t('common.back')}
        </Link>
        <h1 className="text-2xl font-bold text-charcoal">
          {t('levels.level')} {level.order}: {getLocalizedText(level.title)}
        </h1>
        <p className="text-gray-600 mt-1">{getLocalizedText(level.description)}</p>
      </div>

      {tests.length === 0 ? (
        <Card>
          <p className="text-center text-gray-500 py-8">{t('common.noResults')}</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {tests.map((test) => (
            <Card key={test.id} data-testid="test-card">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1">
                  <h2 className="font-semibold text-charcoal mb-1">
                    {getLocalizedText(test.title)}
                  </h2>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                    <span>{t('tests.questionsCount')}: {test.caseCount}</span>
                    <span>{t('tests.pointsPerQuestion')}: {test.pointsPerCorrect}</span>
                    <span>{getTimerModeText(test)}</span>
                    <span className={test.answerType === 'multiple' ? 'text-amber-600' : ''}>
                      {test.answerType === 'multiple'
                        ? t('tests.multipleAnswers')
                        : t('tests.singleAnswer')}
                    </span>
                  </div>
                  {test.progress && (
                    <div className="mt-2 text-sm">
                      <span className="text-primary font-medium">
                        {t('tests.bestScore')}: {test.progress.bestScore} ({parseFloat(test.progress.bestAccuracy.toFixed(2))}%)
                      </span>
                      <span className="text-gray-400 ml-2">
                        · {t('tests.attemptsCount')}: {test.progress.totalAttempts}
                      </span>
                    </div>
                  )}
                </div>
                <Button onClick={() => navigate(`/quiz/${test.id}`)}>
                  {test.progress ? t('tests.start') : t('tests.start')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Layout>
  );
}
