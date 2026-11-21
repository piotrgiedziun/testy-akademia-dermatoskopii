import { describe, expect, it } from 'vitest';
import {
  buildLensSrc,
  IDLE_PRESENTER_STATUS,
  isLensChapter,
  LENS_APP_PATH,
  parseLensMessage,
  shouldForwardKey,
  toLensLang,
} from './lensBridge';

describe('buildLensSrc', () => {
  it('passes the language and opens a known chapter', () => {
    expect(buildLensSrc({ lang: 'pl', chapter: 'atlas' })).toBe(`${LENS_APP_PATH}?lang=pl#atlas`);
  });

  it('asks for presenter controls only for presenters', () => {
    expect(buildLensSrc({ lang: 'en', presenter: true })).toBe(`${LENS_APP_PATH}?lang=en&role=presenter`);
    expect(buildLensSrc({ lang: 'en', presenter: false })).toBe(`${LENS_APP_PATH}?lang=en`);
  });

  it('ignores unknown chapters (no arbitrary hash reaches the frame)', () => {
    expect(buildLensSrc({ lang: 'en', chapter: 'audience' })).toBe(`${LENS_APP_PATH}?lang=en`);
    expect(buildLensSrc({ lang: 'en', chapter: '"><script>' })).toBe(`${LENS_APP_PATH}?lang=en`);
  });

  it('builds the projector view without presenter role or chapter', () => {
    expect(buildLensSrc({ lang: 'en', audience: true, presenter: true, chapter: 'evo' })).toBe(
      `${LENS_APP_PATH}?lang=en#audience`
    );
  });
});

describe('toLensLang / isLensChapter', () => {
  it('maps app languages to the two lens languages', () => {
    expect(toLensLang('pl')).toBe('pl');
    expect(toLensLang('pl-PL')).toBe('pl');
    expect(toLensLang('en-US')).toBe('en');
    expect(toLensLang('de')).toBe('en');
    expect(toLensLang(undefined)).toBe('en');
  });

  it('knows the eight chapters', () => {
    expect(isLensChapter('instrument')).toBe(true);
    expect(isLensChapter('sites')).toBe(true);
    expect(isLensChapter('audience')).toBe(false);
    expect(isLensChapter(3)).toBe(false);
  });
});

describe('parseLensMessage', () => {
  const status = { ...IDLE_PRESENTER_STATUS, active: true, waiting: true, introUrl: 'https://www.youtube.com/watch?v=diGnvjehtW8' };

  it('accepts the lens messages', () => {
    expect(parseLensMessage({ source: 'btl-lens', type: 'ready' })).toEqual({ type: 'ready' });
    expect(parseLensMessage({ source: 'btl-lens', type: 'exit' })).toEqual({ type: 'exit' });
    expect(parseLensMessage({ source: 'btl-lens', type: 'close' })).toEqual({ type: 'close' });
    expect(parseLensMessage({ source: 'btl-lens', type: 'error' })).toEqual({ type: 'error' });
    expect(parseLensMessage({ source: 'btl-lens', type: 'chapter', key: 'evo' })).toEqual({ type: 'chapter', key: 'evo' });
    expect(parseLensMessage({ source: 'btl-lens', type: 'lang', lang: 'pl' })).toEqual({ type: 'lang', lang: 'pl' });
    expect(parseLensMessage({ source: 'btl-lens', type: 'presenter', status })).toEqual({ type: 'presenter', status });
  });

  it('drops messages from anything else (e.g. the YouTube player, other tools)', () => {
    expect(parseLensMessage(null)).toBeNull();
    expect(parseLensMessage('{"event":"onReady"}')).toBeNull();
    expect(parseLensMessage({ event: 'infoDelivery' })).toBeNull();
    expect(parseLensMessage({ source: 'btl-app', type: 'ready' })).toBeNull();
    expect(parseLensMessage({ source: 'btl-lens', type: 'navigate', to: '/admin' })).toBeNull();
  });

  it('validates payloads', () => {
    expect(parseLensMessage({ source: 'btl-lens', type: 'chapter', key: 'nope' })).toBeNull();
    expect(parseLensMessage({ source: 'btl-lens', type: 'lang', lang: 'de' })).toBeNull();
    expect(parseLensMessage({ source: 'btl-lens', type: 'presenter', status: { active: 'yes' } })).toBeNull();
    expect(parseLensMessage({ source: 'btl-lens', type: 'presenter', status: { ...status, introState: 'weird' } })).toBeNull();
  });

  it('only keeps a YouTube watch URL for the intro link', () => {
    const evil = parseLensMessage({ source: 'btl-lens', type: 'presenter', status: { ...status, introUrl: 'javascript:alert(1)' } });
    expect(evil).toEqual({ type: 'presenter', status: { ...status, introUrl: '' } });
  });
});

describe('shouldForwardKey', () => {
  const key = (k: string, mods: Partial<KeyboardEvent> = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods });

  it('forwards the lens shortcuts', () => {
    for (const k of ['1', '8', 'n', 'B', 'i', 'f', ' ', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Escape']) {
      expect(shouldForwardKey(key(k))).toBe(true);
    }
  });

  it('leaves other keys and browser shortcuts alone', () => {
    for (const k of ['9', '0', 'a', 'Tab', 'Enter', 'ArrowUp', 'F5']) expect(shouldForwardKey(key(k))).toBe(false);
    expect(shouldForwardKey(key('n', { ctrlKey: true }))).toBe(false);
    expect(shouldForwardKey(key('1', { metaKey: true }))).toBe(false);
    expect(shouldForwardKey(key('b', { altKey: true }))).toBe(false);
  });
});
