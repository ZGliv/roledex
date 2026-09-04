"use client";

import Link from "next/link";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  BriefcaseBusiness,
  CircleOff,
  Heart,
  LoaderCircle,
  MoveHorizontal,
  RefreshCw,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { JobDecisionReason } from "@/db/schema";
import type { DeckDecision } from "@/features/decisions/policy";
import {
  annotateJobDecisionReasonsAction,
  decideJobAction,
  loadMoreDeckJobsAction,
  replenishDeckJobsAction,
  type DeckReplenishmentState,
  updateJobStatusAction,
} from "@/features/jobs/actions";
import { JobDetailsDialog } from "@/features/jobs/components/job-details-dialog";
import {
  safelyAnimate,
  waitForDeckMotion,
} from "@/features/jobs/components/job-deck-motion";
import { JobSwipeCard } from "@/features/jobs/components/job-swipe-card";
import { companyVisual } from "@/features/jobs/components/company-visual";
import { nextDeckCheckLabel } from "@/features/jobs/feed-copy";
import { saveJobFeedSnapshot } from "@/features/jobs/feed-snapshot";
import type {
  EnrichedJobCardViewModel,
  ProfileFeedImpactCounts,
} from "@/features/jobs/queries";

type JobDeckDecision = DeckDecision | "apply";

type DecisionFeedbackPrompt = {
  decision: "saved" | "skipped";
  jobId: string;
  title: string;
};

type GestureAxis = "pending" | "horizontal";

type GestureState = {
  active: boolean;
  axis: GestureAxis;
  baseX: number;
  lastTime: number;
  lastX: number;
  lightX: number;
  lightY: number;
  maxDistance: number;
  pointerX: number;
  pointerY: number;
  pointerId: number;
  startX: number;
  startY: number;
  vx: number;
  x: number;
  y: number;
};

const TAP_SLOP = 12;
const TILT_TRAVEL_PX = 48;
const HORIZONTAL_LOCK_RATIO = 1.3;
const MIN_FLING_DISTANCE = 24;
const MIN_FLING_VELOCITY = 0.48;
const VELOCITY_PROJECTION_MS = 180;
const SWIPE_THRESHOLD_RATIO = 0.26;
const SNAP_EASING = "cubic-bezier(.22,1,.36,1)";
const EXIT_EASING = "cubic-bezier(.2,.82,.25,1)";
const SPRING_STIFFNESS = 390;
const SPRING_DAMPING = 36;
const SPRING_MAX_DURATION_MS = 850;
const STREAM_LOW_WATER_MARK = 7;
const STREAM_PAGE_SIZE = 20;
const LOW_INVENTORY_RECHECK_DELAY_MS = 1_200;
const LOW_INVENTORY_RECHECK_INTERVAL_MS = 5 * 60_000;
const MAX_TIMEOUT_DELAY_MS = 2_147_000_000;
const GESTURE_HINT_STORAGE_KEY = "jobswipe:gesture-hint-seen:v2";

const PASS_FEEDBACK_OPTIONS = [
  { code: "wrong_role", label: "Wrong role" },
  { code: "too_senior", label: "Too senior" },
  { code: "pay_too_low", label: "Pay too low" },
  { code: "wrong_location", label: "Wrong location" },
  { code: "wrong_work_mode", label: "Work setup" },
  { code: "company_or_industry", label: "Company / industry" },
  { code: "stale_or_duplicate", label: "Stale / duplicate" },
] as const satisfies readonly {
  code: JobDecisionReason;
  label: string;
}[];

const SAVE_FEEDBACK_OPTIONS = [
  { code: "liked_role", label: "The role" },
  { code: "growth_opportunity", label: "Growth path" },
  { code: "liked_pay", label: "Compensation" },
  { code: "liked_location", label: "Location" },
  { code: "liked_work_mode", label: "Work setup" },
  { code: "liked_company_or_industry", label: "Company / industry" },
] as const satisfies readonly {
  code: JobDecisionReason;
  label: string;
}[];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function translationWithTiltResistance(travelX: number) {
  return travelX;
}

function tiltFromTravel(travel: number) {
  return clamp(travel / TILT_TRAVEL_PX, -1, 1);
}

function cardTransform(
  x: number,
  width: number,
  pointerX = 0,
  pointerY = 0,
) {
  const progress = clamp(Math.abs(x) / Math.max(width, 1), 0, 1);
  const rotationZ = clamp((x / Math.max(width, 1)) * 9.5, -9.5, 9.5);
  const rotationX = clamp(pointerY * -1.5, -1.5, 1.5);
  const rotationY = clamp(pointerX * 2, -2, 2);
  const pointerEnergy = clamp(Math.hypot(pointerX, pointerY), 0, 1);
  const scale = 1 + pointerEnergy * 0.002 - progress * 0.005;

  // Keep translation leftmost so the card stays under the finger even while
  // the perspective/tilt matrix is changing.
  return `translate3d(${x}px, ${-3 * progress}px, 0) perspective(950px) rotateX(${rotationX}deg) rotateY(${rotationY}deg) rotateZ(${rotationZ}deg) scale(${scale})`;
}

function latestPointerPosition(event: ReactPointerEvent<HTMLDivElement>) {
  const coalesced = event.nativeEvent.getCoalescedEvents?.();
  const latest = coalesced?.[coalesced.length - 1];
  return latest ?? event.nativeEvent;
}

function nextCardTransform(progress: number) {
  const boundedProgress = clamp(progress, 0, 1);
  const rest = 1 - boundedProgress;
  return `perspective(900px) translate3d(0, ${11 * rest}px, 0) rotateX(${1.1 * rest}deg) scale(${0.972 + boundedProgress * 0.028})`;
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function nextReplenishmentDelay(
  nextCheckAt: string | null | undefined,
  fallback: number,
) {
  if (!nextCheckAt) return fallback;
  const nextCheck = new Date(nextCheckAt).getTime();
  if (!Number.isFinite(nextCheck)) return fallback;
  return Math.min(MAX_TIMEOUT_DELAY_MS, Math.max(0, nextCheck - Date.now()));
}

function conciseAccessibleText(value: string, limit = 220) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit
    ? `${normalized.slice(0, limit - 1).trimEnd()}…`
    : normalized;
}

function accessibleCardLabel(job: EnrichedJobCardViewModel) {
  const workLabel =
    job.workArrangement !== "Unclear"
      ? job.workArrangement
      : job.employmentType;
  const locationAndWork = job.location
    .toLocaleLowerCase()
    .includes(workLabel.toLocaleLowerCase())
    ? job.location
    : `${job.location}; ${workLabel}`;
  const insight =
    job.decisionBrief?.opportunity ??
    job.strongestMatches[0] ??
    job.reasonsToApply[0] ??
    job.verdictExplanation;

  return [
    `Open details for ${job.title} at ${job.company}.`,
    `Feed tier: ${job.feedTier.replaceAll("_", " ")}.`,
    `Evidence confidence: ${job.evidenceConfidence}.`,
    `Salary: ${job.salaryDisplay}.`,
    `Work: ${locationAndWork}.`,
    `Why it fits: ${conciseAccessibleText(job.whyItFits || insight)}.`,
    `What to check: ${conciseAccessibleText(job.biggestRisk)}.`,
    "Use Left Arrow to pass or Right Arrow to save.",
  ].join(" ");
}

