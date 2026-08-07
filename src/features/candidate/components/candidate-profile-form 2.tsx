"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Compass,
  Gauge,
  Layers3,
  LoaderCircle,
  MapPin,
  Save,
  ShieldCheck,
  Target,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  updateCandidateProfileAction,
  type CandidateProfileActionState,
} from "@/features/candidate/actions";
import {
  calculateProfileCompleteness,
  type ProfileCompleteness,
} from "@/features/candidate/components/profile-completeness";
import { cn } from "@/lib/utils";

const INITIAL_STATE: CandidateProfileActionState = { message: "", ok: false };

export type CandidateProfileFormValue = {
  careerGoals: string[];
  currentRole: string;
  currentSalaryCents: number;
  dealBreakers: string[];
  interests: string[];
  interviewConcerns: string[];
  location: string | null;
  preferredIndustries: string[];
  preferredSalaryMinimumCents: number;
  preferredSalaryTargetCents: number;
  preferredWorkArrangements: string[];
  relocationPreference: string | null;
  revision: number;
  skills: string[];
  strengths: string[];
  targetRoleFamilies: string[];
  weaknesses: string[];
  yearsExperience: number;
};

type FieldName = Exclude<keyof CandidateProfileFormValue, "revision">;

const SALARY_FIELDS = [
  {
    label: "Current base",
    name: "currentSalaryCents",
    why: "Anchors whether a move is actually an upgrade.",
  },
  {
    label: "Minimum to move",
    name: "preferredSalaryMinimumCents",
    why: "Roles below this line lose priority.",
  },
  {
    label: "Ideal target",
    name: "preferredSalaryTargetCents",
    why: "Raises roles near your real goal.",
  },
] as const satisfies ReadonlyArray<{
  label: string;
  name:
    | "currentSalaryCents"
    | "preferredSalaryMinimumCents"
    | "preferredSalaryTargetCents";
  why: string;
}>;

function dollars(cents: number) {
  return String(Math.round(cents / 100));
}

function lines(items: readonly string[]) {
  return items.join("\n");
}

function describedBy(...ids: Array<string | false | null | undefined>) {
  const value = ids.filter(Boolean).join(" ");
  return value || undefined;
}

function FieldError({
  id,
  name,
  state,
}: {
  id: string;
  name: FieldName;
  state: CandidateProfileActionState;
}) {
  const message = state.fieldErrors?.[name]?.[0];
  return message ? (
    <p id={id} className="text-xs leading-5 text-destructive">
      {message}
    </p>
  ) : null;
}

function WhyItMatters({ children, id }: { children: React.ReactNode; id: string }) {
  return (
    <p id={id} className="text-[11px] leading-4 text-[#737b8d]">{children}</p>
  );
}

function MultilineField({
  label,
  name,
  placeholder,
  rows = 4,
  state,
  value,
  why,
}: {
  label: string;
  name: FieldName;
  placeholder?: string;
  rows?: number;
  state: CandidateProfileActionState;
  value: readonly string[];
  why: string;
}) {
  const errorId = `${name}-error`;
  const helpId = `${name}-help`;
  const hasError = Boolean(state.fieldErrors?.[name]?.length);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={name}>{label}</Label>
        <span className="shrink-0 text-[11px] text-[#9298a6]">
          One per line
        </span>
      </div>
      <Textarea
        id={name}
        name={name}
        defaultValue={lines(value)}
        placeholder={placeholder}
        rows={rows}
        aria-invalid={hasError}
        aria-describedby={describedBy(helpId, hasError && errorId)}
        className="glass-input min-h-24 scroll-mt-28 resize-y rounded-xl text-base leading-6 focus-visible:border-primary/35 focus-visible:ring-primary/15 sm:text-sm"
      />
      <WhyItMatters id={helpId}>{why}</WhyItMatters>
      <FieldError id={errorId} name={name} state={state} />
    </div>
  );
}

