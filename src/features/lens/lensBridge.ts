/**
 * "Beneath the Lens" is a self-contained 3D page (lens-app/, a separate Vite entry) that the app frames
 * at /lens/. This module is the app side of their postMessage protocol; the lens side is the
 * "app bridge" section at the end of lens-app/engine.js. Keep the two in step.
 */

/** The lens page, built from lens-app/index.html. */
export const LENS_APP_PATH = '/lens-app/index.html';
/** App route that frames the lens (login required). */
export const LENS_ROUTE = '/lens/';
/** App route that frames the projector (audience) view of a presentation (admins only). */
export const LENS_PROJECTOR_ROUTE = '/lens/projector';

/** Chapter keys of the lens (`CH` in lens-app/engine.js), usable as /lens/#<key> deep links. */
export const LENS_CHAPTERS = [
  'instrument',
  'glare',
  'light',
  'depth',
  'layers',
  'atlas',
  'evo',
  'sites',
] as const;
export type LensChapter = (typeof LENS_CHAPTERS)[number];

export type LensLang = 'pl' | 'en';

/** The explainer's stage colour (its --ground), also used for the page around the frame and the browser toolbar. */
export const LENS_THEME_COLOR = '#0D1830';
export type PresenterAction = 'start' | 'notes' | 'blank' | 'intro' | 'end';
export type IntroState = '' | 'load' | 'play' | 'muted' | 'fail';

/** Presenter state, as reported by the lens (admins only). */
export interface PresenterStatus {
  /** this window is the presenter */
  active: boolean;
  /** a projector window is connected */
  connected: boolean;
  /** the projector window is in full screen */
  fullscreen: boolean;
  /** a projector window was just requested and has not said hello yet */
  waiting: boolean;
  /** the notes panel is shown on the projector */
  notes: boolean;
  /** the projector is blanked */
  blank: boolean;
  /** the intro video is playing */
  intro: boolean;
  introState: IntroState;
  /** no projector: the intro plays in the presenter's window */
  introLocal: boolean;
  /** the intro on YouTube, offered when it cannot be embedded */
  introUrl: string;
}

export const IDLE_PRESENTER_STATUS: PresenterStatus = {
  active: false,
  connected: false,
  fullscreen: false,
  waiting: false,
  notes: false,
  blank: false,
  intro: false,
  introState: '',
  introLocal: false,
  introUrl: '',
};

/** Messages the lens sends to the app. */
export type LensMessage =
  | { type: 'ready' }
  | { type: 'error' }
  | { type: 'chapter'; key: LensChapter }
  | { type: 'lang'; lang: LensLang }
  | { type: 'exit' }
  | { type: 'close' }
  | { type: 'presenter'; status: PresenterStatus };

/** Messages the app sends to the lens (the bridge adds `source: 'btl-app'`). */
export type AppMessage =
  | { type: 'presenter'; action: PresenterAction }
  | {
      type: 'key';
      key: string;
      code: string;
      shiftKey: boolean;
      altKey: boolean;
      ctrlKey: boolean;
      metaKey: boolean;
    }
  | { type: 'sync' };

const INTRO_STATES: readonly IntroState[] = ['', 'load', 'play', 'muted', 'fail'];

export function isLensChapter(value: unknown): value is LensChapter {
  return typeof value === 'string' && (LENS_CHAPTERS as readonly string[]).includes(value);
}

export function toLensLang(language: string | undefined): LensLang {
  return language?.toLowerCase().startsWith('pl') ? 'pl' : 'en';
}

interface LensSrcOptions {
  lang: LensLang;
  /** admins: the lens reports presenter state and accepts presenter actions */
  presenter?: boolean;
  /** chapter to open with (ignored for the projector view) */
  chapter?: string;
  /** the projector (audience) view of a presentation */
  audience?: boolean;
}

/** URL of the lens page for the iframe. */
export function buildLensSrc({ lang, presenter = false, chapter, audience = false }: LensSrcOptions): string {
  const params = new URLSearchParams({ lang });
  if (presenter && !audience) params.set('role', 'presenter');
  const hash = audience ? '#audience' : isLensChapter(chapter) ? `#${chapter}` : '';
  return `${LENS_APP_PATH}?${params.toString()}${hash}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parsePresenterStatus(value: unknown): PresenterStatus | null {
  if (!isRecord(value)) return null;
  const flags = ['active', 'connected', 'fullscreen', 'waiting', 'notes', 'blank', 'intro', 'introLocal'] as const;
  if (!flags.every((flag) => typeof value[flag] === 'boolean')) return null;
  if (!INTRO_STATES.includes(value.introState as IntroState)) return null;
  // only ever rendered as a link: accept YouTube https URLs and nothing else
  const introUrl =
    typeof value.introUrl === 'string' && /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]+$/.test(value.introUrl)
      ? value.introUrl
      : '';
  return {
    introUrl,
    active: value.active as boolean,
    connected: value.connected as boolean,
    fullscreen: value.fullscreen as boolean,
    waiting: value.waiting as boolean,
    notes: value.notes as boolean,
    blank: value.blank as boolean,
    intro: value.intro as boolean,
    introState: value.introState as IntroState,
    introLocal: value.introLocal as boolean,
  };
}

/** Validates a message from the lens frame; anything unexpected is dropped (returns null). */
export function parseLensMessage(data: unknown): LensMessage | null {
  if (!isRecord(data) || data.source !== 'btl-lens') return null;
  switch (data.type) {
    case 'ready':
    case 'error':
    case 'exit':
    case 'close':
      return { type: data.type };
    case 'chapter':
      return isLensChapter(data.key) ? { type: 'chapter', key: data.key } : null;
    case 'lang':
      return data.lang === 'pl' || data.lang === 'en' ? { type: 'lang', lang: data.lang } : null;
    case 'presenter': {
      const status = parsePresenterStatus(data.status);
      return status ? { type: 'presenter', status } : null;
    }
    default:
      return null;
  }
}

/**
 * Keys pressed while focus is on the app around the frame (e.g. the presenter controls) that the lens
 * should still handle: chapters 1–8, PageUp/PageDown (clickers), arrows and Space (evolution stages),
 * N/B/I (presenter), F (projector full screen) and Escape (closes a local intro).
 */
export function shouldForwardKey(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return /^(?:[1-8]|[bnifBNIF]| |ArrowLeft|ArrowRight|PageUp|PageDown|Escape)$/.test(event.key);
}
