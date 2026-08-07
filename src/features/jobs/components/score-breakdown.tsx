import { Target } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Progress,
  ProgressLabel,
} from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface ScoreBreakdownItemViewModel {
  id: string;
  label: string;
  score: number;
  weightPercent: number;
  coveragePercent: number;
  note?: string | null;
}

export interface ScoreBreakdownProps {
  items: readonly ScoreBreakdownItemViewModel[];
  className?: string;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function progressTone(score: number) {
  if (score >= 7.5) {
    return "[&_[data-slot=progress-indicator]]:bg-fit-high";
  }

  if (score >= 5) {
    return "[&_[data-slot=progress-indicator]]:bg-fit-mid";
  }

  return "[&_[data-slot=progress-indicator]]:bg-fit-low";
}

export function ScoreBreakdown({ items, className }: ScoreBreakdownProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border/70 bg-background/35 p-4 sm:p-5",
        className,
      )}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Target className="size-4 text-primary" aria-hidden="true" />
            Score anatomy
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Transparent deterministic inputs, before deeper AI analysis.
          </p>
        </div>
        <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
          Weighted
        </Badge>
      </div>

      {items.length > 0 ? (
        <div className="space-y-4">
          {items.map((item) => {
            const normalizedScore = clamp(item.score, 0, 10);
            const coverage = Math.round(clamp(item.coveragePercent, 0, 100));
            const weight = Math.round(clamp(item.weightPercent, 0, 100));

            return (
              <div key={item.id} className="space-y-1.5">
                <Progress
                  value={normalizedScore * 10}
                  aria-label={`${item.label}: ${normalizedScore.toFixed(1)} out of 10`}
                  className={cn(
                    "gap-x-3 gap-y-2 [&_[data-slot=progress-track]]:h-1.5",
                    progressTone(normalizedScore),
                  )}
                >
                  <ProgressLabel className="min-w-0 truncate text-xs font-medium">
                    {item.label}
                  </ProgressLabel>
                  <span className="ml-auto flex shrink-0 items-center gap-2 text-xs text-muted-foreground tabular-nums">
                    <span>{normalizedScore.toFixed(1)}</span>
                    <span className="text-[10px] text-muted-foreground/70">
                      {weight}% weight
                    </span>
                  </span>
                </Progress>

                <div className="flex items-start justify-between gap-3 pl-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  <span>{item.note ?? "No additional scoring note."}</span>
                  {coverage < 100 ? (
                    <span className="shrink-0 tabular-nums text-fit-mid">
                      {coverage}% known
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-xs text-muted-foreground">
          A component breakdown is not available yet.
        </p>
      )}
    </section>
  );
}
