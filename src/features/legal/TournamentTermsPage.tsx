import { useTranslation } from 'react-i18next';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui';

export function TournamentTermsPage() {
  const { t } = useTranslation();

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <Card>
          <h1 className="text-2xl font-bold text-charcoal mb-2">
            {t('tournamentTerms.title')}
          </h1>
          <p className="text-gray-500 mb-6">{t('tournamentTerms.lastUpdated')}</p>

          <div className="space-y-6 text-gray-700">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <section key={i}>
                <h2 className="font-semibold text-charcoal text-lg mb-2">
                  {t(`tournamentTerms.section${i}Title`)}
                </h2>
                <p>{t(`tournamentTerms.section${i}Content`)}</p>
              </section>
            ))}
          </div>
        </Card>
      </div>
    </Layout>
  );
}
