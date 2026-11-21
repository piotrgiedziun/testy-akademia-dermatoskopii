import { useTranslation } from 'react-i18next';

interface LensLoadProblemProps {
  /** 'slow': no 'ready' from the lens for a long time; 'error': the lens reported that it cannot start */
  kind: 'slow' | 'error';
  onRetry: () => void;
  /** omitted where there is nowhere to go back to (the projector window) */
  onBack?: () => void;
}

/**
 * Shown over the lens frame when the 3D scene is slow to load or cannot start (no WebGL, a script that did
 * not load). The lens page has no app header, so this is also the way back into the app.
 */
export function LensLoadProblem({ kind, onRetry, onBack }: LensLoadProblemProps) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="absolute inset-x-4 bottom-6 z-10 mx-auto flex w-fit max-w-md flex-wrap items-center gap-3 rounded-xl bg-white px-4 py-3 text-sm text-charcoal shadow-lg"
    >
      <span className="min-w-0 flex-1 basis-56">{t(kind === 'error' ? 'lens.loadError' : 'lens.slowLoad')}</span>
      <span className="flex flex-none gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-gray-300 px-3 py-1.5 font-medium text-charcoal transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            {t('common.back')}
          </button>
        )}
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-primary px-3 py-1.5 font-medium text-white transition-colors hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          {t('common.retry')}
        </button>
      </span>
    </div>
  );
}
