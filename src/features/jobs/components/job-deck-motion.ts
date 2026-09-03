const EXIT_COMPLETION_GRACE_MS = 120;

type AnimationWithCompletion = { finished: Promise<unknown> };

type MotionTimer = ReturnType<typeof globalThis.setTimeout>;

export function safelyAnimate(
  element: Pick<HTMLElement, "animate"> | null,
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
  options: number | KeyframeAnimationOptions,
) {
  if (!element || typeof element.animate !== "function") return null;

  try {
    return element.animate(keyframes, options);
  } catch {
    // Some iOS WebKit releases can reject otherwise valid transform
    // keyframes while a captured touch is being handed back to the page.
    // The deck still advances through the completion controller below.
    return null;
  }
}

export function waitForDeckMotion({
  animations,
  durationMs,
  onComplete,
}: {
  animations: readonly (AnimationWithCompletion | null)[];
  durationMs: number;
  onComplete: () => void;
}) {
  let cancelled = false;
  let completed = false;
  let fallbackTimer: MotionTimer | null = null;

  const completeOnce = () => {
    if (cancelled || completed) return;
    completed = true;
    if (fallbackTimer !== null) {
      globalThis.clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    onComplete();
  };

  const completionPromises = animations
    .filter(
      (animation): animation is AnimationWithCompletion => animation !== null,
    )
    .map((animation) =>
      Promise.resolve(animation.finished).catch(() => undefined),
    );

  if (completionPromises.length === 0) {
    queueMicrotask(completeOnce);
  } else {
    void Promise.all(completionPromises).then(completeOnce);
  }

  // WebKit can leave Animation.finished pending when a pointer-capture handoff
  // interrupts a compositor animation. Never let that strand a card with a
  // fill-forwards transform: promote the next card after a small grace window.
  fallbackTimer = globalThis.setTimeout(
    completeOnce,
    Math.max(0, durationMs) + EXIT_COMPLETION_GRACE_MS,
  );

  return () => {
    cancelled = true;
    if (fallbackTimer !== null) {
      globalThis.clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  };
}
