import { useTranslation } from 'react-i18next';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui';

export function PrivacyPolicyPage() {
  const { t } = useTranslation();

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <Card>
          <h1 className="text-2xl font-bold text-charcoal mb-2">
            {t('privacy.title')}
          </h1>
          <p className="text-gray-500 mb-6">{t('privacy.lastUpdated')}</p>

          <div className="space-y-6 text-gray-700">
            <section>
              <h2 className="font-semibold text-charcoal text-lg mb-2">
                {t('privacy.section1Title')}
              </h2>
              <p>{t('privacy.section1Content')}</p>
            </section>

            <section>
              <h2 className="font-semibold text-charcoal text-lg mb-2">
                {t('privacy.section2Title')}
              </h2>
              <p>{t('privacy.section2Content')}</p>
            </section>

            <section>
              <h2 className="font-semibold text-charcoal text-lg mb-2">
                {t('privacy.section3Title')}
              </h2>
              <p>{t('privacy.section3Content')}</p>
            </section>

            <section>
              <h2 className="font-semibold text-charcoal text-lg mb-2">
                {t('privacy.section4Title')}
              </h2>
              <p>{t('privacy.section4Content')}</p>
            </section>

            <section>
              <h2 className="font-semibold text-charcoal text-lg mb-2">
                {t('privacy.section5Title')}
              </h2>
              <p>{t('privacy.section5Content')}</p>
            </section>

            <section>
              <h2 className="font-semibold text-charcoal text-lg mb-2">
                {t('privacy.section6Title')}
              </h2>
              <p>{t('privacy.section6Content')}</p>
            </section>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
