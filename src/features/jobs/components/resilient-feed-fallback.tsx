"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { EmergencyFeedDeck } from "@/features/jobs/components/emergency-feed-deck";
import { EmergencyProfilePanel } from "@/features/jobs/components/emergency-profile-panel";
import {
  readJobFeedSnapshot,
  type JobFeedSnapshot,
} from "@/features/jobs/feed-snapshot";

type SnapshotState =
  | { kind: "checking" }
  | { kind: "found"; snapshot: JobFeedSnapshot }
  | { kind: "missing" };

export function ResilientFeedFallback({}: { retry?: () => void }) {
  const pathname = usePathname();
  const savedView = pathname.startsWith("/saved");
  const profileView = pathname.startsWith("/profile");
  const [snapshotState, setSnapshotState] = useState<SnapshotState>({
    kind: "checking",
  });

  useEffect(() => {
    if (profileView) return;

    const frame = requestAnimationFrame(() => {
      const snapshot = readJobFeedSnapshot(savedView ? "saved" : "feed");
      setSnapshotState(
        snapshot ? { kind: "found", snapshot } : { kind: "missing" },
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [profileView, savedView]);

  return (
    <div className="app-viewport job-deck-bg relative isolate overflow-x-hidden px-4 pb-28 pt-[calc(env(safe-area-inset-top)+0.75rem)] text-white">
      {profileView ? (
        <EmergencyProfilePanel />
      ) : snapshotState.kind === "checking" ? (
        <div className="mx-auto mt-2 h-[min(68svh,35rem)] w-full max-w-[23rem] animate-pulse rounded-[1.25rem] border border-[#26313e] bg-[#151d27]" role="status" aria-label="Loading jobs" />
      ) : (
        <EmergencyFeedDeck
          fallbackSnapshot={
            snapshotState.kind === "found" ? snapshotState.snapshot : undefined
          }
          savedView={savedView}
        />
      )}
    </div>
  );
}
