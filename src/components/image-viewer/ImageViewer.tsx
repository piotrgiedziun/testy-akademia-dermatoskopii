import { useState, useEffect, useCallback, ReactNode } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import type { CaseImage } from '@/types';

interface ImageViewerProps {
  images: CaseImage[];
  onImageLoad?: () => void;
  children?: ReactNode;
  /** Additional controls to render next to zoom buttons (outside transform) */
  controls?: ReactNode;
}

export function ImageViewer({ images, onImageLoad, children, controls }: ImageViewerProps) {
  const { t } = useTranslation();
  const [currentImageType, setCurrentImageType] = useState<'polarized' | 'non-polarized'>(
    images[0]?.type || 'polarized'
  );
  const [isLoading, setIsLoading] = useState(true);

  const currentImage = images.find((img) => img.type === currentImageType) || images[0];
  const hasBothTypes =
    images.some((img) => img.type === 'polarized') &&
    images.some((img) => img.type === 'non-polarized');

  const preloadImages = useCallback(async () => {
    const promises = images.map(
      (img) =>
        new Promise<string>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(img.url);
          image.onerror = () => reject(new Error(`Failed to load ${img.url}`));
          image.src = img.url;
        })
    );

    try {
      await Promise.all(promises);
      setIsLoading(false);
      onImageLoad?.();
    } catch (error) {
      console.error('Error preloading images:', error);
      setIsLoading(false);
      onImageLoad?.();
    }
  }, [images, onImageLoad]);

  useEffect(() => {
    setIsLoading(true);
    preloadImages();
  }, [preloadImages]);

  const toggleImageType = () => {
    setCurrentImageType((prev) =>
      prev === 'polarized' ? 'non-polarized' : 'polarized'
    );
  };

  if (isLoading) {
    return (
      <div className="relative w-full aspect-square max-h-[60vh] bg-gray-100 rounded-xl flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500">{t('quiz.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full bg-black rounded-xl overflow-hidden">
      <TransformWrapper
        initialScale={1}
        minScale={0.5}
        maxScale={5}
        centerOnInit
        wheel={{ step: 0.1 }}
        pinch={{ step: 5 }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <TransformComponent
              wrapperStyle={{ width: '100%', height: '100%' }}
              contentStyle={{ width: '100%', height: '100%' }}
            >
              <div className="relative w-full aspect-square max-h-[60vh] flex items-center justify-center">
                <img
                  src={currentImage?.url}
                  alt="Dermatoscopic image"
                  className="max-w-full max-h-full object-contain"
                  draggable={false}
                />
                {children}
              </div>
            </TransformComponent>

            <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center">
              <div className="flex gap-2">
                <button
                  onClick={() => zoomOut()}
                  className="p-2 bg-white bg-opacity-90 rounded-lg shadow hover:bg-opacity-100 transition-colors"
                  aria-label="Zoom out"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                </button>
                <button
                  onClick={() => zoomIn()}
                  className="p-2 bg-white bg-opacity-90 rounded-lg shadow hover:bg-opacity-100 transition-colors"
                  aria-label="Zoom in"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                <button
                  onClick={() => resetTransform()}
                  className="p-2 bg-white bg-opacity-90 rounded-lg shadow hover:bg-opacity-100 transition-colors"
                  aria-label="Reset zoom"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                    />
                  </svg>
                </button>
                {controls}
              </div>

              {hasBothTypes && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={toggleImageType}
                  className="bg-white bg-opacity-90 hover:bg-opacity-100"
                >
                  {currentImageType === 'polarized'
                    ? t('quiz.nonPolarized')
                    : t('quiz.polarized')}
                </Button>
              )}
            </div>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
