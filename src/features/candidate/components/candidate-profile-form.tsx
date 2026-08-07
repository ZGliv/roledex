"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
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

const INPUT_CLASS =
  "h-11 rounded-[0.9rem] border-white/10 bg-white/[0.055] text-base text-[#edf1f8] shadow-none placeholder:text-[#66738a] focus-visible:border-[#8176ff]/50 focus-visible:ring-[#8176ff]/15 sm:text-sm";
const TEXTAREA_CLASS =
  "min-h-28 max-h-52 scroll-mt-28 resize-y overflow-y-auto rounded-[0.9rem] border-white/10 bg-white/[0.055] text-base leading-6 text-[#edf1f8] shadow-none [field-sizing:fixed] placeholder:text-[#66738a] focus-visible:border-[#8176ff]/50 focus-visible:ring-[#8176ff]/15 sm:text-sm";
const LABEL_CLASS = "text-[12px] font-semibold text-[#cbd3e1]";

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
    why: "The baseline for deciding whether a move is an upgrade.",
  },
  {
    label: "Minimum to move",
    name: "preferredSalaryMinimumCents",
    why: "Roles below this line lose priority.",
  },
  {
    label: "Ideal target",
    name: "preferredSalaryTargetCents",
    why: "Roles near this number gain priority.",
  },
] as const satisfies ReadonlyArray<{
  label: string;
  name:
    | "currentSalaryCents"
    | "preferredSalaryMinimumCents"
    | "preferredSalaryTargetCents";
  why: string;
}>;

const PROFILE_SECTIONS = [
  ["#direction", "Direction"],
  ["#work-location", "Location"],
  ["#pay", "Pay"],
  ["#experience", "Experience"],
] as const;

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
    <p id={id} className="text-[12px] leading-5 text-[#ff9aaa]">
      {message}
    </p>
  ) : null;
}

