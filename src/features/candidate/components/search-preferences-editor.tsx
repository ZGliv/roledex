"use client";

import {
  Check,
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateCandidateSearchPreferencesAction,
  type CandidateProfileMutationState,
} from "@/features/candidate/actions";
import { cn } from "@/lib/utils";

const SENIORITY_OPTIONS = [
  ["intern", "Intern"],
  ["entry", "Entry"],
  ["mid", "Mid-level"],
  ["senior", "Senior"],
  ["staff", "Staff"],
  ["principal", "Principal"],
  ["manager", "Manager"],
  ["director", "Director"],
  ["executive", "Executive"],
] as const;

const EMPLOYMENT_OPTIONS = [
  ["full_time", "Full-time"],
  ["part_time", "Part-time"],
  ["contract", "Contract"],
  ["temporary", "Temporary"],
  ["internship", "Internship"],
] as const;

const WORK_MODE_OPTIONS = [
  ["remote", "Remote"],
  ["hybrid", "Hybrid"],
  ["on_site", "On-site"],
] as const;

type Seniority = (typeof SENIORITY_OPTIONS)[number][0];
type EmploymentType = (typeof EMPLOYMENT_OPTIONS)[number][0];
type WorkMode = (typeof WORK_MODE_OPTIONS)[number][0];
type WorkAuthorization =
  | "citizen_or_permanent_resident"
  | "work_authorized"
  | "student_or_temporary"
  | "not_authorized"
  | "prefer_not_to_say";
type MissingSalaryPolicy = "show" | "explore_only" | "hide";

export type SearchPreferencesValue = {
  acceptedEmploymentTypes: EmploymentType[];
  commuteRadiusMiles: number | null;
  desiredSeniorityLevels: Seniority[];
  excludedCompanies: string[];
  excludedIndustries: string[];
  excludedTitles: string[];
  maxOfficeDaysPerWeek: number | null;
  maxTravelPercent: number | null;
  missingSalaryPolicy: MissingSalaryPolicy;
  preferredWorkModes: WorkMode[];
  relocationDestinations: string[];
  requiresSponsorship: boolean | null;
  strictWorkModes: boolean;
  workAuthorization: WorkAuthorization;
};

type Props = {
  initialValue: SearchPreferencesValue;
  onRevisionChange: (revision: number) => void;
  revision: number;
};

const EMPTY_STATE: CandidateProfileMutationState = {
  message: "",
  ok: false,
};

const CONTROL_CLASS =
  "h-13 rounded-[0.75rem] border-white/[0.18] bg-[#111827] px-4 text-[16px] font-normal text-[#f5f7fb] shadow-[inset_0_1px_0_rgba(255,255,255,.045)] placeholder:text-[#68758a] hover:border-white/[0.26] focus-visible:border-[#a9a2ff]/70 focus-visible:bg-[#141c2c] focus-visible:ring-3 focus-visible:ring-[#8176ff]/14";

function toggleItem<T extends string>(items: readonly T[], item: T) {
  return items.includes(item)
    ? items.filter((value) => value !== item)
    : [...items, item];
}

function nullableNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function FieldMessage({
  errors,
  id,
  name,
}: {
  errors?: Record<string, string[]>;
  id?: string;
  name: string;
}) {
  const message = errors?.[name]?.[0];
  return message ? (
    <p id={id} className="text-[11px] leading-4 text-[#ff9aaa]" role="alert">
      {message}
    </p>
  ) : null;
}

function OptionChips<T extends string>({
  error,
  label,
  onChange,
  options,
  selected,
}: {
  error?: string;
  label: string;
  onChange: (values: T[]) => void;
  options: readonly (readonly [T, string])[];
  selected: readonly T[];
}) {
  const errorId = useId();
  return (
    <fieldset
      className="min-w-0"
      aria-invalid={Boolean(error)}
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="text-[12px] font-semibold uppercase tracking-[0.09em] text-[#909caf]">
        {label}
      </legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map(([value, display]) => {
          const active = selected.includes(value);
          return (
            <label
              key={value}
              className={cn(
                "relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-[12px] font-semibold outline-none transition duration-200 focus-within:ring-2 focus-within:ring-[#8176ff]/45 motion-reduce:transition-none",
                active
                  ? "border-[#958cff]/35 bg-[#8176ff]/15 text-[#ddd9ff] shadow-[inset_0_1px_0_rgba(255,255,255,.1)]"
                  : "border-white/[0.09] bg-white/[0.025] text-[#8f9aae] hover:border-white/[0.16] hover:text-[#c9d0dc]",
              )}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => onChange(toggleItem(selected, value))}
                className="sr-only"
              />
              {active ? <Check className="size-3.5" aria-hidden="true" /> : null}
              {display}
            </label>
          );
        })}
      </div>
      {error ? <p id={errorId} className="mt-2 text-[11px] leading-4 text-[#ff9aaa]" role="alert">{error}</p> : null}
    </fieldset>
  );
}

