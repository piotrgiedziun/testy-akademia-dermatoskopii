import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Header } from './Header';

interface LayoutProps {
  children: ReactNode;
  showHeader?: boolean;
  fullWidth?: boolean;
}

export function Layout({ children, showHeader = true, fullWidth = false }: LayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {showHeader && <Header />}
      <main
        className={`flex-1 ${fullWidth ? '' : 'max-w-7xl mx-auto w-full px-4 py-6'}`}
      >
        {children}
      </main>
      <footer className="border-t border-gray-200 bg-white py-4">
        <div className="max-w-7xl mx-auto px-4 flex justify-center gap-4">
          <Link
            to="/terms"
            className="text-sm text-gray-500 hover:text-primary transition-colors"
          >
            {t('footer.terms')}
          </Link>
          <Link
            to="/privacy"
            className="text-sm text-gray-500 hover:text-primary transition-colors"
          >
            {t('footer.privacy')}
          </Link>
        </div>
      </footer>
    </div>
  );
}
