"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  RotateCcw,
  Search,
  WifiOff,
} from "lucide-react";

import { CompanyMark } from "@/features/jobs/components/company-mark";
import { CachedFeedRecovery } from "@/features/jobs/components/cached-feed-recovery";
import { companyVisual } from "@/features/jobs/components/company-visual";
import {
  safelyAnimate,
  waitForDeckMotion,
} from "@/features/jobs/components/job-deck-motion";
import {
  DEFAULT_EMERGENCY_PROFILE,
  type EmergencyFeedJob,
} from "@/features/jobs/emergency-feed";
import type { EmergencyFeedPageMeta } from "@/features/jobs/emergency-feed-page";
import type { JobFeedSnapshot } from "@/features/jobs/feed-snapshot";
import { saveJobFeedSnapshot } from "@/features/jobs/feed-snapshot";
import { EmergencyJobCard } from "@/features/jobs/components/emergency-job-card";
import { emergencyJobRead } from "@/features/jobs/emergency-feed-presentation";
import {
  EMERGENCY_PROFILE_CHANGED_EVENT,
  emergencySavedJobs,
  isEmergencyFeedJob,
  readEmergencyDecisions,
  readEmergencyProfile,
  readEmergencySeenJobIds,
  recordEmergencyDecisionWithStatus,
} from "@/features/jobs/emergency-feed-storage";

const EmergencyJobDetails = dynamic(
  () =>
    import("@/features/jobs/components/emergency-job-details").then(
      (module) => module.EmergencyJobDetails,
    ),
  {
    loading: () => (
      <div
        className="fixed inset-0 z-50 grid place-items-center bg-[#0f151d]/94"
        role="status"
        aria-label="Loading job"
      >
        <span className="page-loading-spinner" aria-hidden="true" />
      </div>
    ),
    ssr: false,
  },
);

type FeedState =
  | { kind: "loading" }
  | { kind: "ready"; jobs: EmergencyFeedJob[] }
  | { kind: "error" };

type DirectFeedStatus = {
  checkedSources: number;
  failedSources: number;
  hasMore: boolean;
  loadingMore: boolean;
  nextRefreshAt: number | null;
  retryAt: number | null;
  sourceBatch: number;
  successfulSources: number;
  totalSourceBatches: number;
  totalSources: number;
};

type DirectFeedPage = { jobs: EmergencyFeedJob[]; meta: EmergencyFeedPageMeta };

const LOW_WATER_JOBS = 20;
const RETRY_DELAY_MS = 60_000;
const INITIAL_DIRECT_FEED_STATUS: DirectFeedStatus = {
  checkedSources: 0,
  failedSources: 0,
  hasMore: true,
  loadingMore: false,
  nextRefreshAt: null,
  retryAt: null,
  sourceBatch: 0,
  successfulSources: 0,
  totalSourceBatches: 0,
  totalSources: 0,
};

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function encodeEmergencyProfile() {
  const profile = readEmergencyProfile() ?? DEFAULT_EMERGENCY_PROFILE;
  const bytes = new TextEncoder().encode(JSON.stringify(profile));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function isEmergencyFeedPageMeta(value: unknown): value is EmergencyFeedPageMeta {
  if (!value || typeof value !== "object") return false;
  const meta = value as Partial<EmergencyFeedPageMeta>;
  return (
    typeof meta.checkedSources === "number" &&
    typeof meta.failedSources === "number" &&
    typeof meta.hasMore === "boolean" &&
    (typeof meta.nextCursor === "string" || meta.nextCursor === null) &&
    typeof meta.refreshAfterSeconds === "number" &&
    typeof meta.sourceBatch === "number" &&
    typeof meta.successfulSources === "number" &&
    typeof meta.totalSourceBatches === "number" &&
    typeof meta.totalSources === "number"
  );
}

function loadDirectFeed(signal: AbortSignal, cursor: string) {
  const search = new URLSearchParams({
    cursor,
    profile: encodeEmergencyProfile(),
  });
  return fetch(`/api/emergency-feed?${search}`, {
    headers: { accept: "application/json" },
    signal,
  }).then(async (response) => {
    if (!response.ok) throw new Error("Direct feed unavailable");
    const payload = (await response.json()) as { data?: unknown; meta?: unknown };
    if (!Array.isArray(payload.data) || !isEmergencyFeedPageMeta(payload.meta)) {
      throw new Error("Invalid direct feed");
    }
    return {
      jobs: payload.data.filter(isEmergencyFeedJob),
      meta: payload.meta,
    } satisfies DirectFeedPage;
  });
}

function listingIdentity(job: EmergencyFeedJob) {
  return [job.company, job.title, job.location]
    .join("|")
    .toLowerCase()
    .replace(/[^a-z0-9|]+/g, " ")
    .trim();
}

function normalizedTokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4);
}

