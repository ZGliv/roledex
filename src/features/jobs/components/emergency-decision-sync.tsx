"use client";

import { useEffect } from "react";

import {
  markEmergencyDecisionsSynced,
  pendingEmergencyDecisions,
} from "@/features/jobs/emergency-feed-storage";

const SYNC_INTERVAL_MS = 5 * 60_000;

export function EmergencyDecisionSync() {
  useEffect(() => {
    let cancelled = false;
    let syncing = false;

    const sync = async () => {
      if (syncing || !navigator.onLine) return;
      const pending = pendingEmergencyDecisions().slice(0, 10);
      if (pending.length === 0) return;
      syncing = true;
      try {
        const response = await fetch("/api/emergency-feed/sync", {
          body: JSON.stringify({
            decisions: pending.map(({ decision, job }) => ({
              decision,
              externalId: job.externalId,
              id: job.id,
              provider: job.provider,
              sourceKey: job.sourceKey,
            })),
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        });
        if (!response.ok || cancelled) return;
        const payload = (await response.json()) as { syncedIds?: unknown };
        if (Array.isArray(payload.syncedIds)) {
          markEmergencyDecisionsSynced(
            payload.syncedIds.filter((id): id is string => typeof id === "string"),
          );
        }
      } catch {
        // Offline decisions remain queued until a later navigation or online event.
      } finally {
        syncing = false;
      }
    };

    const online = () => void sync();
    window.addEventListener("online", online);
    const timer = window.setInterval(() => void sync(), SYNC_INTERVAL_MS);
    void sync();
    return () => {
      cancelled = true;
      window.removeEventListener("online", online);
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
