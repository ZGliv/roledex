"use client";

import { ResilientFeedFallback } from "@/features/jobs/components/resilient-feed-fallback";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ResilientFeedFallback retry={reset} />;
}