function rankForThisDevice(jobs: readonly EmergencyFeedJob[]) {
  const profile = readEmergencyProfile();
  if (!profile) return [...jobs];
  const targetTokens = new Set(profile.targetRoleFamilies.flatMap(normalizedTokens));
  const acceptedModes = new Set(
    profile.preferredWorkModes.map((mode) =>
      mode === "on_site" ? "On-site" : `${mode[0].toUpperCase()}${mode.slice(1)}`,
    ),
  );
  return jobs
    .filter(
      (job) =>
        acceptedModes.size === 0 ||
        job.workArrangement === "Unclear" ||
        acceptedModes.has(job.workArrangement),
    )
    .map((job) => ({
      job,
      score:
        job.relevanceScore +
        normalizedTokens(job.title).filter((token) => targetTokens.has(token)).length * 3,
    }))
    .sort((left, right) => right.score - left.score)
    .map(({ job }) => job);
}

function EmergencySavedList({
  announcement,
  jobs,
  onRemove,
}: {
  announcement: string;
  jobs: EmergencyFeedJob[];
  onRemove: (job: EmergencyFeedJob) => void;
}) {
  const [query, setQuery] = useState("");
  const visibleJobs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return jobs;
    return jobs.filter((job) =>
      [job.title, job.company, job.location, job.workArrangement]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [jobs, query]);

  return (
    <div className="mx-auto mt-2 w-full max-w-2xl">
      <header className="flex min-h-12 items-center justify-between gap-4 px-1">
        <h1 className="text-xl font-semibold tracking-[-0.03em]">Saved</h1>
        <span className="text-xs font-semibold tabular-nums text-[#8591a1]">{jobs.length}</span>
      </header>

      {announcement.startsWith("Couldn’t") ? (
        <p
          className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.08] px-4 py-3 text-[12px] leading-5 text-amber-100"
          role="alert"
        >
          {announcement}
        </p>
      ) : null}

      {jobs.length > 0 ? (
        <label className="relative mt-5 block">
          <span className="sr-only">Search saved jobs on this device</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#7f8a99]" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search saved jobs"
            className="h-12 w-full rounded-xl border border-[#303b49] bg-[#151d27] pl-11 pr-4 text-base text-white outline-none placeholder:text-[#687484] focus:border-[#6f9bea] focus:ring-2 focus:ring-[#4f7fd8]/20"
          />
        </label>
      ) : null}

      {visibleJobs.length === 0 ? (
        <section className="mt-6 rounded-2xl border border-[#2b3542] bg-[#151d27] px-6 py-14 text-center">
          <BriefcaseBusiness className="mx-auto size-6 text-[#6f9bea]" aria-hidden="true" />
          <h2 className="mt-4 text-xl font-semibold">
            {jobs.length === 0 ? "No saved jobs" : "No matches"}
          </h2>
        </section>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-[#2b3542] bg-[#151d27]">
          {visibleJobs.map((job) => {
            const visual = companyVisual(job.company);
            return (
              <article key={job.id} className="border-b border-[#2b3542] p-4 last:border-b-0 sm:p-5">
                <div className="flex items-start gap-3.5">
                  <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-black/10" style={{ backgroundColor: visual.background, color: visual.foreground }}>
                    <CompanyMark company={job.company} compact className="max-h-6 max-w-8" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#b8c1cc]">{job.company}</p>
                    <h2 className="mt-1 text-[16px] font-semibold leading-5 tracking-[-0.025em] text-white">{job.title}</h2>
                    <p className="mt-2 text-[13px] font-semibold text-[#edf1f6]">{job.salaryDisplay}</p>
                    <p className="mt-1 truncate text-xs text-[#8d98a8]">{job.location} · {job.workArrangement}</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                  <a href={job.sourceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#4f7fd8] px-4 text-xs font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[#8caef0]">
                    Open <ArrowUpRight className="size-3.5" aria-hidden="true" />
                  </a>
                  <button type="button" onClick={() => onRemove(job)} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#303b49] px-3.5 text-xs font-semibold text-[#aeb8c5] outline-none hover:bg-[#1c2632] hover:text-white focus-visible:ring-2 focus-visible:ring-[#6f9bea]" aria-label={`Remove ${job.title} from saved jobs`}>
                    Remove
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function EmergencyFeedDeck({
  fallbackSnapshot,
  savedView = false,
}: {
  fallbackSnapshot?: JobFeedSnapshot;
  savedView?: boolean;
}) {
  const [feed, setFeed] = useState<FeedState>(() =>
    savedView ? { kind: "ready", jobs: emergencySavedJobs() } : { kind: "loading" },
  );
  const [announcement, setAnnouncement] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [profileRevision, setProfileRevision] = useState(0);
  const [directFeedStatus, setDirectFeedStatus] = useState<DirectFeedStatus>(
    INITIAL_DIRECT_FEED_STATUS,
  );
  const [emergencyProfile, setEmergencyProfile] =
    useState(DEFAULT_EMERGENCY_PROFILE);
  const [selectedJob, setSelectedJob] = useState<EmergencyFeedJob | null>(null);
  const activeRef = useRef<HTMLElement>(null);
  const frameRef = useRef<number | null>(null);
  const activeAnimationRef = useRef<Animation | null>(null);
  const cancelMotionCompletionRef = useRef<(() => void) | null>(null);
  const decisionLockedRef = useRef(false);
  const detailsOpeningRef = useRef(false);
  const focusAfterDecisionRef = useRef(false);
  const emptyStateRef = useRef<HTMLElement>(null);
  const suppressClickUntilRef = useRef(0);
  const directFeedRequestRef = useRef<{
    controller: AbortController | null;
    consecutiveFailures: number;
    generation: number;
    inFlight: boolean;
    nextCursor: string | null;
  }>({
    controller: null,
    consecutiveFailures: 0,
    generation: 0,
    inFlight: false,
    nextCursor: "0",
  });
  const seenJobIdsRef = useRef(new Set<string>());
  const seenListingsRef = useRef(new Set<string>());
  const pointer = useRef({
    active: false,
    bounds: null as DOMRect | null,
    id: -1,
    lastAt: 0,
    lastX: 0,
    maxDistance: 0,
    startX: 0,
    startY: 0,
    vx: 0,
    x: 0,
  });

  const fetchNextDirectFeedPage = useCallback(
    async (generation: number, initial: boolean) => {
      const requestState = directFeedRequestRef.current;
      const cursor = requestState.nextCursor;
      if (
        savedView ||
        requestState.generation !== generation ||
        requestState.inFlight ||
        cursor === null
      ) {
        return;
      }

      requestState.inFlight = true;
      const controller = new AbortController();
      requestState.controller?.abort();
      requestState.controller = controller;
      setDirectFeedStatus((status) => ({
        ...status,
        loadingMore: !initial,
        retryAt: null,
      }));

      try {
        const page = await loadDirectFeed(controller.signal, cursor);
        if (directFeedRequestRef.current.generation !== generation) return;

        requestState.consecutiveFailures = 0;
        requestState.nextCursor = page.meta.nextCursor;
        const decided = new Set([
          ...readEmergencySeenJobIds(),
          ...readEmergencyDecisions().map((item) => item.job.id),
        ]);
        const freshJobs = rankForThisDevice(page.jobs).filter((job) => {
          const identity = listingIdentity(job);
          if (
            decided.has(job.id) ||
            seenJobIdsRef.current.has(job.id) ||
            seenListingsRef.current.has(identity)
          ) {
            return false;
          }
          seenJobIdsRef.current.add(job.id);
          seenListingsRef.current.add(identity);
          return true;
        });
        saveJobFeedSnapshot("feed", freshJobs, { merge: true });
        setFeed((state) => ({
          kind: "ready",
          jobs:
            initial || state.kind !== "ready"
              ? freshJobs
              : [...state.jobs, ...freshJobs],
        }));
        setDirectFeedStatus((status) => ({
          checkedSources: page.meta.checkedSources,
          failedSources: status.failedSources + page.meta.failedSources,
          hasMore: page.meta.hasMore,
          loadingMore: false,
          nextRefreshAt: page.meta.hasMore
            ? null
            : Date.now() + page.meta.refreshAfterSeconds * 1_000,
          retryAt: null,
          sourceBatch: page.meta.sourceBatch,
          successfulSources:
            status.successfulSources + page.meta.successfulSources,
          totalSourceBatches: page.meta.totalSourceBatches,
          totalSources: page.meta.totalSources,
        }));
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn("A direct company-feed shard is temporarily unavailable.", error);
        const canRetry = requestState.consecutiveFailures < 1;
        requestState.consecutiveFailures += 1;
        if (!canRetry) requestState.nextCursor = null;
        setDirectFeedStatus((status) => ({
          ...status,
          hasMore: canRetry && status.hasMore,
          loadingMore: false,
          retryAt: canRetry ? Date.now() + RETRY_DELAY_MS : null,
        }));
        if (initial || !canRetry) {
          setFeed((state) =>
            state.kind === "ready" && state.jobs.length > 0
              ? state
              : { kind: "error" },
          );
        }
      } finally {
        if (directFeedRequestRef.current.generation === generation) {
          directFeedRequestRef.current.inFlight = false;
          directFeedRequestRef.current.controller = null;
          setDirectFeedStatus((status) => ({ ...status, loadingMore: false }));
        }
      }
    },
    [savedView],
  );

  useEffect(() => {
    if (savedView) {
      const frame = requestAnimationFrame(() => {
        setFeed({ kind: "ready", jobs: emergencySavedJobs() });
      });
      return () => cancelAnimationFrame(frame);
    }

    const requestState = directFeedRequestRef.current;
    requestState.controller?.abort();
    const generation = requestState.generation + 1;
    requestState.generation = generation;
    requestState.consecutiveFailures = 0;
    requestState.inFlight = false;
    requestState.nextCursor = "0";
    seenJobIdsRef.current = new Set([
      ...readEmergencySeenJobIds(),
      ...readEmergencyDecisions().map((item) => item.job.id),
    ]);
    seenListingsRef.current = new Set(
      readEmergencyDecisions().map((item) => listingIdentity(item.job)),
    );
    const frame = requestAnimationFrame(() => {
      if (requestState.generation !== generation) return;
      setFeed({ kind: "loading" });
      detailsOpeningRef.current = false;
      setSelectedJob(null);
      setEmergencyProfile(readEmergencyProfile() ?? DEFAULT_EMERGENCY_PROFILE);
      setDirectFeedStatus(INITIAL_DIRECT_FEED_STATUS);
      void fetchNextDirectFeedPage(generation, true);
    });

    return () => {
      cancelAnimationFrame(frame);
      if (requestState.generation === generation) {
        requestState.controller?.abort();
        requestState.generation += 1;
        requestState.inFlight = false;
      }
    };
  }, [fetchNextDirectFeedPage, profileRevision, refreshKey, savedView]);

  const jobs = feed.kind === "ready" ? feed.jobs : [];

  useEffect(() => {
    if (
      savedView ||
      feed.kind !== "ready" ||
      jobs.length > LOW_WATER_JOBS ||
      !directFeedStatus.hasMore ||
      directFeedStatus.loadingMore ||
      directFeedStatus.retryAt !== null
    ) {
      return;
    }
    void fetchNextDirectFeedPage(
      directFeedRequestRef.current.generation,
      false,
    );
  }, [
    directFeedStatus.hasMore,
    directFeedStatus.loadingMore,
    directFeedStatus.retryAt,
    feed.kind,
    fetchNextDirectFeedPage,
    jobs.length,
    savedView,
  ]);

  useEffect(() => {
    if (savedView || jobs.length > LOW_WATER_JOBS) return;
    const wakeAt = directFeedStatus.retryAt ?? directFeedStatus.nextRefreshAt;
    if (wakeAt === null) return;
    const timeout = window.setTimeout(() => {
      const requestState = directFeedRequestRef.current;
      if (!directFeedStatus.hasMore) requestState.nextCursor = "0";
      setDirectFeedStatus((status) => ({
        ...status,
        checkedSources: status.hasMore ? status.checkedSources : 0,
        failedSources: status.hasMore ? status.failedSources : 0,
        hasMore: true,
        nextRefreshAt: null,
        retryAt: null,
        sourceBatch: status.hasMore ? status.sourceBatch : 0,
        successfulSources: status.hasMore ? status.successfulSources : 0,
      }));
    }, Math.max(0, wakeAt - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [
    directFeedStatus.hasMore,
    directFeedStatus.nextRefreshAt,
    directFeedStatus.retryAt,
    jobs.length,
    savedView,
  ]);

  useEffect(() => {
    if (savedView) return;
    const onProfileChanged = () => setProfileRevision((value) => value + 1);
    window.addEventListener(EMERGENCY_PROFILE_CHANGED_EVENT, onProfileChanged);
    return () =>
      window.removeEventListener(
        EMERGENCY_PROFILE_CHANGED_EVENT,
        onProfileChanged,
      );
  }, [savedView]);

  const current = jobs[0] ?? null;
  const next = jobs[1] ?? null;
  const currentRead = useMemo(
    () => (current ? emergencyJobRead(current, emergencyProfile) : null),
    [current, emergencyProfile],
  );
  const nextRead = useMemo(
    () => (next ? emergencyJobRead(next, emergencyProfile) : null),
    [emergencyProfile, next],
  );
  const openDetails = useCallback((job: EmergencyFeedJob) => {
    if (decisionLockedRef.current || detailsOpeningRef.current) return;
    detailsOpeningRef.current = true;
    setSelectedJob(job);
  }, []);

  useEffect(() => {
    if (!focusAfterDecisionRef.current) return;
    const frame = requestAnimationFrame(() => {
      (activeRef.current ?? emptyStateRef.current)?.focus();
      focusAfterDecisionRef.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [current?.id]);
  const refresh = useCallback(() => {
    setFeed({ kind: "loading" });
    setRefreshKey((value) => value + 1);
  }, []);
  const removeSavedJob = useCallback((job: EmergencyFeedJob) => {
    const result = recordEmergencyDecisionWithStatus(job, "skipped");
    if (!result.persisted) {
      setAnnouncement(
        `Couldn’t remove ${job.title}. Allow browser storage and try again.`,
      );
      return;
    }
    setFeed((state) =>
      state.kind === "ready"
        ? { ...state, jobs: state.jobs.filter((candidate) => candidate.id !== job.id) }
        : state,
    );
    setAnnouncement(`${job.title} removed from saved jobs.`);
  }, []);

  const resetCard = useCallback(() => {
    const card = activeRef.current;
    if (!card) return;
    card.style.transition = prefersReducedMotion()
      ? "none"
      : "transform 240ms cubic-bezier(.22,.78,.24,1)";
    card.style.transform = "translate3d(0,0,0) rotateZ(0deg) scale(1)";
    card.dataset.interacting = "false";
    window.setTimeout(() => {
      if (activeRef.current === card) card.style.removeProperty("transition");
    }, 260);
    pointer.current.x = 0;
    pointer.current.vx = 0;
    pointer.current.maxDistance = 0;
  }, []);

  const decide = useCallback(
    (decision: "saved" | "skipped") => {
      if (
        !current ||
        decisionLockedRef.current ||
        detailsOpeningRef.current
      ) {
        return;
      }
      const decidedJob = current;
      decisionLockedRef.current = true;
      const result = recordEmergencyDecisionWithStatus(decidedJob, decision);
      if (!result.persisted) {
        setAnnouncement(
          result.reason === "saved_limit"
            ? "Your on-device shortlist is full. Remove a saved job before adding another."
            : decision === "saved"
            ? "Couldn’t save this job on your device. Allow browser storage and try again."
            : "Couldn’t remember this pass. Allow browser storage and try again.",
        );
        decisionLockedRef.current = false;
        return;
      }
      setAnnouncement(
        decision === "saved"
          ? `${decidedJob.title} saved on this device.`
          : `${decidedJob.title} passed.`,
      );
      const card = activeRef.current;
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      cancelMotionCompletionRef.current?.();
      cancelMotionCompletionRef.current = null;
      activeAnimationRef.current?.cancel();
      activeAnimationRef.current = null;

      const direction = decision === "saved" ? 1 : -1;
      const duration = 210;
      const animation =
        card && !prefersReducedMotion()
          ? safelyAnimate(
              card,
          [
            { transform: getComputedStyle(card).transform, opacity: 1 },
            {
              transform: `translate3d(${direction * (window.innerWidth + 360)}px, 8px, 0) rotateZ(${direction * 7}deg)`,
              opacity: 0.72,
            },
          ],
              {
                duration,
                easing: "cubic-bezier(.22,.72,.2,1)",
                fill: "forwards",
              },
            )
          : null;
      activeAnimationRef.current = animation;
      cancelMotionCompletionRef.current = waitForDeckMotion({
        animations: [animation],
        durationMs: duration,
        onComplete: () => {
          cancelMotionCompletionRef.current = null;
          activeAnimationRef.current?.cancel();
          activeAnimationRef.current = null;
          setFeed((state) =>
            state.kind === "ready"
              ? {
                  ...state,
                  jobs: state.jobs.filter((job) => job.id !== decidedJob.id),
                }
              : state,
          );
          pointer.current = {
            active: false,
            bounds: null,
            id: -1,
            lastX: 0,
            lastAt: 0,
            maxDistance: 0,
            startX: 0,
            startY: 0,
            x: 0,
            vx: 0,
          };
          decisionLockedRef.current = false;
        },
      });
    },
    [current],
  );

  useEffect(
    () => () => {
      cancelMotionCompletionRef.current?.();
      cancelMotionCompletionRef.current = null;
      activeAnimationRef.current?.cancel();
      activeAnimationRef.current = null;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (
      !current ||
      decisionLockedRef.current ||
      detailsOpeningRef.current ||
      selectedJob !== null ||
      !event.isPrimary ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort in older embedded mobile browsers.
    }
    pointer.current = {
      active: true,
      bounds: event.currentTarget.getBoundingClientRect(),
      id: event.pointerId,
      lastAt: performance.now(),
      lastX: event.clientX,
      maxDistance: 0,
      startX: event.clientX,
      startY: event.clientY,
      vx: 0,
      x: 0,
    };
    event.currentTarget.style.transition = "none";
    event.currentTarget.dataset.interacting = "true";
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!pointer.current.active || pointer.current.id !== event.pointerId) return;
    const card = activeRef.current;
    if (!card) return;
    const points = event.nativeEvent.getCoalescedEvents?.();
    const latest = points?.at(-1) ?? event.nativeEvent;
    const clientX = latest.clientX;
    const clientY = latest.clientY;
    const now = performance.now();
    const dx = clientX - pointer.current.startX;
    const dy = clientY - pointer.current.startY;
    const elapsed = Math.max(1, now - pointer.current.lastAt);
    pointer.current.vx = (clientX - pointer.current.lastX) / elapsed;
    pointer.current.lastX = clientX;
    pointer.current.lastAt = now;
    pointer.current.x = dx;
    pointer.current.maxDistance = Math.max(pointer.current.maxDistance, Math.hypot(dx, dy));
    if (frameRef.current === null) {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const bounds = pointer.current.bounds;
        if (!bounds || !pointer.current.active) return;
        const moveX = pointer.current.x * 0.96;
        const progress = Math.min(1, Math.abs(moveX) / Math.max(bounds.width, 1));
        const rotation = Math.max(-5, Math.min(5, (moveX / Math.max(bounds.width, 1)) * 6));
        card.style.transform = `translate3d(${moveX.toFixed(2)}px,${(-progress * 2).toFixed(2)}px,0) rotateZ(${rotation.toFixed(2)}deg) scale(${(1 - progress * 0.004).toFixed(4)})`;
      });
    }
    if (Math.abs(dx) > Math.abs(dy) + 5) event.preventDefault();
  };

  const endPointer = (event: React.PointerEvent<HTMLElement>) => {
    if (!pointer.current.active || pointer.current.id !== event.pointerId) return;
    pointer.current.active = false;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // The browser may have already released capture during a native gesture.
    }
    const shouldDismiss = Math.abs(pointer.current.x) > 82 || Math.abs(pointer.current.vx) > 0.55;
    if (shouldDismiss) {
      suppressClickUntilRef.current = performance.now() + 450;
      const direction =
        Math.abs(pointer.current.x) > 16
          ? pointer.current.x
          : pointer.current.vx;
      decide(direction >= 0 ? "saved" : "skipped");
    }
    else {
      const shouldOpen = pointer.current.maxDistance < 10;
      if (!shouldOpen) suppressClickUntilRef.current = performance.now() + 450;
      resetCard();
      if (shouldOpen && current) {
        openDetails(current);
      }
    }
  };

  const cancelPointer = (event: React.PointerEvent<HTMLElement>) => {
    if (!pointer.current.active || pointer.current.id !== event.pointerId) return;
    pointer.current.active = false;
    suppressClickUntilRef.current = performance.now() + 450;
    resetCard();
  };

  if (feed.kind === "loading") {
    if (fallbackSnapshot && !savedView) {
      return (
        <CachedFeedRecovery
          savedView={false}
          snapshot={fallbackSnapshot}
        />
      );
    }
    return (
      <div className="mx-auto mt-2 h-[min(68svh,35rem)] w-full max-w-[23rem] animate-pulse rounded-[1.25rem] border border-[#26313e] bg-[#151d27]" role="status" aria-label="Loading jobs" />
    );
  }

  if (feed.kind === "error") {
    if (fallbackSnapshot && !savedView) {
      return (
        <CachedFeedRecovery
          retry={refresh}
          savedView={false}
          snapshot={fallbackSnapshot}
        />
      );
    }
    return (
      <section
        ref={emptyStateRef}
        tabIndex={-1}
        className="mx-auto mt-20 max-w-sm text-center outline-none"
      >
        <WifiOff className="mx-auto size-7 text-[#6f9bea]" aria-hidden="true" />
        <h1 className="mt-5 text-2xl font-semibold tracking-[-0.04em]">Feed unavailable</h1>
        <button type="button" onClick={refresh} className="mt-6 min-h-12 rounded-xl bg-[#4f7fd8] px-6 text-sm font-semibold text-white">
          Retry
        </button>
      </section>
    );
  }

  if (savedView && feed.kind === "ready") {
    const currentIds = new Set(feed.jobs.map((job) => job.id));
    const legacySnapshot = fallbackSnapshot
      ? {
          ...fallbackSnapshot,
          jobs: fallbackSnapshot.jobs.filter((job) => !currentIds.has(job.id)),
        }
      : null;
    return (
      <>
        <EmergencySavedList
          announcement={announcement}
          jobs={feed.jobs}
          onRemove={removeSavedJob}
        />
        {legacySnapshot && legacySnapshot.jobs.length > 0 ? (
          <div className="mt-8 border-t border-white/[0.08] pt-1">
            <CachedFeedRecovery
              savedView
              snapshot={legacySnapshot}
            />
          </div>
        ) : null}
        <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      </>
    );
  }

  if (!current || !currentRead) {
    if (
      !savedView &&
      directFeedStatus.retryAt === null &&
      (directFeedStatus.loadingMore || directFeedStatus.hasMore)
    ) {
      if (fallbackSnapshot) {
        return (
          <CachedFeedRecovery
            savedView={false}
            snapshot={fallbackSnapshot}
          />
        );
      }
      return (
        <div
          ref={(element) => {
            emptyStateRef.current = element;
          }}
          tabIndex={-1}
          className="mx-auto mt-2 h-[min(68svh,35rem)] w-full max-w-[23rem] animate-pulse rounded-[1.25rem] border border-[#26313e] bg-[#151d27] outline-none"
          role="status"
          aria-label="Loading jobs"
        >
        </div>
      );
    }
    return (
      <section
        ref={emptyStateRef}
        tabIndex={-1}
        className="mx-auto mt-20 max-w-sm text-center outline-none"
      >
        <BriefcaseBusiness className="mx-auto size-7 text-[#6f9bea]" aria-hidden="true" />
        <h1 className="mt-5 text-2xl font-semibold tracking-[-0.04em]">
          {savedView
            ? "No saved jobs"
            : directFeedStatus.retryAt !== null
              ? "Feed paused"
              : "Caught up"}
        </h1>
        {!savedView ? (
          <button type="button" onClick={refresh} className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl border border-[#303b49] bg-[#151d27] px-6 text-sm font-semibold">
            <RotateCcw className="size-4" aria-hidden="true" /> Refresh
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <>
    <section className="relative z-0 mx-auto mt-2 w-full max-w-[25rem]">
      <header className="mx-auto flex h-9 w-full max-w-[23rem] items-center px-1" aria-label="RoleDex">
        <span className="text-[1.05rem] font-bold tracking-[-0.04em] text-white">Role<span className="text-[#6f9bea]">Dex</span></span>
      </header>
      {announcement.startsWith("Couldn’t") ? (
        <p
          className="mx-auto mb-2 max-w-[23rem] rounded-xl border border-amber-300/20 bg-amber-300/[0.08] px-3 py-2 text-center text-[11px] leading-4 text-amber-100"
          role="alert"
        >
          {announcement}
        </p>
      ) : null}
      <div className="job-deck-stage relative isolate mx-auto mt-1 w-full max-w-[23rem]">
        {next && nextRead ? (
          <div className="deck-card-under pointer-events-none absolute inset-0 origin-bottom opacity-70 [backface-visibility:hidden]" aria-hidden="true" style={{ transform: "translate3d(0,8px,0) scale(.975)" }}>
            <EmergencyJobCard job={next} read={nextRead} preview />
          </div>
        ) : null}
        <article
          key={current.id}
          ref={activeRef}
          className="deck-card-active absolute inset-0 z-10 touch-pan-y cursor-grab select-none rounded-[1.25rem] outline-none [backface-visibility:hidden] [transform:translateZ(0)] active:cursor-grabbing focus-visible:ring-3 focus-visible:ring-primary/45"
          tabIndex={0}
          role="button"
          aria-label={`${current.title} at ${current.company}. Tap for the job brief, swipe left to pass, or swipe right to save.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={cancelPointer}
          onLostPointerCapture={cancelPointer}
          onClick={() => {
            if (
              current &&
              !decisionLockedRef.current &&
              !detailsOpeningRef.current &&
              selectedJob === null &&
              !pointer.current.active &&
              performance.now() >= suppressClickUntilRef.current
            ) {
              openDetails(current);
            }
          }}
          onKeyDown={(event) => {
            if (detailsOpeningRef.current || selectedJob !== null) return;
            if (event.key === "ArrowLeft") decide("skipped");
            if (event.key === "ArrowRight") decide("saved");
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openDetails(current);
            }
          }}
        >
          <div aria-hidden="true" className="deck-stamp deck-stamp-save pointer-events-none absolute left-5 top-7 z-30 opacity-0">Save</div>
          <div aria-hidden="true" className="deck-stamp deck-stamp-pass pointer-events-none absolute right-5 top-7 z-30 opacity-0">Pass</div>
          <EmergencyJobCard job={current} read={currentRead} />
        </article>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    </section>
    {selectedJob ? (
      <EmergencyJobDetails
        job={selectedJob}
        open
        read={emergencyJobRead(selectedJob, emergencyProfile)}
        returnFocusRef={activeRef}
        onReady={() => {
          detailsOpeningRef.current = false;
        }}
        onOpenChange={(open) => {
          if (!open) {
            detailsOpeningRef.current = false;
            setSelectedJob(null);
          }
        }}
        onDecision={(decision) => {
          focusAfterDecisionRef.current = true;
          detailsOpeningRef.current = false;
          setSelectedJob(null);
          decide(decision);
        }}
      />
    ) : null}
    </>
  );
}
