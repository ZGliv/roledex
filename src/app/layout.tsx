import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppDock } from "@/components/app-header";
import { PwaRegistration } from "@/components/pwa-registration";
import "./globals.css";

const APP_CHROME_COLOR = "#060913";

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
    default: "JobSwipe",
    template: "%s · JobSwipe",
  },
  description: "A simpler way to discover, compare, and save jobs that fit.",
  applicationName: "JobSwipe",
  icons: {
    icon: [{ url: "/icons/v4/32", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/icons/v4/apple", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "JobSwipe",
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
          <div className="flex min-h-dvh flex-col">
            <AppDock />
            <main className="flex-1">{children}</main>
          </div>
          <PwaRegistration />
        </TooltipProvider>
      </body>
    </html>
  );
}
