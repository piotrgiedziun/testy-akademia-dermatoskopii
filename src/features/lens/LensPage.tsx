import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';
import { useDocumentTitle, useThemeColor } from '@/hooks';
import { Loading } from '@/components/ui';
import { LensFrame } from './LensFrame';
import { LensLoadProblem } from './LensLoadProblem';
import { LensPresenterControls } from './LensPresenterControls';
import {
  buildLensSrc,
  IDLE_PRESENTER_STATUS,
  LENS_PROJECTOR_ROUTE,
  LENS_THEME_COLOR,
  toLensLang,
  type PresenterStatus,
} from './lensBridge';
import { openProjectorWindow } from './projectorWindow';
import { useForwardKeysToLens, useLensBridge } from './useLensBridge';

/**
 * /lens/ — "Beneath the Lens", the interactive 3D explainer of dermatoscopy, for every logged-in user.
 * Admins also get the presenter controls, to show it on a course with a projector.
 * Deep links to a chapter: /lens/#atlas, /lens/#evo, … (see LENS_CHAPTERS).
 */
export function LensPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [presenter, setPresenter] = useState<PresenterStatus>(IDLE_PRESENTER_STATUS);
  const [slow, setSlow] = useState(false);
  const [failed, setFailed] = useState(false);

  // Fixed for the life of the page: a new src would rebuild the whole 3D scene.
  const [src] = useState(() =>
    buildLensSrc({
      lang: toLensLang(i18n.resolvedLanguage ?? i18n.language),
      presenter: isAdmin,
      chapter: location.hash.slice(1),
    })
  );

  useDocumentTitle(t('lens.documentTitle'));
  // the explainer's dark stage reaches the top edge: the mobile browser toolbar follows it
  useThemeColor(LENS_THEME_COLOR);

  // the scene normally builds in a few seconds; if it has not after 25 s, offer a reload (and a way back)
  useEffect(() => {
    if (ready || failed) return;
    const timer = window.setTimeout(() => setSlow(true), 25_000);
    return () => window.clearTimeout(timer);
  }, [ready, failed]);

  const leave = useCallback(() => {
    // back to where the user came from inside the app, else to the course
    const index = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (index > 0) navigate(-1);
    else navigate('/levels');
  }, [navigate]);

  const post = useLensBridge(frameRef, (message) => {
    switch (message.type) {
      case 'ready':
        setReady(true);
        break;
      case 'error':
        setFailed(true);
        break;
      case 'chapter':
        // keep the chapter in the address bar (shareable /lens/#atlas); the router state is kept as is
        window.history.replaceState(
          window.history.state,
          '',
          `${window.location.pathname}${window.location.search}#${message.key}`
        );
        break;
      case 'lang':
        if (toLensLang(i18n.resolvedLanguage ?? i18n.language) !== message.lang) void i18n.changeLanguage(message.lang);
        break;
      case 'exit':
        leave();
        break;
      case 'presenter':
        setPresenter(message.status);
        break;
      case 'close':
        break;
    }
  });

  useForwardKeysToLens(post);

  const startPresentation = useCallback(() => {
    post({ type: 'presenter', action: 'start' });
    void openProjectorWindow(LENS_PROJECTOR_ROUTE);
  }, [post]);

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0D1830]">
      {isAdmin && (
        <LensPresenterControls
          status={presenter}
          ready={ready}
          onStart={startPresentation}
          onAction={(action) => post({ type: 'presenter', action })}
          projectorUrl={LENS_PROJECTOR_ROUTE}
        />
      )}
      <main className="relative min-h-0 flex-1">
        {/* shows through until the lens paints its own loading screen over it */}
        {!ready && (
          <div className="absolute inset-0 grid place-items-center">
            <Loading />
          </div>
        )}
        <LensFrame
          ref={frameRef}
          src={src}
          title={t('lens.frameTitle')}
          autoFocus
          onLoad={() => post({ type: 'sync' })}
        />
        {(failed || (slow && !ready)) && (
          <LensLoadProblem kind={failed ? 'error' : 'slow'} onRetry={() => window.location.reload()} onBack={leave} />
        )}
      </main>
    </div>
  );
}
