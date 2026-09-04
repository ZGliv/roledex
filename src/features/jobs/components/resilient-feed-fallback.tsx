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
      const candidate = readJobFeedSnapshot(savedView ? "saved" : "feed");
      const snapshot = savedView && candidate?.kind !== "saved" ? null : candidate;
      setSnapshotState(
        snapshot ? { kind: "found", snapshot } : { kind: "missing" },
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [profileView, savedView]);

  return (
    <div className="app-viewport direct-feed-page job-deck-bg relative isolate overflow-x-hidden px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1rem)] text-white">
      <div className="deck-live-scene pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <span className="deck-live-orb deck-live-orb-a" />
        <span className="deck-live-orb deck-live-orb-b" />
        <span className="deck-live-grid" />
      </div>

      {profileView ? (
        <EmergencyProfilePanel />
      ) : snapshotState.kind === "checking" ? (
        <div className="grid min-h-[32rem] place-items-center text-center" role="status">
          <div>
            <span className="page-loading-spinner mx-auto block" aria-hidden="true" />
            <p className="mt-4 text-sm font-medium text-white/65">
              Restoring jobs from this device…
            </p>
          </div>
        </div>
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
