import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnnotationOverlay } from './AnnotationOverlay';
import type { Annotation } from '@/types';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
  }),
}));

const createAnnotation = (
  type: 'circle' | 'rect' | 'arrow',
  coords: Annotation['coords'],
  color?: string
): Annotation => ({
  type,
  coords,
  label: { pl: 'Etykieta', en: 'Label' },
  color,
});

describe('AnnotationOverlay', () => {
  describe('visibility', () => {
    it('renders nothing when visible is false', () => {
      const annotations: Annotation[] = [
        createAnnotation('circle', { x: 100, y: 100, radius: 30 }),
      ];

      const { container } = render(
        <AnnotationOverlay
          annotations={annotations}
          visible={false}
          imageWidth={1000}
          imageHeight={1000}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when annotations array is empty', () => {
      const { container } = render(
        <AnnotationOverlay
          annotations={[]}
          visible={true}
          imageWidth={1000}
          imageHeight={1000}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('renders SVG when visible is true and annotations exist', () => {
      const annotations: Annotation[] = [
        createAnnotation('circle', { x: 100, y: 100, radius: 30 }),
      ];

      render(
        <AnnotationOverlay
          annotations={annotations}
          visible={true}
          imageWidth={1000}
          imageHeight={1000}
        />
      );

      expect(screen.getByTestId('annotation-overlay')).toBeInTheDocument();
    });
  });

  describe('viewBox dimensions', () => {
    it('sets correct viewBox from imageWidth and imageHeight', () => {
      const annotations: Annotation[] = [
        createAnnotation('circle', { x: 100, y: 100, radius: 30 }),
      ];

      render(
        <AnnotationOverlay
          annotations={annotations}
          visible={true}
          imageWidth={1920}
          imageHeight={1080}
        />
      );

      const svg = screen.getByTestId('annotation-overlay');
      expect(svg.getAttribute('viewBox')).toBe('0 0 1920 1080');
    });

    it('uses different dimensions correctly', () => {
      const annotations: Annotation[] = [
        createAnnotation('circle', { x: 100, y: 100, radius: 30 }),
      ];

      render(
        <AnnotationOverlay
          annotations={annotations}
          visible={true}
          imageWidth={800}
          imageHeight={600}
        />
      );

      const svg = screen.getByTestId('annotation-overlay');
      expect(svg.getAttribute('viewBox')).toBe('0 0 800 600');
    });
  });

  describe('color application', () => {
    it('uses default color when annotation has no color', () => {
      const annotations: Annotation[] = [
        createAnnotation('circle', { x: 100, y: 100, radius: 30 }),
      ];

      const { container } = render(
        <AnnotationOverlay
          annotations={annotations}
          visible={true}
          imageWidth={1000}
          imageHeight={1000}
        />
      );

      const circle = container.querySelector('circle');
      expect(circle?.getAttribute('stroke')).toBe('#2855B1');
    });

    it('uses custom color when provided', () => {
      const annotations: Annotation[] = [
        createAnnotation('circle', { x: 100, y: 100, radius: 30 }, '#ef4444'),
      ];

      const { container } = render(
        <AnnotationOverlay
          annotations={annotations}
          visible={true}
          imageWidth={1000}
          imageHeight={1000}
        />
      );

      const circle = container.querySelector('circle');
      expect(circle?.getAttribute('stroke')).toBe('#ef4444');
    });

    it('applies color to arrow correctly', () => {
      const annotations: Annotation[] = [
        createAnnotation('arrow', { x: 100, y: 100, endX: 200, endY: 200 }, '#ffffff'),
      ];

      const { container } = render(
        <AnnotationOverlay
          annotations={annotations}
          visible={true}
          imageWidth={1000}
          imageHeight={1000}
        />
      );

      const line = container.querySelector('line');
      expect(line?.getAttribute('stroke')).toBe('#ffffff');
      expect(line?.getAttribute('marker-end')).toBe('url(#arrowhead-ffffff)');
    });

    it('applies color to rect correctly', () => {
      const annotations: Annotation[] = [
        createAnnotation('rect', { x: 100, y: 100, width: 50, height: 50 }, '#00ff00'),
      ];

      const { container } = render(
        <AnnotationOverlay
          annotations={annotations}
          visible={true}
          imageWidth={1000}
          imageHeight={1000}
        />
      );

      const rect = container.querySelector('rect');
      expect(rect?.getAttribute('stroke')).toBe('#00ff00');
    });
  });

  describe('shape rendering', () => {
    it('renders circle with correct attributes', () => {
      const annotations: Annotation[] = [
        createAnnotation('circle', { x: 150, y: 200, radius: 40 }),
      ];

      const { container } = render(
        <AnnotationOverlay
          annotations={annotations}
          visible={true}
          imageWidth={1000}
          imageHeight={1000}
        />
      );

      const circle = container.querySelector('circle');
      expect(circle).toBeInTheDocument();
      expect(circle?.getAttribute('cx')).toBe('150');
      expect(circle?.getAttribute('cy')).toBe('200');
      expect(circle?.getAttribute('r')).toBe('40');
    });

    it('renders rect with correct attributes', () => {
      const annotations: Annotation[] = [
        createAnnotation('rect', { x: 100, y: 150, width: 60, height: 80 }),
      ];

      const { container } = render(
        <AnnotationOverlay
          annotations={annotations}
          visible={true}
          imageWidth={1000}
          imageHeight={1000}
        />
      );

      const rect = container.querySelector('rect');
      expect(rect).toBeInTheDocument();
      expect(rect?.getAttribute('x')).toBe('100');
      expect(rect?.getAttribute('y')).toBe('150');
      expect(rect?.getAttribute('width')).toBe('60');
      expect(rect?.getAttribute('height')).toBe('80');
    });

    it('renders arrow with correct attributes', () => {
      const annotations: Annotation[] = [
        createAnnotation('arrow', { x: 100, y: 100, endX: 250, endY: 300 }),
      ];

      const { container } = render(
        <AnnotationOverlay
          annotations={annotations}
          visible={true}
          imageWidth={1000}
          imageHeight={1000}
        />
      );

      const line = container.querySelector('line');
      expect(line).toBeInTheDocument();
      expect(line?.getAttribute('x1')).toBe('100');
      expect(line?.getAttribute('y1')).toBe('100');
      expect(line?.getAttribute('x2')).toBe('250');
      expect(line?.getAttribute('y2')).toBe('300');
    });

    it('renders multiple annotations', () => {
      const annotations: Annotation[] = [
        createAnnotation('circle', { x: 100, y: 100, radius: 30 }),
        createAnnotation('rect', { x: 200, y: 200, width: 50, height: 50 }),
        createAnnotation('arrow', { x: 300, y: 300, endX: 400, endY: 400 }),
      ];

      const { container } = render(
        <AnnotationOverlay
          annotations={annotations}
          visible={true}
          imageWidth={1000}
          imageHeight={1000}
        />
      );

      expect(container.querySelectorAll('g')).toHaveLength(3);
      expect(container.querySelector('circle')).toBeInTheDocument();
      expect(container.querySelector('rect')).toBeInTheDocument();
      expect(container.querySelector('line')).toBeInTheDocument();
    });
  });

  describe('arrow markers', () => {
    it('creates unique marker for each color', () => {
      const annotations: Annotation[] = [
        createAnnotation('arrow', { x: 100, y: 100, endX: 200, endY: 200 }, '#ff0000'),
        createAnnotation('arrow', { x: 300, y: 300, endX: 400, endY: 400 }, '#00ff00'),
      ];

      const { container } = render(
        <AnnotationOverlay
          annotations={annotations}
          visible={true}
          imageWidth={1000}
          imageHeight={1000}
        />
      );

      const markers = container.querySelectorAll('marker');
      expect(markers).toHaveLength(2);
      expect(container.querySelector('#arrowhead-ff0000')).toBeInTheDocument();
      expect(container.querySelector('#arrowhead-00ff00')).toBeInTheDocument();
    });

    it('reuses marker for same color', () => {
      const annotations: Annotation[] = [
        createAnnotation('arrow', { x: 100, y: 100, endX: 200, endY: 200 }, '#ff0000'),
        createAnnotation('arrow', { x: 300, y: 300, endX: 400, endY: 400 }, '#ff0000'),
      ];

      const { container } = render(
        <AnnotationOverlay
          annotations={annotations}
          visible={true}
          imageWidth={1000}
          imageHeight={1000}
        />
      );

      const markers = container.querySelectorAll('marker');
      expect(markers).toHaveLength(1);
    });
  });

  describe('labels', () => {
    it('renders label text for annotations', () => {
      const annotations: Annotation[] = [
        createAnnotation('circle', { x: 100, y: 100, radius: 30 }),
      ];

      render(
        <AnnotationOverlay
          annotations={annotations}
          visible={true}
          imageWidth={1000}
          imageHeight={1000}
        />
      );

      expect(screen.getByText('Label')).toBeInTheDocument();
    });
  });
});