function TagInput({
  error,
  label,
  onChange,
  placeholder,
  values,
}: {
  error?: string;
  label: string;
  onChange: (values: string[]) => void;
  placeholder: string;
  values: readonly string[];
}) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const [draft, setDraft] = useState("");

  const addDraft = () => {
    const normalized = draft.replace(/\s+/g, " ").trim();
    if (!normalized) return;
    if (
      !values.some(
        (value) => value.toLocaleLowerCase() === normalized.toLocaleLowerCase(),
      )
    ) {
      onChange([...values, normalized]);
    }
    setDraft("");
  };

  return (
    <div className="min-w-0">
      <Label htmlFor={inputId} className="text-[13px] font-semibold text-[#d7dde8]">
        {label}
      </Label>
      {values.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label={`${label} values`}>
          {values.map((value) => (
            <span
              key={value}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/[0.09] bg-white/[0.04] pl-3 pr-1.5 text-[11px] font-medium text-[#c8d0dd]"
            >
              {value}
              <button
                type="button"
                onClick={() => onChange(values.filter((item) => item !== value))}
                className="inline-flex size-7 items-center justify-center rounded-full text-[#7f8ba1] outline-none transition hover:bg-white/[0.08] hover:text-white focus-visible:ring-2 focus-visible:ring-[#8176ff]/50"
                aria-label={`Remove ${value}`}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex gap-2">
        <Input
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addDraft();
            }
          }}
          placeholder={placeholder}
          className={CONTROL_CLASS}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={addDraft}
          disabled={!draft.trim()}
          className="size-12 border-white/10 bg-white/[0.04] text-[#b8c2d2] hover:bg-white/[0.08]"
          aria-label={`Add ${label.toLocaleLowerCase()}`}
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>
      {error ? <p id={errorId} className="mt-2 text-[11px] leading-4 text-[#ff9aaa]" role="alert">{error}</p> : null}
    </div>
  );
}

export function SearchPreferencesEditor({
  initialValue,
  onRevisionChange,
  revision,
}: Props) {
  const [value, setValue] = useState(initialValue);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState(EMPTY_STATE);
  const firstFieldError = Object.values(state.fieldErrors ?? {}).flat()[0];

  const update = <K extends keyof SearchPreferencesValue>(
    key: K,
    nextValue: SearchPreferencesValue[K],
  ) => {
    setValue((current) => ({ ...current, [key]: nextValue }));
    setDirty(true);
    setState(EMPTY_STATE);
  };

  const save = async () => {
    setPending(true);
    setState(EMPTY_STATE);
    try {
      const result = await updateCandidateSearchPreferencesAction({
        ...value,
        expectedRevision: revision,
      });
      setState(result);
      if (result.ok && result.revision) {
        setDirty(false);
        onRevisionChange(result.revision);
      }
    } catch {
      setState({
        message: "Search rules could not be saved. Check your connection and try again.",
        ok: false,
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <fieldset
      disabled={pending}
      className="m-0 min-w-0 space-y-7 border-0 p-0"
      aria-busy={pending}
    >
      <legend className="sr-only">Search rules</legend>
      <div className="sticky top-2 z-20 flex min-h-[4.25rem] items-center justify-between gap-3 rounded-[1.2rem] border border-white/[0.12] bg-[rgba(10,15,27,.94)] px-3 py-2.5 shadow-[0_18px_48px_rgba(0,0,0,.4)] backdrop-blur-xl sm:px-4">
        <p
          aria-live="polite"
          role={state.message && !state.ok ? "alert" : "status"}
          className={cn(
            "min-w-0 flex-1 text-[12px] font-semibold leading-4 sm:text-[13px]",
            state.message
              ? state.ok
                ? "text-[#73d8b1]"
                : "text-[#ff9aaa]"
              : dirty
                ? "text-[#cbd3df]"
                : "text-[#8490a4]",
          )}
        >
          {pending
            ? "Recalculating your feed…"
            : state.message || (dirty ? "Unsaved changes" : "Choose or edit filters below")}
        </p>
        <Button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="h-12 shrink-0 rounded-[0.75rem] border border-[#9d95ff]/25 bg-[#8176ff] px-4 text-[13px] font-semibold text-white shadow-[0_12px_30px_rgba(72,60,210,.25)] hover:bg-[#7064f4] disabled:bg-white/[0.08] disabled:text-[#778297] disabled:shadow-none"
        >
          {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
      <div className="grid gap-7 border-b border-white/[0.08] pb-7 md:grid-cols-2">
        <OptionChips
          label="Target seniority"
          options={SENIORITY_OPTIONS}
          selected={value.desiredSeniorityLevels}
          onChange={(items) => update("desiredSeniorityLevels", items)}
        />
        <OptionChips
          label="Employment types"
          error={state.fieldErrors?.acceptedEmploymentTypes?.[0]}
          options={EMPLOYMENT_OPTIONS}
          selected={value.acceptedEmploymentTypes}
          onChange={(items) => update("acceptedEmploymentTypes", items)}
        />
      </div>

      <div className="space-y-4 border-b border-white/[0.08] pb-7">
        <OptionChips
          label="Work modes"
          error={state.fieldErrors?.preferredWorkModes?.[0]}
          options={WORK_MODE_OPTIONS}
          selected={value.preferredWorkModes}
          onChange={(items) => update("preferredWorkModes", items)}
        />
        <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-[1rem] border border-white/[0.09] bg-white/[0.025] px-4 py-3">
          <span>
            <span className="block text-[14px] font-semibold text-[#e2e7ef]">
              Treat work modes as a hard rule
            </span>
            <span className="mt-1 block text-[12px] leading-5 text-[#8c98ab]">
              When off, the modes guide ranking. When on, other known modes are filtered.
            </span>
          </span>
          <input
            type="checkbox"
            checked={value.strictWorkModes}
            onChange={(event) => update("strictWorkModes", event.target.checked)}
            className="size-5 shrink-0 accent-[#8176ff]"
          />
        </label>
      </div>

      <div className="grid gap-5 border-b border-white/[0.08] pb-7 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="commute-radius" className="text-[13px] font-semibold text-[#d7dde8]">
            Commute radius
          </Label>
          <div className="relative">
            <Input
              id="commute-radius"
              aria-invalid={Boolean(state.fieldErrors?.commuteRadiusMiles?.length)}
              aria-describedby={state.fieldErrors?.commuteRadiusMiles?.length ? "commute-radius-error" : undefined}
              type="number"
              inputMode="numeric"
              min={0}
              max={250}
              value={value.commuteRadiusMiles ?? ""}
              onChange={(event) => update("commuteRadiusMiles", nullableNumber(event.target.value))}
              placeholder="25"
              className={cn(CONTROL_CLASS, "pr-12")}
            />
            <span className="pointer-events-none absolute right-3 top-3.5 text-[11px] text-[#738096]">mi</span>
          </div>
          <FieldMessage id="commute-radius-error" errors={state.fieldErrors} name="commuteRadiusMiles" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="office-days" className="text-[13px] font-semibold text-[#d7dde8]">
            Max office days
          </Label>
          <Input
            id="office-days"
            aria-invalid={Boolean(state.fieldErrors?.maxOfficeDaysPerWeek?.length)}
            aria-describedby={state.fieldErrors?.maxOfficeDaysPerWeek?.length ? "office-days-error" : undefined}
            type="number"
            inputMode="numeric"
            min={0}
            max={5}
            value={value.maxOfficeDaysPerWeek ?? ""}
            onChange={(event) => update("maxOfficeDaysPerWeek", nullableNumber(event.target.value))}
            placeholder="2 per week"
            className={CONTROL_CLASS}
          />
          <FieldMessage id="office-days-error" errors={state.fieldErrors} name="maxOfficeDaysPerWeek" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="max-travel" className="text-[13px] font-semibold text-[#d7dde8]">
            Max travel
          </Label>
          <div className="relative">
            <Input
              id="max-travel"
              aria-invalid={Boolean(state.fieldErrors?.maxTravelPercent?.length)}
              aria-describedby={state.fieldErrors?.maxTravelPercent?.length ? "max-travel-error" : undefined}
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              value={value.maxTravelPercent ?? ""}
              onChange={(event) => update("maxTravelPercent", nullableNumber(event.target.value))}
              placeholder="10"
              className={cn(CONTROL_CLASS, "pr-10")}
            />
            <span className="pointer-events-none absolute right-3 top-3.5 text-[11px] text-[#738096]">%</span>
          </div>
          <FieldMessage id="max-travel-error" errors={state.fieldErrors} name="maxTravelPercent" />
        </div>
      </div>

      <div className="grid gap-5 border-b border-white/[0.08] pb-7 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="work-authorization" className="text-[13px] font-semibold text-[#d7dde8]">
            US work authorization
          </Label>
          <select
            id="work-authorization"
            value={value.workAuthorization}
            onChange={(event) => update("workAuthorization", event.target.value as WorkAuthorization)}
            className={cn(CONTROL_CLASS, "w-full px-3 outline-none")}
          >
            <option value="prefer_not_to_say">Not specified</option>
            <option value="citizen_or_permanent_resident">Citizen or permanent resident</option>
            <option value="work_authorized">Authorized to work</option>
            <option value="student_or_temporary">Student or temporary authorization</option>
            <option value="not_authorized">Not currently authorized</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sponsorship" className="text-[13px] font-semibold text-[#d7dde8]">
            Sponsorship needed
          </Label>
          <select
            id="sponsorship"
            value={value.requiresSponsorship === null ? "unknown" : value.requiresSponsorship ? "yes" : "no"}
            onChange={(event) =>
              update(
                "requiresSponsorship",
                event.target.value === "unknown" ? null : event.target.value === "yes",
              )
            }
            className={cn(CONTROL_CLASS, "w-full px-3 outline-none")}
          >
            <option value="unknown">Not specified</option>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>
      </div>

      <div className="grid gap-5 border-b border-white/[0.08] pb-7 md:grid-cols-2">
        <div className="space-y-5">
          <TagInput
            label="Never show these titles"
            error={state.fieldErrors?.excludedTitles?.[0]}
            placeholder="Add a title pattern"
            values={value.excludedTitles}
            onChange={(items) => update("excludedTitles", items)}
          />
          <TagInput
            label="Excluded companies"
            error={state.fieldErrors?.excludedCompanies?.[0]}
            placeholder="Add a company"
            values={value.excludedCompanies}
            onChange={(items) => update("excludedCompanies", items)}
          />
        </div>
        <div className="space-y-5">
          <TagInput
            label="Excluded industries"
            error={state.fieldErrors?.excludedIndustries?.[0]}
            placeholder="Add an industry"
            values={value.excludedIndustries}
            onChange={(items) => update("excludedIndustries", items)}
          />
          <TagInput
            label="Relocation destinations"
            error={state.fieldErrors?.relocationDestinations?.[0]}
            placeholder="New York, NY"
            values={value.relocationDestinations}
            onChange={(items) => update("relocationDestinations", items)}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div>
            <Label htmlFor="missing-salary" className="text-[12px] font-semibold text-[#d9dfea]">
              Jobs without employer-posted pay
            </Label>
            <p className="mt-0.5 text-[11px] leading-4 text-[#7f8ba1]">
              Market estimates can still be displayed, but you control which lane they enter.
            </p>
        </div>
        <select
          id="missing-salary"
          value={value.missingSalaryPolicy}
          onChange={(event) => update("missingSalaryPolicy", event.target.value as MissingSalaryPolicy)}
          className={cn(CONTROL_CLASS, "w-full px-3 outline-none")}
        >
          <option value="show">Allow as Ready Now when everything else fits</option>
          <option value="explore_only">Keep as Credible Stretch until pay is verified</option>
          <option value="hide">Hide unless employer-posted pay is available</option>
        </select>
      </div>

      <div className="flex flex-col gap-3 border-t border-white/[0.09] pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p
          aria-live="polite"
          role={state.message && !state.ok ? "alert" : "status"}
          className={cn(
            "min-h-5 text-[11px] leading-5",
            state.message ? (state.ok ? "text-[#73d8b1]" : "text-[#ff9aaa]") : "text-[#758196]",
          )}
        >
          {state.message
            ? `${state.message}${firstFieldError ? ` ${firstFieldError}` : ""}`
            : "Hard rules filter first; preferences rank what remains."}
        </p>
        <Button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="h-12 rounded-[0.75rem] border border-[#9d95ff]/25 bg-[#8176ff] px-5 text-white shadow-[0_12px_30px_rgba(72,60,210,.25)] hover:bg-[#7064f4]"
        >
          {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>

      <p className="text-[11px] leading-5 text-[#69768c]">
        Authorization and compensation details are private matching inputs and are never sent to employers.
      </p>
    </fieldset>
  );
}
