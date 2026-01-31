import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Layout } from '@/components/layout';
import { Card, Button, Loading } from '@/components/ui';
import { useAuthStore } from '@/stores';
import { getTestAttempt, getTest } from '@/services/firebase/firestore';
import {
  formatDuration,
  getTotalTimeSpent,
  getCorrectCount,
  getIncorrectCount,
  getTimedOutCount,
} from '@/utils';
import type { TestAttempt, Test } from '@/types';

export function ResultsPage() {
  const { t, i18n } = useTranslation();
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [attempt, setAttempt] = useState<TestAttempt | null>(null);
  const [test, setTest] = useState<Test | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!attemptId || !user) {
        navigate('/levels');
        return;
      }

      try {
        const attemptData = await getTestAttempt(user.uid, attemptId);
        if (!attemptData) {
          navigate('/levels');
          return;
        }

        const testData = await getTest(attemptData.testId);
        setAttempt(attemptData);
        setTest(testData);
      } catch (error) {
        console.error('Error fetching results:', error);
        navigate('/levels');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [attemptId, user, navigate]);

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

  if (!attempt || !test) {
    return (
      <Layout>
        <Card>
          <p className="text-center text-gray-500 py-8">{t('errors.notFound')}</p>
        </Card>
      </Layout>
    );
  }

  const totalTime = getTotalTimeSpent(attempt.answers);
  const correctCount = getCorrectCount(attempt.answers);
  const incorrectCount = getIncorrectCount(attempt.answers);
  const timedOutCount = getTimedOutCount(attempt.answers);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-10 h-10 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-charcoal mb-2">
            {t('results.completed')}
          </h1>
          <p className="text-gray-600">{getLocalizedText(test.title)}</p>
        </div>

        {/* Score card */}
        <Card className="mb-4">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="p-4 bg-primary bg-opacity-5 rounded-xl">
              <p className="text-3xl font-bold text-primary" data-testid="result-score">{attempt.score}</p>
              <p className="text-sm text-gray-500">{t('results.score')}</p>
            </div>
            <div className="p-4 bg-primary bg-opacity-5 rounded-xl">
              <p className="text-3xl font-bold text-primary" data-testid="result-accuracy">{attempt.accuracy}%</p>
              <p className="text-sm text-gray-500">{t('results.accuracy')}</p>
            </div>
          </div>
        </Card>

        {/* Statistics */}
        <Card className="mb-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">{t('results.totalTime')}</span>
              <span className="font-semibold" data-testid="result-time">{formatDuration(totalTime)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">{t('results.questionsCorrect')}</span>
              <span className="font-semibold text-green-600" data-testid="result-correct">
                {correctCount} / {attempt.answers.length}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">{t('results.questionsMissed')}</span>
              <span className="font-semibold text-red-600" data-testid="result-incorrect">{incorrectCount}</span>
            </div>
            {timedOutCount > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-gray-600">{t('results.questionsTimedOut')}</span>
                <span className="font-semibold text-orange-600">{timedOutCount}</span>
              </div>
            )}
          </div>
        </Card>

        {/* Actions */}
        <div className="space-y-3">
          <Button
            fullWidth
            size="lg"
            onClick={() => navigate(`/quiz/${test.id}`)}
          >
            {t('results.retake')}
          </Button>

          <Link to={`/levels/${test.levelId}`}>
            <Button variant="outline" fullWidth size="lg">
              {t('results.backToTests')}
            </Button>
          </Link>
        </div>
      </div>
    </Layout>
  );
}
