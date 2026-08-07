"use client";

import { useActionState, useEffect, useRef } from "react";
import { LoaderCircle, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addJobSourceAction,
} from "@/features/discovery/actions";
import { EMPTY_SOURCE_MUTATION_STATE } from "@/features/discovery/action-state";

function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="mt-1 text-xs text-destructive">
      {errors[0]}
    </p>
  );
}

export function AddSourceForm() {
  const [state, formAction, pending] = useActionState(
    addJobSourceAction,
    EMPTY_SOURCE_MUTATION_STATE,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-xl border border-border/80 bg-card p-4 sm:p-5"
    >
      <div>
        <h2 className="font-semibold">Connect a company</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Paste a public Greenhouse, Lever, or Ashby board. JobSwipe verifies the official feed before saving it.
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="source-url">Public job-board URL</Label>
          <Input
            id="source-url"
            name="sourceUrl"
            type="url"
            inputMode="url"
            placeholder="https://jobs.ashbyhq.com/company"
            maxLength={2_048}
            required
            className="h-11 rounded-xl"
            aria-invalid={Boolean(state.fieldErrors?.sourceUrl?.length)}
            aria-describedby={state.fieldErrors?.sourceUrl?.length ? "source-url-error" : "source-url-help"}
          />
          <p id="source-url-help" className="mt-1 text-[11px] text-muted-foreground">
            Supported: job-boards.greenhouse.io, boards.greenhouse.io, jobs.lever.co, and jobs.ashbyhq.com.
          </p>
          <FieldError id="source-url-error" errors={state.fieldErrors?.sourceUrl} />
        </div>
        <div>
          <Label htmlFor="source-company-name">Company name</Label>
          <Input
            id="source-company-name"
            name="companyName"
            placeholder="Acme"
            maxLength={120}
            required
            className="h-11 rounded-xl"
            aria-invalid={Boolean(state.fieldErrors?.companyName?.length)}
            aria-describedby={state.fieldErrors?.companyName?.length ? "source-company-name-error" : undefined}
          />
          <FieldError id="source-company-name-error" errors={state.fieldErrors?.companyName} />
        </div>
        <div>
          <Label htmlFor="source-company-domain">Company domain</Label>
          <Input
            id="source-company-domain"
            name="companyDomain"
            inputMode="url"
            placeholder="acme.com"
            maxLength={253}
            className="h-11 rounded-xl"
            aria-invalid={Boolean(state.fieldErrors?.companyDomain?.length)}
            aria-describedby={state.fieldErrors?.companyDomain?.length ? "source-company-domain-error" : undefined}
          />
          <FieldError id="source-company-domain-error" errors={state.fieldErrors?.companyDomain} />
        </div>
        <div>
          <Label htmlFor="source-refresh-interval">Minimum check cadence</Label>
          <select
            id="source-refresh-interval"
            name="refreshIntervalHours"
            defaultValue={24}
            className="h-11 w-full rounded-xl border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value={12}>Every 12 hours</option>
            <option value={24}>Daily</option>
            <option value={48}>Every 2 days</option>
            <option value={72}>Every 3 days</option>
            <option value={168}>Weekly</option>
          </select>
        </div>
        <div className="flex items-end sm:justify-end">
          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {pending ? "Verifying official feed…" : "Connect source"}
          </Button>
        </div>
      </div>
      {state.message ? (
        <p
          aria-live="polite"
          className={state.ok ? "mt-3 text-xs text-emerald-700" : "mt-3 text-xs text-destructive"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
