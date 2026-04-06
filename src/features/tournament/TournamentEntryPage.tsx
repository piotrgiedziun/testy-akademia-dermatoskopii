import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Layout } from '@/components/layout';
import { Card, Button, Input, Loading } from '@/components/ui';
import { useTournamentStore } from '@/stores';

export function TournamentEntryPage() {
  const { t, i18n } = useTranslation();
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();

  const {
    loadTournament,
    startTournamentQuiz,
    resetTournament,
    tournament,
    test,
    cases,
    isLoading,
    tournamentId,
    attemptId,
    userAnswers,
  } = useTournamentStore();

  const [name, setName] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const getLocalizedText = (text: { pl: string; en: string }) => {
    return i18n.language === 'pl' ? text.pl : text.en;
  };

  useEffect(() => {
    if (!uuid) return;

    // If there's an in-progress attempt for this tournament, resume it
    if (tournamentId === uuid && attemptId && userAnswers.length < (cases?.length || Infinity)) {
      navigate(`/tournament/${uuid}/quiz`);
      return;
    }

    // Clear any stale state from a different tournament or completed attempt
    if (tournamentId && tournamentId !== uuid) {
      resetTournament();
    }

    loadTournament(uuid).then((t) => {
      if (!t) {
        setError('notFound');
      } else if (!t.active) {
        setError('inactive');
      }
    }).catch(() => {
      setError('notFound');
    });
  }, [uuid]);

  const handleStart = async () => {
    if (!name.trim() || !termsAccepted || !uuid) return;

    setIsStarting(true);
    try {
      await startTournamentQuiz(name.trim());
      navigate(`/tournament/${uuid}/quiz`);
    } catch (err) {
      console.error('Error starting tournament:', err);
      setIsStarting(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <Loading fullScreen />
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto mt-12">
          <Card>
            <div className="text-center py-8">
              <p className="text-lg text-gray-500">
                {t(`tournament.${error}`)}
              </p>
            </div>
          </Card>
        </div>
      </Layout>
    );
  }

  if (!tournament || !test) return null;

  return (
    <Layout>
      <div className="max-w-lg mx-auto mt-8">
        <Card>
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-charcoal">
                {getLocalizedText(tournament.name)}
              </h1>
              <p className="text-gray-500 mt-2">
                {getLocalizedText(test.title)}
              </p>
              <div className="flex justify-center gap-4 mt-3 text-sm text-gray-400">
                <span>{cases.length} {t('tests.questionsCount')}</span>
                {test.timerMode === 'countdown' && (
                  <span>{test.timePerQuestion}s / {t('quiz.question')}</span>
                )}
              </div>
            </div>

            <div>
              <Input
                label={t('tournament.enterName')}
                placeholder={t('tournament.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span className="text-sm text-gray-600">
                {t('tournament.acceptTerms')}{' '}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {t('tournament.termsLink')}
                </a>
              </span>
            </label>

            <Button
              fullWidth
              onClick={handleStart}
              disabled={!name.trim() || !termsAccepted || isStarting}
            >
              {isStarting ? t('common.loading') : t('tournament.startTournament')}
            </Button>

            <div className="text-center">
              <button
                onClick={() => navigate(`/tournament/${uuid}/ranking`)}
                className="text-sm text-primary hover:underline"
              >
                {t('tournament.viewRanking')}
              </button>
            </div>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
