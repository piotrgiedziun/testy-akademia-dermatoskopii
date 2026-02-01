import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Layout } from '@/components/layout';
import { Button, Card } from '@/components/ui';
import { useAuthStore } from '@/stores';

export function HomePage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        {/* Hero */}
        <div className="text-center py-12">
          <img
            src="/logo.png"
            alt="Akademia Dermatoskopii"
            className="h-24 mx-auto mb-6"
          />
          <h1 className="text-3xl md:text-4xl font-bold text-charcoal mb-4">
            {t('home.welcome')}
          </h1>
          <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
            {t('home.description')}
          </p>
          {user ? (
            <Link to="/levels">
              <Button size="lg">{t('home.startLearning')}</Button>
            </Link>
          ) : (
            <div className="flex gap-4 justify-center">
              <Link to="/login">
                <Button variant="outline" size="lg">
                  {t('auth.login')}
                </Button>
              </Link>
              <Link to="/register">
                <Button size="lg">{t('auth.register')}</Button>
              </Link>
            </div>
          )}
        </div>

        {/* Features Section */}
        <div className="py-12 border-t border-gray-200">
          <h2 className="text-2xl font-bold text-charcoal text-center mb-8">
            {t('home.features.title')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Interactive Tests */}
            <Card className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h3 className="font-semibold text-charcoal mb-2">
                {t('home.features.interactive.title')}
              </h3>
              <p className="text-sm text-gray-600">
                {t('home.features.interactive.description')}
              </p>
            </Card>

            {/* Clinical Cases */}
            <Card className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              </div>
              <h3 className="font-semibold text-charcoal mb-2">
                {t('home.features.cases.title')}
              </h3>
              <p className="text-sm text-gray-600">
                {t('home.features.cases.description')}
              </p>
            </Card>

            {/* Community */}
            <Card className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </div>
              <h3 className="font-semibold text-charcoal mb-2">
                {t('home.features.community.title')}
              </h3>
              <p className="text-sm text-gray-600">
                {t('home.features.community.description')}
              </p>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
