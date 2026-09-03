import { ImageResponse } from "next/og";
import { JobSwipeGlyph } from "@/components/jobswipe-glyph";

const IMMUTABLE_ICON_HEADERS = {
  "Cache-Control": "public, max-age=31536000, immutable",
  "X-Content-Type-Options": "nosniff",
};

export function createAppIcon(size: number) {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#111827",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <svg
          aria-hidden="true"
          height={size}
          viewBox="0 0 32 32"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M20.6 7.7v10.15c0 4.05-2.34 6.48-6.16 6.48-2.56 0-4.43-1.12-5.35-3.11"
            fill="none"
            stroke="#fff"
            strokeLinecap="round"
            strokeWidth="2.65"
          />
          <circle cx="20.6" cy="7.7" fill="#8B82FF" r="1.65" />
        </svg>
      </div>
    ),
    {
      width: size,
      height: size,
      headers: {
        ...IMMUTABLE_ICON_HEADERS,
        "Content-Disposition": `inline; filename="jobswipe-${size}.png"`,
      },
    },
  );
}

export function createAppIconV3(size: number) {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#101827",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <svg
          aria-hidden="true"
          height={size}
          viewBox="0 0 32 32"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            x="6.65"
            y="7.2"
            width="14.4"
            height="18.15"
            rx="3.3"
            fill="#101827"
            stroke="#ffffff"
            strokeOpacity="0.42"
            strokeWidth="1.7"
            transform="rotate(-8 13.85 16.275)"
          />
          <rect
            x="10.05"
            y="6.15"
            width="15.3"
            height="19.7"
            rx="3.55"
            fill="#101827"
            stroke="#ffffff"
            strokeWidth="1.85"
          />
          <path
            d="M14.05 11.25h7.3"
            stroke="#ffffff"
            strokeLinecap="round"
            strokeWidth="1.55"
          />
          <path
            d="M14.05 14.8h5.1"
            stroke="#ffffff"
            strokeLinecap="round"
            strokeOpacity="0.68"
            strokeWidth="1.55"
          />
          <path
            d="M14.15 20.3h7.35m0 0-2.75-2.75m2.75 2.75-2.75 2.75"
            stroke="#7667ff"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      </div>
    ),
    {
      width: size,
      height: size,
      headers: {
        ...IMMUTABLE_ICON_HEADERS,
        "Content-Disposition": `inline; filename="jobswipe-v3-${size}.png"`,
      },
    },
  );
}

export function createAppIconV4(size: number) {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#0d1422",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <JobSwipeGlyph
          accentColor="#7868f6"
          foregroundColor="#f8fafc"
          height={size}
          width={size}
        />
      </div>
    ),
    {
      width: size,
      height: size,
      headers: {
        ...IMMUTABLE_ICON_HEADERS,
        "Content-Disposition": `inline; filename="jobswipe-v4-${size}.png"`,
      },
    },
  );
}

type AppIconV5Options = {
  maskable?: boolean;
};

export function createAppIconV5(
  size: number,
  { maskable = false }: AppIconV5Options = {},
) {
  const glyphSize = maskable ? size * 0.74 : size * 0.92;

  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background:
            "radial-gradient(circle at 62% 26%, rgba(70, 92, 130, 0.18) 0%, rgba(70, 92, 130, 0) 34%), linear-gradient(145deg, #151a22 0%, #0d131c 52%, #070b10 100%)",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <JobSwipeGlyph
          accentColor="#3468ff"
          foregroundColor="#f3efff"
          height={glyphSize}
          width={glyphSize}
        />
      </div>
    ),
    {
      width: size,
      height: size,
      headers: {
        ...IMMUTABLE_ICON_HEADERS,
        "Content-Disposition": `inline; filename="roledex-v5${maskable ? "-maskable" : ""}-${size}.png"`,
      },
    },
  );
}
