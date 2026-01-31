import { useRef, useState, useEffect, useCallback } from 'react';
import type { CommentAnnotation, CommentAnnotationCoords } from '@/types';

type DrawingTool = 'arrow' | 'area';

interface DrawingCanvasProps {
  imageUrl: string;
  annotations: CommentAnnotation[];
  onAnnotationsChange: (annotations: CommentAnnotation[]) => void;
  readOnly?: boolean;
  selectedColor?: string;
  selectedTool?: DrawingTool;
}

const COLORS = ['#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];

export function DrawingCanvas({
  imageUrl,
  annotations,
  onAnnotationsChange,
  readOnly = false,
  selectedColor = COLORS[0],
  selectedTool = 'arrow',
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Load image and set up canvas
  useEffect(() => {
    // Reset state when image URL changes
    setImageLoaded(false);

    const img = new Image();
    // Only set crossOrigin for non-readOnly mode (when we need to export canvas)
    if (!readOnly) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => {
      imageRef.current = img;
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
      setImageLoaded(true);
    };

    img.onerror = (e) => {
      console.error('Failed to load image:', imageUrl, e);
      // Retry without crossOrigin if CORS fails
      if (!readOnly) {
        const fallbackImg = new Image();
        fallbackImg.onload = () => {
          imageRef.current = fallbackImg;
          setImageSize({ width: fallbackImg.naturalWidth, height: fallbackImg.naturalHeight });
          setImageLoaded(true);
        };
        fallbackImg.src = imageUrl;
      }
    };

    img.src = imageUrl;
  }, [imageUrl, readOnly]);

  // Redraw canvas when annotations or image changes
  useEffect(() => {
    if (!imageLoaded || !canvasRef.current || !imageRef.current) return;
    drawCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageLoaded, annotations, imageSize]);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const img = imageRef.current;
    if (!canvas || !ctx || !img) return;

    // Clear and draw image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Draw all annotations
    annotations.forEach((annotation) => {
      drawAnnotation(ctx, annotation, canvas.width, canvas.height);
    });
  }, [annotations, imageSize]);

  const drawAnnotation = (
    ctx: CanvasRenderingContext2D,
    annotation: CommentAnnotation,
    canvasWidth: number,
    canvasHeight: number
  ) => {
    if (!annotation || !annotation.coords) return;
    const { type, coords, color, strokeStyle } = annotation;

    // Calculate line width based on image size for consistent visibility
    const baseLineWidth = Math.max(4, Math.min(canvasWidth, canvasHeight) / 150);

    // For white color, add a dark outline for visibility
    const isWhite = color === '#ffffff' || color === 'white';

    if (isWhite) {
      // Draw dark outline first
      ctx.strokeStyle = '#000000';
      ctx.fillStyle = '#000000';
      ctx.lineWidth = baseLineWidth + 2;
      ctx.setLineDash([]);
      drawAnnotationShape(ctx, type, coords, canvasWidth, canvasHeight);
    }

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = baseLineWidth;

    if (strokeStyle === 'dashed') {
      ctx.setLineDash([12, 6]);
    } else {
      ctx.setLineDash([]);
    }

    drawAnnotationShape(ctx, type, coords, canvasWidth, canvasHeight);
  };

  const drawAnnotationShape = (
    ctx: CanvasRenderingContext2D,
    type: CommentAnnotation['type'],
    coords: CommentAnnotationCoords,
    canvasWidth: number,
    canvasHeight: number
  ) => {
    // Prevent division by zero
    if (imageSize.width === 0 || imageSize.height === 0) return;

    // Scale coords to canvas size
    const scaleX = canvasWidth / imageSize.width;
    const scaleY = canvasHeight / imageSize.height;

    switch (type) {
      case 'arrow':
        if (typeof coords.x === 'number' && typeof coords.y === 'number') {
          drawArrow(
            ctx,
            coords.x * scaleX,
            coords.y * scaleY,
            (coords.endX ?? coords.x) * scaleX,
            (coords.endY ?? coords.y) * scaleY,
            canvasWidth
          );
        }
        break;
      case 'area':
        if (Array.isArray(coords.points) && coords.points.length > 0) {
          ctx.beginPath();
          ctx.moveTo(coords.points[0].x * scaleX, coords.points[0].y * scaleY);
          coords.points.forEach((point) => {
            ctx.lineTo(point.x * scaleX, point.y * scaleY);
          });
          ctx.closePath();
          ctx.stroke();
        }
        break;
    }
  };

  const drawArrow = (
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    canvasWidth: number
  ) => {
    // Scale arrow head size based on canvas size
    const headLength = Math.max(15, canvasWidth / 60);
    const angle = Math.atan2(toY - fromY, toX - fromX);

    // Calculate where the line should stop (at the base of the arrowhead)
    const lineEndX = toX - headLength * Math.cos(angle);
    const lineEndY = toY - headLength * Math.sin(angle);

    // Draw line (stops at base of arrowhead)
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(lineEndX, lineEndY);
    ctx.stroke();

    // Draw arrowhead
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - headLength * Math.cos(angle - Math.PI / 6),
      toY - headLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      toX - headLength * Math.cos(angle + Math.PI / 6),
      toY - headLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  };

  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    // Scale from displayed size to canvas internal size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (readOnly) return;
    e.preventDefault();

    const coords = getCanvasCoords(e);
    setIsDrawing(true);
    setCurrentPoints([coords]);
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || readOnly) return;
    e.preventDefault();

    const coords = getCanvasCoords(e);

    if (selectedTool === 'area') {
      setCurrentPoints((prev) => [...prev, coords]);
    } else {
      setCurrentPoints((prev) => [prev[0], coords]);
    }

    // Draw preview
    drawPreview();
  };

  const handleMouseUp = () => {
    if (!isDrawing || readOnly || currentPoints.length < 2) {
      setIsDrawing(false);
      setCurrentPoints([]);
      return;
    }

    const newAnnotation = createAnnotation();
    if (newAnnotation) {
      onAnnotationsChange([...annotations, newAnnotation]);
    }

    setIsDrawing(false);
    setCurrentPoints([]);
  };

  const createAnnotation = (): CommentAnnotation | null => {
    if (currentPoints.length < 2) return null;

    const startPoint = currentPoints[0];
    const endPoint = currentPoints[currentPoints.length - 1];

    let coords: CommentAnnotationCoords;

    switch (selectedTool) {
      case 'arrow':
        coords = {
          x: startPoint.x,
          y: startPoint.y,
          endX: endPoint.x,
          endY: endPoint.y,
        };
        break;
      case 'area':
        coords = {
          x: startPoint.x,
          y: startPoint.y,
          points: currentPoints,
        };
        break;
      default:
        return null;
    }

    return {
      type: selectedTool,
      coords,
      color: selectedColor,
      strokeStyle: selectedTool === 'area' ? 'dashed' : 'solid',
    };
  };

  const drawPreview = () => {
    if (!canvasRef.current || !imageRef.current || currentPoints.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Redraw base
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height);

    // Draw existing annotations
    annotations.forEach((annotation) => {
      drawAnnotation(ctx, annotation, canvas.width, canvas.height);
    });

    // Draw current preview
    if (currentPoints.length >= 2) {
      const previewAnnotation = createAnnotation();
      if (previewAnnotation) {
        drawAnnotation(ctx, previewAnnotation, canvas.width, canvas.height);
      }
    }
  };

  const handleUndo = () => {
    if (annotations.length > 0) {
      onAnnotationsChange(annotations.slice(0, -1));
    }
  };

  const handleClear = () => {
    onAnnotationsChange([]);
  };

  if (!imageLoaded) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-100 rounded-lg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <canvas
        ref={canvasRef}
        width={imageSize.width}
        height={imageSize.height}
        className="max-w-full h-auto cursor-crosshair touch-none"
        style={{ maxHeight: '60vh' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
      />

      {!readOnly && annotations.length > 0 && (
        <div className="absolute top-2 right-2 flex gap-2">
          <button
            onClick={handleUndo}
            className="p-2 bg-white/90 rounded-lg shadow hover:bg-white"
            title="Undo"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <button
            onClick={handleClear}
            className="p-2 bg-white/90 rounded-lg shadow hover:bg-white"
            title="Clear all"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// Toolbar component for selecting tools and colors
interface DrawingToolbarProps {
  selectedTool: DrawingTool;
  selectedColor: string;
  onToolChange: (tool: DrawingTool) => void;
  onColorChange: (color: string) => void;
}

export function DrawingToolbar({
  selectedTool,
  selectedColor,
  onToolChange,
  onColorChange,
}: DrawingToolbarProps) {
  const tools: { type: DrawingTool; label: string; icon: React.ReactNode }[] = [
    {
      type: 'arrow',
      label: 'Arrow',
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
    {
      type: 'area',
      label: 'Freeform',
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-4 p-3 bg-gray-50 rounded-lg">
      <div className="flex gap-1">
        {tools.map((tool) => (
          <button
            key={tool.type}
            onClick={() => onToolChange(tool.type)}
            className={`p-3 rounded-lg transition-colors ${
              selectedTool === tool.type
                ? 'bg-primary text-white'
                : 'bg-white hover:bg-gray-100'
            }`}
            title={tool.label}
          >
            {tool.icon}
          </button>
        ))}
      </div>

      <div className="w-px h-8 bg-gray-300" />

      <div className="flex gap-1">
        {COLORS.map((color) => (
          <button
            key={color}
            onClick={() => onColorChange(color)}
            className={`w-8 h-8 rounded-full border-2 transition-transform ${
              selectedColor === color
                ? 'border-gray-800 scale-110'
                : color === '#ffffff'
                ? 'border-gray-300'
                : 'border-transparent'
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  );
}

export { COLORS };
export type { DrawingTool };
