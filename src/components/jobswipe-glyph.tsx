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
 * The RoleDex deck mark: stacked role cards with a subtly glassy active card.
 * Keep the geometry shared by the product mark, offline fallback, and v5 icons.
 */
export function JobSwipeGlyph({
  accentColor = "#3468ff",
  className,
  foregroundColor = "#f3efff",
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
      <defs>
        <linearGradient id="roledex-active-card" x1="12.4" x2="25.6" y1="8" y2="25.4">
          <stop stopColor="#fbf8ff" stopOpacity="0.58" />
          <stop offset="0.54" stopColor="#8b81df" stopOpacity="0.6" />
          <stop offset="1" stopColor="#8d5dff" stopOpacity="0.74" />
        </linearGradient>
        <linearGradient id="roledex-active-stroke" x1="12" x2="25.6" y1="8.2" y2="25.8">
          <stop stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#b9c6ff" />
          <stop offset="1" stopColor="#b26cff" />
        </linearGradient>
        <linearGradient id="roledex-swipe-arc" x1="7.35" x2="25.85" y1="25.8" y2="22.2">
          <stop stopColor="#2d4fff" stopOpacity="0" />
          <stop offset="0.52" stopColor="#5e5bff" stopOpacity="0.76" />
          <stop offset="1" stopColor="#b870ff" />
        </linearGradient>
      </defs>
      <path
        d="M7.55 24.7c4.85 2.2 13.2 1.65 17.1-1.95"
        stroke="url(#roledex-swipe-arc)"
        strokeLinecap="round"
        strokeWidth="0.92"
      />
      <path
        d="m23.7 22.65 1.28-.18-.04 1.3"
        stroke="#b870ff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="0.92"
      />
      <rect
        x="6.55"
        y="9.7"
        width="11.4"
        height="16.1"
        rx="2.35"
        fill="#243145"
        opacity="0.78"
        transform="rotate(-12 12.25 17.75)"
      />
      <rect
        x="10.2"
        y="7.4"
        width="12.15"
        height="17"
        rx="2.45"
        fill={accentColor}
        transform="rotate(-2.5 16.275 15.9)"
      />
      <rect
        x="13.45"
        y="7.15"
        width="12.2"
        height="17.4"
        rx="2.55"
        fill="url(#roledex-active-card)"
        transform="rotate(12 19.55 15.85)"
      />
      <rect
        x="13.45"
        y="7.15"
        width="12.2"
        height="17.4"
        rx="2.55"
        fill="none"
        stroke="url(#roledex-active-stroke)"
        strokeOpacity="0.9"
        strokeWidth="0.72"
        transform="rotate(12 19.55 15.85)"
      />
      <path
        d="M15.5 9.25c2.45-.45 5.45-.15 7.45.8"
        stroke={foregroundColor}
        strokeLinecap="round"
        strokeOpacity="0.45"
        strokeWidth="0.74"
      />
    </svg>
  );
}
