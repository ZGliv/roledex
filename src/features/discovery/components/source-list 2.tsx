"use client";

import { useOptimistic, useState, useTransition } from "react";
import { CircleCheck, CircleOff, LoaderCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { setJobSourceEnabledAction } from "@/features/discovery/actions";
import type { JobSourceView } from "@/features/discovery/queries";
import { formatAppDateTime } from "@/lib/format";

function lastCheckedLabel(value: string | null) {
  if (!value) return "Not checked yet";
  return formatAppDateTime(value);
}

export function SourceList({ initialSources }: { initialSources: JobSourceView[] }) {
  const [sources, setOptimisticSource] = useOptimistic(
    initialSources,
    (currentSources, update: { enabled: boolean; sourceId: string }) =>
      currentSources.map((source) =>
        source.id === update.sourceId ? { ...source, enabled: update.enabled } : source,
      ),
  );
  const [pendingSourceId, setPendingSourceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (source: JobSourceView) => {
    if (pending) return;
    setError(null);
    setPendingSourceId(source.id);
    startTransition(async () => {
      const nextEnabled = !source.enabled;
      setOptimisticSource({ sourceId: source.id, enabled: nextEnabled });
      try {
        await setJobSourceEnabledAction(source.id, nextEnabled);
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : "The source preference could not be saved.",
        );
      } finally {
        setPendingSourceId(null);
      }
    });
  };

  return (
    <div>
      {error ? (
        <p className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {sources.map((source) => (
          <Card
            key={source.id}
            className={source.enabled ? "bg-card/80" : "bg-card/35 opacity-70"}
          >
            <CardContent className="flex items-center gap-4 p-4 sm:p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border/70 bg-background/45 text-muted-foreground">
                {source.enabled ? (
                  <CircleCheck className="size-5 text-primary" aria-hidden="true" />
                ) : (
                  <CircleOff className="size-5" aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate font-semibold">{source.companyName}</h2>
                  <Badge variant="outline" className="uppercase text-[9px] tracking-wider">
                    {source.provider}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {source.companyDomain} · {lastCheckedLabel(source.lastSucceededAt)}
                </p>
                {source.lastError ? (
                  <p className="mt-1 line-clamp-1 text-xs text-amber-800" title={source.lastError}>
                    Last check failed: {source.lastError}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => toggle(source)}
                disabled={pending}
                aria-label={`${source.enabled ? "Disable" : "Enable"} ${source.companyName}`}
              >
                {pendingSourceId === source.id ? (
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                ) : source.enabled ? (
                  "Disable"
                ) : (
                  "Enable"
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
