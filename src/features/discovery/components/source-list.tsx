"use client";

import { useActionState, useMemo, useOptimistic, useState, useTransition } from "react";
import {
  Check,
  CircleCheck,
  CircleOff,
  ExternalLink,
  LoaderCircle,
  Search,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  removeJobSourceAction,
  setJobSourceEnabledAction,
  updateJobSourceAction,
} from "@/features/discovery/actions";
import { EMPTY_SOURCE_MUTATION_STATE } from "@/features/discovery/action-state";
import type { JobSourceView } from "@/features/discovery/queries";
import { formatAppDateTime } from "@/lib/format";

function dateLabel(value: string | null, fallback: string) {
  if (!value) return fallback;
  return formatAppDateTime(value);
}

function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="mt-1 text-xs text-destructive">
      {errors[0]}
    </p>
  );
}

function SourceEditor({
  onRemoved,
  source,
}: {
  onRemoved: (sourceId: string) => void;
  source: JobSourceView;
}) {
  const updateAction = updateJobSourceAction.bind(null, source.id);
  const [state, formAction, pending] = useActionState(
    updateAction,
    EMPTY_SOURCE_MUTATION_STATE,
  );
  const [removing, startRemoving] = useTransition();

  const remove = () => {
    if (
      !window.confirm(
        `Remove ${source.companyName} from the live source network? Existing saved jobs stay intact.`,
      )
    ) {
      return;
    }
    startRemoving(async () => {
      await removeJobSourceAction(source.id);
      onRemoved(source.id);
    });
  };

  return (
    <details className="group mt-3 border-t border-border/60 pt-3">
      <summary className="flex min-h-11 cursor-pointer list-none items-center text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
        Edit source
      </summary>
      <form action={formAction} className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`company-name-${source.id}`}>Company</Label>
          <Input
            id={`company-name-${source.id}`}
            name="companyName"
            defaultValue={source.companyName}
            maxLength={120}
            required
            className="h-11 rounded-xl"
            aria-invalid={Boolean(state.fieldErrors?.companyName?.length)}
            aria-describedby={
              state.fieldErrors?.companyName?.length
                ? `company-name-error-${source.id}`
                : undefined
            }
          />
          <FieldError
            id={`company-name-error-${source.id}`}
            errors={state.fieldErrors?.companyName}
          />
        </div>
        <div>
          <Label htmlFor={`company-domain-${source.id}`}>Company domain</Label>
          <Input
            id={`company-domain-${source.id}`}
            name="companyDomain"
            defaultValue={source.companyDomain ?? ""}
            inputMode="url"
            placeholder="example.com"
            maxLength={253}
            className="h-11 rounded-xl"
            aria-invalid={Boolean(state.fieldErrors?.companyDomain?.length)}
            aria-describedby={
              state.fieldErrors?.companyDomain?.length
                ? `company-domain-error-${source.id}`
                : undefined
            }
          />
          <FieldError
            id={`company-domain-error-${source.id}`}
            errors={state.fieldErrors?.companyDomain}
          />
        </div>
        <div>
          <Label htmlFor={`refresh-interval-${source.id}`}>Minimum check cadence</Label>
          <select
            id={`refresh-interval-${source.id}`}
            name="refreshIntervalHours"
            defaultValue={source.refreshIntervalHours}
            className="h-11 w-full rounded-xl border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value={12}>Every 12 hours</option>
            <option value={24}>Daily</option>
            <option value={48}>Every 2 days</option>
            <option value={72}>Every 3 days</option>
            <option value={168}>Weekly</option>
          </select>
        </div>
        <div className="flex items-end gap-2 sm:justify-end">
          <Button type="submit" variant="outline" disabled={pending || removing}>
            {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={remove}
            disabled={pending || removing}
          >
            {removing ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
            {removing ? "Removing…" : "Remove"}
          </Button>
        </div>
        {state.message ? (
          <p
            aria-live="polite"
            className={state.ok ? "text-xs text-emerald-700 sm:col-span-2" : "text-xs text-destructive sm:col-span-2"}
          >
            {state.message}
          </p>
        ) : null}
      </form>
    </details>
  );
}

type OptimisticUpdate =
  | { enabled: boolean; kind: "toggle"; sourceId: string }
  | { kind: "remove"; sourceId: string };

export function SourceList({ initialSources }: { initialSources: JobSourceView[] }) {
  const [sources, updateOptimisticSource] = useOptimistic(
    initialSources,
    (currentSources, update: OptimisticUpdate) =>
      update.kind === "remove"
        ? currentSources.filter((source) => source.id !== update.sourceId)
        : currentSources.map((source) =>
            source.id === update.sourceId
              ? { ...source, enabled: update.enabled }
              : source,
          ),
  );
  const [query, setQuery] = useState("");
  const [pendingSourceId, setPendingSourceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filteredSources = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return sources;
    return sources.filter((source) =>
      [source.companyName, source.companyDomain, source.provider]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalized)),
    );
  }, [query, sources]);

  const toggle = (source: JobSourceView) => {
    if (pending) return;
    setError(null);
    setPendingSourceId(source.id);
    startTransition(async () => {
      const nextEnabled = !source.enabled;
      updateOptimisticSource({
        kind: "toggle",
        sourceId: source.id,
        enabled: nextEnabled,
      });
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

  const removeOptimistically = (sourceId: string) => {
    updateOptimisticSource({ kind: "remove", sourceId });
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search connected companies"
            aria-label="Search connected companies"
            className="h-11 rounded-xl bg-card pl-10"
          />
        </div>
        <p className="shrink-0 text-xs text-muted-foreground">
          {filteredSources.length} {filteredSources.length === 1 ? "source" : "sources"}
        </p>
      </div>
      {error ? (
        <p className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {filteredSources.length > 0 ? (
        <div className="divide-y divide-border/80 overflow-hidden rounded-xl border border-border/80 bg-card">
          {filteredSources.map((source) => (
            <section
              key={source.id}
              className={
                source.enabled
                  ? "p-4 sm:p-5"
                  : "bg-muted/30 p-4 opacity-70 sm:p-5"
              }
            >
              <div className="flex items-start gap-3">
                {source.enabled ? (
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                ) : (
                  <CircleOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-semibold">{source.companyName}</h2>
                    <span className="text-xs capitalize text-muted-foreground">
                      {source.provider}
                    </span>
                  </div>
                  <a
                    href={source.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs text-muted-foreground hover:text-foreground"
                  >
                    {source.companyDomain ?? "Official public board"}
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Last success: {dateLabel(source.lastSucceededAt, "Awaiting first check")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => toggle(source)}
                  disabled={pending}
                  aria-label={`${source.enabled ? "Pause" : "Enable"} ${source.companyName}`}
                >
                  {pendingSourceId === source.id ? (
                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                  ) : source.enabled ? (
                    "Pause"
                  ) : (
                    "Enable"
                  )}
                </Button>
              </div>
              {source.lastError ? (
                <p className="mt-3 line-clamp-2 border-l-2 border-amber-500/45 pl-3 text-xs leading-5 text-amber-800" title={source.lastError}>
                  Last check: {source.lastError}
                </p>
              ) : null}
              <SourceEditor source={source} onRemoved={removeOptimistically} />
            </section>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No connected company matches that search.
        </p>
      )}
    </div>
  );
}
