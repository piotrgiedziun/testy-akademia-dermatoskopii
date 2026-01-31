import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';
import { Button } from '@/components/ui';

export function Header() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const toggleLanguage = () => {
    const newLang = i18n.language === 'pl' ? 'en' : 'pl';
    i18n.changeLanguage(newLang);
  };

  return (
    <header className="bg-white shadow-sm sticky top-0 z-40 safe-area-inset-top">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">AD</span>
            </div>
            <span className="font-semibold text-charcoal hidden sm:block">
              {t('app.name')}
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            {user && (
              <>
                <Link
                  to="/levels"
                  className="text-charcoal hover:text-primary transition-colors"
                >
                  {t('nav.levels')}
                </Link>
                <Link
                  to="/community"
                  className="text-charcoal hover:text-primary transition-colors"
                >
                  {t('nav.community')}
                </Link>
                <Link
                  to="/profile"
                  className="text-charcoal hover:text-primary transition-colors"
                >
                  {t('nav.profile')}
                </Link>
                {user.role === 'admin' && (
                  <Link
                    to="/admin"
                    className="text-charcoal hover:text-primary transition-colors"
                  >
                    {t('nav.admin')}
                  </Link>
                )}
              </>
            )}
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleLanguage}
              className="px-2 py-1 text-sm font-medium text-charcoal hover:text-primary transition-colors uppercase"
            >
              {i18n.language === 'pl' ? 'EN' : 'PL'}
            </button>

            {user ? (
              <div className="hidden md:flex items-center gap-3">
                <span className="text-sm text-gray-500">{user.displayName}</span>
                <Button variant="outline" size="sm" onClick={handleLogout}>
                  {t('nav.logout')}
                </Button>
              </div>
            ) : (
              <div className="hidden md:flex items-center gap-2">
                <Link to="/login">
                  <Button variant="ghost" size="sm">
                    {t('auth.login')}
                  </Button>
                </Link>
                <Link to="/register">
                  <Button size="sm">{t('auth.register')}</Button>
                </Link>
              </div>
            )}

            <button
              className="md:hidden p-2 text-charcoal"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle menu"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {isMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>

        {isMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-100">
            <nav className="flex flex-col gap-2">
              {user ? (
                <>
                  <Link
                    to="/levels"
                    className="px-3 py-2 text-charcoal hover:bg-gray-50 rounded-lg"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {t('nav.levels')}
                  </Link>
                  <Link
                    to="/community"
                    className="px-3 py-2 text-charcoal hover:bg-gray-50 rounded-lg"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {t('nav.community')}
                  </Link>
                  <Link
                    to="/profile"
                    className="px-3 py-2 text-charcoal hover:bg-gray-50 rounded-lg"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {t('nav.profile')}
                  </Link>
                  {user.role === 'admin' && (
                    <Link
                      to="/admin"
                      className="px-3 py-2 text-charcoal hover:bg-gray-50 rounded-lg"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      {t('nav.admin')}
                    </Link>
                  )}
                  <button
                    onClick={() => {
                      handleLogout();
                      setIsMenuOpen(false);
                    }}
                    className="px-3 py-2 text-left text-red-500 hover:bg-gray-50 rounded-lg"
                  >
                    {t('nav.logout')}
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="px-3 py-2 text-charcoal hover:bg-gray-50 rounded-lg"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {t('auth.login')}
                  </Link>
                  <Link
                    to="/register"
                    className="px-3 py-2 text-primary font-medium hover:bg-gray-50 rounded-lg"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {t('auth.register')}
                  </Link>
                </>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
