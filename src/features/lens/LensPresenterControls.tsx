import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { PresenterAction, PresenterStatus } from './lensBridge';

interface LensPresenterControlsProps {
  /** presenter state reported by the lens */
  status: PresenterStatus;
  /** the lens has booted; the controls do nothing before that */
  ready: boolean;
  /** start presenting: opens the projector window (call from the click, for the pop-up blocker) */
  onStart: () => void;
  onAction: (action: Exclude<PresenterAction, 'start'>) => void;
  /** projector page, offered as a plain link when the pop-up is blocked */
  projectorUrl: string;
}

const baseButton =
  'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[13px] font-medium leading-none ' +
  'transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50';
const plainButton = `${baseButton} border-white/25 text-white/90 hover:border-white/50 hover:bg-white/5`;
const pressedButton = `${baseButton} border-[#8AA7FF] bg-[#1F4DC0] text-white hover:bg-[#2A5BD6]`;
const primaryButton = `${baseButton} border-primary bg-primary text-white hover:bg-primary-light`;

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      aria-hidden="true"
      className="ml-0.5 rounded border border-white/25 px-1 py-px font-mono text-[10px] font-normal text-white/65"
    >
      {children}
    </kbd>
  );
}

function ScreensIcon() {
  return (
    <svg width="15" height="12" viewBox="0 0 15 12" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <rect x="0.7" y="0.7" width="8.6" height="6.6" rx="1" />
      <rect x="5.7" y="4.7" width="8.6" height="6.6" rx="1" fill="currentColor" fillOpacity="0.25" />
    </svg>
  );
}

function PlayStopIcon({ stop }: { stop: boolean }) {
  return stop ? (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor" />
    </svg>
  ) : (
    <svg width="10" height="11" viewBox="0 0 10 11" aria-hidden="true">
      <path d="M1 1v9l8-4.5z" fill="currentColor" />
    </svg>
  );
}

/**
 * Presenter controls for "Beneath the Lens" (admins), used when the lens is shown on a course: a
 * projector window mirrors this one (on the second screen) and these controls drive it. The lens owns
 * the state; this component renders what it reports and sends actions back (see LensPage).
 * Keyboard: N notes · B blank · I intro · PageUp/PageDown chapters, also while focus is in the lens.
 */
export function LensPresenterControls({ status, ready, onStart, onAction, projectorUrl }: LensPresenterControlsProps) {
  const { t } = useTranslation();
  const disconnected = status.active && !status.connected && !status.waiting;

  const dot = !status.active
    ? 'bg-slate-400'
    : status.connected
      ? 'bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400'
      : status.waiting
        ? 'bg-amber-400 motion-safe:animate-pulse'
        : 'bg-orange-500';

  const statusText = !status.active
    ? t('lens.presenter.idle')
    : status.connected
      ? t('lens.presenter.connected')
      : status.waiting
        ? t('lens.presenter.waiting')
        : t('lens.presenter.disconnected');

  let hint: ReactNode;
  if (!status.active) hint = t('lens.presenter.startHint');
  else if (status.connected) hint = status.fullscreen ? `${t('lens.presenter.fullscreen')} ✓` : t('lens.presenter.noFullscreen');
  else if (status.waiting) hint = t('lens.presenter.help');
  else
    hint = (
      <>
        {t('lens.presenter.blocked')}{' '}
        <a href={projectorUrl} target="_blank" rel="noopener" className="font-medium text-[#8AA7FF] underline underline-offset-2">
          {t('lens.presenter.openProjectorPage')}
        </a>
      </>
    );

  let introText: ReactNode = null;
  if (status.intro) {
    if (status.introState === 'fail')
      introText = (
        <>
          {t('lens.presenter.introFail')}{' '}
          {status.introUrl && (
            <a href={status.introUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-[#8AA7FF] underline underline-offset-2">
              {t('lens.presenter.introYouTube')}
            </a>
          )}
        </>
      );
    else if (status.introState === 'muted') introText = t('lens.presenter.introMuted');
    else introText = status.introLocal ? t('lens.presenter.introLocal') : t('lens.presenter.introOn');
  }

  return (
    <section
      aria-label={t('lens.presenter.label')}
      className="hidden flex-none flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-white/10 bg-[#0B1428] px-4 py-2 text-sm text-white [@media(min-width:768px)_and_(min-height:501px)]:flex"
    >
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-white/55">{t('lens.presenter.label')}</h2>

      <p role="status" aria-live="polite" className="flex min-w-0 items-center gap-2 font-medium">
        <span className={`h-2 w-2 flex-none rounded-full ${dot}`} aria-hidden="true" />
        {statusText}
      </p>

      <p className="min-w-0 flex-1 basis-64 text-xs leading-snug text-white/65">{hint}</p>

      <div className="flex flex-wrap items-center gap-2">
        {!status.active ? (
          <button type="button" className={primaryButton} onClick={onStart} disabled={!ready}>
            <ScreensIcon />
            {t('lens.presenter.start')}
          </button>
        ) : (
          <>
            {disconnected && (
              <button type="button" className={primaryButton} onClick={onStart} disabled={!ready}>
                <ScreensIcon />
                {t('lens.presenter.openProjector')}
              </button>
            )}
            <button
              type="button"
              className={status.notes ? pressedButton : plainButton}
              aria-pressed={status.notes}
              aria-keyshortcuts="N"
              onClick={() => onAction('notes')}
              disabled={!ready}
            >
              {t('lens.presenter.notes')}
              <Kbd>N</Kbd>
            </button>
            <button
              type="button"
              className={status.blank ? pressedButton : plainButton}
              aria-pressed={status.blank}
              aria-keyshortcuts="B"
              onClick={() => onAction('blank')}
              disabled={!ready}
            >
              {t('lens.presenter.blank')}
              <Kbd>B</Kbd>
            </button>
            <button
              type="button"
              className={status.intro ? pressedButton : plainButton}
              aria-pressed={status.intro}
              aria-keyshortcuts="I"
              onClick={() => onAction('intro')}
              disabled={!ready}
            >
              <PlayStopIcon stop={status.intro} />
              {status.intro ? t('lens.presenter.introStop') : t('lens.presenter.intro')}
              <Kbd>I</Kbd>
            </button>
            <button type="button" className={plainButton} onClick={() => onAction('end')} disabled={!ready}>
              {t('lens.presenter.end')}
            </button>
          </>
        )}
      </div>

      {introText && (
        <p className="basis-full text-xs leading-snug text-white/80" aria-live="polite">
          {introText}
        </p>
      )}
    </section>
  );
}
