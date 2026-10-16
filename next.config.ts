import type { NextConfig } from "next";

const allowedDevOrigins = process.env.JOBSWIPE_DEV_ORIGINS
  ?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins,
  // PDF.js needs its native Node module/worker resolution, not the action bundle.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  // PDF.js loads these through Node's createRequire and a runtime worker URL,
  // which the deployment tracer cannot discover from the static import graph.
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/@napi-rs/canvas*/**/*",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
      "./node_modules/pdfjs-dist/cmaps/**/*",
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
          },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
    ];
  },
};

export default nextConfig;
