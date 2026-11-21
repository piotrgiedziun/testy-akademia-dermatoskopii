/**
 * Opens the projector window of a presentation, on another screen when the browser can tell where it is
 * (Window Management API, Chromium; asks for permission the first time).
 */

interface ScreenDetailed extends Screen {
  readonly availLeft: number;
  readonly availTop: number;
}

interface ScreenDetails {
  readonly screens: readonly ScreenDetailed[];
  readonly currentScreen: ScreenDetailed;
}

type WindowWithScreenDetails = Window & { getScreenDetails?: () => Promise<ScreenDetails> };

const DEFAULT_FEATURES = 'popup,width=1280,height=720';
/**
 * A first-time permission prompt must not hold the window back for long: the click's user activation,
 * which `window.open` needs, expires after a few seconds and the pop-up would then be blocked.
 */
const SCREEN_DETAILS_TIMEOUT_MS = 2500;

async function projectorFeatures(): Promise<string> {
  const win = window as WindowWithScreenDetails;
  if (typeof win.getScreenDetails !== 'function') return DEFAULT_FEATURES;
  try {
    const permission = await navigator.permissions
      ?.query({ name: 'window-management' as PermissionName })
      .catch(() => null);
    if (permission?.state === 'denied') return DEFAULT_FEATURES;
    const details = await Promise.race([
      win.getScreenDetails(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), SCREEN_DETAILS_TIMEOUT_MS)),
    ]);
    const other = details?.screens.find((screen) => screen !== details.currentScreen);
    if (!other) return DEFAULT_FEATURES;
    return `popup,left=${other.availLeft},top=${other.availTop},width=${other.availWidth},height=${other.availHeight}`;
  } catch {
    return DEFAULT_FEATURES;
  }
}

/**
 * Must be called from a click handler. `noopener` gives the projector window a renderer process of its
 * own, so the two 3D scenes do not share a main thread; it also means `window.open` returns null either
 * way, so a blocked pop-up shows up as a projector that never connects (see LensPresenterControls).
 */
export async function openProjectorWindow(url: string): Promise<void> {
  const features = await projectorFeatures();
  window.open(url, '_blank', `${features},noopener`);
}
