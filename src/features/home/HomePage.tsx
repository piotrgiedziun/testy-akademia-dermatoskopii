import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Layout } from '@/components/layout';
import { Button } from '@/components/ui';
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
      </div>
    </Layout>
  );
}
