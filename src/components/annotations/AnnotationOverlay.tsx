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

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox={`0 0 ${imageWidth} ${imageHeight}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="#2855B1" />
        </marker>
      </defs>

      {annotations.map((annotation, index) => {
        const { type, coords, label } = annotation;
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
                  stroke="#2855B1"
                  strokeWidth="3"
                  strokeDasharray="5,5"
                />
                {labelText && (
                  <text
                    x={coords.x}
                    y={coords.y + (coords.radius || 30) + 20}
                    textAnchor="middle"
                    fill="#2855B1"
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
                  stroke="#2855B1"
                  strokeWidth="3"
                  strokeDasharray="5,5"
                />
                {labelText && (
                  <text
                    x={coords.x + (coords.width || 50) / 2}
                    y={coords.y + (coords.height || 50) + 20}
                    textAnchor="middle"
                    fill="#2855B1"
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
                  stroke="#2855B1"
                  strokeWidth="3"
                  markerEnd="url(#arrowhead)"
                />
                {labelText && (
                  <text
                    x={coords.x}
                    y={coords.y - 10}
                    textAnchor="middle"
                    fill="#2855B1"
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
