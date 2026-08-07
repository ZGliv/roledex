"use client";

import { useActionState } from "react";
import { AlertCircle, ClipboardPaste, LoaderCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createManualJobAction,
  type JobEntryActionState,
} from "@/features/jobs/actions";

const initialJobEntryState: JobEntryActionState = { message: "" };

function FieldError({ errors, id }: { errors?: string[]; id: string }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="text-xs text-destructive" role="alert">
      {errors[0]}
    </p>
  );
}

export function JobEntryForm() {
  const [state, formAction, pending] = useActionState(
    createManualJobAction,
    initialJobEntryState,
  );

  return (
    <form action={formAction} className="space-y-6">
      {state.message ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Import needs attention</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Job title</Label>
          <Input
            id="title"
            name="title"
            placeholder="Associate AI Implementation Consultant"
            autoComplete="organization-title"
            className="h-11 rounded-xl"
            aria-invalid={Boolean(state.fieldErrors?.title)}
            aria-describedby={state.fieldErrors?.title ? "title-error" : undefined}
            required
          />
          <FieldError id="title-error" errors={state.fieldErrors?.title} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="company">Company</Label>
          <Input
            id="company"
            name="company"
            placeholder="Company name"
            autoComplete="organization"
            className="h-11 rounded-xl"
            aria-invalid={Boolean(state.fieldErrors?.company)}
            aria-describedby={state.fieldErrors?.company ? "company-error" : undefined}
            required
          />
          <FieldError id="company-error" errors={state.fieldErrors?.company} />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            name="location"
            placeholder="Remote · United States"
            className="h-11 rounded-xl"
            aria-invalid={Boolean(state.fieldErrors?.location)}
            aria-describedby={state.fieldErrors?.location ? "location-error" : undefined}
          />
          <FieldError id="location-error" errors={state.fieldErrors?.location} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sourceName">Listing source</Label>
          <Input
            id="sourceName"
            name="sourceName"
            defaultValue="Manual paste"
            placeholder="Company careers, LinkedIn, referral…"
            className="h-11 rounded-xl"
            aria-invalid={Boolean(state.fieldErrors?.sourceName)}
            aria-describedby={state.fieldErrors?.sourceName ? "sourceName-error" : undefined}
          />
          <FieldError id="sourceName-error" errors={state.fieldErrors?.sourceName} />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="space-y-2">
          <Label htmlFor="sourceUrl">Original listing URL</Label>
          <Input
            id="sourceUrl"
            name="sourceUrl"
            type="url"
            placeholder="https://company.com/careers/role"
            className="h-11 rounded-xl"
            aria-invalid={Boolean(state.fieldErrors?.sourceUrl)}
            aria-describedby={state.fieldErrors?.sourceUrl ? "sourceUrl-error" : undefined}
          />
          <FieldError id="sourceUrl-error" errors={state.fieldErrors?.sourceUrl} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="salarySource">Salary source</Label>
          <Select name="salarySource" defaultValue="unknown">
            <SelectTrigger
              id="salarySource"
              className="h-11 w-full rounded-xl"
              aria-invalid={Boolean(state.fieldErrors?.salarySource)}
              aria-describedby={
                state.fieldErrors?.salarySource ? "salarySource-error" : undefined
              }
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unknown">Not sure</SelectItem>
              <SelectItem value="employer_posted">Employer-posted</SelectItem>
              <SelectItem value="externally_estimated">External estimate</SelectItem>
            </SelectContent>
          </Select>
          <FieldError id="salarySource-error" errors={state.fieldErrors?.salarySource} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-end justify-between gap-4">
          <div>
            <Label htmlFor="descriptionRaw">Full job description</Label>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Include responsibilities, qualifications, salary, location, and benefits when available.
            </p>
          </div>
          <span className="hidden text-xs text-muted-foreground sm:block">
            ⌘/Ctrl + Enter
          </span>
        </div>
        <Textarea
          id="descriptionRaw"
          name="descriptionRaw"
          placeholder="Paste the complete listing here…"
          className="min-h-72 resize-y rounded-xl bg-background/55 text-sm leading-6"
          aria-invalid={Boolean(state.fieldErrors?.descriptionRaw)}
          aria-describedby={
            state.fieldErrors?.descriptionRaw ? "descriptionRaw-error" : undefined
          }
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          required
        />
        <FieldError id="descriptionRaw-error" errors={state.fieldErrors?.descriptionRaw} />
      </div>

      <div className="flex flex-col gap-4 border-t border-border/80 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-xs leading-5 text-muted-foreground">
          The raw listing is preserved exactly. Missing fields remain unknown, and the score is stored with its evidence and version.
        </p>
        <Button type="submit" size="lg" disabled={pending} className="shrink-0">
          {pending ? (
            <>
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
              Importing listing
            </>
          ) : (
            <>
              <ClipboardPaste data-icon="inline-start" />
              Import and score
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