function EssentialSection({
  children,
  description,
  icon: Icon,
  id,
  step,
  title,
}: {
  children: React.ReactNode;
  description: string;
  icon: typeof Target;
  id: string;
  step: string;
  title: string;
}) {
  const headingId = `${id}-heading`;
  return (
    <section id={id} aria-labelledby={headingId} className="scroll-mt-24 border-b border-[#27324a]/[0.07] px-4 py-6 last:border-b-0 sm:px-6 sm:py-7">
      <div className="mb-5 flex items-start gap-3">
        <Icon className="mt-0.5 size-4 shrink-0 text-[#5d52da]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[#777f90]">
            Step {Number(step)} of 4
          </p>
          <h2 id={headingId} className="mt-0.5 text-base font-semibold tracking-[-0.025em] text-[#111828]">
            {title}
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-[#697185]">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function CompletenessMeter({ value }: { value: ProfileCompleteness }) {
  const nextSignal = value.missing[0];
  return (
    <div className="border-b border-[#27324a]/[0.07] bg-white/24 px-4 py-4 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Gauge className="size-4 shrink-0 text-[#5d52da]" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs text-[#697185]">Profile strength</p>
            <p className="truncate text-sm font-semibold text-[#172033]">{value.label}</p>
          </div>
        </div>
        <p className="text-lg font-semibold tabular-nums text-[#5147cf]">{value.score}%</p>
      </div>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#dfe2ea]"
        role="progressbar"
        aria-label="Profile strength"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value.score}
      >
        <div
          className="h-full rounded-full bg-[#5b55df] transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${value.score}%` }}
        />
      </div>
      <div className="mt-2 flex flex-col gap-1 text-[11px] leading-4 text-[#697185] sm:flex-row sm:items-center sm:justify-between">
        <p>
          {value.completedSignals} of {value.totalSignals} useful details are filled in.
        </p>
        <p className="font-medium text-[#515a6d]">
          {nextSignal ? `Best next step: add ${nextSignal}.` : "Your profile is ready."}
        </p>
      </div>
    </div>
  );
}

function completenessFromForm(form: HTMLFormElement) {
  const data = new FormData(form);
  const text = (name: string) => String(data.get(name) ?? "");
  return calculateProfileCompleteness({
    careerGoals: text("careerGoals"),
    currentRole: text("currentRole"),
    currentSalaryCents: text("currentSalaryCents"),
    dealBreakers: text("dealBreakers"),
    location: text("location"),
    preferredIndustries: text("preferredIndustries"),
    preferredSalaryMinimumCents: text("preferredSalaryMinimumCents"),
    preferredSalaryTargetCents: text("preferredSalaryTargetCents"),
    preferredWorkArrangements: data
      .getAll("preferredWorkArrangements")
      .map(String),
    skills: text("skills"),
    targetRoleFamilies: text("targetRoleFamilies"),
    yearsExperience: text("yearsExperience"),
  });
}

export function CandidateProfileForm({
  profile,
}: {
  profile: CandidateProfileFormValue;
}) {
  const [state, formAction, pending] = useActionState(
    updateCandidateProfileAction,
    INITIAL_STATE,
  );
  const [completeness, setCompleteness] = useState(() =>
    calculateProfileCompleteness(profile),
  );
  const formRef = useRef<HTMLFormElement>(null);
  const advancedDetailsRef = useRef<HTMLDetailsElement>(null);

  const yearsHasError = Boolean(state.fieldErrors?.yearsExperience?.length);
  const locationHasError = Boolean(state.fieldErrors?.location?.length);
  const relocationHasError = Boolean(state.fieldErrors?.relocationPreference?.length);
  const workArrangementsHaveError = Boolean(
    state.fieldErrors?.preferredWorkArrangements?.length,
  );
  const advancedHasError = (
    [
      "careerGoals",
      "dealBreakers",
      "interests",
      "interviewConcerns",
      "strengths",
      "weaknesses",
    ] as const
  ).some((name) => Boolean(state.fieldErrors?.[name]?.length));

  useEffect(() => {
    if (!state.fieldErrors) return;
    if (advancedHasError && advancedDetailsRef.current) {
      advancedDetailsRef.current.open = true;
    }
    formRef.current
      ?.querySelector<HTMLElement>(
        "input[aria-invalid='true'], textarea[aria-invalid='true'], fieldset[aria-invalid='true'] input",
      )
      ?.focus();
  }, [advancedHasError, state.fieldErrors]);

  return (
    <form
      key={profile.revision}
      ref={formRef}
      action={formAction}
      aria-busy={pending}
      onInput={(event) => setCompleteness(completenessFromForm(event.currentTarget))}
      className="min-w-0"
    >
      <input type="hidden" name="expectedRevision" value={profile.revision} />

      <div className="glass-panel-strong rounded-[1.35rem] sm:rounded-b-none">
      <fieldset
        disabled={pending}
        aria-describedby="profile-save-status"
        className={cn(
          "m-0 min-w-0 rounded-t-[1.35rem] border-0 p-0 transition-opacity duration-200",
          pending && "cursor-wait opacity-60",
        )}
      >
        <legend className="sr-only">Profile preferences</legend>

      <div className="flex flex-col gap-3 rounded-t-[1.35rem] border-b border-[#27324a]/[0.07] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="text-sm font-semibold tracking-[-0.02em] text-[#172033]">Your preferences</p>
          <p className="mt-0.5 text-[11px] text-[#737b8c]">Essentials take a few minutes. Everything else is optional depth.</p>
        </div>
        <nav className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Profile essentials">
          {[
            ["#direction", "Direction"],
            ["#work-life", "Location"],
            ["#compensation", "Pay"],
            ["#experience", "Skills"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="inline-flex min-h-11 items-center rounded-lg px-1 text-xs font-medium text-[#596277] transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              {label}
            </a>
          ))}
        </nav>
      </div>

      <CompletenessMeter value={completeness} />

      <EssentialSection
        id="direction"
        step="01"
        icon={Target}
        title="Where you want to go"
        description="This is the strongest signal in your feed. Use role families, not one exact job title."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="currentRole">Current or most recent role</Label>
            <Input
              id="currentRole"
              name="currentRole"
              required
              maxLength={180}
              defaultValue={profile.currentRole}
              placeholder="Hospital help desk analyst"
              aria-invalid={Boolean(state.fieldErrors?.currentRole?.length)}
              aria-describedby={describedBy(
                "currentRole-help",
                state.fieldErrors?.currentRole?.length
                  ? "currentRole-error"
                  : undefined,
              )}
              className="glass-input h-11 rounded-xl text-base focus-visible:border-primary/35 focus-visible:ring-primary/15 sm:text-sm"
            />
            <WhyItMatters id="currentRole-help">Sets the experience baseline so adjacent moves are scored fairly.</WhyItMatters>
            <FieldError id="currentRole-error" name="currentRole" state={state} />
          </div>
          <MultilineField
            label="Target role directions"
            name="targetRoleFamilies"
            rows={5}
            placeholder={"AI implementation\nTechnical customer success\nProduct operations"}
            value={profile.targetRoleFamilies}
            state={state}
            why="Jobs matching more than one direction rise first; you can stay broad without becoming random."
          />
          <MultilineField
            label="Industries worth exploring"
            name="preferredIndustries"
            rows={5}
            placeholder={"Artificial intelligence\nHealthcare technology\nSoftware"}
            value={profile.preferredIndustries}
            state={state}
            why="Breaks ties between similar roles and improves company discovery."
          />
        </div>
      </EssentialSection>

      <EssentialSection
        id="work-life"
        step="02"
        icon={MapPin}
        title="Where work can fit"
        description="Tell JobSwipe what is actually commutable or acceptable so impossible roles stop competing."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="location">Home location</Label>
            <Input
              id="location"
              name="location"
              maxLength={220}
              defaultValue={profile.location ?? ""}
              placeholder="Pittsburgh, PA"
              aria-invalid={locationHasError}
              aria-describedby={describedBy("location-help", locationHasError && "location-error")}
              className="glass-input h-11 rounded-xl text-base focus-visible:border-primary/35 focus-visible:ring-primary/15 sm:text-sm"
            />
            <WhyItMatters id="location-help">Used for local, hybrid, and remote-location eligibility.</WhyItMatters>
            <FieldError id="location-error" name="location" state={state} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="relocationPreference">Location flexibility</Label>
            <Input
              id="relocationPreference"
              name="relocationPreference"
              maxLength={500}
              defaultValue={profile.relocationPreference ?? ""}
              placeholder="Prefer remote; open to realistic hybrid roles"
              aria-invalid={relocationHasError}
              aria-describedby={describedBy(
                "relocationPreference-help",
                relocationHasError && "relocationPreference-error",
              )}
              className="glass-input h-11 rounded-xl text-base focus-visible:border-primary/35 focus-visible:ring-primary/15 sm:text-sm"
            />
            <WhyItMatters id="relocationPreference-help">Adds nuance that a location checkbox cannot capture.</WhyItMatters>
            <FieldError id="relocationPreference-error" name="relocationPreference" state={state} />
          </div>
          <fieldset
            id="preferredWorkArrangements"
            className="scroll-mt-24 space-y-2 sm:col-span-2"
            aria-invalid={workArrangementsHaveError}
            aria-describedby={describedBy(
              "preferredWorkArrangements-help",
              workArrangementsHaveError && "preferredWorkArrangements-error",
            )}
          >
            <legend className="text-sm font-medium">Work modes you would accept</legend>
            <div className="grid grid-cols-1 gap-2 min-[370px]:grid-cols-3">
              {[
                ["remote", "Remote"],
                ["hybrid", "Hybrid"],
                ["on_site", "On-site"],
              ].map(([value, label]) => (
                <label
                  key={value}
                  className="glass-input flex min-h-12 cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 text-sm font-semibold text-[#525c70] transition hover:bg-white/90 has-[:checked]:border-[#6a5ee5]/20 has-[:checked]:bg-[#eeecff] has-[:checked]:text-[#4f45d2]"
                >
                  <input
                    type="checkbox"
                    name="preferredWorkArrangements"
                    value={value}
                    defaultChecked={profile.preferredWorkArrangements.includes(value)}
                    aria-invalid={workArrangementsHaveError}
                    className="size-4 accent-[#6257f4]"
                  />
                  {label}
                </label>
              ))}
            </div>
            <WhyItMatters id="preferredWorkArrangements-help">Uncheck anything you would consistently reject.</WhyItMatters>
            <FieldError id="preferredWorkArrangements-error" name="preferredWorkArrangements" state={state} />
          </fieldset>
        </div>
      </EssentialSection>

      <EssentialSection
        id="compensation"
        step="03"
        icon={CircleDollarSign}
        title="What makes a move worthwhile"
        description="Use annual base salary. These numbers stay private and help separate attractive roles from sideways moves."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {SALARY_FIELDS.map(({ name, label, why }) => {
            const hasError = Boolean(state.fieldErrors?.[name]?.length);
            return (
              <div key={name} className="space-y-2 border-l border-[#27324a]/[0.1] pl-3.5">
                <Label htmlFor={name}>{label}</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-[#656970]">$</span>
                  <Input
                    id={name}
                    name={name}
                    required
                    inputMode="decimal"
                    defaultValue={dollars(profile[name])}
                    className="glass-input h-11 scroll-mt-28 rounded-xl pl-7 text-base focus-visible:border-primary/35 focus-visible:ring-primary/15 sm:text-sm"
                    aria-invalid={hasError}
                    aria-describedby={describedBy(`${name}-help`, hasError && `${name}-error`)}
                  />
                </div>
                <WhyItMatters id={`${name}-help`}>{why}</WhyItMatters>
                <FieldError id={`${name}-error`} name={name} state={state} />
              </div>
            );
          })}
        </div>
        <p className="mt-4 flex items-center gap-2 text-[11px] leading-5 text-[#697185]">
          <ShieldCheck className="size-3.5 shrink-0 text-[#278e78]" aria-hidden="true" />
          Compensation is used only for your private ranking and is never sent to employers.
        </p>
      </EssentialSection>

      <EssentialSection
        id="experience"
        step="04"
        icon={BriefcaseBusiness}
        title="What you can credibly prove"
        description="Be concrete. JobSwipe rewards evidence you have now and labels growth areas instead of pretending every keyword is a match."
      >
        <div className="grid gap-5 sm:grid-cols-[11rem_minmax(0,1fr)]">
          <div className="space-y-2">
            <Label htmlFor="yearsExperience">Relevant professional years</Label>
            <Input
              id="yearsExperience"
              name="yearsExperience"
              required
              inputMode="numeric"
              min={0}
              max={50}
              type="number"
              defaultValue={profile.yearsExperience}
              aria-invalid={yearsHasError}
              aria-describedby={describedBy(
                "yearsExperience-help",
                yearsHasError && "yearsExperience-error",
              )}
              className="glass-input h-11 rounded-xl text-base focus-visible:border-primary/35 focus-visible:ring-primary/15 sm:text-sm"
            />
            <WhyItMatters id="yearsExperience-help">Portfolio projects do not inflate tenure.</WhyItMatters>
            <FieldError id="yearsExperience-error" name="yearsExperience" state={state} />
          </div>
          <MultilineField
            label="Skills you can discuss or demonstrate"
            name="skills"
            rows={6}
            placeholder={"Technical support\nAI-assisted development\nSQL\nUser research"}
            value={profile.skills}
            state={state}
            why="Specific tools and transferable capabilities drive qualification evidence on each card."
          />
        </div>
      </EssentialSection>

      <details
        ref={advancedDetailsRef}
        className="group border-b border-[#27324a]/[0.07]"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-5 marker:content-none transition-colors hover:bg-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30 sm:px-6">
          <span className="flex min-w-0 items-start gap-3">
            <Layers3 className="mt-0.5 size-4 shrink-0 text-[#646d80] group-open:text-[#5d52da]" aria-hidden="true" />
            <span>
              <span className="block text-sm font-semibold tracking-[-0.02em] text-[#111828]">More detail</span>
              <span className="mt-1 block text-xs leading-5 text-[#697185]">Optional details about your goals, gaps, interests, and boundaries.</span>
            </span>
          </span>
          <span className="grid size-8 shrink-0 place-items-center text-[#697185] transition group-open:rotate-180 group-open:text-primary">
            <ChevronDown className="size-4" aria-hidden="true" />
          </span>
        </summary>
        <div className="space-y-7 px-4 pb-7 sm:px-6">
          <div>
            <div className="mb-4 flex items-center gap-2">
              <Compass className="size-4 text-[#5d52da]" aria-hidden="true" />
              <h3 className="text-sm font-bold text-[#172033]">Motivation and interests</h3>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <MultilineField
                label="Career goals"
                name="careerGoals"
                value={profile.careerGoals}
                state={state}
                why="Raises roles that build the experience and trajectory you actually want."
              />
              <MultilineField
                label="Topics and problems you enjoy"
                name="interests"
                value={profile.interests}
                state={state}
                why="Adds a lighter preference signal without overpowering qualifications."
              />
            </div>
          </div>
          <div className="border-t border-[#27324a]/[0.07] pt-6">
            <div className="mb-4 flex items-center gap-2">
              <Gauge className="size-4 text-[#5d52da]" aria-hidden="true" />
              <h3 className="text-sm font-bold text-[#172033]">Strengths and growth edges</h3>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <MultilineField
                label="Strengths"
                name="strengths"
                value={profile.strengths}
                state={state}
                why="Supports adjacent-role matches that a title alone would miss."
              />
              <MultilineField
                label="Known gaps"
                name="weaknesses"
                value={profile.weaknesses}
                state={state}
                why="Keeps likelihood honest and turns missing experience into a preparation plan."
              />
            </div>
          </div>
          <div className="border-t border-[#27324a]/[0.07] pt-6">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck className="size-4 text-[#5d52da]" aria-hidden="true" />
              <h3 className="text-sm font-bold text-[#172033]">Boundaries and interview risk</h3>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <MultilineField
                label="Deal-breakers"
                name="dealBreakers"
                value={profile.dealBreakers}
                state={state}
                why="Flags roles that look good numerically but would be a poor real-life trade."
              />
              <MultilineField
                label="Interview concerns"
                name="interviewConcerns"
                value={profile.interviewConcerns}
                state={state}
                why="Makes readiness advice specific to the screens you want to prepare for."
              />
            </div>
          </div>
        </div>
      </details>
      </fieldset>
      </div>

      <div className="glass-panel-strong fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 border-x-0 border-b-0 px-3 pt-2.5 pb-[max(.625rem,env(safe-area-inset-bottom))] shadow-[0_-10px_28px_rgba(20,28,48,.08)] sm:sticky sm:z-10 sm:flex sm:items-center sm:justify-between sm:gap-3 sm:rounded-b-[1.35rem] sm:px-6 sm:pt-4 sm:pb-4 sm:shadow-[0_-8px_24px_rgba(20,28,48,.045)]">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 sm:mx-0 sm:max-w-none">
        <p
          id="profile-save-status"
          aria-live="polite"
          role={!pending && state.message && !state.ok ? "alert" : "status"}
          className={cn(
            "min-w-0 flex-1 truncate text-[11px] font-medium leading-5 sm:flex sm:min-h-5 sm:items-center sm:gap-2 sm:whitespace-normal sm:text-xs",
            pending
              ? "text-[#5147cf]"
              : state.message
              ? state.ok
                ? "text-[#28785b]"
                : "text-destructive"
              : "text-[#697185]",
          )}
        >
          {pending ? (
            <LoaderCircle className="mr-1.5 inline size-3.5 animate-spin sm:mr-0 sm:size-4" aria-hidden="true" />
          ) : state.message ? (
            state.ok ? (
              <CheckCircle2 className="mr-1.5 inline size-3.5 shrink-0 sm:mr-0 sm:size-4" aria-hidden="true" />
            ) : (
              <AlertCircle className="mr-1.5 inline size-3.5 shrink-0 sm:mr-0 sm:size-4" aria-hidden="true" />
            )
          ) : null}
          {pending
            ? "Saving now — editing is paused."
            : state.message || "Changes only apply after you save."}
        </p>
        <Button
          type="submit"
          disabled={pending}
          className="h-11 shrink-0 px-4 sm:px-5"
        >
          {pending ? (
            <LoaderCircle className="animate-spin" data-icon="inline-start" />
          ) : (
            <Save data-icon="inline-start" />
          )}
          <span className="sm:hidden">{pending ? "Saving…" : "Save preferences"}</span>
          <span className="hidden sm:inline">{pending ? "Updating your matches…" : "Save and refresh matches"}</span>
        </Button>
        </div>
      </div>
    </form>
  );
}
