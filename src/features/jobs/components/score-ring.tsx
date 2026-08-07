import { cn } from "@/lib/utils";

export interface ScoreRingProps {
  score: number;
  coveragePercent: number;
  label?: string;
  className?: string;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function scoreTone(score: number) {
  if (score >= 7.5) return "text-fit-high";
  if (score >= 5) return "text-fit-mid";
  return "text-fit-low";
}

export function ScoreRing({
  score,
  coveragePercent,
  label = "Deterministic fit",
  className,
}: ScoreRingProps) {
  const normalizedScore = clamp(score, 0, 10);
  const normalizedCoverage = Math.round(clamp(coveragePercent, 0, 100));
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference * (1 - normalizedScore / 10);

  return (
    <div
      role="img"
      aria-label={`${label}: ${normalizedScore.toFixed(1)} out of 10, based on ${normalizedCoverage}% of available evidence`}
      className={cn(
        "relative grid size-32 shrink-0 place-items-center rounded-full",
        scoreTone(normalizedScore),
        className,
      )}
    >
      <svg
        viewBox="0 0 120 120"
        aria-hidden="true"
        className="absolute inset-0 size-full -rotate-90"
      >
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="8"
          className="stroke-muted"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeOffset}
          className="stroke-current transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>

      <div className="relative flex flex-col items-center text-center">
        <span className="text-3xl font-semibold leading-none tracking-[-0.06em] tabular-nums text-foreground">
          {normalizedScore.toFixed(1)}
        </span>
        <span className="mt-1 text-[11px] text-muted-foreground">
          of 10
        </span>
        <span className="mt-2 text-[10px] font-medium tabular-nums text-current">
          {normalizedCoverage}% evidence
        </span>
      </div>
    </div>
  );
}