function FieldNote({ children, id }: { children: React.ReactNode; id: string }) {
  return (
    <p id={id} className="text-[11px] leading-4 text-[#8490a4]">
      {children}
    </p>
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
        <Label htmlFor={name} className={LABEL_CLASS}>
          {label}
        </Label>
        <span className="shrink-0 text-[11px] text-[#748097]">One per line</span>
      </div>
      <Textarea
        id={name}
        name={name}
        defaultValue={lines(value)}
        placeholder={placeholder}
        rows={rows}
        aria-invalid={hasError}
        aria-describedby={describedBy(helpId, hasError && errorId)}
        className={TEXTAREA_CLASS}
      />
      <FieldNote id={helpId}>{why}</FieldNote>
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
    <section
      id={id}
      aria-labelledby={headingId}
      className="scroll-mt-28 border-b border-white/[0.09] px-4 py-6 last:border-b-0 sm:px-6 sm:py-7"
    >
      <div className="mb-5 grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
        <span className="grid size-7 place-items-center rounded-[0.6rem] border border-[#8176ff]/25 bg-[#8176ff]/10 text-[11px] font-semibold tabular-nums text-[#aaa3ff]">
          {step}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon className="size-4 shrink-0 text-[#8176ff]" aria-hidden="true" />
            <h2
              id={headingId}
              className="text-base font-semibold tracking-[-0.025em] text-[#f2f4f9]"
            >
              {title}
            </h2>
          </div>
          <p className="mt-1 max-w-2xl text-[12px] leading-5 text-[#909caf]">
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

function CompletenessMeter({ value }: { value: ProfileCompleteness }) {
  const nextSignal = value.missing[0];

  return (
    <section className="border-b border-white/[0.09] px-4 py-4 sm:px-6" aria-label="Profile strength">
      <div className="flex items-center gap-3">
        <Gauge className="size-4 shrink-0 text-[#8176ff]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-4">
            <p className="truncate text-[12px] font-semibold text-[#dfe4ed]">
              {value.label}
            </p>
            <p className="shrink-0 text-[12px] font-semibold tabular-nums text-[#aaa3ff]">
              {value.score}%
            </p>
          </div>
          <div
            className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.09]"
            role="progressbar"
            aria-label="Profile strength"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value.score}
          >
            <div
              className="h-full rounded-full bg-[#8176ff] transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${value.score}%` }}
            />
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-col gap-0.5 pl-7 text-[11px] leading-4 text-[#8490a4] sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p>
          {value.completedSignals} of {value.totalSignals} ranking signals complete
        </p>
        <p className="text-[#a5afc0]">
          {nextSignal ? `Next: add ${nextSignal}.` : "Ready for precise matching."}
        </p>
      </div>
    </section>
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
  const [dirty, setDirty] = useState(false);
  const submitProfile = useCallback(
    async (
      previousState: CandidateProfileActionState,
      formData: FormData,
    ) => {
      const nextState = await updateCandidateProfileAction(
        previousState,
        formData,
      );
      if (nextState.ok) setDirty(false);
      return nextState;
    },
    [],
  );
  const [state, formAction, pending] = useActionState(
    submitProfile,
    INITIAL_STATE,
  );
  const [completeness, setCompleteness] = useState(() =>
    calculateProfileCompleteness(profile),
  );
  const formRef = useRef<HTMLFormElement>(null);
  const advancedDetailsRef = useRef<HTMLDetailsElement>(null);

  const yearsHasError = Boolean(state.fieldErrors?.yearsExperience?.length);
  const locationHasError = Boolean(state.fieldErrors?.location?.length);
  const relocationHasError = Boolean(
    state.fieldErrors?.relocationPreference?.length,
  );
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
      onInput={(event) => {
        setDirty(true);
        setCompleteness(completenessFromForm(event.currentTarget));
      }}
      className="min-w-0"
    >
      <input type="hidden" name="expectedRevision" value={profile.revision} />

      <div className="sticky top-3 z-30 mb-3">
        <div
          className="editorial-dark-surface flex min-h-[3.75rem] items-center gap-3 rounded-[1.15rem] px-3 py-2 shadow-[0_18px_48px_rgba(0,0,0,.34)] sm:px-4"
          style={{ backgroundColor: "rgba(10, 15, 27, 0.9)" }}
        >
          <p
            id="profile-save-status"
            aria-live="polite"
            role={!pending && state.message && !state.ok ? "alert" : "status"}
            className={cn(
              "min-w-0 flex-1 text-[11px] font-medium leading-4 sm:text-[12px]",
              pending
                ? "text-[#b5afff]"
                : state.message
                  ? state.ok
                    ? "text-[#73d8b1]"
                    : "text-[#ff9aaa]"
                  : dirty
                    ? "text-[#c7cfdd]"
                    : "text-[#8490a4]",
            )}
          >
            {pending ? (
              <LoaderCircle className="mr-1.5 inline size-3.5 animate-spin" aria-hidden="true" />
            ) : state.message ? (
              state.ok ? (
                <CheckCircle2 className="mr-1.5 inline size-3.5" aria-hidden="true" />
              ) : (
                <AlertCircle className="mr-1.5 inline size-3.5" aria-hidden="true" />
              )
            ) : null}
            {pending
              ? "Updating your matches…"
              : state.message || (dirty ? "Unsaved profile changes" : "Profile is up to date")}
          </p>
          <Button
            type="submit"
            disabled={pending || !dirty}
            className="h-11 shrink-0 border-[#8176ff] bg-[#8176ff] px-4 text-white shadow-[0_8px_22px_rgba(72,60,210,.28)] hover:bg-[#6d61f3] focus-visible:ring-[#9a91ff]/55 focus-visible:ring-offset-[#080c16] disabled:bg-white/[0.08] disabled:text-[#778297] disabled:shadow-none sm:px-5"
          >
            {pending ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : (
              <Save data-icon="inline-start" />
            )}
            {pending ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </Button>
        </div>
      </div>

      <div className="editorial-dark-surface overflow-hidden rounded-[1.35rem]">
        <fieldset
          disabled={pending}
          aria-describedby="profile-save-status"
          className={cn(
            "m-0 min-w-0 border-0 p-0 transition-opacity duration-200",
            pending && "cursor-wait opacity-60",
          )}
        >
          <legend className="sr-only">Profile preferences</legend>

          <CompletenessMeter value={completeness} />

          <nav
            className="flex overflow-x-auto border-b border-white/[0.09] px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-5"
            aria-label="Profile sections"
          >
            {PROFILE_SECTIONS.map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="inline-flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-3 text-[11px] font-semibold text-[#8e99ad] outline-none transition hover:text-[#dce1eb] focus-visible:border-[#8176ff] focus-visible:text-white"
              >
                {label}
              </a>
            ))}
          </nav>

          <EssentialSection
            id="direction"
            step="01"
            icon={Target}
            title="Direction"
            description="Define the work you do now and the role families worth showing you next."
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="currentRole" className={LABEL_CLASS}>
                  Current or most recent role
                </Label>
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
                  className={INPUT_CLASS}
                />
                <FieldNote id="currentRole-help">
                  Sets a fair experience baseline for adjacent moves.
                </FieldNote>
                <FieldError id="currentRole-error" name="currentRole" state={state} />
              </div>
              <MultilineField
                label="Target role directions"
                name="targetRoleFamilies"
                rows={5}
                placeholder={"AI implementation\nTechnical customer success\nProduct operations"}
                value={profile.targetRoleFamilies}
                state={state}
                why="Use role families rather than one exact title to keep the feed focused without becoming narrow."
              />
              <MultilineField
                label="Industries worth exploring"
                name="preferredIndustries"
                rows={5}
                placeholder={"Artificial intelligence\nHealthcare technology\nSoftware"}
                value={profile.preferredIndustries}
                state={state}
                why="Industry preferences break ties between otherwise similar roles."
              />
            </div>
          </EssentialSection>

          <EssentialSection
            id="work-location"
            step="02"
            icon={MapPin}
            title="Location"
            description="Remove roles that are not realistically commutable, remote-eligible, or worth relocating for."
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="location" className={LABEL_CLASS}>
                  Home location
                </Label>
                <Input
                  id="location"
                  name="location"
                  maxLength={220}
                  defaultValue={profile.location ?? ""}
                  placeholder="Pittsburgh, PA"
                  aria-invalid={locationHasError}
                  aria-describedby={describedBy(
                    "location-help",
                    locationHasError && "location-error",
                  )}
                  className={INPUT_CLASS}
                />
                <FieldNote id="location-help">
                  Used for local, hybrid, and remote-location eligibility.
                </FieldNote>
                <FieldError id="location-error" name="location" state={state} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="relocationPreference" className={LABEL_CLASS}>
                  Location flexibility
                </Label>
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
                  className={INPUT_CLASS}
                />
                <FieldNote id="relocationPreference-help">
                  Adds nuance beyond a work-mode checkbox.
                </FieldNote>
                <FieldError
                  id="relocationPreference-error"
                  name="relocationPreference"
                  state={state}
                />
              </div>
              <fieldset
                id="preferredWorkArrangements"
                className="scroll-mt-28 space-y-2 sm:col-span-2"
                aria-invalid={workArrangementsHaveError}
                aria-describedby={describedBy(
                  "preferredWorkArrangements-help",
                  workArrangementsHaveError && "preferredWorkArrangements-error",
                )}
              >
                <legend className={LABEL_CLASS}>Work modes you would accept</legend>
                <div className="grid grid-cols-1 divide-y divide-white/[0.08] overflow-hidden rounded-[0.9rem] border border-white/10 bg-white/[0.035] min-[370px]:grid-cols-3 min-[370px]:divide-x min-[370px]:divide-y-0">
                  {[
                    ["remote", "Remote"],
                    ["hybrid", "Hybrid"],
                    ["on_site", "On-site"],
                  ].map(([value, label]) => (
                    <label
                      key={value}
                      className="flex min-h-12 cursor-pointer items-center gap-2.5 px-3.5 text-[12px] font-semibold text-[#9da8bb] transition hover:bg-white/[0.045] has-[:checked]:bg-[#8176ff]/10 has-[:checked]:text-[#c4beff]"
                    >
                      <input
                        type="checkbox"
                        name="preferredWorkArrangements"
                        value={value}
                        defaultChecked={profile.preferredWorkArrangements.includes(value)}
                        aria-invalid={workArrangementsHaveError}
                        className="size-4 accent-[#8176ff]"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <FieldNote id="preferredWorkArrangements-help">
                  Leave checked only the arrangements you would genuinely consider.
                </FieldNote>
                <FieldError
                  id="preferredWorkArrangements-error"
                  name="preferredWorkArrangements"
                  state={state}
                />
              </fieldset>
            </div>
          </EssentialSection>

          <EssentialSection
            id="pay"
            step="03"
            icon={CircleDollarSign}
            title="Pay"
            description="Set annual base salary thresholds so an attractive title cannot hide a sideways move."
          >
            <div className="grid border-y border-white/[0.09] sm:grid-cols-3 sm:divide-x sm:divide-white/[0.09]">
              {SALARY_FIELDS.map(({ name, label, why }, index) => {
                const hasError = Boolean(state.fieldErrors?.[name]?.length);

                return (
                  <div
                    key={name}
                    className={cn(
                      "space-y-2 py-4 sm:px-4",
                      index < SALARY_FIELDS.length - 1 &&
                        "border-b border-white/[0.09] sm:border-b-0",
                      index === 0 && "sm:pl-0",
                      index === SALARY_FIELDS.length - 1 && "sm:pr-0",
                    )}
                  >
                    <Label htmlFor={name} className={LABEL_CLASS}>
                      {label}
                    </Label>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-[#7f8ba1]">
                        $
                      </span>
                      <Input
                        id={name}
                        name={name}
                        required
                        inputMode="decimal"
                        defaultValue={dollars(profile[name])}
                        className={cn(INPUT_CLASS, "scroll-mt-28 pl-7 tabular-nums")}
                        aria-invalid={hasError}
                        aria-describedby={describedBy(
                          `${name}-help`,
                          hasError && `${name}-error`,
                        )}
                      />
                    </div>
                    <FieldNote id={`${name}-help`}>{why}</FieldNote>
                    <FieldError id={`${name}-error`} name={name} state={state} />
                  </div>
                );
              })}
            </div>
            <p className="mt-4 flex items-start gap-2 text-[11px] leading-4 text-[#8490a4]">
              <ShieldCheck className="mt-px size-3.5 shrink-0 text-[#8176ff]" aria-hidden="true" />
              Compensation is used only for private ranking and is never sent to employers.
            </p>
          </EssentialSection>

          <EssentialSection
            id="experience"
            step="04"
            icon={BriefcaseBusiness}
            title="Experience"
            description="Record evidence you can defend today; growth areas stay visible instead of becoming fake matches."
          >
            <div className="grid gap-5 sm:grid-cols-[11rem_minmax(0,1fr)]">
              <div className="space-y-2">
                <Label htmlFor="yearsExperience" className={LABEL_CLASS}>
                  Relevant professional years
                </Label>
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
                  className={INPUT_CLASS}
                />
                <FieldNote id="yearsExperience-help">
                  Portfolio work does not inflate tenure.
                </FieldNote>
                <FieldError
                  id="yearsExperience-error"
                  name="yearsExperience"
                  state={state}
                />
              </div>
              <MultilineField
                label="Skills you can discuss or demonstrate"
                name="skills"
                rows={6}
                placeholder={"Technical support\nAI-assisted development\nSQL\nUser research"}
                value={profile.skills}
                state={state}
                why="Specific tools and transferable capabilities drive qualification evidence on each role."
              />
            </div>
          </EssentialSection>

          <details
            ref={advancedDetailsRef}
            className="group border-t border-white/[0.09]"
          >
            <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 outline-none transition hover:bg-white/[0.025] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8176ff]/40 sm:px-6 [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 items-start gap-3">
                <Layers3
                  className="mt-0.5 size-4 shrink-0 text-[#7f8ba1] group-open:text-[#8176ff]"
                  aria-hidden="true"
                />
                <span>
                  <span className="block text-[13px] font-semibold text-[#e3e8f1]">
                    Advanced details
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-[#8490a4]">
                    Goals, strengths, interests, gaps, boundaries, and interview concerns.
                  </span>
                </span>
              </span>
              <ChevronDown
                className="size-4 shrink-0 text-[#7f8ba1] transition-transform duration-200 group-open:rotate-180 group-open:text-[#aaa3ff]"
                aria-hidden="true"
              />
            </summary>
            <div className="border-t border-white/[0.09] px-4 pb-7 sm:px-6">
              <section className="py-6" aria-labelledby="advanced-motivation-heading">
                <h3 id="advanced-motivation-heading" className="text-[13px] font-semibold text-[#dfe4ed]">
                  Motivation and interests
                </h3>
                <div className="mt-4 grid gap-5 sm:grid-cols-2">
                  <MultilineField
                    label="Career goals"
                    name="careerGoals"
                    value={profile.careerGoals}
                    state={state}
                    why="Raises roles that build the trajectory you actually want."
                  />
                  <MultilineField
                    label="Topics and problems you enjoy"
                    name="interests"
                    value={profile.interests}
                    state={state}
                    why="Adds a preference signal without overpowering qualifications."
                  />
                </div>
              </section>
              <section
                className="border-t border-white/[0.09] py-6"
                aria-labelledby="advanced-strengths-heading"
              >
                <h3 id="advanced-strengths-heading" className="text-[13px] font-semibold text-[#dfe4ed]">
                  Strengths and growth edges
                </h3>
                <div className="mt-4 grid gap-5 sm:grid-cols-2">
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
                    why="Keeps likelihood honest and makes preparation advice useful."
                  />
                </div>
              </section>
              <section
                className="border-t border-white/[0.09] pt-6"
                aria-labelledby="advanced-boundaries-heading"
              >
                <h3 id="advanced-boundaries-heading" className="text-[13px] font-semibold text-[#dfe4ed]">
                  Boundaries and interview risk
                </h3>
                <div className="mt-4 grid gap-5 sm:grid-cols-2">
                  <MultilineField
                    label="Deal-breakers"
                    name="dealBreakers"
                    value={profile.dealBreakers}
                    state={state}
                    why="Flags roles that score well but would be a poor real-life trade."
                  />
                  <MultilineField
                    label="Interview concerns"
                    name="interviewConcerns"
                    value={profile.interviewConcerns}
                    state={state}
                    why="Makes readiness advice specific to the screens you need to prepare for."
                  />
                </div>
              </section>
            </div>
          </details>
        </fieldset>
      </div>
    </form>
  );
}
