import type { MetadataRoute } from "next";

const APP_CHROME_COLOR = "#060913";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "RoleDex — Personal Job Discovery",
    short_name: "RoleDex",
    description: "Swipe through curated jobs and keep the roles worth pursuing.",
    start_url: "/",
    scope: "/",
    lang: "en-US",
    display: "standalone",
    background_color: APP_CHROME_COLOR,
    theme_color: APP_CHROME_COLOR,
    icons: [
      {
        src: "/icons/v5/192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/v5/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/v5/maskable",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Saved jobs",
        short_name: "Saved",
        description: "Open the jobs you kept.",
        url: "/saved",
        icons: [{ src: "/icons/v5/192", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Driving mode",
        short_name: "Listen",
        description: "Set up narrated job review while safely parked.",
        url: "/drive",
        icons: [{ src: "/icons/v5/192", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Market insights",
        short_name: "Insights",
        description: "See patterns across your job search.",
        url: "/insights",
        icons: [{ src: "/icons/v5/192", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
