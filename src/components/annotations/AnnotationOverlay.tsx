import { useTranslation } from 'react-i18next';
import type { Annotation, LocalizedString } from '@/types';

interface AnnotationOverlayProps {
  annotations: Annotation[];
  visible: boolean;
  imageWidth: number;
  imageHeight: number;
}

function getLocalizedText(text: LocalizedString, lang: string): string {
  return lang === 'pl' ? text.pl : text.en;
}

export function AnnotationOverlay({
  annotations,
  visible,
  imageWidth,
  imageHeight,
}: AnnotationOverlayProps) {
  const { i18n } = useTranslation();

  if (!visible || !annotations || annotations.length === 0) {
    return null;
  }

  // Collect unique colors for arrow markers
  const arrowColors = new Set<string>();
  annotations.forEach((ann) => {
    if (ann.type === 'arrow') {
      arrowColors.add(ann.color || '#2855B1');
    }
  });

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox={`0 0 ${imageWidth} ${imageHeight}`}
      preserveAspectRatio="xMidYMid meet"
      data-testid="annotation-overlay"
    >
      <defs>
        {/* Create a marker for each unique arrow color */}
        {Array.from(arrowColors).map((color) => (
          <marker
            key={color}
            id={`arrowhead-${color.replace('#', '')}`}
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill={color} />
          </marker>
        ))}
      </defs>

      {annotations.map((annotation, index) => {
        const { type, coords, label, color } = annotation;
        const strokeColor = color || '#2855B1';
        const labelText = getLocalizedText(label, i18n.language);

        switch (type) {
          case 'circle':
            return (
              <g key={index}>
                <circle
                  cx={coords.x}
                  cy={coords.y}
                  r={coords.radius || 30}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="3"
                  strokeDasharray="5,5"
                />
                {labelText && (
                  <text
                    x={coords.x}
                    y={coords.y + (coords.radius || 30) + 20}
                    textAnchor="middle"
                    fill={strokeColor}
                    fontSize="14"
                    fontWeight="600"
                    className="drop-shadow-sm"
                  >
                    <tspan
                      style={{
                        paintOrder: 'stroke',
                        stroke: 'white',
                        strokeWidth: '3px',
                      }}
                    >
                      {labelText}
                    </tspan>
                  </text>
                )}
              </g>
            );

          case 'rect':
            return (
              <g key={index}>
                <rect
                  x={coords.x}
                  y={coords.y}
                  width={coords.width || 50}
                  height={coords.height || 50}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="3"
                  strokeDasharray="5,5"
                />
                {labelText && (
                  <text
                    x={coords.x + (coords.width || 50) / 2}
                    y={coords.y + (coords.height || 50) + 20}
                    textAnchor="middle"
                    fill={strokeColor}
                    fontSize="14"
                    fontWeight="600"
                    className="drop-shadow-sm"
                  >
                    <tspan
                      style={{
                        paintOrder: 'stroke',
                        stroke: 'white',
                        strokeWidth: '3px',
                      }}
                    >
                      {labelText}
                    </tspan>
                  </text>
                )}
              </g>
            );

          case 'arrow':
            return (
              <g key={index}>
                <line
                  x1={coords.x}
                  y1={coords.y}
                  x2={coords.endX || coords.x + 50}
                  y2={coords.endY || coords.y}
                  stroke={strokeColor}
                  strokeWidth="3"
                  markerEnd={`url(#arrowhead-${strokeColor.replace('#', '')})`}
                />
                {labelText && (
                  <text
                    x={coords.x}
                    y={coords.y - 10}
                    textAnchor="middle"
                    fill={strokeColor}
                    fontSize="14"
                    fontWeight="600"
                    className="drop-shadow-sm"
                  >
                    <tspan
                      style={{
                        paintOrder: 'stroke',
                        stroke: 'white',
                        strokeWidth: '3px',
                      }}
                    >
                      {labelText}
                    </tspan>
                  </text>
                )}
              </g>
            );

          default:
            return null;
        }
      })}
    </svg>
  );
}
