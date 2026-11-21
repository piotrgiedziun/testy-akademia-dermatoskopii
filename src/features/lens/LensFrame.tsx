import { forwardRef } from 'react';

interface LensFrameProps {
  src: string;
  /** accessible name of the frame */
  title: string;
  /** move keyboard focus into the lens once it has loaded (its shortcuts then work at once) */
  autoFocus?: boolean;
  onLoad?: () => void;
}

/**
 * The lens page in an iframe. Same origin, so nothing is sandboxed; the frame isolates the lens's
 * global CSS, listeners and WebGL context from the app and tears all of it down on unmount.
 * `allow` lets it go full screen (dock button, projector window) and lets the intro video autoplay.
 */
export const LensFrame = forwardRef<HTMLIFrameElement, LensFrameProps>(function LensFrame(
  { src, title, autoFocus = false, onLoad },
  ref
) {
  return (
    <iframe
      ref={ref}
      src={src}
      title={title}
      className="absolute inset-0 block h-full w-full border-0"
      allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
      onLoad={(event) => {
        if (autoFocus) event.currentTarget.focus();
        onLoad?.();
      }}
    />
  );
});
