"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  refillJobsAction,
  type RefillJobsActionState,
} from "@/features/discovery/actions";
import type { DiscoveryStatusView } from "@/features/discovery/queries";
import type { DiscoveryRefreshSeverity } from "@/features/discovery/refresh-policy";
import { formatAppDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type RefillJobsButtonProps = {
  autoRefresh?: boolean;
  className?: string;
  compact?: boolean;
  iconOnly?: boolean;
  onRefresh?: () => Promise<{
    message: string;
    severity: DiscoveryRefreshSeverity;
  }>;
  status: DiscoveryStatusView;
};

function lastRefreshLabel(status: DiscoveryStatusView) {
  const value = status.latestRun?.completedAt;
  if (!value) return "Live source network ready";
  return `Last checked ${formatAppDateTime(value)}`;
}

function refillResultMessage(result: Pick<RefillJobsActionState, "message">) {
  return result.message;
}

export function RefillJobsButton({
  autoRefresh = false,
  className,
  compact = false,
  iconOnly = false,
  onRefresh,
  status,
}: RefillJobsButtonProps) {
  const attemptedAutomaticRefresh = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resultSeverity, setResultSeverity] =
    useState<DiscoveryRefreshSeverity | null>(null);
  const [pending, startTransition] = useTransition();

  const refill = useCallback(() => {
    if (pending) return;
    setResultSeverity(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = onRefresh ? await onRefresh() : await refillJobsAction();
        setResultSeverity(result.severity);
        setMessage(refillResultMessage(result));
      } catch (error) {
        setResultSeverity("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "The feed could not be refreshed. Try again shortly.",
        );
      }
    });
  }, [onRefresh, pending]);

  useEffect(() => {
    if (!autoRefresh || attemptedAutomaticRefresh.current) return;
    attemptedAutomaticRefresh.current = true;
    refill();
  }, [autoRefresh, refill]);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className={cn("flex items-center gap-3", compact ? "justify-center sm:justify-end" : "")}>
        <Button
          type="button"
          variant={compact ? "outline" : "default"}
          size={iconOnly ? "icon" : compact ? "sm" : "default"}
          onClick={refill}
          disabled={pending}
          title={
            iconOnly
              ? pending
                ? "Checking sources"
                : onRefresh
                  ? "Refresh jobs"
                  : "Check sources"
              : undefined
          }
          className={cn(
            iconOnly && "rounded-xl",
            !compact && "rounded-xl px-5",
          )}
        >
          {pending ? (
            <LoaderCircle className="animate-spin" data-icon="inline-start" />
          ) : (
            <RefreshCw data-icon="inline-start" />
          )}
          <span className={cn(iconOnly && "sr-only")}>
            {pending
              ? "Checking…"
              : onRefresh
                ? "Refresh jobs"
                : "Check sources"}
          </span>
        </Button>
        {!compact ? (
          <p className="hidden max-w-52 text-xs leading-5 text-muted-foreground sm:block">
            {lastRefreshLabel(status)}
          </p>
        ) : null}
      </div>
      {message || (!compact && !onRefresh) ? (
        <p
          aria-live="polite"
          className={cn(
            "flex items-center gap-1.5 text-xs",
            resultSeverity === "error"
              ? "text-destructive"
              : resultSeverity === "warning"
                ? "text-amber-800"
                : "text-muted-foreground",
            compact && "max-w-56 justify-end text-right",
          )}
        >
          {message ? (
          <>
            {resultSeverity === "error" || resultSeverity === "warning" ? (
              <TriangleAlert
                className="size-3.5 shrink-0"
                aria-hidden="true"
              />
            ) : (
              <CheckCircle2 className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
            )}
            {message}
          </>
          ) : (
          lastRefreshLabel(status)
          )}
        </p>
      ) : null}
    </div>
  );
}
