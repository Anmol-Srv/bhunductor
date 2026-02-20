import React from 'react';

/**
 * Bhunductor Logo — Dotted "B" monogram
 * 
 * A minimal, modern SaaS-style logo built from precisely placed dots
 * that form the letter "B". Uses currentColor or the conductor teal.
 * 
 * @param {number} size - Overall size in pixels (default 32)
 * @param {string} className - Additional CSS class names
 * @param {boolean} animated - Whether to show dot entrance animation
 */
function BhunductorLogo({ size = 32, className = '', animated = false }) {
  // Dot positions forming a stylized "B" on a 7x9 grid
  // Each dot is [col, row] where col 0-6, row 0-8
  const dots = [
    // Left vertical spine
    [0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [0, 8],
    // Top horizontal bar
    [1, 0], [2, 0], [3, 0],
    // Upper bump curve
    [4, 1], [5, 2],
    [5, 3],
    [4, 4],
    // Middle bar
    [1, 4], [2, 4], [3, 4],
    // Lower bump curve (slightly wider for proper B proportion)
    [4, 5], [5, 6],
    [5, 7],
    [4, 8],
    // Bottom horizontal bar
    [1, 8], [2, 8], [3, 8],
  ];

  const gridCols = 6;
  const gridRows = 9;
  const padding = 2;
  
  // Calculate dot sizes based on overall size
  const dotRadius = size / (gridRows * 2.4);
  const spacingX = (size - padding * 2) / gridCols;
  const spacingY = (size - padding * 2) / (gridRows - 1);

  const viewBoxWidth = size;
  const viewBoxHeight = size;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`bhunductor-logo ${animated ? 'bhunductor-logo--animated' : ''} ${className}`}
      aria-label="Bhunductor logo"
    >
      {dots.map(([col, row], i) => {
        const cx = padding + col * spacingX + dotRadius;
        const cy = padding + row * spacingY;
        const delay = animated ? i * 0.03 : 0;

        return (
          <circle
            key={`${col}-${row}`}
            cx={cx}
            cy={cy}
            r={dotRadius}
            fill="currentColor"
            opacity={animated ? 0 : 1}
            style={animated ? {
              animation: `bhunductorDotIn 0.4s ease-out ${delay}s forwards`
            } : undefined}
          />
        );
      })}
    </svg>
  );
}

export default BhunductorLogo;
