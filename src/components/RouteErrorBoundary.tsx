import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

function RouteErrorFallback() {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <p className="text-lg font-medium text-charcoal">{t('common.error')}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-lg bg-primary px-4 py-2 font-medium text-white transition-colors hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
        {t('common.retry')}
      </button>
    </div>
  );
}

interface RouteErrorBoundaryProps {
  children: ReactNode;
}

/**
 * Keeps a failing route (e.g. a lazy chunk that no longer exists after a deploy) from unmounting the
 * whole app: shows a message with a reload button instead of a blank page.
 */
export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Route failed to render', error, info.componentStack);
  }

  render() {
    return this.state.failed ? <RouteErrorFallback /> : this.props.children;
  }
}
