import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { parseLensMessage, shouldForwardKey, type AppMessage, type LensMessage } from './lensBridge';

/**
 * Talks to the lens page in `frameRef`: calls `onMessage` for each valid message from that frame
 * (same origin only) and returns a function that sends messages to it.
 */
export function useLensBridge(
  frameRef: RefObject<HTMLIFrameElement | null>,
  onMessage: (message: LensMessage) => void
): (message: AppMessage) => void {
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const frameWindow = frameRef.current?.contentWindow;
      if (!frameWindow || event.source !== frameWindow || event.origin !== window.location.origin) return;
      const message = parseLensMessage(event.data);
      if (message) onMessageRef.current(message);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [frameRef]);

  return useCallback(
    (message: AppMessage) => {
      frameRef.current?.contentWindow?.postMessage({ source: 'btl-app', ...message }, window.location.origin);
    },
    [frameRef]
  );
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Keys pressed while focus is on the app around the frame (not inside it) still reach the lens,
 * so chapter keys, clickers and presenter shortcuts work whatever was clicked last.
 */
export function useForwardKeysToLens(post: (message: AppMessage) => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || isEditable(event.target)) return;
      if (!shouldForwardKey(event)) return;
      // Space on a focused button or link activates it: leave that to the browser
      if (event.key === ' ' && event.target instanceof HTMLElement && event.target.closest('button, a, [role="button"]')) return;
      post({
        type: 'key',
        key: event.key,
        code: event.code,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
      });
      if (event.key === ' ' || event.key === 'PageUp' || event.key === 'PageDown') event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [post, enabled]);
}
