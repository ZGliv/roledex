import type { CSSProperties } from "react";

type JobSwipeGlyphProps = {
  accentColor?: string;
  className?: string;
  foregroundColor?: string;
  height?: number | string;
  style?: CSSProperties;
  width?: number | string;
};

/**
 * The JobSwipe monogram: a J-shaped path crossed by a decisive right swipe.
 * Keep the geometry shared by the product mark and generated v4 app icons.
 */
export function JobSwipeGlyph({
  accentColor = "#7868f6",
  className,
  foregroundColor = "currentColor",
  height = "100%",
  style,
  width = "100%",
}: JobSwipeGlyphProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      height={height}
      style={style}
      viewBox="0 0 32 32"
      width={width}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M21.35 7.75v9.75c0 4.55-2.5 7.2-6.6 7.2-3.15 0-5.4-1.45-6.55-3.9"
        stroke={foregroundColor}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.05"
      />
      <path
        d="M10.15 12.45h14m0 0-2.65-2.55m2.65 2.55-2.65 2.55"
        stroke={accentColor}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.7"
      />
    </svg>
  );
}
