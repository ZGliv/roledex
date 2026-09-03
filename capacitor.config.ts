import type { CapacitorConfig } from "@capacitor/cli";

const developmentBundleId = "dev.jobswipe.preview";

const config: CapacitorConfig = {
  appId: process.env.JOBSWIPE_IOS_BUNDLE_ID?.trim() || developmentBundleId,
  appName: "RoleDex",
  webDir: "mobile/dist",
  loggingBehavior: "debug",
  backgroundColor: "#060913",
  ios: {
    path: "mobile/ios",
    contentInset: "never",
    preferredContentMode: "mobile",
    zoomEnabled: false,
  },
};

// App Store builds always copy the local bundle. There is deliberately no
// remote `server.url` fallback.
export default config;
