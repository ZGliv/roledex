"use client";

import Link from "next/link";
import {
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
import type { DeckDecision } from "@/features/decisions/policy";
import {
  decideJobAction,
  loadMoreDeckJobsAction,
  replenishDeckJobsAction,
  type DeckReplenishmentState,
  updateJobStatusAction,
} from "@/features/jobs/actions";
import type { JobCardViewModel } from "@/features/jobs/components/job-card";
import { JobDetailsDialog } from "@/features/jobs/components/job-details-dialog";
import { JobSwipeCard } from "@/features/jobs/components/job-swipe-card";

type JobDeckDecision = DeckDecision | "apply";

type GestureAxis = "pending" | "horizontal" | "vertical";

type GestureState = {
  active: boolean;
  axis: GestureAxis;
  lastTime: number;
  lastX: number;
  maxDistance: number;
  pointerId: number;
  startX: number;
  startY: number;
  vx: number;
  x: number;
  y: number;
};

const TAP_SLOP = 8;
const HORIZONTAL_LOCK_RATIO = 1.15;
const MIN_FLING_DISTANCE = 24;
const MIN_FLING_VELOCITY = 0.48;
const VELOCITY_PROJECTION_MS = 180;
const SWIPE_THRESHOLD_RATIO = 0.26;
const SNAP_EASING = "cubic-bezier(.22,1,.36,1)";
const EXIT_EASING = "cubic-bezier(.2,.82,.25,1)";
const STREAM_LOW_WATER_MARK = 7;
const STREAM_PAGE_SIZE = 25;
const LOW_INVENTORY_RECHECK_DELAY_MS = 1_200;
const LOW_INVENTORY_RECHECK_INTERVAL_MS = 5 * 60_000;
const MAX_TIMEOUT_DELAY_MS = 2_147_000_000;
const GESTURE_HINT_STORAGE_KEY = "jobswipe:gesture-hint-seen:v1";

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function cardTransform(x: number, width: number) {
  const progress = clamp(Math.abs(x) / Math.max(width, 1), 0, 1);
  const rotation = clamp((x / Math.max(width, 1)) * 9, -9, 9);
  const lift = -2 * progress;
  return `translate3d(${x}px, ${lift}px, 0) rotateZ(${rotation}deg)`;
}

function nextCardTransform(progress: number) {
  const boundedProgress = clamp(progress, 0, 1);
  return `translate3d(0, ${9 * (1 - boundedProgress)}px, 0) scale(${0.978 + boundedProgress * 0.022})`;
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function finished(animation: Animation) {
  return animation.finished.catch(() => undefined);
}

function nextCheckLabel(value: string | null | undefined) {
  if (!value) return "Watching for newly published roles";
  const nextCheck = new Date(value);
  if (Number.isNaN(nextCheck.getTime())) {
    return "Watching for newly published roles";
  }
  return `Next automatic check around ${nextCheck.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
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

function accessibleCardLabel(job: JobCardViewModel) {
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
    `Disposition: ${job.verdict}.`,
    `Salary: ${job.salaryDisplay}.`,
    `Work: ${locationAndWork}.`,
    `Decision insight: ${conciseAccessibleText(insight)}.`,
    "Use Left Arrow to pass or Right Arrow to save.",
  ].join(" ");
}

export function JobDeck({
  initialHasMore,
  initialJobs,
  initialNextCursor,
}: {
  initialHasMore: boolean;
  initialJobs: JobCardViewModel[];
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
    initialJobs.length === 0,
  );
  const [replenishment, setReplenishment] =
    useState<DeckReplenishmentState | null>(null);
  const [replenishmentCycle, setReplenishmentCycle] = useState(0);
  const activeCardRef = useRef<HTMLDivElement>(null);
  const emptyStateHeadingRef = useRef<HTMLHeadingElement>(null);
  const nextCardRef = useRef<HTMLDivElement>(null);
  const saveStampRef = useRef<HTMLDivElement>(null);
  const passStampRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const activeMotionAnimationRef = useRef<Animation | null>(null);
  const nextMotionAnimationRef = useRef<Animation | null>(null);
  const motionSequenceRef = useRef(0);
  const queuedXRef = useRef(0);
  const cardWidthRef = useRef(420);
  const decisionLocked = useRef(false);
  const dismissedJobIdsRef = useRef(new Set<string>());
  const focusAfterDecisionRef = useRef(false);
  const streamLoadInFlightRef = useRef(false);
  const replenishmentInFlightRef = useRef(false);
  const pendingDecisionWritesRef = useRef(new Set<Promise<unknown>>());
  const gesture = useRef<GestureState>({
    active: false,
    axis: "pending",
    lastTime: 0,
    lastX: 0,
    maxDistance: 0,
    pointerId: -1,
    startX: 0,
    startY: 0,
    vx: 0,
    x: 0,
    y: 0,
  });

  const currentJob = jobs[currentIndex] ?? null;
  const nextJob = jobs.length > 1 ? jobs[(currentIndex + 1) % jobs.length] : null;
  const interactionLocked = animating;

  const dismissGestureHint = useCallback(() => {
    setGestureHintVisible(false);
    try {
      window.localStorage.setItem(GESTURE_HINT_STORAGE_KEY, "true");
    } catch {
      // Storage can be unavailable in strict privacy modes. The hint still
      // dismisses for the current page view.
    }
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

  const cancelMotionAnimations = useCallback(() => {
    const sequence = ++motionSequenceRef.current;
    const activeAnimation = activeMotionAnimationRef.current;
    const nextAnimation = nextMotionAnimationRef.current;
    activeMotionAnimationRef.current = null;
    nextMotionAnimationRef.current = null;
    activeAnimation?.cancel();
    nextAnimation?.cancel();
    return sequence;
  }, []);

  const renderSwipePosition = useCallback((x: number) => {
    const activeCard = activeCardRef.current;
    if (!activeCard) return;

    const width = cardWidthRef.current || 1;
    const progress = clamp(Math.abs(x) / (width * 0.55), 0, 1);
    activeCard.style.transform = cardTransform(x, width);

    if (nextCardRef.current) {
      nextCardRef.current.style.transform = nextCardTransform(progress);
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
    }
    if (nextCardRef.current) {
      nextCardRef.current.style.transform = nextCardTransform(0);
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
      return;
    }

    const width = cardWidthRef.current || 1;
    const currentX = gesture.current.x;
    const progress = clamp(Math.abs(currentX) / (width * 0.55), 0, 1);
    const duration = clamp(
      190 + progress * 100 - Math.abs(gesture.current.vx) * 24,
      175,
      290,
    );
    activeCard.style.willChange = "transform";
    if (nextCardRef.current) nextCardRef.current.style.willChange = "transform";
    const activeAnimation = activeCard.animate(
      [
        { transform: cardTransform(currentX, width) },
        { transform: cardTransform(0, width) },
      ],
      { duration, easing: SNAP_EASING, fill: "forwards" },
    );
    activeMotionAnimationRef.current = activeAnimation;

    const nextAnimation = nextCardRef.current?.animate(
      [
        { transform: nextCardTransform(progress) },
        { transform: nextCardTransform(0) },
      ],
      { duration, easing: SNAP_EASING, fill: "forwards" },
    );
    nextMotionAnimationRef.current = nextAnimation ?? null;

    if (saveStampRef.current) saveStampRef.current.style.opacity = "0";
    if (passStampRef.current) passStampRef.current.style.opacity = "0";

    void Promise.all([
      finished(activeAnimation),
      nextAnimation ? finished(nextAnimation) : Promise.resolve(),
    ]).then(() => {
      if (
        motionSequenceRef.current === sequence &&
        activeMotionAnimationRef.current === activeAnimation
      ) {
        activeMotionAnimationRef.current = null;
        if (nextMotionAnimationRef.current === nextAnimation) {
          nextMotionAnimationRef.current = null;
        }
        resetSwipeStyles();
        gesture.current.x = 0;
        gesture.current.vx = 0;
        activeAnimation.cancel();
        nextAnimation?.cancel();
      }
    });
  }, [cancelMotionAnimations, resetSwipeStyles]);

  const commitDecision = useCallback(
    (decision: JobDeckDecision) => {
      const job = currentJob;
      if (!job || decisionLocked.current) return;

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
        renderSwipePosition(queuedXRef.current);
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
        ? updateJobStatusAction(job.id, "apply", job.currentDecision)
        : decideJobAction(job.id, decision, job.currentDecision))
        .then((result) =>
          result.ok
            ? { ok: true as const, result: result.value }
            : { ok: false as const, actionError: new Error(result.message) },
        )
        .catch((actionError: unknown) => ({ ok: false as const, actionError }));
      pendingDecisionWritesRef.current.add(persistence);
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
      const toTransform =
        verticalExit
          ? "translate3d(0, -48vh, 0) scale(.965)"
          : `translate3d(${exitX}px, 10px, 0) rotateZ(${direction * 10}deg)`;

      if (
        (decision === "saved" || decision === "apply") &&
        saveStampRef.current
      ) {
        saveStampRef.current.style.opacity = "1";
      }
      if (decision === "skipped" && passStampRef.current) {
        passStampRef.current.style.opacity = "1";
      }

      const activeAnimation = reducedMotion
        ? null
        : activeCard?.animate(
            [
              {
                transform: activeCard.style.transform,
                opacity: 1,
              },
              {
                transform: toTransform,
                opacity: verticalExit ? 0 : 0.96,
              },
            ],
            { duration, easing: EXIT_EASING, fill: "forwards" },
          );
      const nextAnimation = reducedMotion
        ? null
        : nextCard?.animate(
            [
              { transform: nextCard.style.transform },
              { transform: nextCardTransform(1) },
            ],
            { duration, easing: SNAP_EASING, fill: "forwards" },
          );

      activeMotionAnimationRef.current = activeAnimation ?? null;
      nextMotionAnimationRef.current = nextAnimation ?? null;

      const exitFinished = Promise.all([
        activeAnimation ? finished(activeAnimation) : Promise.resolve(),
        nextAnimation ? finished(nextAnimation) : Promise.resolve(),
      ]);

      void exitFinished.then(() => {
        if (motionSequenceRef.current !== sequence) return;
        activeMotionAnimationRef.current = null;
        nextMotionAnimationRef.current = null;
        setJobs((existing) => existing.filter((candidate) => candidate.id !== job.id));
        setCurrentIndex((index) => Math.max(0, Math.min(index, jobs.length - 2)));
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
          setError(
            outcome.actionError instanceof Error
              ? `${outcome.actionError.message} The job was returned to your deck.`
              : "That decision could not sync. The job was returned to your deck.",
          );
          setAnnouncement(`${job.title} could not sync and was returned to your deck.`);
        });
      });
    },
    [
      cancelMotionAnimations,
      currentJob,
      dismissGestureHint,
      jobs.length,
      renderSwipePosition,
    ],
  );

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      animating ||
      decisionLocked.current ||
      !event.isPrimary ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }

    cancelMotionAnimations();
    resetSwipeStyles();
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const now = performance.now();
    const cardBounds = activeCardRef.current?.getBoundingClientRect();
    cardWidthRef.current = cardBounds?.width || 420;
    queuedXRef.current = 0;
    gesture.current = {
      active: true,
      axis: "pending",
      lastTime: now,
      lastX: 0,
      maxDistance: 0,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      vx: 0,
      x: 0,
      y: 0,
    };
    event.currentTarget.style.willChange = "transform";
    event.currentTarget.style.transformOrigin = "50% 72%";
    if (nextCardRef.current) nextCardRef.current.style.willChange = "transform";
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort on older embedded mobile browsers.
    }
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current.active || current.pointerId !== event.pointerId) return;

    const x = event.clientX - current.startX;
    const y = event.clientY - current.startY;
    current.x = x;
    current.y = y;
    current.maxDistance = Math.max(current.maxDistance, Math.hypot(x, y));

    if (current.axis === "pending" && Math.hypot(x, y) > TAP_SLOP) {
      if (Math.abs(x) > Math.abs(y) * HORIZONTAL_LOCK_RATIO) {
        current.axis = "horizontal";
        dismissGestureHint();
      } else if (Math.abs(y) > Math.abs(x) * 1.08) {
        current.axis = "vertical";
      }
    }
    if (current.axis !== "horizontal") return;

    const now = performance.now();
    const elapsed = Math.max(1, now - current.lastTime);
    const instantVelocity = clamp((x - current.lastX) / elapsed, -3.5, 3.5);
    current.vx = current.vx * 0.58 + instantVelocity * 0.42;
    current.lastX = x;
    current.lastTime = now;

    queuedXRef.current = x;
    if (frameRef.current === null) {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        renderSwipePosition(queuedXRef.current);
      });
    }
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current.active || current.pointerId !== event.pointerId) return;

    const finalX = event.clientX - current.startX;
    const finalY = event.clientY - current.startY;
    current.x = finalX;
    current.y = finalY;
    current.maxDistance = Math.max(
      current.maxDistance,
      Math.hypot(finalX, finalY),
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
    if (current.axis === "horizontal") renderSwipePosition(current.x);
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

    if (current.axis !== "horizontal") {
      resetSwipeStyles();
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
      cancelMotionAnimations();
    },
    [cancelMotionAnimations],
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
    gesture.current.x = 0;
    gesture.current.vx = 0;
    cancelMotionAnimations();
    resetSwipeStyles();
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
  }, [commitDecision, detailsOpen]);

  const mergeStreamPage = useCallback((incoming: JobCardViewModel[]) => {
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

  const replaceStreamPage = useCallback((incoming: JobCardViewModel[]) => {
    setJobs(
      incoming.filter(
        (job) => !dismissedJobIdsRef.current.has(job.id),
      ),
    );
    setCurrentIndex(0);
  }, []);

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
      setReplenishment(page.replenishment);
      // A live refresh can revise or expire held jobs, so reconcile the whole
      // small deck rather than appending stale client copies.
      replaceStreamPage(page.jobs);
      setHasMoreJobs(page.hasMore);
      setNextCursor(page.nextCursor);
      if (page.replenishment.status === "error") {
        setError(page.replenishment.message);
      }
    } catch (streamError) {
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
  }, [replaceStreamPage]);

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
    void (async () => {
      try {
        const page = await loadMoreDeckJobsAction({
          cursor: nextCursor,
          limit: STREAM_PAGE_SIZE,
        });

        setError(null);
        mergeStreamPage(page.jobs);
        setHasMoreJobs(page.hasMore);
        setNextCursor(page.nextCursor);
      } catch (streamError) {
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
      hasMoreJobs ||
      nextCursor
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

  if (!currentJob) {
    const emptyMode =
      checkingForJobs || replenishment?.status === "checking"
        ? "checking"
        : error || replenishment?.status === "error"
          ? "error"
          : "caught_up";
    const heading =
      emptyMode === "checking"
        ? "Checking for new roles"
        : emptyMode === "error"
          ? "We couldn’t check right now"
          : "You’re caught up";
    const description =
      emptyMode === "checking"
        ? "Looking for newly available jobs that fit your current search."
        : emptyMode === "error"
          ? "Your saved jobs and swipe history are safe. We’ll try again automatically."
          : "You’ve seen every active role that currently fits your search. New matches will appear here automatically.";

    return (
      <div className="mx-auto grid min-h-[calc(100dvh-8rem)] max-w-sm place-items-center px-5 text-center">
        <section
          className="w-full rounded-[1.75rem] border border-white/15 bg-white/[0.075] px-6 py-7 text-white shadow-[0_28px_72px_rgba(0,0,0,.3),inset_0_1px_0_rgba(255,255,255,.16)] backdrop-blur-[22px] backdrop-saturate-[145%]"
          role="status"
          aria-live="polite"
          aria-busy={emptyMode === "checking"}
        >
          <span className="mx-auto grid size-12 place-items-center rounded-[1rem] border border-white/15 bg-white/[0.09] text-[#a9a3ff] shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_12px_30px_rgba(0,0,0,.2)]">
            {emptyMode === "checking" ? (
              <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
            ) : emptyMode === "error" ? (
              <CircleOff className="size-5" aria-hidden="true" />
            ) : (
              <BriefcaseBusiness className="size-5" aria-hidden="true" />
            )}
          </span>
          <h1
            ref={emptyStateHeadingRef}
            tabIndex={-1}
            className="mt-5 text-balance text-2xl font-semibold tracking-[-0.045em] text-white outline-none"
          >
            {heading}
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-[13px] leading-5 text-[#aeb7ca]">
            {description}
          </p>
          {emptyMode === "error" && error ? (
            <p
              role="alert"
              className="mx-auto mt-3 max-w-xs text-[11px] leading-4 text-[#f2a9b5]"
            >
              {error}
            </p>
          ) : null}
          <p className="mt-4 text-[11px] font-medium text-[#8995ab]">
            {emptyMode === "checking"
              ? "Checking the latest matches…"
              : nextCheckLabel(replenishment?.nextCheckAt)}
          </p>

          {emptyMode === "checking" ? (
            <Link
              href="/saved"
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-xs font-semibold text-[#c8cede] outline-none transition hover:bg-white/[0.08] hover:text-white focus-visible:ring-2 focus-visible:ring-white/35"
            >
              <Heart className="size-3.5" aria-hidden="true" />
              Review saved jobs
            </Link>
          ) : (
            <div className="mt-6 space-y-2.5">
              <button
                type="button"
                onClick={() => void checkForNewJobs()}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-white/75 bg-white px-4 text-sm font-semibold text-[#182237] shadow-[0_10px_28px_rgba(0,0,0,.2),inset_0_1px_0_rgba(255,255,255,.95)] outline-none transition hover:bg-[#f2f4ff] focus-visible:ring-2 focus-visible:ring-white/50"
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                {emptyMode === "error" ? "Try again" : "Check again"}
              </button>
              <Link
                href="/profile#direction"
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.075] px-4 text-sm font-semibold text-[#dce1ed] shadow-[inset_0_1px_0_rgba(255,255,255,.12)] outline-none transition hover:bg-white/[0.12] hover:text-white focus-visible:ring-2 focus-visible:ring-white/35"
              >
                <SlidersHorizontal className="size-4" aria-hidden="true" />
                Broaden your search
              </Link>
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
    );
  }

  return (
    <section className="mx-auto w-full max-w-[25rem]">
      {error ? (
        <Card
          role="alert"
          className="glass-panel-strong mb-3 border-[#db5366]/20 bg-[#fff2f4]/90 text-[#9d3445]"
        >
          <CardContent className="flex items-start gap-3 p-3.5 text-sm leading-5">
            <CircleOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </CardContent>
        </Card>
      ) : null}

      <div className="relative mx-auto h-[clamp(26.5rem,calc(100svh-var(--dock-reserve)-1.75rem),43.5rem)] w-full max-w-[23rem]">
        {nextJob ? (
          <div
            key={`under-${nextJob.id}`}
            ref={nextCardRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 origin-bottom [backface-visibility:hidden]"
            style={{ transform: nextCardTransform(0) }}
          >
            <JobSwipeCard job={nextJob} preview />
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
          className="absolute inset-0 z-10 touch-pan-y cursor-grab select-none rounded-[1.75rem] outline-none [backface-visibility:hidden] [transform:translateZ(0)] active:cursor-grabbing focus-visible:ring-3 focus-visible:ring-primary/45"
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
            className="pointer-events-none absolute left-5 top-6 z-30 -rotate-6 rounded-xl border border-[#6c64e5]/25 bg-white/82 px-3.5 py-2 text-xs font-semibold text-[#524bc7] opacity-0 shadow-[0_10px_30px_rgba(47,43,120,.12)] backdrop-blur-xl"
          >
            Save
          </div>
          <div
            ref={passStampRef}
            aria-hidden="true"
            className="pointer-events-none absolute right-5 top-6 z-30 rotate-6 rounded-xl border border-[#d66272]/25 bg-white/82 px-3.5 py-2 text-xs font-semibold text-[#ba4052] opacity-0 shadow-[0_10px_30px_rgba(125,44,57,.1)] backdrop-blur-xl"
          >
            Pass
          </div>
          <JobSwipeCard job={currentJob} />
        </div>
      </div>

      {gestureHintVisible ? (
        <div className="mx-auto mt-2 flex max-w-[23rem] items-center gap-2 px-2 text-[11px] leading-4 text-[#929db2]" role="status">
          <MoveHorizontal className="size-3.5 shrink-0 text-[#8d84ff]" aria-hidden="true" />
          <span className="min-w-0 flex-1">Swipe to decide · tap to open</span>
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

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <JobDetailsDialog
        job={currentJob}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onDecision={commitDecision}
        pending={interactionLocked}
        returnFocusRef={activeCardRef}
      />
    </section>
  );
}
