export function swipePose(
  x: number,
  y: number,
  width: number,
  reduced = false,
) {
  const progress = Math.min(1, Math.abs(x) / Math.max(1, width * 0.55));
  const rotation = reduced ? 0 : Math.max(-9, Math.min(9, (x / width) * 12));
  return {
    transform: `translate3d(${x}px, ${reduced ? 0 : y * 0.16}px, 0) rotate(${rotation}deg)`,
    nextTransform: `translate3d(0, ${10 * (1 - progress)}px, 0) scale(${0.965 + progress * 0.035})`,
    progress,
  };
}

/** A flick needs intentional travel; a held or reversed gesture must not fly away. */
export function swipeDecision(
  x: number,
  velocity: number,
  width: number,
  idleMs = 0,
) {
  const threshold = Math.max(80, Math.min(120, width * 0.27));
  const freshVelocity =
    velocity * Math.max(0, 1 - Math.max(0, idleMs - 40) / 100);
  if (Math.abs(x) >= threshold) return x > 0 ? "saved" : "skipped";
  if (
    Math.abs(x) >= 32 &&
    x * freshVelocity > 0 &&
    Math.abs(x + freshVelocity * 130) >= threshold
  ) {
    return x > 0 ? "saved" : "skipped";
  }
  return null;
}
