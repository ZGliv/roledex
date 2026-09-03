export function nextDeckCheckLabel(
  value: string | null | undefined,
  now: Date = new Date(),
) {
  if (!value) return "Watching for newly published roles";
  const nextCheck = new Date(value);
  if (Number.isNaN(nextCheck.getTime())) {
    return "Watching for newly published roles";
  }
  if (nextCheck.getTime() <= now.getTime()) {
    return "Checking again shortly";
  }
  return `Next automatic check around ${nextCheck.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}
