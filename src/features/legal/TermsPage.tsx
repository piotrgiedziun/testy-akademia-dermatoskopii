import { useTranslation } from 'react-i18next';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui';

export function TermsPage() {
  const { t } = useTranslation();

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <Card>
          <h1 className="text-2xl font-bold text-charcoal mb-2">
            {t('terms.title')}
          </h1>
          <p className="text-gray-500 mb-6">{t('terms.lastUpdated')}</p>

          <div className="space-y-6 text-gray-700">
            <section>
              <h2 className="font-semibold text-charcoal text-lg mb-2">
                {t('terms.section1Title')}
              </h2>
              <p>{t('terms.section1Content')}</p>
            </section>

            <section>
              <h2 className="font-semibold text-charcoal text-lg mb-2">
                {t('terms.section2Title')}
              </h2>
              <p>{t('terms.section2Content')}</p>
            </section>

            <section>
              <h2 className="font-semibold text-charcoal text-lg mb-2">
                {t('terms.section3Title')}
              </h2>
              <p>{t('terms.section3Content')}</p>
            </section>

            <section>
              <h2 className="font-semibold text-charcoal text-lg mb-2">
                {t('terms.section4Title')}
              </h2>
              <p>{t('terms.section4Content')}</p>
            </section>

            <section>
              <h2 className="font-semibold text-charcoal text-lg mb-2">
                {t('terms.section5Title')}
              </h2>
              <p>{t('terms.section5Content')}</p>
            </section>

            <section>
              <h2 className="font-semibold text-charcoal text-lg mb-2">
                {t('terms.section6Title')}
              </h2>
              <p>{t('terms.section6Content')}</p>
            </section>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
