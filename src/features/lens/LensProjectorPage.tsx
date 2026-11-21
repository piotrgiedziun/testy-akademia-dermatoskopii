import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle, useThemeColor } from '@/hooks';
import { LensFrame } from './LensFrame';
import { LensLoadProblem } from './LensLoadProblem';
import { buildLensSrc, LENS_THEME_COLOR, toLensLang } from './lensBridge';
import { useForwardKeysToLens, useLensBridge } from './useLensBridge';

/**
 * /lens/projector — the projector (audience) window of a presentation, opened from the presenter
 * controls on /lens/ (admins). It renders the scene itself at the projector's resolution and follows
 * the presenter's window; click it or press F for full screen.
 */
export function LensProjectorPage() {
  const { t, i18n } = useTranslation();
  const frameRef = useRef<HTMLIFrameElement>(null);
  // the presenter's state sets the language once connected; this is only the first paint
  const [src] = useState(() =>
    buildLensSrc({ lang: toLensLang(i18n.resolvedLanguage ?? i18n.language), audience: true })
  );

  const [failed, setFailed] = useState(false);

  useDocumentTitle(t('lens.projectorDocumentTitle'));
  useThemeColor(LENS_THEME_COLOR);

  const post = useLensBridge(frameRef, (message) => {
    // the presenter ended the show; a frame cannot close its window, so the page does
    if (message.type === 'close') window.close();
    else if (message.type === 'error') setFailed(true);
  });

  useForwardKeysToLens(post);

  return (
    <main className="fixed inset-0 bg-[#0D1830]">
      <LensFrame ref={frameRef} src={src} title={t('lens.projectorFrameTitle')} autoFocus />
      {failed && <LensLoadProblem kind="error" onRetry={() => window.location.reload()} />}
    </main>
  );
}
