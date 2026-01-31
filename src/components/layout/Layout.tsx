import { ReactNode } from 'react';
import { Header } from './Header';

interface LayoutProps {
  children: ReactNode;
  showHeader?: boolean;
  fullWidth?: boolean;
}

export function Layout({ children, showHeader = true, fullWidth = false }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {showHeader && <Header />}
      <main
        className={`flex-1 ${fullWidth ? '' : 'max-w-7xl mx-auto w-full px-4 py-6'}`}
      >
        {children}
      </main>
    </div>
  );
}
