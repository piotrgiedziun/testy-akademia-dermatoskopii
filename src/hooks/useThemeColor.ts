import { useEffect } from 'react';

/**
 * Sets the browser's theme colour (the toolbar on mobile browsers, the status bar of the installed app)
 * while the calling component is mounted, then restores the previous one. Browsers read it only from
 * the top-level document, so a framed page cannot set it itself.
 */
export function useThemeColor(color: string): void {
  useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const created = !meta;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    const previous = meta.getAttribute('content');
    meta.setAttribute('content', color);
    return () => {
      if (created) meta.remove();
      else if (previous !== null) meta.setAttribute('content', previous);
    };
  }, [color]);
}
