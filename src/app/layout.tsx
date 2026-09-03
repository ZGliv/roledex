import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  AppDock,
  NavigationTransitionProvider,
} from "@/components/app-header";
import { PwaRegistration } from "@/components/pwa-registration";
import { EmergencyDecisionSync } from "@/features/jobs/components/emergency-decision-sync";
import { productionDatabaseReleaseBlocked } from "@/features/production/database-release";
import "./globals.css";

const APP_CHROME_COLOR = "#0f151d";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "RoleDex",
    template: "%s · RoleDex",
  },
  description: "A simpler way to discover, compare, and save jobs that fit.",
  applicationName: "RoleDex",
  icons: {
    icon: [{ url: "/icons/v5/32", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/icons/v5/apple", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "RoleDex",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: APP_CHROME_COLOR,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const databaseReleaseBlocked = productionDatabaseReleaseBlocked();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
      style={{ backgroundColor: APP_CHROME_COLOR }}
    >
      <body
        className="min-h-full"
        style={{ backgroundColor: APP_CHROME_COLOR }}
      >
        <TooltipProvider>
          <NavigationTransitionProvider>
            <div className="flex min-h-dvh flex-col">
              <AppDock />
              <main className="flex-1">{children}</main>
            </div>
          </NavigationTransitionProvider>
          {databaseReleaseBlocked ? null : <EmergencyDecisionSync />}
          <PwaRegistration />
        </TooltipProvider>
      </body>
    </html>
  );
}
