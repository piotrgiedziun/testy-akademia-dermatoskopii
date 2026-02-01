import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import type { CommunityCaseImage } from '@/types';

interface CaseImageGalleryProps {
  images: CommunityCaseImage[];
}

export function CaseImageGallery({ images }: CaseImageGalleryProps) {
  const { t } = useTranslation();
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const selectedImage = images[selectedImageIndex];

  const getImageTypeLabel = (type: string) => {
    switch (type) {
      case 'dermatoscopic':
        return t('community.dermatoscopic');
      case 'macro':
        return t('community.macro');
      default:
        return t('community.other');
    }
  };

  if (images.length === 0) {
    return (
      <div className="bg-gray-100 rounded-lg p-8 text-center text-gray-500">
        {t('community.noImages')}
      </div>
    );
  }

  const renderZoomControls = (zoomIn: () => void, zoomOut: () => void, resetTransform: () => void) => (
    <div className="absolute bottom-4 left-4 flex gap-2 z-10">
      <button
        onClick={(e) => {
          e.stopPropagation();
          zoomOut();
        }}
        className="p-2 bg-white bg-opacity-90 rounded-lg shadow hover:bg-opacity-100 transition-colors"
        aria-label="Zoom out"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
        </svg>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          zoomIn();
        }}
        className="p-2 bg-white bg-opacity-90 rounded-lg shadow hover:bg-opacity-100 transition-colors"
        aria-label="Zoom in"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          resetTransform();
        }}
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
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Main image viewer with zoom */}
      <div className="relative bg-black rounded-lg overflow-hidden">
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
                <div className="relative w-full flex items-center justify-center">
                  <img
                    src={selectedImage.url}
                    alt={`Image ${selectedImageIndex + 1}`}
                    className="w-full max-h-[60vh] object-contain"
                    draggable={false}
                  />
                </div>
              </TransformComponent>

              {/* Zoom controls */}
              {renderZoomControls(zoomIn, zoomOut, resetTransform)}

              {/* Image type badge */}
              <div className="absolute top-3 left-3 z-10">
                <span className="px-2 py-1 bg-black/70 text-white text-sm rounded">
                  {getImageTypeLabel(selectedImage.type)}
                </span>
              </div>

              {/* Image counter */}
              <div className="absolute bottom-4 right-4 z-10">
                <span className="px-2 py-1 bg-black/70 text-white text-sm rounded">
                  {selectedImageIndex + 1} / {images.length}
                </span>
              </div>
            </>
          )}
        </TransformWrapper>
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {images.map((image, index) => (
            <button
              key={image.id}
              onClick={() => setSelectedImageIndex(index)}
              className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-colors ${
                index === selectedImageIndex ? 'border-primary' : 'border-transparent'
              }`}
            >
              <img
                src={image.url}
                alt={`Thumbnail ${index + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