export function JobDeck({
  initialAdmissionCounts,
  initialHasMore,
  initialJobs,
  initialNextCursor,
}: {
  initialAdmissionCounts: Pick<
    ProfileFeedImpactCounts,
    "matches" | "explore" | "blocked"
  >;
  initialHasMore: boolean;
  initialJobs: EnrichedJobCardViewModel[];
  initialNextCursor: string | null;
}) {
  const [jobs, setJobs] = useState(initialJobs);
  const [hasMoreJobs, setHasMoreJobs] = useState(initialHasMore);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [gestureHintVisible, setGestureHintVisible] = useState(false);
  const [checkingForJobs, setCheckingForJobs] = useState(
    initialJobs.length === 0 &&
      initialAdmissionCounts.matches === 0 &&
      initialAdmissionCounts.explore === 0,
  );
  const [replenishment, setReplenishment] =
    useState<DeckReplenishmentState | null>(null);
  const [replenishmentCycle, setReplenishmentCycle] = useState(0);
  const [feedbackPrompt, setFeedbackPrompt] =
    useState<DecisionFeedbackPrompt | null>(null);
  const [feedbackSaving, setFeedbackSaving] =
    useState<JobDecisionReason | null>(null);
  const activeCardRef = useRef<HTMLDivElement>(null);
  const activeGlareRef = useRef<HTMLDivElement>(null);
  const emptyStateHeadingRef = useRef<HTMLHeadingElement>(null);
  const nextCardRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const saveStampRef = useRef<HTMLDivElement>(null);
  const passStampRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const springFrameRef = useRef<number | null>(null);
  const dialogFeedbackTimerRef = useRef<number | null>(null);
  const activeMotionAnimationRef = useRef<Animation | null>(null);
  const nextMotionAnimationRef = useRef<Animation | null>(null);
  const cancelMotionCompletionRef = useRef<(() => void) | null>(null);
  const motionSequenceRef = useRef(0);
  const queuedXRef = useRef(0);
  const queuedPointerXRef = useRef(0);
  const queuedPointerYRef = useRef(0);
  const queuedLightXRef = useRef(0);
  const queuedLightYRef = useRef(0);
  const cardWidthRef = useRef(420);
  const cardBoundsRef = useRef({ height: 620, left: 0, top: 0, width: 420 });
  const reducedMotionRef = useRef(false);
  const decisionLocked = useRef(false);
  const dismissedJobIdsRef = useRef(new Set<string>());
  const focusAfterDecisionRef = useRef(false);
  const streamLoadInFlightRef = useRef(false);
  const replenishmentInFlightRef = useRef(false);
  const pendingDecisionWritesRef = useRef(new Set<Promise<unknown>>());
  const feedbackPersistenceRef = useRef<{
    jobId: string;
    promise: Promise<
      | { ok: true; result: { decisionEventId: string | null } }
      | { ok: false; actionError: unknown }
    >;
  } | null>(null);
  const feedRequestSequenceRef = useRef(0);
  const gesture = useRef<GestureState>({
    active: false,
    axis: "pending",
    baseX: 0,
    lastTime: 0,
    lastX: 0,
    lightX: 0,
    lightY: 0,
    maxDistance: 0,
    pointerX: 0,
    pointerY: 0,
    pointerId: -1,
    startX: 0,
    startY: 0,
    vx: 0,
    x: 0,
    y: 0,
  });

  const currentJob = jobs[currentIndex] ?? null;
  const nextJob = jobs.length > 1 ? jobs[(currentIndex + 1) % jobs.length] : null;
  const interactionLocked =
    animating || feedbackSaving !== null;

  const dismissGestureHint = useCallback(() => {
    setGestureHintVisible(false);
    try {
      window.localStorage.setItem(GESTURE_HINT_STORAGE_KEY, "true");
    } catch {
      // Storage can be unavailable in strict privacy modes. The hint still
      // dismisses for the current page view.
    }
  }, []);

  const cancelDelayedFeedback = useCallback(() => {
    if (dialogFeedbackTimerRef.current === null) return;
    window.clearTimeout(dialogFeedbackTimerRef.current);
    dialogFeedbackTimerRef.current = null;
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        setGestureHintVisible(
          window.localStorage.getItem(GESTURE_HINT_STORAGE_KEY) !== "true",
        );
      } catch {
        setGestureHintVisible(true);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    saveJobFeedSnapshot("feed", jobs);
  }, [jobs]);

  const cancelMotionAnimations = useCallback(() => {
    const sequence = ++motionSequenceRef.current;
    cancelMotionCompletionRef.current?.();
    cancelMotionCompletionRef.current = null;
    if (springFrameRef.current !== null) {
      cancelAnimationFrame(springFrameRef.current);
      springFrameRef.current = null;
    }
    const activeAnimation = activeMotionAnimationRef.current;
    const nextAnimation = nextMotionAnimationRef.current;
    activeMotionAnimationRef.current = null;
    nextMotionAnimationRef.current = null;
    activeAnimation?.cancel();
    nextAnimation?.cancel();
    return sequence;
  }, []);

  const renderSwipePosition = useCallback((
    x: number,
    pointerX = gesture.current.pointerX,
    pointerY = gesture.current.pointerY,
    lightX = gesture.current.lightX,
    lightY = gesture.current.lightY,
  ) => {
    const activeCard = activeCardRef.current;
    if (!activeCard) return;

    const width = cardWidthRef.current || 1;
    const visualPointerX = reducedMotionRef.current ? 0 : pointerX;
    const visualPointerY = reducedMotionRef.current ? 0 : pointerY;
    const progress = clamp(Math.abs(x) / (width * 0.55), 0, 1);
    const pointerEnergy = clamp(
      Math.hypot(visualPointerX, visualPointerY),
      0,
      1,
    );
    activeCard.style.transform = cardTransform(
      x,
      width,
      visualPointerX,
      visualPointerY,
    );

    const glare = activeGlareRef.current;
    if (glare) {
      const glareX = clamp(lightX * 34 + (x / width) * 4, -36, 36);
      const glareY = clamp(lightY * 48, -48, 48);
      glare.style.transform = `translate3d(${glareX}px, ${glareY}px, 1px) scale(1.08)`;
      glare.style.opacity = String(
        clamp(pointerEnergy * 0.29 + progress * 0.11, 0, 0.34),
      );
    }

    if (nextCardRef.current) {
      nextCardRef.current.style.transform = nextCardTransform(progress);
      nextCardRef.current.style.opacity = String(0.76 + progress * 0.24);
    }
    if (saveStampRef.current) {
      saveStampRef.current.style.opacity = String(
        clamp((x - width * 0.04) / (width * 0.2), 0, 1),
      );
    }
    if (passStampRef.current) {
      passStampRef.current.style.opacity = String(
        clamp((-x - width * 0.04) / (width * 0.2), 0, 1),
      );
    }
  }, []);

  const resetSwipeStyles = useCallback(() => {
    const activeCard = activeCardRef.current;
    if (activeCard) {
      activeCard.style.removeProperty("transform");
      activeCard.style.removeProperty("opacity");
      activeCard.style.removeProperty("transform-origin");
      activeCard.style.removeProperty("will-change");
      activeCard.dataset.interacting = "false";
    }
    if (activeGlareRef.current) {
      activeGlareRef.current.style.removeProperty("transform");
      activeGlareRef.current.style.removeProperty("opacity");
    }
    if (stageRef.current) stageRef.current.dataset.interacting = "false";
    if (nextCardRef.current) {
      nextCardRef.current.style.transform = nextCardTransform(0);
      nextCardRef.current.style.opacity = "0.76";
      nextCardRef.current.style.removeProperty("will-change");
    }
    if (saveStampRef.current) saveStampRef.current.style.opacity = "0";
    if (passStampRef.current) passStampRef.current.style.opacity = "0";
  }, []);

  const snapBack = useCallback(() => {
    const activeCard = activeCardRef.current;
    if (!activeCard) return;

    const sequence = cancelMotionAnimations();
    if (prefersReducedMotion()) {
      resetSwipeStyles();
      gesture.current.x = 0;
      gesture.current.vx = 0;
      gesture.current.pointerX = 0;
      gesture.current.pointerY = 0;
      gesture.current.lightX = 0;
      gesture.current.lightY = 0;
      return;
    }

    let position = gesture.current.x;
    let velocity = gesture.current.vx * 1_000;
    let pointerX = gesture.current.pointerX;
    let pointerY = gesture.current.pointerY;
    let lightX = gesture.current.lightX;
    let lightY = gesture.current.lightY;
    let lastTime = performance.now();
    const startTime = lastTime;
    activeCard.style.willChange = "transform";
    if (nextCardRef.current) nextCardRef.current.style.willChange = "transform";
    activeCard.dataset.interacting = "true";

    const settle = (now: number) => {
      if (motionSequenceRef.current !== sequence) return;
      const elapsedSeconds = Math.min((now - lastTime) / 1_000, 0.048);
      lastTime = now;
      const steps = Math.max(1, Math.ceil(elapsedSeconds / 0.016));
      const stepSeconds = elapsedSeconds / steps;
      for (let step = 0; step < steps; step += 1) {
        const acceleration =
          -SPRING_STIFFNESS * position - SPRING_DAMPING * velocity;
        velocity += acceleration * stepSeconds;
        position += velocity * stepSeconds;
      }
      const pointerDecay = Math.exp(-13 * elapsedSeconds);
      pointerX *= pointerDecay;
      pointerY *= pointerDecay;
      lightX *= pointerDecay;
      lightY *= pointerDecay;

      gesture.current.x = position;
      gesture.current.vx = velocity / 1_000;
      gesture.current.pointerX = pointerX;
      gesture.current.pointerY = pointerY;
      gesture.current.lightX = lightX;
      gesture.current.lightY = lightY;
      renderSwipePosition(position, pointerX, pointerY, lightX, lightY);

      const settled =
        Math.abs(position) < 0.35 &&
        Math.abs(velocity) < 5 &&
        Math.abs(pointerX) < 0.004 &&
        Math.abs(pointerY) < 0.004 &&
        Math.abs(lightX) < 0.004 &&
        Math.abs(lightY) < 0.004;
      if (settled || now - startTime >= SPRING_MAX_DURATION_MS) {
        springFrameRef.current = null;
        resetSwipeStyles();
        gesture.current.x = 0;
        gesture.current.vx = 0;
        gesture.current.pointerX = 0;
        gesture.current.pointerY = 0;
        gesture.current.lightX = 0;
        gesture.current.lightY = 0;
        return;
      }
      springFrameRef.current = requestAnimationFrame(settle);
    };

    springFrameRef.current = requestAnimationFrame(settle);
  }, [cancelMotionAnimations, renderSwipePosition, resetSwipeStyles]);

  const commitDecision = useCallback(
    (decision: JobDeckDecision) => {
      const job = currentJob;
      if (!job || decisionLocked.current) return;
      cancelDelayedFeedback();
      setFeedbackPrompt(null);
      const decisionOriginatedInDialog = detailsOpen;

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
        renderSwipePosition(
          queuedXRef.current,
          queuedPointerXRef.current,
          queuedPointerYRef.current,
          queuedLightXRef.current,
          queuedLightYRef.current,
        );
      }

      const activeCard = activeCardRef.current;
      const nextCard = nextCardRef.current;
      const width =
        activeCard?.getBoundingClientRect().width || cardWidthRef.current || 420;
      cardWidthRef.current = width;
      const currentX = gesture.current.x;
      const activeVisualTransform = activeCard
        ? getComputedStyle(activeCard).transform
        : cardTransform(currentX, width);
      const nextVisualTransform = nextCard
        ? getComputedStyle(nextCard).transform
        : nextCardTransform(0);
      const sequence = cancelMotionAnimations();

      if (nextCard) {
        nextCard.dataset.promoting = "true";
        nextCard
          .querySelector<HTMLElement>(".obsidian-job-card")
          ?.removeAttribute("aria-hidden");
      }

      if (activeCard) {
        activeCard.style.transform =
          activeVisualTransform === "none"
            ? cardTransform(currentX, width)
            : activeVisualTransform;
        activeCard.style.willChange = "transform, opacity";
      }
      if (nextCard) {
        nextCard.style.transform =
          nextVisualTransform === "none"
            ? nextCardTransform(0)
            : nextVisualTransform;
        nextCard.style.willChange = "transform";
      }

      const pointerId = gesture.current.pointerId;
      gesture.current.active = false;
      if (activeCard && pointerId >= 0) {
        try {
          if (activeCard.hasPointerCapture(pointerId)) {
            activeCard.releasePointerCapture(pointerId);
          }
        } catch {
          // A browser can drop pointer capture as it starts native scrolling.
        }
      }

      dismissGestureHint();

      const activeElement = document.activeElement;
      focusAfterDecisionRef.current =
        activeElement === activeCardRef.current ||
        Boolean(activeElement?.closest("[role='dialog']"));
      dismissedJobIdsRef.current.add(job.id);
      decisionLocked.current = true;
      setAnimating(true);
      setDetailsOpen(false);
      setError(null);

      const persistence = (decision === "apply"
        ? updateJobStatusAction(
            job.id,
            "apply",
            job.currentDecision,
            job.currentDecisionEventId,
          )
        : decideJobAction(
            job.id,
            decision,
            job.currentDecision,
            job.currentDecisionEventId,
          ))
        .then((result) =>
          result.ok
            ? { ok: true as const, result: result.value }
            : { ok: false as const, actionError: new Error(result.message) },
        )
        .catch((actionError: unknown) => ({ ok: false as const, actionError }));
      pendingDecisionWritesRef.current.add(persistence);
      if (decision === "skipped" || decision === "saved") {
        feedbackPersistenceRef.current = {
          jobId: job.id,
          promise: persistence,
        };
      }
      void persistence.then(() => {
        pendingDecisionWritesRef.current.delete(persistence);
      });

      const direction =
        decision === "saved" || decision === "apply"
          ? 1
          : decision === "skipped"
            ? -1
            : 0;
      const verticalExit = decision === "stretch" || decision === "learn_first";
      const reducedMotion = prefersReducedMotion();
      const hasGestureMomentum = Math.abs(currentX) >= MIN_FLING_DISTANCE;
      const duration = verticalExit
        ? 225
        : clamp(
            255 - (hasGestureMomentum ? Math.abs(gesture.current.vx) * 34 : 0),
            175,
            255,
          );
      const exitDistance = Math.max(window.innerWidth, width) + width;
      const exitX = direction * exitDistance;
      const momentumX =
        direction * Math.max(width * 0.3, 96) + currentX;
      const toTransform =
        verticalExit
          ? "translate3d(0, -48vh, 0) scale(.965)"
          : `translate3d(${exitX}px, 14px, 0) rotateZ(${direction * 13}deg) scale(.985)`;

      if (
        (decision === "saved" || decision === "apply") &&
        saveStampRef.current
      ) {
        saveStampRef.current.style.opacity = "1";
      }
      if (decision === "skipped" && passStampRef.current) {
        passStampRef.current.style.opacity = "1";
      }

      const activeAnimation =
        reducedMotion || !activeCard
          ? null
          : safelyAnimate(
              activeCard,
              [
                {
                  transform: activeCard.style.transform,
                  opacity: 1,
                  offset: 0,
                },
                ...(!verticalExit
                  ? [
                      {
                        transform: cardTransform(momentumX, width),
                        opacity: 1,
                        offset: 0.28,
                      },
                    ]
                  : []),
                {
                  transform: verticalExit
                    ? toTransform
                    : `perspective(1100px) translate3d(${exitX}px, 14px, 0) rotateX(0deg) rotateY(${direction * 5}deg) rotateZ(${direction * 13}deg) scale(.985)`,
                  opacity: verticalExit ? 0 : 0.96,
                  offset: 1,
                },
              ],
              { duration, easing: EXIT_EASING, fill: "forwards" },
            );
      const nextAnimation =
        reducedMotion || !nextCard
          ? null
          : safelyAnimate(
              nextCard,
              [
                {
                  transform: nextCard.style.transform,
                  opacity: Number.parseFloat(nextCard.style.opacity || "0.76"),
                  offset: 0,
                },
                {
                  transform:
                    "perspective(900px) translate3d(0, -1px, 0) rotateX(0deg) scale(1.003)",
                  opacity: 1,
                  offset: 0.8,
                },
                { transform: nextCardTransform(1), opacity: 1, offset: 1 },
              ],
              { duration, easing: SNAP_EASING, fill: "forwards" },
            );

      activeMotionAnimationRef.current = activeAnimation ?? null;
      nextMotionAnimationRef.current = nextAnimation ?? null;

      cancelMotionCompletionRef.current = waitForDeckMotion({
        animations: [activeAnimation, nextAnimation],
        durationMs: duration,
        onComplete: () => {
          if (motionSequenceRef.current !== sequence) return;
          cancelMotionCompletionRef.current = null;
          activeMotionAnimationRef.current = null;
          nextMotionAnimationRef.current = null;
          setJobs((existing) =>
            existing.filter((candidate) => candidate.id !== job.id),
          );
          setCurrentIndex((index) =>
            Math.max(0, Math.min(index, jobs.length - 2)),
          );
          setAnnouncement(
            decision === "apply"
              ? `${job.title} moved to your application pipeline.`
              : decision === "saved"
                ? `${job.title} saved.`
                : decision === "stretch"
                  ? `${job.title} saved as a stretch.`
                  : decision === "learn_first"
                    ? `${job.title} saved to learn first.`
                    : `${job.title} passed.`,
          );
          if (decision === "skipped" || decision === "saved") {
            const revealFeedback = () => {
              setFeedbackPrompt({ decision, jobId: job.id, title: job.title });
              setAnnouncement(
                decision === "saved"
                  ? `${job.title} saved. Optional feedback is available.`
                  : `${job.title} passed. Optional feedback is available.`,
              );
            };
            if (decisionOriginatedInDialog) {
              dialogFeedbackTimerRef.current = window.setTimeout(() => {
                dialogFeedbackTimerRef.current = null;
                revealFeedback();
              }, 140);
            } else {
              revealFeedback();
            }
          }
          gesture.current.axis = "pending";
          gesture.current.pointerId = -1;
          gesture.current.x = 0;
          gesture.current.vx = 0;
          decisionLocked.current = false;
          setAnimating(false);

          void persistence.then((outcome) => {
            if (outcome.ok) return;
            setJobs((existing) =>
              existing.some((candidate) => candidate.id === job.id)
                ? existing
                : [...existing, job],
            );
            dismissedJobIdsRef.current.delete(job.id);
            setFeedbackPrompt((current) =>
              current?.jobId === job.id ? null : current,
            );
            setError(
              outcome.actionError instanceof Error
                ? `${outcome.actionError.message} The job was returned to your deck.`
                : "That decision could not sync. The job was returned to your deck.",
            );
            setAnnouncement(
              `${job.title} could not sync and was returned to your deck.`,
            );
          });
        },
      });
    },
    [
      cancelDelayedFeedback,
      cancelMotionAnimations,
      currentJob,
      detailsOpen,
      dismissGestureHint,
      jobs.length,
      renderSwipePosition,
    ],
  );

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      interactionLocked ||
      decisionLocked.current ||
      !event.isPrimary ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }

    cancelDelayedFeedback();
    setFeedbackPrompt(null);

    const startingX = gesture.current.x;
    reducedMotionRef.current = prefersReducedMotion();
    cancelMotionAnimations();
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const now = performance.now();
    const pointer = latestPointerPosition(event);
    const cardBounds = activeCardRef.current?.getBoundingClientRect();
    cardWidthRef.current = cardBounds?.width || 420;
    cardBoundsRef.current = {
      height: cardBounds?.height || 620,
      left: cardBounds?.left || 0,
      top: cardBounds?.top || 0,
      width: cardBounds?.width || 420,
    };
    const pointerX = clamp(
      ((pointer.clientX - cardBoundsRef.current.left) /
        cardBoundsRef.current.width -
        0.5) *
        2,
      -1,
      1,
    );
    const pointerY = clamp(
      ((pointer.clientY - cardBoundsRef.current.top) /
        cardBoundsRef.current.height -
        0.5) *
        2,
      -1,
      1,
    );
    queuedXRef.current = startingX;
    queuedPointerXRef.current = 0;
    queuedPointerYRef.current = 0;
    queuedLightXRef.current = pointerX;
    queuedLightYRef.current = pointerY;
    gesture.current = {
      active: true,
      axis: "pending",
      baseX: startingX,
      lastTime: now,
      lastX: startingX,
      lightX: pointerX,
      lightY: pointerY,
      maxDistance: 0,
      pointerX: 0,
      pointerY: 0,
      pointerId: event.pointerId,
      startX: pointer.clientX,
      startY: pointer.clientY,
      vx: 0,
      x: startingX,
      y: 0,
    };
    event.currentTarget.style.willChange = "transform";
    event.currentTarget.dataset.interacting = "true";
    activeGlareRef.current = event.currentTarget.querySelector<HTMLDivElement>(
      ".job-card-interactive-glare",
    );
    if (stageRef.current) stageRef.current.dataset.interacting = "true";
    if (nextCardRef.current) nextCardRef.current.style.willChange = "transform";
    renderSwipePosition(startingX, 0, 0, pointerX, pointerY);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort on older embedded mobile browsers.
    }
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current.active || current.pointerId !== event.pointerId) return;

    const pointer = latestPointerPosition(event);
    const travelX = pointer.clientX - current.startX;
    const travelY = pointer.clientY - current.startY;
    const travelDistance = Math.hypot(travelX, travelY);
    let x = current.baseX;
    current.y = travelY;
    current.maxDistance = Math.max(current.maxDistance, travelDistance);
    current.pointerX = tiltFromTravel(travelX);
    current.pointerY = tiltFromTravel(travelY);
    current.lightX = clamp(
      ((pointer.clientX - cardBoundsRef.current.left) /
        cardBoundsRef.current.width -
        0.5) *
        2,
      -1,
      1,
    );
    current.lightY = clamp(
      ((pointer.clientY - cardBoundsRef.current.top) /
        cardBoundsRef.current.height -
        0.5) *
        2,
      -1,
      1,
    );

    if (current.axis === "pending" && travelDistance > TAP_SLOP) {
      if (Math.abs(travelX) > Math.abs(travelY) * HORIZONTAL_LOCK_RATIO) {
        current.axis = "horizontal";
        dismissGestureHint();
      }
    }

    if (current.axis === "horizontal") {
      x = current.baseX + translationWithTiltResistance(travelX);
    }
    current.x = x;
    if (current.axis === "pending") {
      queuedXRef.current = current.baseX;
      queuedPointerXRef.current = current.pointerX;
      queuedPointerYRef.current = current.pointerY;
      queuedLightXRef.current = current.lightX;
      queuedLightYRef.current = current.lightY;
      if (frameRef.current === null) {
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = null;
          renderSwipePosition(
            queuedXRef.current,
            queuedPointerXRef.current,
            queuedPointerYRef.current,
            queuedLightXRef.current,
            queuedLightYRef.current,
          );
        });
      }
      return;
    }

    event.preventDefault();

    const now = performance.now();
    const elapsed = Math.max(1, now - current.lastTime);
    const instantVelocity = clamp((x - current.lastX) / elapsed, -3.5, 3.5);
    current.vx = current.vx * 0.58 + instantVelocity * 0.42;
    current.lastX = x;
    current.lastTime = now;

    queuedXRef.current = x;
    queuedPointerXRef.current = current.pointerX;
    queuedPointerYRef.current = current.pointerY;
    queuedLightXRef.current = current.lightX;
    queuedLightYRef.current = current.lightY;
    if (frameRef.current === null) {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        renderSwipePosition(
          queuedXRef.current,
          queuedPointerXRef.current,
          queuedPointerYRef.current,
          queuedLightXRef.current,
          queuedLightYRef.current,
        );
      });
    }
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current.active || current.pointerId !== event.pointerId) return;

    const pointer = latestPointerPosition(event);
    const finalTravelX = pointer.clientX - current.startX;
    const finalTravelY = pointer.clientY - current.startY;
    const finalX =
      current.axis === "horizontal"
        ? current.baseX + translationWithTiltResistance(finalTravelX)
        : current.baseX;
    current.x = finalX;
    current.y = finalTravelY;
    current.pointerX = tiltFromTravel(finalTravelX);
    current.pointerY = tiltFromTravel(finalTravelY);
    current.lightX = clamp(
      ((pointer.clientX - cardBoundsRef.current.left) /
        cardBoundsRef.current.width -
        0.5) *
        2,
      -1,
      1,
    );
    current.lightY = clamp(
      ((pointer.clientY - cardBoundsRef.current.top) /
        cardBoundsRef.current.height -
        0.5) *
        2,
      -1,
      1,
    );
    current.maxDistance = Math.max(
      current.maxDistance,
      Math.hypot(finalTravelX, finalTravelY),
    );

    if (current.axis === "horizontal") {
      const now = performance.now();
      const elapsed = Math.max(1, now - current.lastTime);
      const finalDelta = finalX - current.lastX;
      if (Math.abs(finalDelta) > 0.5) {
        const finalVelocity = clamp(finalDelta / elapsed, -3.5, 3.5);
        current.vx = current.vx * 0.48 + finalVelocity * 0.52;
      } else if (elapsed > 40) {
        current.vx *= clamp(1 - (elapsed - 40) / 120, 0, 1);
      }
      current.lastX = finalX;
      current.lastTime = now;
    }

    current.active = false;
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (current.axis === "horizontal") {
      renderSwipePosition(
        current.x,
        current.pointerX,
        current.pointerY,
        current.lightX,
        current.lightY,
      );
    }
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Pointer capture may already be gone after a native scroll handoff.
    }

    const activeCard = activeCardRef.current;
    const width = activeCard?.offsetWidth ?? 420;
    const projectedX = current.x + current.vx * VELOCITY_PROJECTION_MS;
    const threshold = clamp(width * SWIPE_THRESHOLD_RATIO, 84, 126);

    if (current.axis === "pending" && current.maxDistance > TAP_SLOP) {
      renderSwipePosition(
        current.x,
        current.pointerX,
        current.pointerY,
        current.lightX,
        current.lightY,
      );
      snapBack();
      return;
    }

    if (current.axis !== "horizontal") {
      resetSwipeStyles();
      current.baseX = 0;
      current.x = 0;
      current.vx = 0;
      current.pointerX = 0;
      current.pointerY = 0;
      current.lightX = 0;
      current.lightY = 0;
      if (current.axis === "pending" && current.maxDistance <= TAP_SLOP) {
        setDetailsOpen(true);
      }
      return;
    }

    const deliberateFling =
      Math.abs(current.x) >= MIN_FLING_DISTANCE &&
      Math.abs(current.vx) >= MIN_FLING_VELOCITY;
    const deliberateTravel = Math.abs(current.x) >= threshold;
    if (
      Math.abs(projectedX) >= threshold &&
      (deliberateTravel || deliberateFling)
    ) {
      commitDecision(projectedX > 0 ? "saved" : "skipped");
    } else {
      snapBack();
    }
  };

  const cancelActiveDrag = useCallback(
    (pointerId?: number) => {
      const current = gesture.current;
      if (
        !current.active ||
        (pointerId !== undefined && current.pointerId !== pointerId)
      ) {
        return;
      }
      current.active = false;
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (current.axis === "horizontal") {
        renderSwipePosition(current.x);
        snapBack();
      } else {
        resetSwipeStyles();
        current.baseX = 0;
        current.x = 0;
        current.vx = 0;
        current.pointerX = 0;
        current.pointerY = 0;
        current.lightX = 0;
        current.lightY = 0;
      }
    },
    [renderSwipePosition, resetSwipeStyles, snapBack],
  );

  const cancelDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    cancelActiveDrag(event.pointerId);
  };

  const losePointerCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    cancelActiveDrag(event.pointerId);
  };

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      cancelDelayedFeedback();
      cancelMotionAnimations();
    },
    [cancelDelayedFeedback, cancelMotionAnimations],
  );

  useEffect(() => {
    const stopInterruptedGesture = () => cancelActiveDrag();
    const stopHiddenGesture = () => {
      if (document.visibilityState === "hidden") cancelActiveDrag();
    };
    window.addEventListener("blur", stopInterruptedGesture);
    document.addEventListener("visibilitychange", stopHiddenGesture);
    return () => {
      window.removeEventListener("blur", stopInterruptedGesture);
      document.removeEventListener("visibilitychange", stopHiddenGesture);
    };
  }, [cancelActiveDrag]);

  useEffect(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    queuedXRef.current = 0;
    gesture.current.active = false;
    gesture.current.axis = "pending";
    gesture.current.pointerId = -1;
    gesture.current.baseX = 0;
    gesture.current.x = 0;
    gesture.current.vx = 0;
    gesture.current.pointerX = 0;
    gesture.current.pointerY = 0;
    gesture.current.lightX = 0;
    gesture.current.lightY = 0;
    cancelMotionAnimations();
    resetSwipeStyles();
    activeGlareRef.current = null;
  }, [cancelMotionAnimations, currentJob?.id, resetSwipeStyles]);

  useEffect(() => {
    if (!focusAfterDecisionRef.current) return;
    focusAfterDecisionRef.current = false;
    const frame = requestAnimationFrame(() => {
      if (activeCardRef.current) {
        activeCardRef.current.focus();
      } else {
        emptyStateHeadingRef.current?.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [currentJob?.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        detailsOpen ||
        interactionLocked ||
        event.defaultPrevented ||
        decisionLocked.current
      ) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, button, a, [contenteditable='true'], [role='button'], [role='dialog']",
        )
      ) {
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        commitDecision("saved");
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        commitDecision("skipped");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commitDecision, detailsOpen, interactionLocked]);

  const mergeStreamPage = useCallback((incoming: EnrichedJobCardViewModel[]) => {
    if (incoming.length === 0) return;
    setJobs((existing) => {
      const knownIds = new Set(existing.map((job) => job.id));
      const additions = incoming.filter(
        (job) =>
          !knownIds.has(job.id) && !dismissedJobIdsRef.current.has(job.id),
      );
      return additions.length > 0 ? [...existing, ...additions] : existing;
    });
  }, []);

  const submitDecisionFeedback = useCallback(
    async (reasonCode: JobDecisionReason) => {
      const prompt = feedbackPrompt;
      if (!prompt || feedbackSaving) return;

      setFeedbackSaving(reasonCode);
      setError(null);
      try {
        const persistence = feedbackPersistenceRef.current;
        if (persistence?.jobId === prompt.jobId) {
          const persisted = await persistence.promise;
          if (!persisted.ok) throw persisted.actionError;
          if (!persisted.result.decisionEventId) {
            throw new Error(
              "That pass could not be identified safely. Refresh before adding feedback.",
            );
          }

          const result = await annotateJobDecisionReasonsAction(
            prompt.jobId,
            prompt.decision,
            persisted.result.decisionEventId,
            [reasonCode],
          );
          if (!result.ok) throw new Error(result.message);
        } else {
          throw new Error(
            "That decision is no longer available for feedback. Swipe another card to continue tuning your feed.",
          );
        }

        setAnnouncement(`Got it. ${prompt.title} will refine your feed.`);

        const requestSequence = ++feedRequestSequenceRef.current;
        try {
          const page = await loadMoreDeckJobsAction({
            cursor: null,
            limit: STREAM_PAGE_SIZE,
          });
          if (
            feedRequestSequenceRef.current === requestSequence
          ) {
            // Keep the card currently under the user's hand in place while the
            // single For You queue reranks around the saved signal.
            mergeStreamPage(page.jobs);
            setHasMoreJobs(page.hasMore);
            setNextCursor(page.nextCursor);
          }
        } catch (rerankError) {
          console.error(
            "Feedback was saved, but the deck could not rerank immediately.",
            rerankError,
          );
          setAnnouncement(
            `Feedback saved for ${prompt.title}. Your feed will catch up automatically.`,
          );
        }
        setFeedbackPrompt((current) =>
          current?.jobId === prompt.jobId ? null : current,
        );
      } catch (feedbackError) {
        setError(
          feedbackError instanceof Error
            ? feedbackError.message
            : "That feedback could not sync right now.",
        );
      } finally {
        setFeedbackSaving(null);
      }
    },
    [
      feedbackPrompt,
      feedbackSaving,
      mergeStreamPage,
    ],
  );

  const checkForNewJobs = useCallback(async () => {
    if (
      replenishmentInFlightRef.current ||
      streamLoadInFlightRef.current
    ) {
      return;
    }
    if (document.visibilityState === "hidden") {
      setCheckingForJobs(false);
      return;
    }

    replenishmentInFlightRef.current = true;
    const requestSequence = feedRequestSequenceRef.current;
    setCheckingForJobs(true);
    setError(null);
    try {
      // The last swipe is optimistic. Let its write settle before asking the
      // server what remains, otherwise the just-dismissed job can make an
      // actually empty deck look non-empty to the refill action.
      await Promise.allSettled([...pendingDecisionWritesRef.current]);
      if (document.hidden) return;
      const page = await replenishDeckJobsAction({
        limit: STREAM_PAGE_SIZE,
      });
      if (feedRequestSequenceRef.current !== requestSequence) return;
      setReplenishment(page.replenishment);
      // Background discovery never replaces a card being read or moved.
      mergeStreamPage(page.jobs);
      setHasMoreJobs(page.hasMore);
      setNextCursor(page.nextCursor);
      if (page.replenishment.status === "error") {
        setError(page.replenishment.message);
      }
    } catch (streamError) {
      if (feedRequestSequenceRef.current !== requestSequence) return;
      const message =
        streamError instanceof Error
          ? streamError.message
          : "The live stream could not check for new roles right now.";
      setError(message);
      setReplenishment({
        message,
        nextCheckAt: new Date(
          Date.now() + LOW_INVENTORY_RECHECK_INTERVAL_MS,
        ).toISOString(),
        status: "error",
      });
    } finally {
      replenishmentInFlightRef.current = false;
      setCheckingForJobs(false);
      setReplenishmentCycle((cycle) => cycle + 1);
    }
  }, [mergeStreamPage]);

  useEffect(() => {
    if (
      jobs.length > STREAM_LOW_WATER_MARK ||
      streamLoadInFlightRef.current ||
      !hasMoreJobs ||
      !nextCursor
    ) {
      return;
    }

    streamLoadInFlightRef.current = true;
    const requestSequence = feedRequestSequenceRef.current;
    void (async () => {
      try {
        const page = await loadMoreDeckJobsAction({
          cursor: nextCursor,
          limit: STREAM_PAGE_SIZE,
        });
        if (feedRequestSequenceRef.current !== requestSequence) return;

        setError(null);
        mergeStreamPage(page.jobs);
        setHasMoreJobs(page.hasMore);
        setNextCursor(page.nextCursor);
      } catch (streamError) {
        if (feedRequestSequenceRef.current !== requestSequence) return;
        if (jobs.length === 0) {
          setError(
            streamError instanceof Error
              ? streamError.message
              : "The live stream could not refresh right now.",
          );
        }
      } finally {
        streamLoadInFlightRef.current = false;
      }
    })();
  }, [
    hasMoreJobs,
    jobs.length,
    mergeStreamPage,
    nextCursor,
  ]);

  useEffect(() => {
    if (
      jobs.length > STREAM_LOW_WATER_MARK ||
      (hasMoreJobs && nextCursor)
    ) {
      return;
    }

    const initialDelay = nextReplenishmentDelay(
      replenishment?.nextCheckAt,
      jobs.length === 0 ? 0 : LOW_INVENTORY_RECHECK_DELAY_MS,
    );
    const initialCheck = window.setTimeout(() => {
      void checkForNewJobs();
    }, initialDelay);
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void checkForNewJobs();
    };

    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      window.clearTimeout(initialCheck);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [
    checkForNewJobs,
    hasMoreJobs,
    jobs.length,
    nextCursor,
    replenishmentCycle,
    replenishment?.nextCheckAt,
  ]);

  const emptyMode =
    checkingForJobs ||
    replenishment?.status === "checking"
      ? "checking"
      : error || replenishment?.status === "error"
        ? "error"
        : "caught_up";
  const emptyHeading =
    emptyMode === "checking"
      ? "Checking for new roles"
      : emptyMode === "error"
        ? "We couldn’t check right now"
        : "You’re caught up";
  const emptyDescription =
    emptyMode === "checking"
      ? "Looking for fresh roles that still respect every hard filter."
      : emptyMode === "error"
        ? "Your saved jobs and swipe history are safe. We’ll try again automatically."
        : "You’ve seen every credible role currently in your For You queue. We won’t pad it with weak or incompatible listings.";

  const activeVisual = currentJob ? companyVisual(currentJob.company) : null;
  const deckVisualStyle = activeVisual
    ? ({
        "--deck-company-accent": activeVisual.accent,
        "--deck-company-glass": activeVisual.background,
        "--deck-company-ink": activeVisual.foreground,
      } as CSSProperties)
    : undefined;

  return (
    <section
      className="relative z-0 mx-auto w-full max-w-[25rem]"
      style={deckVisualStyle}
    >
      <div
        className="deck-live-scene pointer-events-none fixed inset-0 -z-10 overflow-hidden"
        aria-hidden="true"
      >
        <span className="deck-live-orb deck-live-orb-a" />
        <span className="deck-live-orb deck-live-orb-b" />
        <span className="deck-live-grid" />
      </div>
      {!currentJob ? (
        <div className="mx-auto mt-3 max-w-[23rem] px-2 text-center">
        <section
          className="w-full rounded-[1.4rem] border border-white/12 bg-white/[0.055] px-5 py-5 text-white shadow-[0_18px_46px_rgba(0,0,0,.22),inset_0_1px_0_rgba(255,255,255,.12)] backdrop-blur-[18px] backdrop-saturate-[135%]"
          role="status"
          aria-live="polite"
          aria-busy={emptyMode === "checking"}
        >
          <span className="mx-auto grid size-10 place-items-center rounded-[0.85rem] border border-white/14 bg-white/[0.075] text-[#a9a3ff] shadow-[inset_0_1px_0_rgba(255,255,255,.14),0_9px_24px_rgba(0,0,0,.16)]">
            {emptyMode === "checking" ? (
              <LoaderCircle className="size-4.5 animate-spin" aria-hidden="true" />
            ) : emptyMode === "error" ? (
              <CircleOff className="size-4.5" aria-hidden="true" />
            ) : (
              <BriefcaseBusiness className="size-4.5" aria-hidden="true" />
            )}
          </span>
          <h1
            ref={emptyStateHeadingRef}
            tabIndex={-1}
            className="mt-3 text-balance text-xl font-semibold tracking-[-0.04em] text-white outline-none"
          >
            {emptyHeading}
          </h1>
          <p className="mx-auto mt-1.5 max-w-xs text-[12px] leading-[1.15rem] text-[#aeb7ca]">
            {emptyDescription}
          </p>
          {emptyMode === "error" && error ? (
            <p
              role="alert"
              className="mx-auto mt-3 max-w-xs text-[11px] leading-4 text-[#f2a9b5]"
            >
              {error}
            </p>
          ) : null}
          <p className="mt-3 text-[10.5px] font-medium text-[#8995ab]">
            {emptyMode === "checking"
              ? "Checking your For You queue…"
              : nextDeckCheckLabel(replenishment?.nextCheckAt)}
          </p>

          {emptyMode === "checking" ? (
            <Link
              href="/saved"
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-xs font-semibold text-[#c8cede] outline-none transition hover:bg-white/[0.08] hover:text-white focus-visible:ring-2 focus-visible:ring-white/35"
            >
              <Heart className="size-3.5" aria-hidden="true" />
              Review saved jobs
            </Link>
          ) : (
            <div className="mt-4 space-y-2">
              {emptyMode === "error" ? (
                <button
                  type="button"
                  onClick={() => void checkForNewJobs()}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-white/75 bg-white px-4 text-sm font-semibold text-[#182237] shadow-[0_10px_28px_rgba(0,0,0,.2),inset_0_1px_0_rgba(255,255,255,.95)] outline-none transition hover:bg-[#f2f4ff] focus-visible:ring-2 focus-visible:ring-white/50"
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                  Try again
                </button>
              ) : (
                <Link
                  href="/profile#direction"
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-white/75 bg-white px-4 text-sm font-semibold text-[#182237] shadow-[0_10px_28px_rgba(0,0,0,.2),inset_0_1px_0_rgba(255,255,255,.95)] outline-none transition hover:bg-[#f2f4ff] focus-visible:ring-2 focus-visible:ring-white/50"
                >
                  <SlidersHorizontal className="size-4" aria-hidden="true" />
                  Tune your criteria
                </Link>
              )}
              {emptyMode === "error" ? (
                <Link
                  href="/profile#direction"
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.075] px-4 text-sm font-semibold text-[#dce1ed] shadow-[inset_0_1px_0_rgba(255,255,255,.12)] outline-none transition hover:bg-white/[0.12] hover:text-white focus-visible:ring-2 focus-visible:ring-white/35"
                >
                  <SlidersHorizontal className="size-4" aria-hidden="true" />
                  Edit your filters
                </Link>
              ) : null}
              <Link
                href="/saved"
                className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-xs font-semibold text-[#aeb7ca] outline-none transition hover:bg-white/[0.07] hover:text-white focus-visible:ring-2 focus-visible:ring-white/35"
              >
                <Heart className="size-3.5" aria-hidden="true" />
                Review saved jobs
              </Link>
            </div>
          )}
          </section>
        </div>
      ) : (
        <>
      {error ? (
        <Card
          role="alert"
          className="glass-panel-strong mb-3 mt-3 border-[#db5366]/20 bg-[#fff2f4]/90 text-[#9d3445]"
        >
          <CardContent className="flex items-start gap-3 p-3.5 text-sm leading-5">
            <CircleOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </CardContent>
        </Card>
      ) : null}

      <div
        ref={stageRef}
        data-gesture-hint={
          (gestureHintVisible && !feedbackPrompt && !error) || undefined
        }
        data-feedback-prompt={Boolean(feedbackPrompt) || undefined}
        data-has-error={Boolean(error) || undefined}
        className="job-deck-stage relative isolate mx-auto mt-3 w-full max-w-[23rem]"
        aria-busy={interactionLocked}
      >
        {nextJob ? (
          <div
            key={`under-${nextJob.id}`}
            ref={nextCardRef}
            aria-hidden="true"
            className="deck-card-under pointer-events-none absolute inset-0 origin-bottom [backface-visibility:hidden]"
            style={{ opacity: 0.76, transform: nextCardTransform(0) }}
          >
            <JobSwipeCard
              job={nextJob}
              nearMatchExplanation={nextJob.nearMatchExplanation}
              preview
            />
          </div>
        ) : null}

        <div
          key={currentJob.id}
          ref={activeCardRef}
          data-job-id={currentJob.id}
          role="button"
          tabIndex={0}
          aria-label={accessibleCardLabel(currentJob)}
          aria-disabled={interactionLocked}
          aria-roledescription="swipeable job card"
          aria-keyshortcuts="Enter Space ArrowLeft ArrowRight"
          className="deck-card-active absolute inset-0 z-10 [touch-action:pinch-zoom] cursor-grab select-none rounded-[1.75rem] outline-none [backface-visibility:hidden] [transform:translateZ(0)] active:cursor-grabbing focus-visible:ring-3 focus-visible:ring-primary/45"
          onClick={(event) => {
            // Pointer gestures are resolved in onPointerUp. A detail-less click is
            // generated by assistive technology or a programmatic activation.
            if (
              event.detail === 0 &&
              !interactionLocked &&
              !decisionLocked.current
            ) {
              setDetailsOpen(true);
            }
          }}
          onKeyDown={(event) => {
            if (
              interactionLocked ||
              decisionLocked.current
            ) {
              if (
                event.key === "Enter" ||
                event.key === " " ||
                event.key === "ArrowRight" ||
                event.key === "ArrowLeft"
              ) {
                event.preventDefault();
              }
              return;
            }
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setDetailsOpen(true);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              commitDecision("saved");
            } else if (event.key === "ArrowLeft") {
              event.preventDefault();
              commitDecision("skipped");
            }
          }}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
          onPointerCancel={cancelDrag}
          onLostPointerCapture={losePointerCapture}
        >
          <div
            ref={saveStampRef}
            aria-hidden="true"
            className="deck-stamp deck-stamp-save pointer-events-none absolute left-5 top-7 z-30 opacity-0"
          >
            Save
          </div>
          <div
            ref={passStampRef}
            aria-hidden="true"
            className="deck-stamp deck-stamp-pass pointer-events-none absolute right-5 top-7 z-30 opacity-0"
          >
            Pass
          </div>
          <JobSwipeCard
            job={currentJob}
            nearMatchExplanation={currentJob.nearMatchExplanation}
          />
        </div>

      </div>

      {gestureHintVisible && !feedbackPrompt && !error ? (
        <div className="deck-gesture-hint mx-auto mt-2 flex max-w-[23rem] items-center gap-2 px-2 text-[11px] leading-4 text-[#929db2]" role="status">
          <MoveHorizontal className="size-3.5 shrink-0 text-[#8d84ff]" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            Tilt gently · swipe to decide · tap to open
          </span>
          <button
            type="button"
            onClick={dismissGestureHint}
            className="grid size-11 shrink-0 place-items-center rounded-xl text-[#8994a8] outline-none transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:ring-2 focus-visible:ring-white/30"
            aria-label="Dismiss gesture help"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}
        </>
      )}

      {feedbackPrompt ? (
        <aside
          data-decision-feedback={feedbackPrompt.decision}
          className="deck-feedback-tray relative z-20 mx-auto mt-2 w-[calc(100%-0.5rem)] max-w-[23rem] rounded-[1.4rem] px-3 pb-3 pt-2.5 text-left"
          role="region"
          aria-labelledby="decision-feedback-heading"
        >
          <div className="flex items-center gap-3 px-1">
            <div className="min-w-0 flex-1">
              <p
                id="decision-feedback-heading"
                className="text-[13px] font-semibold tracking-[-0.015em] text-white"
              >
                {feedbackPrompt.decision === "saved"
                  ? "What stood out?"
                  : "What was off?"}
              </p>
              <p className="truncate text-[10.5px] text-[#8f9aaf]">
                Optional · this tunes the next cards
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFeedbackPrompt(null)}
              disabled={feedbackSaving !== null}
              className="grid size-11 shrink-0 place-items-center rounded-full text-[#9da7ba] outline-none transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:ring-2 focus-visible:ring-white/35 disabled:opacity-45"
              aria-label={`Dismiss feedback for ${feedbackPrompt.title}`}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          <div className="deck-feedback-options flex gap-2 overflow-x-auto pb-0.5 pt-1">
            {(feedbackPrompt.decision === "saved"
              ? SAVE_FEEDBACK_OPTIONS
              : PASS_FEEDBACK_OPTIONS
            ).map((option) => (
              <button
                key={option.code}
                type="button"
                onClick={() => void submitDecisionFeedback(option.code)}
                disabled={feedbackSaving !== null}
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.075] px-3.5 text-[11px] font-semibold text-[#d7dce7] shadow-[inset_0_1px_0_rgba(255,255,255,.11)] outline-none transition hover:border-white/20 hover:bg-white/[0.13] hover:text-white focus-visible:ring-2 focus-visible:ring-white/35 disabled:cursor-wait disabled:opacity-50"
              >
                {feedbackSaving === option.code ? (
                  <LoaderCircle className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />
                ) : null}
                {option.label}
              </button>
            ))}
          </div>
        </aside>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {currentJob ? (
        <JobDetailsDialog
          job={currentJob}
          nearMatchExplanation={currentJob.nearMatchExplanation}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          onDecision={commitDecision}
          pending={interactionLocked}
          returnFocusRef={activeCardRef}
        />
      ) : null}
    </section>
  );
}
