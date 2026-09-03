export type MobileCardKeyboardAction = "open" | "saved" | "skipped" | null;

export function mobileCardKeyboardAction(key: string): MobileCardKeyboardAction {
  if (key === "ArrowLeft") return "skipped";
  if (key === "ArrowRight") return "saved";
  if (key === "Enter" || key === " ") return "open";
  return null;
}
