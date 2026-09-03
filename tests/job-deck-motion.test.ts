import { afterEach, describe, expect, it, vi } from "vitest";

import {
  safelyAnimate,
  waitForDeckMotion,
} from "@/features/jobs/components/job-deck-motion";

afterEach(() => {
  vi.useRealTimers();
});

describe("job deck motion completion", () => {
  it("completes when every browser animation finishes", async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const first = Promise.resolve();
    const second = Promise.resolve();

    waitForDeckMotion({
      animations: [{ finished: first }, { finished: second }],
      durationMs: 240,
      onComplete,
    });
    await Promise.all([first, second]);
    await Promise.resolve();

    expect(onComplete).toHaveBeenCalledOnce();
    await vi.runAllTimersAsync();
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("uses a deadline when WebKit leaves Animation.finished pending", async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();

    waitForDeckMotion({
      animations: [{ finished: new Promise(() => undefined) }],
      durationMs: 240,
      onComplete,
    });

    await vi.advanceTimersByTimeAsync(359);
    expect(onComplete).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("does not complete an obsolete animation sequence after cancellation", async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const cancel = waitForDeckMotion({
      animations: [{ finished: new Promise(() => undefined) }],
      durationMs: 180,
      onComplete,
    });

    cancel();
    await vi.runAllTimersAsync();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("falls back cleanly if the browser rejects transform keyframes", () => {
    const animate = vi.fn(() => {
      throw new TypeError("unsupported keyframe");
    });

    expect(
      safelyAnimate({ animate } as unknown as HTMLElement, [], { duration: 200 }),
    ).toBeNull();
    expect(animate).toHaveBeenCalledOnce();
  });
});
