"use client";

import React from 'react';

interface SproutGrowthProps {
  totalDepositedSui: number;
  size?: number;
}

export default function SproutGrowth({ totalDepositedSui, size = 200 }: SproutGrowthProps) {
  // stage = Math.min(5, Math.floor(Math.log2(max(totalDepositedSui, 0.01) + 1)))
  // Let's make it more sensitive for the demo
  const stage = Math.min(6, Math.floor(totalDepositedSui * 2) + (totalDepositedSui > 0 ? 1 : 0));

  const stemHeight = 30 + stage * 25;
  const leafPairs = Math.min(5, stage);

  // Center of the SVG
  const cx = size / 2;
  const bottom = size - 20;

  return (
    <div className="relative group">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        {/* Ground */}
        <line
          x1={cx - 60} y1={bottom}
          x2={cx + 60} y2={bottom}
          stroke="#1F3A2C" strokeWidth="6" strokeLinecap="round"
          className="opacity-40"
        />

        {/* Roots (Subtle) */}
        {stage >= 1 && (
          <g className="opacity-20">
            <path d={`M ${cx} ${bottom} L ${cx - 15} ${bottom + 10}`} stroke="#86C454" strokeWidth="2" fill="none" />
            <path d={`M ${cx} ${bottom} L ${cx + 15} ${bottom + 10}`} stroke="#86C454" strokeWidth="2" fill="none" />
          </g>
        )}

        {/* Stem */}
        <path
          d={`M ${cx} ${bottom} Q ${cx + Math.sin(stage) * 5} ${bottom - stemHeight / 2}, ${cx} ${bottom - stemHeight}`}
          stroke="#86C454"
          strokeWidth={6 + Math.min(4, stage)}
          strokeLinecap="round"
          fill="none"
          className="transition-all duration-1000 ease-in-out"
        />

        {/* Leaves */}
        {Array.from({ length: leafPairs }).map((_, i) => {
          const y = bottom - 25 - (i * 25);
          const offset = i % 2 === 0 ? 1 : -1;
          const rotateLeft = -25 - (i * 5);
          const rotateRight = 25 + (i * 5);

          return (
            <g key={i} className={`transition-all duration-1000 ease-in-out delay-${i * 100} hover:scale-110 origin-center`}>
              {/* Left Leaf */}
              <path
                d={`M ${cx} ${y} Q ${cx - 25} ${y - 10}, ${cx - 35} ${y + 5} T ${cx} ${y}`}
                fill="#9FD66B"
                className="drop-shadow-sm"
                transform={`rotate(${rotateLeft}, ${cx}, ${y})`}
              />
              {/* Right Leaf */}
              <path
                d={`M ${cx} ${y} Q ${cx + 25} ${y - 10}, ${cx + 35} ${y + 5} T ${cx} ${y}`}
                fill="#9FD66B"
                className="drop-shadow-sm"
                transform={`rotate(${rotateRight}, ${cx}, ${y})`}
              />
            </g>
          );
        })}

        {/* Bud or Small Flower if mature */}
        {stage >= 4 && (
          <g className="animate-pulse">
            <circle
              cx={cx} cy={bottom - stemHeight - 10}
              r={stage >= 6 ? 16 : 8}
              fill="#E8B865"
              className="transition-all duration-1000 ease-in-out"
            />
            <circle
              cx={cx} cy={bottom - stemHeight - 10}
              r={stage >= 6 ? 20 : 10}
              fill="#E8B865"
              fillOpacity="0.2"
              className="transition-all duration-1000 ease-in-out"
            />
          </g>
        )}

        <defs>
          <radialGradient id="glow">
            <stop offset="0%" stopColor="#E8B865" />
            <stop offset="100%" stopColor="#E8B865" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>

      {/* Energy particles */}
      {stage >= 5 && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-32 h-32 bg-sprout-400/20 blur-3xl rounded-full"></div>
        </div>
      )}
    </div>
  );
}
