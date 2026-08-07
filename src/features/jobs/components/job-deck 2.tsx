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
  Undo2,
  X,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { RefillJobsButton } from "@/features/discovery/components/refill-jobs-button";
import type { DiscoveryStatusView } from "@/features/discovery/queries";
import type { DeckDecision } from "@/features/decisions/policy";
import {
  decideJobAction,
  loadMoreDeckJobsAction,
  restoreJobToDeckAction,
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
  discoveryStatus,
  initialHasMore,
  initialJobs,
  initialNextCursor,
}: {
  discoveryStatus: DiscoveryStatusView;
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
  const [lastDecision, setLastDecision] = useState<{
    decision: JobDeckDecision;
    job: JobCardViewModel;
    persisted: boolean;
  } | null>(null);
  const [undoing, setUndoing] = useState(false);
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
  const undoLockedRef = useRef(false);
  const dismissedJobIdsRef = useRef(new Set<string>());
  const focusAfterDecisionRef = useRef(false);
  const streamLoadInFlightRef = useRef(false);
  const deckActionsRef = useRef<HTMLDivElement>(null);
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
  const interactionLocked = animating || undoing;

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
      if (!job || decisionLocked.current || undoLockedRef.current) return;

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
        Boolean(activeElement?.closest("[role='dialog']")) ||
        Boolean(
          jobs.length === 1 &&
            activeElement &&
            deckActionsRef.current?.contains(activeElement),
        );
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
        setLastDecision({ decision, job, persisted: false });
        gesture.current.axis = "pending";
        gesture.current.pointerId = -1;
        gesture.current.x = 0;
        gesture.current.vx = 0;
        decisionLocked.current = false;
        setAnimating(false);

        void persistence.then((outcome) => {
          if (outcome.ok) {
            setLastDecision((current) =>
              current?.job.id === job.id ? { ...current, persisted: true } : current,
            );
            return;
          }
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
          setLastDecision((current) =>
            current?.job.id === job.id ? null : current,
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

  const undoLastDecision = useCallback(() => {
    const previous = lastDecision;
    if (
      !previous ||
      !previous.persisted ||
      undoLockedRef.current ||
      decisionLocked.current
    ) {
      return;
    }

    undoLockedRef.current = true;
    setUndoing(true);
    setError(null);

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    cancelMotionAnimations();
    resetSwipeStyles();

    const pointerId = gesture.current.pointerId;
    gesture.current.active = false;
    gesture.current.axis = "pending";
    gesture.current.pointerId = -1;
    gesture.current.x = 0;
    gesture.current.vx = 0;
    if (activeCardRef.current && pointerId >= 0) {
      try {
        if (activeCardRef.current.hasPointerCapture(pointerId)) {
          activeCardRef.current.releasePointerCapture(pointerId);
        }
      } catch {
        // Pointer capture may already have ended before the undo was invoked.
      }
    }

    void restoreJobToDeckAction(previous.job.id, previous.decision)
      .then((result) => {
        if (!result.ok) throw new Error(result.message);
        dismissedJobIdsRef.current.delete(previous.job.id);
        focusAfterDecisionRef.current = true;
        setJobs((existing) =>
          existing.some((candidate) => candidate.id === previous.job.id)
            ? existing
            : [previous.job, ...existing],
        );
        setCurrentIndex(0);
        setLastDecision(null);
        setAnnouncement(`${previous.job.title} was returned to the deck.`);
      })
      .catch((actionError: unknown) => {
        setError(
          actionError instanceof Error
            ? actionError.message
            : "That decision could not be undone.",
        );
      })
      .finally(() => {
        undoLockedRef.current = false;
        setUndoing(false);
      });
  }, [cancelMotionAnimations, lastDecision, resetSwipeStyles]);

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      animating ||
      decisionLocked.current ||
      undoLockedRef.current ||
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
        undoLockedRef.current ||
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

  const refreshAvailableJobs = useCallback(async () => {
    const page = await loadMoreDeckJobsAction({
      cursor: null,
      limit: STREAM_PAGE_SIZE,
    });
    const knownIds = new Set(jobs.map((job) => job.id));
    const additions = page.jobs.filter(
      (job) =>
        !knownIds.has(job.id) && !dismissedJobIdsRef.current.has(job.id),
    ).length;

    setError(null);
    mergeStreamPage(page.jobs);
    setHasMoreJobs(page.hasMore);
    setNextCursor(page.nextCursor);

    return {
      message:
        additions > 0
          ? `${additions} ${additions === 1 ? "new role" : "new roles"} added.`
          : "You’re up to date.",
      severity: "ok" as const,
    };
  }, [jobs, mergeStreamPage]);

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

  if (!currentJob) {
    return (
      <div className="mx-auto grid min-h-[calc(100dvh-8rem)] max-w-sm place-items-center px-6 text-center">
        <div>
          {error ? (
            <div
              role="alert"
              className="mb-5 flex items-start gap-3 rounded-2xl border border-[#db5366]/20 bg-[#fff2f4]/90 px-4 py-3 text-left text-sm leading-5 text-[#9d3445] shadow-sm"
            >
              <CircleOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-white/58 text-[#5f58d8] shadow-[0_16px_45px_rgba(24,35,55,.1)] ring-1 ring-white/80">
            <BriefcaseBusiness className="size-5" aria-hidden="true" />
          </span>
          <h1 ref={emptyStateHeadingRef} tabIndex={-1} className="mt-5 text-balance text-2xl font-semibold tracking-[-0.045em] text-[#111827] outline-none">
            You&apos;re caught up
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-[13px] leading-5 text-[#717b8c]">
            New roles arrive automatically. We&apos;ll keep looking.
          </p>
          <div className="mt-6 flex justify-center">
            <RefillJobsButton
              autoRefresh={false}
              onRefresh={refreshAvailableJobs}
              status={discoveryStatus}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="mx-auto w-full max-w-[29rem]">
      <div className="mb-2.5 flex min-h-11 items-start justify-between gap-3 px-1">
        <Link
          href="/profile"
          title="Tune your preferences"
          aria-label="Tune your job preferences"
          className="rounded-xl px-1 py-1 outline-none transition-colors hover:text-[#4f47c4] focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <span className="block text-sm font-semibold tracking-[-0.025em] text-[#283246]">
            Recommended jobs
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#6f7e93]">
            <span className="size-1.5 rounded-full bg-[#39bba3] shadow-[0_0_0_4px_rgba(57,187,163,.11)]" aria-hidden="true" />
            Based on your profile
          </span>
        </Link>
        <RefillJobsButton
          autoRefresh={false}
          compact
          onRefresh={refreshAvailableJobs}
          status={discoveryStatus}
          className="items-end [&_button]:h-11 [&_button]:rounded-full [&_button]:border-white/75 [&_button]:bg-white/42 [&_button]:px-3.5 [&_button]:text-[#526177] [&_button]:shadow-sm [&_button]:backdrop-blur-xl [&_p]:sr-only"
        />
      </div>

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

      <div className="relative mx-auto h-[clamp(29.5rem,calc(100dvh-13.75rem),40.5rem)] w-full max-w-[27rem]">
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
          className="absolute inset-0 z-10 touch-pan-y cursor-grab select-none rounded-[2.25rem] outline-none [backface-visibility:hidden] [transform:translateZ(0)] active:cursor-grabbing focus-visible:ring-3 focus-visible:ring-primary/45"
          onClick={(event) => {
            // Pointer gestures are resolved in onPointerUp. A detail-less click is
            // generated by assistive technology or a programmatic activation.
            if (
              event.detail === 0 &&
              !interactionLocked &&
              !undoLockedRef.current &&
              !decisionLocked.current
            ) {
              setDetailsOpen(true);
            }
          }}
          onKeyDown={(event) => {
            if (
              interactionLocked ||
              undoLockedRef.current ||
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

      <div
        ref={deckActionsRef}
        className="glass-bar relative z-20 mx-auto mt-3 grid w-full max-w-[27rem] grid-cols-2 gap-2 rounded-[1.4rem] p-2"
      >
        <button
          type="button"
          onClick={() => commitDecision("skipped")}
          disabled={interactionLocked}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-[1rem] border border-white/70 bg-white/44 px-5 text-sm font-semibold text-[#4f5e73] shadow-sm transition-[transform,background-color] duration-200 hover:-translate-y-px hover:bg-white/76 active:translate-y-0 active:scale-[.975] disabled:pointer-events-none disabled:opacity-45 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#667085]/25"
        >
          <X className="size-4.5" aria-hidden="true" />
          Pass
        </button>
        <button
          type="button"
          onClick={() => commitDecision("saved")}
          disabled={interactionLocked}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-[1rem] border border-white/26 bg-[linear-gradient(135deg,rgba(112,94,255,.94),rgba(79,72,218,.88))] px-5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(75,61,190,.24),inset_0_1px_0_rgba(255,255,255,.34)] backdrop-blur-xl transition-[transform,filter] duration-200 hover:-translate-y-px hover:brightness-105 active:translate-y-0 active:scale-[.975] disabled:pointer-events-none disabled:opacity-45 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/35"
        >
          <Heart className="size-4.5" aria-hidden="true" />
          Save
        </button>
      </div>

      {gestureHintVisible ? (
        <div className="glass-panel mx-auto mt-2 flex max-w-[27rem] items-center gap-2 rounded-2xl px-3 py-2 text-[10px] leading-4 text-[#66758a]" role="status">
          <MoveHorizontal className="size-3.5 shrink-0 text-[#7068df]" aria-hidden="true" />
          <span className="min-w-0 flex-1">Swipe left to pass, right to save, or tap for the role brief.</span>
          <button
            type="button"
            onClick={dismissGestureHint}
            className="grid size-11 shrink-0 place-items-center rounded-full text-[#8f97a4] hover:bg-white/60 hover:text-[#313b4d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            aria-label="Dismiss gesture help"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {lastDecision ? (
        <div className="glass-panel-strong fixed bottom-[max(5.25rem,calc(env(safe-area-inset-bottom)+4.5rem))] left-1/2 z-40 flex w-fit max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-full px-3.5 py-2 text-[11px] font-medium text-[#565f70] shadow-[0_16px_45px_rgba(21,32,52,.14)]" role="status">
          <span className="max-w-52 truncate">
            {lastDecision.decision === "skipped"
              ? "Passed"
              : lastDecision.decision === "apply"
                ? "Moved to applications"
              : lastDecision.decision === "stretch"
                ? "Saved as stretch"
                : lastDecision.decision === "learn_first"
                  ? "Saved to learn first"
                  : "Saved"}
          </span>
          <button
            type="button"
            onClick={undoLastDecision}
            disabled={interactionLocked || !lastDecision.persisted}
            className="inline-flex min-h-11 items-center gap-1 rounded-full px-2.5 font-bold text-primary hover:bg-white/55 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            {undoing || !lastDecision.persisted ? (
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Undo2 className="size-3.5" aria-hidden="true" />
            )}
            {lastDecision.persisted ? "Undo" : "Syncing"}
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
