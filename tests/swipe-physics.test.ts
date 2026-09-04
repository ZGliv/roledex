import { describe, expect, it } from "vitest";
import {
  swipeDecision,
  swipePose,
} from "@/features/jobs/components/swipe-physics";

describe("phone swipe intent", () => {
  it("tracks the first few pixels without a dead zone", () => {
    expect(swipePose(4, 0, 360).transform).toContain("translate3d(4px");
  });
  it("never saves from a tiny, fast tap", () => {
    expect(swipeDecision(8, 3, 360)).toBeNull();
  });
  it("accepts deliberate travel in either direction", () => {
    expect(swipeDecision(110, 0, 360)).toBe("saved");
    expect(swipeDecision(-110, 0, 360)).toBe("skipped");
  });
  it("accepts a short intentional flick but cancels a held or reversed flick", () => {
    expect(swipeDecision(45, 0.8, 360)).toBe("saved");
    expect(swipeDecision(45, 0.8, 360, 180)).toBeNull();
    expect(swipeDecision(45, -0.8, 360)).toBeNull();
  });
  it("keeps reduced-motion dragging direct without rotation or vertical movement", () => {
    expect(swipePose(40, 50, 360, true).transform).toBe(
      "translate3d(40px, 0px, 0) rotate(0deg)",
    );
  });
});
