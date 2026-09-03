"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";

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

export function ResilientFeedFallback({ retry }: { retry?: () => void }) {
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

  const statusCopy =
    profileView
      ? "On-device search · changes apply to this phone"
      : snapshotState.kind === "found"
      ? "Live company feeds · cached backup ready"
      : snapshotState.kind === "checking"
        ? "Opening your on-device feed"
        : "Live company feeds · decisions saved on this phone";

  return (
    <div className="app-viewport job-deck-bg relative isolate overflow-x-hidden px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1rem)] text-white">
      <div className="deck-live-scene pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <span className="deck-live-orb deck-live-orb-a" />
        <span className="deck-live-orb deck-live-orb-b" />
        <span className="deck-live-grid" />
      </div>

      <div className="mx-auto flex min-h-8 w-fit items-center gap-2 rounded-full border border-white/10 bg-[#0b1020]/65 px-3 text-[10px] font-medium text-[#98a3b7] shadow-[inset_0_1px_0_rgba(255,255,255,.08)] backdrop-blur-xl" role="status">
        <span className="size-1.5 rounded-full bg-[#e5b96b] shadow-[0_0_0_3px_rgba(229,185,107,.1)]" aria-hidden="true" />
        <span>{statusCopy}</span>
        {retry ? (
          <button
            type="button"
            onClick={retry}
            className="ml-0.5 grid size-7 place-items-center rounded-full text-[#bcc5d3] outline-none transition hover:bg-white/[0.08] hover:text-white focus-visible:ring-2 focus-visible:ring-white/35"
            aria-label="Retry workspace connection"
          >
            <RefreshCw className="size-3" aria-hidden="true" />
          </button>
        ) : null}
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
