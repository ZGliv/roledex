import { describe, expect, it } from "vitest";

import { mobileCardKeyboardAction } from "../mobile/src/card-interaction";

describe("mobile card keyboard interaction", () => {
  it.each([
    ["ArrowLeft", "skipped"],
    ["ArrowRight", "saved"],
    ["Enter", "open"],
    [" ", "open"],
  ] as const)("maps %s to %s", (key, action) => {
    expect(mobileCardKeyboardAction(key)).toBe(action);
  });

  it("leaves unrelated navigation keys alone", () => {
    expect(mobileCardKeyboardAction("Tab")).toBeNull();
    expect(mobileCardKeyboardAction("Escape")).toBeNull();
  });
});
