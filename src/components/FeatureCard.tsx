import React, { useState } from 'react';

/*
  FeatureCard — the 6 cards at the bottom of Image 2
  Each has: icon, label, gold border, hover state with glow
  Layout: horizontal strip, equal width, dark background
*/

interface FeatureCardProps {
  icon: string;        // SVG path or emoji-like symbol
  label: string;
  description?: string;
  index: number;       // For staggered animation delay
}

// SVG icon paths for each feature — hand-crafted to match the style of Image 2's small icons
// The reference shows simple line-art style icons in gold
const ICON_SVGS: Record<string, React.ReactNode> = {
  Explore: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <polygon points="12,5 15.5,14.5 12,12.5 8.5,14.5" fill="currentColor" stroke="none" opacity="0.4"/>
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>
    </svg>
  ),
  Trade: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 16V4m0 0L3 8m4-4 4 4"/>
      <path d="M17 8v12m0 0 4-4m-4 4-4-4"/>
    </svg>
  ),
  Compete: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
    </svg>
  ),
  'Earn Reputation': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <path d="m9 12 2 2 4-4" strokeWidth="2"/>
    </svg>
  ),
  'Collect Badges': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="5"/>
      <path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12"/>
    </svg>
  ),
  'Holder Perks': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12l4 6-10 13L2 9z"/>
      <path d="M11 3 8 9l4 13 4-13-3-6" opacity="0.5"/>
    </svg>
  ),
};

export function FeatureCard({ icon, label, description, index }: FeatureCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="feature-card"
      style={{
        animationDelay: `${0.6 + index * 0.08}s`,
        /* CSS custom property for hover state without JS class */
      } as React.CSSProperties}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-hovered={hovered}
    >
      {/* Top ornament line — matches the gold header strip in Image 1 panels */}
      <div className="feature-card__top-bar" />

      {/* Corner ornaments — like the decorative corners in Image 1 */}
      <span className="feature-card__corner feature-card__corner--tl" aria-hidden />
      <span className="feature-card__corner feature-card__corner--tr" aria-hidden />
      <span className="feature-card__corner feature-card__corner--bl" aria-hidden />
      <span className="feature-card__corner feature-card__corner--br" aria-hidden />

      <div className="feature-card__icon">
        {ICON_SVGS[icon] || ICON_SVGS[label]}
      </div>

      <span className="feature-card__label">{label}</span>

      {/* Hover glow overlay */}
      <div className="feature-card__glow" aria-hidden />
    </div>
  );
}
