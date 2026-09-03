"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CircleDollarSign,
  Clock3,
  Laptop,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";

import {
  replaceCandidateRoleTargetsAction,
  updateCandidateProfileAction,
  updateCandidateSearchPreferencesAction,
} from "@/features/candidate/actions";
import {
  ResumeImportReview,
  type ResumeImportDraftValue,
} from "@/features/candidate/components/resume-import-review";
import type { RoleTargetValue } from "@/features/candidate/components/role-target-editor";
import {
  eligibleOnboardingCalibrationJobs,
  onboardingCalibrationGoal,
  ONBOARDING_CALIBRATION_PREFETCH,
} from "@/features/candidate/onboarding-calibration";
import { ROLE_DIRECTION_PRESETS } from "@/features/candidate/search-contract-defaults";
import type { JobDecisionReason } from "@/db/schema";
import {
  annotateJobDecisionReasonsAction,
  decideJobAction,
  loadMoreDeckJobsAction,
} from "@/features/jobs/actions";
import type { EnrichedJobCardViewModel } from "@/features/jobs/queries";
import { completeOnboardingAction } from "@/features/product/actions";
import { cn } from "@/lib/utils";

type WorkMode = "remote" | "hybrid" | "on_site";
type Seniority =
  | "intern"
  | "entry"
  | "mid"
  | "senior"
  | "staff"
  | "principal"
  | "manager"
  | "director"
  | "executive";
type EmploymentType =
  | "full_time"
  | "part_time"
  | "contract"
  | "temporary"
  | "internship";
type WorkAuthorization =
  | "citizen_or_permanent_resident"
  | "work_authorized"
  | "student_or_temporary"
  | "not_authorized"
  | "prefer_not_to_say";
type MissingSalaryPolicy = "show" | "explore_only" | "hide";

export type OnboardingProfileValue = {
  acceptedEmploymentTypes: EmploymentType[];
  careerGoals: string[];
  currentRole: string;
  currentSalaryCents: number;
  dealBreakers: string[];
  desiredSeniorityLevels: Seniority[];
  excludedCompanies: string[];
  excludedIndustries: string[];
  excludedTitles: string[];
  interests: string[];
  interviewConcerns: string[];
  location: string | null;
  missingSalaryPolicy: MissingSalaryPolicy;
  preferredIndustries: string[];
  preferredSalaryMinimumCents: number;
  preferredSalaryTargetCents: number;
  preferredWorkModes: WorkMode[];
  relocationDestinations: string[];
  relocationPreference: string | null;
  requiresSponsorship: boolean | null;
  revision: number;
  roleTargets: RoleTargetValue[];
  resumeImportDrafts: ResumeImportDraftValue[];
  skills: string[];
  strengths: string[];
  strictWorkModes: boolean;
  targetRoleFamilies: string[];
  weaknesses: string[];
  workAuthorization: WorkAuthorization;
  yearsExperience: number;
  commuteRadiusMiles: number | null;
  maxOfficeDaysPerWeek: number | null;
  maxTravelPercent: number | null;
};

const SENIORITY_OPTIONS: ReadonlyArray<{ label: string; value: Seniority }> = [
  { label: "Intern", value: "intern" },
  { label: "Entry", value: "entry" },
  { label: "Mid-level", value: "mid" },
  { label: "Senior", value: "senior" },
  { label: "Staff", value: "staff" },
  { label: "Principal", value: "principal" },
  { label: "Manager", value: "manager" },
  { label: "Director", value: "director" },
  { label: "Executive", value: "executive" },
];

const WORK_MODE_OPTIONS: ReadonlyArray<{ label: string; value: WorkMode }> = [
  { label: "Remote", value: "remote" },
  { label: "Hybrid", value: "hybrid" },
  { label: "On-site", value: "on_site" },
];

const EMPLOYMENT_OPTIONS: ReadonlyArray<{
  label: string;
  value: EmploymentType;
}> = [
  { label: "Full-time", value: "full_time" },
  { label: "Contract", value: "contract" },
  { label: "Part-time", value: "part_time" },
  { label: "Temporary", value: "temporary" },
  { label: "Internship", value: "internship" },
];

const LOCATION_SUGGESTIONS = [
  "United States",
  "New York, NY",
  "Pittsburgh, PA",
  "Chicago, IL",
] as const;

const AUTHORIZATION_OPTIONS: ReadonlyArray<{
  description: string;
  label: string;
  value: WorkAuthorization;
}> = [
  {
    description: "Citizen or green card holder",
    label: "Permanent",
    value: "citizen_or_permanent_resident",
  },
  {
    description: "Authorized without sponsorship",
    label: "Authorized",
    value: "work_authorized",
  },
  {
    description: "Student visa or temporary status",
    label: "Temporary",
    value: "student_or_temporary",
  },
  {
    description: "Not currently authorized",
    label: "Not authorized",
    value: "not_authorized",
  },
  {
    description: "Keep this out of your ranking",
    label: "Keep private",
    value: "prefer_not_to_say",
  },
];

const STEP_TITLES = [
  "Introduction",
  "Job direction",
  "Hard limits",
  "Review",
  "Calibration",
] as const;

const CALIBRATION_PASS_REASONS = [
  { code: "wrong_role", label: "Wrong role" },
  { code: "too_senior", label: "Too senior" },
  { code: "pay_too_low", label: "Pay" },
  { code: "wrong_location", label: "Location" },
  { code: "wrong_work_mode", label: "Work setup" },
] as const satisfies readonly { code: JobDecisionReason; label: string }[];

const CALIBRATION_SAVE_REASONS = [
  { code: "liked_role", label: "Role" },
  { code: "growth_opportunity", label: "Growth" },
  { code: "liked_pay", label: "Pay" },
  { code: "liked_location", label: "Location" },
  { code: "liked_work_mode", label: "Work setup" },
] as const satisfies readonly { code: JobDecisionReason; label: string }[];

type CalibrationFeedbackPrompt = {
  decision: "saved" | "skipped";
  decisionEventId: string;
  jobId: string;
  title: string;
};

function calibrationTierLabel(job: EnrichedJobCardViewModel) {
  if (job.feedTier === "credible_stretch") return "Credible stretch";
  if (job.feedTier === "discovery") return "Discovery";
  return "Ready now";
}

function dollars(cents: number) {
  return String(Math.round(cents / 100));
}

function listText(items: readonly string[]) {
  return items.join("\n");
}

function normalizedLines(value: string) {
  const seen = new Set<string>();
  return value
    .split(/\r?\n/)
    .map((item) => item.replace(/^\s*[-*•]\s*/, "").replace(/\s+/g, " ").trim())
    .filter((item) => {
      const key = item.toLocaleLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function toggleValue<T extends string>(values: readonly T[], value: T) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function selectedLabels<T extends string>(
  values: readonly T[],
  options: ReadonlyArray<{ label: string; value: T }>,
) {
  return values
    .map((value) => options.find((option) => option.value === value)?.label ?? value)
    .join(" · ");
}

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ChoiceChip({
  checked,
  children,
  onClick,
}: {
  checked: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[12px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-[#a9a3ff]/55",
        checked
          ? "border-[#9c93ff]/45 bg-[#8176ff]/20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.16)]"
          : "border-white/10 bg-white/[0.045] text-[#aeb8c9] hover:bg-white/[0.08]",
      )}
    >
      {checked ? <Check className="size-3.5" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

function OptionCards<T extends string>({
  columns = 2,
  name,
  onChange,
  options,
  value,
}: {
  columns?: 2 | 3;
  name: string;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ description?: string; label: string; value: T }>;
  value: T;
}) {
  const radioName = `${useId()}-${name.replace(/\s+/g, "-").toLocaleLowerCase()}`;
  return (
    <div
      className={cn("grid gap-2", columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}
      role="radiogroup"
      aria-label={name}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <label
            key={option.value}
            className={cn(
              "relative min-h-[4.5rem] cursor-pointer rounded-[1rem] border p-3 text-left outline-none transition focus-within:ring-2 focus-within:ring-[#a9a3ff]/55",
              selected
                ? "border-[#a39bff]/45 bg-[linear-gradient(135deg,rgba(129,118,255,.22),rgba(129,118,255,.08))] shadow-[inset_0_1px_0_rgba(255,255,255,.16),0_10px_30px_rgba(0,0,0,.12)]"
                : "border-white/10 bg-white/[0.035] hover:border-white/16 hover:bg-white/[0.06]",
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={radioName}
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
            />
            <span className="flex items-center justify-between gap-3">
              <span className={cn("text-[12px] font-semibold", selected ? "text-white" : "text-[#c4ccda]")}>
                {option.label}
              </span>
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full border",
                  selected ? "border-[#aaa3ff] bg-[#8176ff] text-white" : "border-white/16",
                )}
                aria-hidden="true"
              >
                {selected ? <Check className="size-3" /> : null}
              </span>
            </span>
            {option.description ? (
              <span className="mt-1.5 block text-[10px] leading-4 text-[#7f8ba0]">
                {option.description}
              </span>
            ) : null}
          </label>
        );
      })}
    </div>
  );
}

function ToggleRow({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-[4.25rem] w-full items-center justify-between gap-4 rounded-[1rem] border border-white/10 bg-white/[0.04] px-4 text-left outline-none transition hover:border-white/16 hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-[#a9a3ff]/55"
    >
      <span>
        <span className="block text-[12px] font-semibold text-[#e3e8f1]">{label}</span>
        <span className="mt-0.5 block text-[10px] leading-4 text-[#77849a]">{description}</span>
      </span>
      <span
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full border transition",
          checked
            ? "border-[#a39bff]/60 bg-[#8176ff] shadow-[0_0_24px_rgba(129,118,255,.24)]"
            : "border-white/14 bg-white/[0.07]",
        )}
        aria-hidden="true"
      >
        <span
          className={cn(
            "absolute top-1 size-[1.125rem] rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-[1.55rem]" : "translate-x-1",
          )}
        />
      </span>
    </button>
  );
}

function NumberStepper({
  label,
  max,
  min,
  onChange,
  quickValues,
  suffix,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  quickValues?: readonly number[];
  suffix: string;
  value: number;
}) {
  const boundedValue = Math.min(max, Math.max(min, value));
  return (
    <fieldset>
      <legend className="text-[11px] font-semibold text-[#dce2ec]">{label}</legend>
      <div className="mt-2 rounded-[1rem] border border-white/10 bg-white/[0.035] p-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            aria-label={`Decrease ${label.toLocaleLowerCase()}`}
            disabled={boundedValue <= min}
            onClick={() => onChange(Math.max(min, boundedValue - 1))}
            className="grid size-11 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-[#c9d0dc] outline-none transition hover:bg-white/[0.09] disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-[#a9a3ff]/55"
          >
            <Minus className="size-4" aria-hidden="true" />
          </button>
          <output className="text-center" aria-live="polite">
            <span className="block text-2xl font-semibold tracking-[-0.04em] text-white">{boundedValue}</span>
            <span className="block text-[10px] text-[#7f8ba0]">{suffix}</span>
          </output>
          <button
            type="button"
            aria-label={`Increase ${label.toLocaleLowerCase()}`}
            disabled={boundedValue >= max}
            onClick={() => onChange(Math.min(max, boundedValue + 1))}
            className="grid size-11 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-[#c9d0dc] outline-none transition hover:bg-white/[0.09] disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-[#a9a3ff]/55"
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>
        {quickValues ? (
          <div className="mt-3 flex flex-wrap justify-center gap-1.5 border-t border-white/8 pt-3">
            {quickValues.map((quickValue) => (
              <button
                key={quickValue}
                type="button"
                aria-pressed={boundedValue === quickValue}
                onClick={() => onChange(quickValue)}
                className={cn(
                  "min-h-11 rounded-full px-3 text-[10px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-[#a9a3ff]/55",
                  boundedValue === quickValue
                    ? "bg-[#8176ff]/22 text-white"
                    : "bg-white/[0.045] text-[#8f9aae] hover:bg-white/[0.08]",
                )}
              >
                {quickValue} {suffix}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </fieldset>
  );
}

function SalaryControl({
  allowPrivate = false,
  label,
  max = 500_000,
  onChange,
  value,
}: {
  allowPrivate?: boolean;
  label: string;
  max?: number;
  onChange: (value: number) => void;
  value: number;
}) {
  const boundedValue = Math.min(max, Math.max(0, value));
  const privateValue = allowPrivate && boundedValue === 0;
  const display = privateValue ? "Not shared" : `$${Math.round(boundedValue / 1000)}k`;
  return (
    <fieldset className="rounded-[1rem] border border-white/10 bg-white/[0.035] p-3.5">
      <legend className="sr-only">{label}</legend>
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-semibold text-[#dce2ec]" aria-hidden="true">{label}</span>
        {allowPrivate ? (
          <button
            type="button"
            aria-pressed={privateValue}
            onClick={() => onChange(privateValue ? 80_000 : 0)}
            className={cn(
              "min-h-11 rounded-full px-2.5 text-[9px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-[#a9a3ff]/55",
              privateValue ? "bg-[#8176ff]/20 text-[#c7c2ff]" : "bg-white/[0.05] text-[#7f8ba0]",
            )}
          >
            Keep private
          </button>
        ) : null}
      </div>
      <output className="mt-2 block text-xl font-semibold tracking-[-0.04em] text-white" aria-live="polite">
        {display}
      </output>
      <input
        type="range"
        aria-label={label}
        disabled={privateValue}
        min={30_000}
        max={max}
        step={5_000}
        value={privateValue ? 30_000 : Math.max(30_000, boundedValue)}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 h-11 w-full cursor-pointer accent-[#8176ff] disabled:cursor-not-allowed disabled:opacity-25"
      />
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {[60_000, 80_000, 100_000, 125_000].map((amount) => (
          <button
            key={amount}
            type="button"
            aria-pressed={boundedValue === amount}
            onClick={() => onChange(amount)}
            className={cn(
              "min-h-11 rounded-full text-[9px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-[#a9a3ff]/55",
              boundedValue === amount
                ? "bg-[#8176ff]/22 text-white"
                : "bg-white/[0.045] text-[#7f8ba0] hover:bg-white/[0.08]",
            )}
          >
            ${amount / 1000}k
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function TokenEditor({
  addLabel,
  label,
  onChange,
  placeholder,
  suggestions = [],
  value,
}: {
  addLabel: string;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  suggestions?: readonly string[];
  value: string;
}) {
  const [draft, setDraft] = useState("");
  const items = normalizedLines(value);
  const addItem = (item: string) => {
    const next = normalizedLines([...items, item].join("\n"));
    if (next.length === items.length) return;
    onChange(next.join("\n"));
    setDraft("");
  };
  const removeItem = (item: string) => {
    onChange(items.filter((candidate) => candidate !== item).join("\n"));
  };

  return (
    <fieldset>
      <legend className="text-[11px] font-semibold text-[#dce2ec]">{label}</legend>
      {suggestions.length > 0 ? (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={items.some((item) => item.toLocaleLowerCase() === suggestion.toLocaleLowerCase())}
              onClick={() => addItem(suggestion)}
              className="min-h-11 shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 text-[10px] font-semibold text-[#9ca7b9] outline-none transition hover:bg-white/[0.08] disabled:cursor-default disabled:border-[#8176ff]/24 disabled:bg-[#8176ff]/10 disabled:text-[#aaa3ff] focus-visible:ring-2 focus-visible:ring-[#a9a3ff]/55"
            >
              <Plus className="mr-1 inline size-3" aria-hidden="true" /> {suggestion}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-2 rounded-[1rem] border border-white/10 bg-white/[0.035] p-2.5">
        {items.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {items.map((item) => (
              <span key={item} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[#8176ff]/24 bg-[#8176ff]/12 pl-3 text-[10px] font-semibold text-[#d3cfff]">
                {item}
                <button
                  type="button"
                  aria-label={`Remove ${item}`}
                  onClick={() => removeItem(item)}
                  className="grid size-11 place-items-center rounded-full outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#a9a3ff]/55"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== ",") return;
              event.preventDefault();
              addItem(draft);
            }}
            aria-label={addLabel}
            className="min-h-11 min-w-0 flex-1 bg-transparent px-2 text-[12px] text-white outline-none placeholder:text-[#5f6b80]"
            placeholder={placeholder}
          />
          <button
            type="button"
            disabled={!draft.trim()}
            onClick={() => addItem(draft)}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-white/[0.08] text-[#d8deea] outline-none transition hover:bg-white/[0.13] disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-[#a9a3ff]/55"
            aria-label={addLabel}
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </fieldset>
  );
}

function Field({
  children,
  hint,
  label,
}: {
  children: React.ReactNode;
  hint?: string;
  label: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-[#dce2ec]">{label}</span>
      {hint ? (
        <span className="ml-2 text-[10px] font-normal text-[#6f7c91]">{hint}</span>
      ) : null}
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

function StepHeader({
  description,
  headingRef,
  icon,
  title,
}: {
  description: string;
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div>
      <span className="grid size-11 place-items-center rounded-[1rem] border border-white/14 bg-white/[0.07] text-[#aaa3ff] shadow-[inset_0_1px_0_rgba(255,255,255,.14)]">
        {icon}
      </span>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-6 text-[2rem] font-semibold leading-[1.02] tracking-[-0.055em] text-white outline-none"
      >
        {title}
      </h1>
      <p className="mt-2 max-w-lg text-[12px] leading-5 text-[#9ca7b9]">
        {description}
      </p>
    </div>
  );
}

export function OnboardingWizard({
  alreadyCompleted,
  profile,
}: {
  alreadyCompleted: boolean;
  profile: OnboardingProfileValue;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [revision, setRevision] = useState(profile.revision);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [calibrationJobs, setCalibrationJobs] = useState<
    EnrichedJobCardViewModel[]
  >([]);
  const [calibrationIndex, setCalibrationIndex] = useState(0);
  const [calibrationDecisions, setCalibrationDecisions] = useState(0);
  const [calibrationLoadFailed, setCalibrationLoadFailed] = useState(false);
  const [calibrationFeedback, setCalibrationFeedback] =
    useState<CalibrationFeedbackPrompt | null>(null);
  const [feedbackPending, setFeedbackPending] = useState(false);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const hasMountedRef = useRef(false);
  const calibrationDecisionInFlightRef = useRef(false);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    stepHeadingRef.current?.focus();
  }, [step]);

  const [currentRole, setCurrentRole] = useState(profile.currentRole);
  const [currentSalary, setCurrentSalary] = useState(dollars(profile.currentSalaryCents));
  const [location, setLocation] = useState(profile.location ?? "");
  const [minimumSalary, setMinimumSalary] = useState(
    dollars(profile.preferredSalaryMinimumCents),
  );
  const [targetSalary, setTargetSalary] = useState(
    dollars(profile.preferredSalaryTargetCents),
  );
  const [roleTargets, setRoleTargets] = useState<RoleTargetValue[]>(
    profile.roleTargets,
  );
  const [yearsExperience, setYearsExperience] = useState(
    String(profile.yearsExperience),
  );
  const [workModes, setWorkModes] = useState<WorkMode[]>(
    profile.preferredWorkModes.length > 0
      ? profile.preferredWorkModes
      : ["remote", "hybrid"],
  );

  const [seniority, setSeniority] = useState<Seniority[]>(
    profile.desiredSeniorityLevels.length > 0
      ? profile.desiredSeniorityLevels
      : ["entry", "mid"],
  );
  const [employmentTypes, setEmploymentTypes] = useState<EmploymentType[]>(
    profile.acceptedEmploymentTypes.length > 0
      ? profile.acceptedEmploymentTypes
      : ["full_time"],
  );
  const [strictWorkModes, setStrictWorkModes] = useState(profile.strictWorkModes);
  const [workAuthorization, setWorkAuthorization] =
    useState<WorkAuthorization>(profile.workAuthorization);
  const [requiresSponsorship, setRequiresSponsorship] = useState<
    boolean | null
  >(profile.requiresSponsorship);
  const [missingSalaryPolicy, setMissingSalaryPolicy] =
    useState<MissingSalaryPolicy>(profile.missingSalaryPolicy);
  const [commuteRadiusMiles, setCommuteRadiusMiles] = useState(
    profile.commuteRadiusMiles ?? 35,
  );
  const [maxOfficeDaysPerWeek, setMaxOfficeDaysPerWeek] = useState(
    profile.maxOfficeDaysPerWeek ?? 2,
  );
  const [maxTravelPercent, setMaxTravelPercent] = useState(
    profile.maxTravelPercent ?? 25,
  );
  const [relocationDestinations, setRelocationDestinations] = useState(
    listText(profile.relocationDestinations),
  );
  const [excludedTitles, setExcludedTitles] = useState(
    listText(profile.excludedTitles),
  );
  const [excludedCompanies, setExcludedCompanies] = useState(
    listText(profile.excludedCompanies),
  );
  const [excludedIndustries, setExcludedIndustries] = useState(
    listText(profile.excludedIndustries),
  );
  const calibrationGoal = onboardingCalibrationGoal(calibrationJobs.length);
  const currentCalibrationJob =
    calibrationDecisions < calibrationGoal
      ? (calibrationJobs[calibrationIndex] ?? null)
      : null;
  const calibrationComplete =
    calibrationGoal === 0 || calibrationDecisions >= calibrationGoal;

  const saveDirection = async () => {
    setMessage(null);
    if (roleTargets.length < 2) {
      setMessage("Choose at least two role directions.");
      return;
    }
    if (workModes.length === 0) {
      setMessage("Choose at least one work mode.");
      return;
    }

    setPending(true);
    try {
      const formData = new FormData();
      formData.set("expectedRevision", String(revision));
      formData.set("currentRole", currentRole);
      formData.set("location", location);
      formData.set("relocationPreference", profile.relocationPreference ?? "");
      formData.set("currentSalaryCents", currentSalary);
      formData.set("preferredSalaryMinimumCents", minimumSalary);
      formData.set("preferredSalaryTargetCents", targetSalary);
      formData.set("yearsExperience", yearsExperience);
      for (const mode of workModes) formData.append("preferredWorkArrangements", mode);
      formData.set("preferredIndustries", listText(profile.preferredIndustries));
      formData.set(
        "targetRoleFamilies",
        listText(roleTargets.map((target) => target.label)),
      );
      formData.set("skills", listText(profile.skills));
      formData.set("strengths", listText(profile.strengths));
      formData.set("weaknesses", listText(profile.weaknesses));
      formData.set("interests", listText(profile.interests));
      formData.set("careerGoals", listText(profile.careerGoals));
      formData.set("dealBreakers", listText(profile.dealBreakers));
      formData.set("interviewConcerns", listText(profile.interviewConcerns));

      const result = await updateCandidateProfileAction(
        { message: "", ok: false },
        formData,
      );
      if (!result.ok) {
        setMessage(
          Object.values(result.fieldErrors ?? {}).flat()[0] ?? result.message,
        );
        return;
      }
      let nextRevision = result.revision ?? revision;
      const roleResult = await replaceCandidateRoleTargetsAction({
        expectedRevision: nextRevision,
        targets: roleTargets.map((target, index) => ({
          ...target,
          priorityRank: index + 1,
        })),
      });
      if (!roleResult.ok) {
        setMessage(
          Object.values(roleResult.fieldErrors ?? {}).flat()[0] ??
            roleResult.message,
        );
        return;
      }
      nextRevision = roleResult.revision ?? nextRevision;
      setRevision(nextRevision);
      setStep(2);
    } catch (error) {
      console.error("Unable to save onboarding direction", error);
      setMessage("We couldn't save those preferences. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  };

  const prepareCalibration = async () => {
    setMessage(null);
    if (seniority.length === 0) {
      setMessage("Choose at least one seniority level.");
      setStep(2);
      return;
    }
    if (employmentTypes.length === 0) {
      setMessage("Choose at least one employment type.");
      setStep(2);
      return;
    }

    setPending(true);
    try {
      const result = await updateCandidateSearchPreferencesAction({
        acceptedEmploymentTypes: employmentTypes,
        commuteRadiusMiles,
        desiredSeniorityLevels: seniority,
        excludedCompanies: normalizedLines(excludedCompanies),
        excludedIndustries: normalizedLines(excludedIndustries),
        excludedTitles: normalizedLines(excludedTitles),
        expectedRevision: revision,
        maxOfficeDaysPerWeek,
        maxTravelPercent,
        missingSalaryPolicy,
        preferredWorkModes: workModes,
        relocationDestinations: normalizedLines(relocationDestinations),
        requiresSponsorship,
        strictWorkModes,
        workAuthorization,
      });
      if (!result.ok) {
        setMessage(
          Object.values(result.fieldErrors ?? {}).flat()[0] ?? result.message,
        );
        return;
      }
      if (result.revision) setRevision(result.revision);
      setCalibrationIndex(0);
      setCalibrationDecisions(0);
      setCalibrationFeedback(null);
      setCalibrationLoadFailed(false);
      try {
        const page = await loadMoreDeckJobsAction({
          cursor: null,
          limit: ONBOARDING_CALIBRATION_PREFETCH,
        });
        setCalibrationJobs(eligibleOnboardingCalibrationJobs(page.jobs));
      } catch (error) {
        console.error("Unable to load onboarding calibration cards", error);
        setCalibrationJobs([]);
        setCalibrationLoadFailed(true);
      }
      setStep(4);
    } catch (error) {
      console.error("Unable to prepare onboarding calibration", error);
      setMessage("We couldn't save those limits. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  };

  const completeAndOpenFeed = async () => {
    setMessage(null);
    setPending(true);
    try {
      const completion = await completeOnboardingAction();
      if (!completion.ok) {
        setMessage(completion.message);
        return;
      }
      router.replace("/");
    } catch (error) {
      console.error("Unable to complete onboarding", error);
      setMessage("Setup is saved, but we couldn't open your feed. Try again.");
    } finally {
      setPending(false);
    }
  };

  const recordCalibrationDecision = async (
    decision: "saved" | "skipped",
  ) => {
    const job = currentCalibrationJob;
    if (!job || pending || calibrationDecisionInFlightRef.current) return;

    calibrationDecisionInFlightRef.current = true;
    setMessage(null);
    setCalibrationFeedback(null);
    setPending(true);
    // Reveal the next card immediately; if persistence fails, restore this one
    // at the same position with the user's choice still unsaved.
    setCalibrationIndex(calibrationIndex + 1);
    setCalibrationDecisions(calibrationDecisions + 1);
    try {
      const result = await decideJobAction(
        job.id,
        decision,
        job.currentDecision,
        job.currentDecisionEventId,
      );
      if (!result.ok) {
        setCalibrationIndex(calibrationIndex);
        setCalibrationDecisions(calibrationDecisions);
        setMessage(result.message);
        return;
      }

      const decisionEventId = result.value.decisionEventId;
      if (decisionEventId) {
        setCalibrationFeedback({
          decision,
          decisionEventId,
          jobId: job.id,
          title: job.title,
        });
      }
    } catch (error) {
      console.error("Unable to save onboarding calibration choice", error);
      setCalibrationIndex(calibrationIndex);
      setCalibrationDecisions(calibrationDecisions);
      setMessage("That choice didn't save. Check your connection and try again.");
    } finally {
      calibrationDecisionInFlightRef.current = false;
      setPending(false);
    }
  };

  const saveCalibrationFeedback = async (reason: JobDecisionReason) => {
    const prompt = calibrationFeedback;
    if (!prompt || feedbackPending) return;

    setFeedbackPending(true);
    try {
      const result = await annotateJobDecisionReasonsAction(
        prompt.jobId,
        prompt.decision,
        prompt.decisionEventId,
        [reason],
      );
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setCalibrationFeedback(null);
    } catch (error) {
      console.error("Unable to save onboarding calibration feedback", error);
      setMessage("That extra feedback didn't save. Your swipe is still safe.");
    } finally {
      setFeedbackPending(false);
    }
  };

  const inputClass =
    "min-h-12 w-full rounded-[.95rem] border border-white/10 bg-white/[0.055] px-3.5 text-[13px] text-white outline-none transition placeholder:text-[#5f6b80] focus:border-[#9187ff]/45 focus:bg-white/[0.075] focus:ring-2 focus:ring-[#8176ff]/15";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
      <header className="flex min-h-11 items-center justify-between gap-4">
        <p className="text-[12px] font-semibold text-[#e5e9f1]">JobSwipe setup</p>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (step === 4) void completeAndOpenFeed();
            else router.replace("/profile");
          }}
          className="min-h-11 rounded-full px-3 text-[11px] font-semibold text-[#8e99ab] outline-none hover:bg-white/[0.05] hover:text-white focus-visible:ring-2 focus-visible:ring-white/30"
        >
          {step === 4 ? "Skip calibration" : alreadyCompleted ? "Cancel" : "Not now"}
        </button>
      </header>

      <div className="mt-3 grid grid-cols-5 gap-1" aria-label={`Step ${step + 1} of 5`}>
        {[0, 1, 2, 3, 4].map((item) => (
          <span
            key={item}
            className={cn(
              "h-1 rounded-full transition-colors",
              item <= step ? "bg-[#8176ff]" : "bg-white/10",
            )}
            aria-hidden="true"
          />
        ))}
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        Step {step + 1} of 5: {STEP_TITLES[step]}
      </p>

      <main className="my-auto py-8">
        <section className="rounded-[1.75rem] border border-white/14 bg-[#0c1222]/82 p-5 shadow-[0_30px_90px_rgba(0,0,0,.38),inset_0_1px_0_rgba(255,255,255,.12)] backdrop-blur-2xl sm:p-7">
          {step === 0 ? (
            <div>
              <StepHeader
                headingRef={stepHeadingRef}
                icon={<Sparkles className="size-5" aria-hidden="true" />}
                title={alreadyCompleted ? "Tune your search" : "Set up a feed worth swiping"}
                description="A few short steps define what is allowed into your feed, then eight quick choices tune the order. You can change everything later."
              />
              <div className="mt-7 divide-y divide-white/9 border-y border-white/9">
                {[
                  [Target, "Ready now", "Direct roles that clear every hard filter"],
                  [Sparkles, "Stretch", "Plausible adjacent roles that need your judgment"],
                  [ShieldCheck, "Filtered", "Pay, location, seniority, or eligibility conflicts stay out"],
                ].map(([Icon, label, copy]) => {
                  const StepIcon = Icon as typeof Target;
                  return (
                    <div key={String(label)} className="flex items-start gap-3 py-4">
                      <StepIcon className="mt-0.5 size-4 shrink-0 text-[#aaa3ff]" aria-hidden="true" />
                      <div>
                        <p className="text-[12px] font-semibold text-[#e9edf4]">{String(label)}</p>
                        <p className="mt-0.5 text-[11px] leading-4 text-[#8f9aae]">{String(copy)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <details className="group mt-4 rounded-[1rem] border border-white/10 bg-white/[0.025]">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-[11px] font-semibold text-[#cbd2de] [&::-webkit-details-marker]:hidden">
                  Import a résumé first (optional)
                  <span className="text-[#7b879a] group-open:rotate-45" aria-hidden="true">+</span>
                </summary>
                <div className="border-t border-white/8 p-4">
                  <ResumeImportReview
                    initialDrafts={profile.resumeImportDrafts}
                    revision={revision}
                    onRevisionChange={setRevision}
                  />
                </div>
              </details>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-5 text-[13px] font-semibold text-[#111827] outline-none transition hover:bg-[#f0f2ff] focus-visible:ring-2 focus-visible:ring-white/50"
              >
                Start setup <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}

          {step === 1 ? (
            <div>
              <StepHeader
                headingRef={stepHeadingRef}
                icon={<Target className="size-5" aria-hidden="true" />}
                title="What should a good job look like?"
                description="Start with the role, market, and work setup. These shape most of your For You feed."
              />
              <div className="mt-7 space-y-5">
                <fieldset>
                  <legend className="text-[11px] font-semibold text-[#dce2ec]">Role directions</legend>
                  <p className="mt-1 text-[10px] leading-4 text-[#6f7c91]">Choose two or three to start. Ready now fills most of your feed; Stretch adds credible adjacent moves.</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {ROLE_DIRECTION_PRESETS.map((preset) => {
                      const selected = roleTargets.some(
                        (target) => target.canonicalFamily === preset.canonicalFamily,
                      );
                      return (
                        <button
                          key={preset.canonicalFamily}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            setMessage(null);
                            setRoleTargets((current) => {
                              if (current.some((target) => target.canonicalFamily === preset.canonicalFamily)) {
                                return current.length > 1
                                  ? current.filter((target) => target.canonicalFamily !== preset.canonicalFamily)
                                  : current;
                              }
                              return [
                                ...current,
                                {
                                  aliases: [...preset.aliases],
                                  allowedSeniorityLevels: ["entry", "mid"],
                                  canonicalFamily: preset.canonicalFamily,
                                  exclusions: ["Senior", "Staff", "Principal", "Manager", "Requires 4+ years"],
                                  label: preset.label,
                                  maximumRequiredExperienceYears: 3,
                                  minimumRequiredExperienceYears: 0,
                                  priorityRank: current.length + 1,
                                  readiness: preset.readiness,
                                },
                              ];
                            });
                          }}
                          className={cn(
                            "flex min-h-14 items-center justify-between gap-3 rounded-xl border px-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[#8176ff]/50",
                            selected
                              ? "border-[#8176ff]/35 bg-[#8176ff]/10 text-white"
                              : "border-white/9 bg-white/[0.025] text-[#9ba6b8] hover:bg-white/[0.05]",
                          )}
                        >
                          <span className="text-[10px] font-semibold leading-4">{preset.label}</span>
                          <span className="shrink-0 text-[8px] font-semibold uppercase tracking-[0.08em] text-[#8076ed]">
                            {preset.readiness === "ready_now" ? "Ready" : "Stretch"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Current role">
                    <div className="relative">
                      <BriefcaseBusiness className="pointer-events-none absolute left-3.5 top-4 size-4 text-[#6f7c91]" aria-hidden="true" />
                      <input
                        value={currentRole}
                        onChange={(event) => setCurrentRole(event.target.value)}
                        className={`${inputClass} pl-10`}
                        placeholder="Your current or latest title"
                        required
                      />
                    </div>
                  </Field>
                  <NumberStepper
                    label="Relevant experience"
                    min={0}
                    max={50}
                    quickValues={[0, 2, 5, 8]}
                    suffix="years"
                    value={numberValue(yearsExperience)}
                    onChange={(value) => setYearsExperience(String(value))}
                  />
                </div>
                <Field label="Home location" hint="used only for commute and location fit">
                  <div className="relative">
                    <MapPin className="pointer-events-none absolute left-3.5 top-4 size-4 text-[#6f7c91]" aria-hidden="true" />
                    <input value={location} onChange={(event) => setLocation(event.target.value)} className={`${inputClass} pl-10`} placeholder="Pittsburgh, PA" />
                  </div>
                </Field>
                <div className="-mt-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Suggested locations">
                  {[profile.location, ...LOCATION_SUGGESTIONS]
                    .filter((item): item is string => Boolean(item))
                    .filter((item, index, items) => items.indexOf(item) === index)
                    .map((item) => (
                      <button
                        key={item}
                        type="button"
                        aria-pressed={location === item}
                        onClick={() => setLocation(item)}
                        className={cn(
                          "min-h-11 shrink-0 rounded-full px-3 text-[9px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-[#a9a3ff]/55",
                          location === item
                            ? "bg-[#8176ff]/20 text-[#d3cfff]"
                            : "bg-white/[0.04] text-[#7f8ba0] hover:bg-white/[0.08]",
                        )}
                      >
                        {item}
                      </button>
                    ))}
                </div>
                <fieldset>
                  <legend className="text-[11px] font-semibold text-[#dce2ec]">Where would you work?</legend>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {WORK_MODE_OPTIONS.map((option) => (
                      <ChoiceChip key={option.value} checked={workModes.includes(option.value)} onClick={() => setWorkModes(toggleValue(workModes, option.value))}>
                        {option.value === "remote" ? <Laptop className="size-3.5" aria-hidden="true" /> : null}
                        {option.value === "hybrid" ? <Clock3 className="size-3.5" aria-hidden="true" /> : null}
                        {option.value === "on_site" ? <MapPin className="size-3.5" aria-hidden="true" /> : null}
                        {option.label}
                      </ChoiceChip>
                    ))}
                  </div>
                </fieldset>
                <div>
                  <div className="mb-2">
                    <p className="text-[11px] font-semibold text-[#dce2ec]">Compensation</p>
                    <p className="mt-0.5 text-[10px] leading-4 text-[#6f7c91]">Your minimum is a hard filter. Your ideal helps order the feed.</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <SalaryControl
                      allowPrivate
                      label="Current base"
                      value={numberValue(currentSalary)}
                      onChange={(value) => setCurrentSalary(String(value))}
                    />
                    <SalaryControl
                      label="Minimum base"
                      value={numberValue(minimumSalary)}
                      onChange={(value) => {
                        setMinimumSalary(String(value));
                        if (numberValue(targetSalary) < value) setTargetSalary(String(value));
                      }}
                    />
                    <SalaryControl
                      label="Ideal base"
                      value={numberValue(targetSalary)}
                      onChange={(value) => setTargetSalary(String(Math.max(value, numberValue(minimumSalary))))}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <StepHeader
                headingRef={stepHeadingRef}
                icon={<ShieldCheck className="size-5" aria-hidden="true" />}
                title="Set your hard limits"
                description="These decide what gets filtered out before ranking. Stretch roles cannot bypass them."
              />
              <div className="mt-7 space-y-6">
                <fieldset>
                  <legend className="text-[11px] font-semibold text-[#dce2ec]">Seniority you want to see</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {SENIORITY_OPTIONS.map((option) => (
                      <ChoiceChip key={option.value} checked={seniority.includes(option.value)} onClick={() => setSeniority(toggleValue(seniority, option.value))}>
                        {option.label}
                      </ChoiceChip>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="text-[11px] font-semibold text-[#dce2ec]">Employment types</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {EMPLOYMENT_OPTIONS.map((option) => (
                      <ChoiceChip key={option.value} checked={employmentTypes.includes(option.value)} onClick={() => setEmploymentTypes(toggleValue(employmentTypes, option.value))}>
                        {option.label}
                      </ChoiceChip>
                    ))}
                  </div>
                </fieldset>
                <ToggleRow
                  checked={strictWorkModes}
                  label="Work mode is non-negotiable"
                  description="Hide jobs outside the modes you selected"
                  onChange={setStrictWorkModes}
                />
                <fieldset>
                  <legend className="text-[11px] font-semibold text-[#dce2ec]">
                    Location limits
                  </legend>
                  <p className="mt-1 text-[10px] leading-4 text-[#6f7c91]">
                    These apply only when a listing requires an office.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <NumberStepper
                      label="Max commute"
                      min={0}
                      max={250}
                      quickValues={[0, 15, 35, 75]}
                      suffix="miles"
                      value={commuteRadiusMiles}
                      onChange={setCommuteRadiusMiles}
                    />
                    <NumberStepper
                      label="Office days"
                      min={0}
                      max={5}
                      quickValues={[0, 1, 2, 3, 5]}
                      suffix="per week"
                      value={maxOfficeDaysPerWeek}
                      onChange={setMaxOfficeDaysPerWeek}
                    />
                    <NumberStepper
                      label="Max travel"
                      min={0}
                      max={100}
                      quickValues={[0, 10, 25, 50]}
                      suffix="percent"
                      value={maxTravelPercent}
                      onChange={setMaxTravelPercent}
                    />
                  </div>
                  <div className="mt-4">
                    <TokenEditor
                      label="Places you would relocate to"
                      addLabel="Add relocation destination"
                      placeholder="City, state"
                      suggestions={LOCATION_SUGGESTIONS.filter(
                        (suggestion) => suggestion !== location,
                      )}
                      value={relocationDestinations}
                      onChange={setRelocationDestinations}
                    />
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="text-[11px] font-semibold text-[#dce2ec]">US work authorization</legend>
                  <div className="mt-2">
                    <OptionCards
                      name="US work authorization"
                      value={workAuthorization}
                      options={AUTHORIZATION_OPTIONS}
                      onChange={setWorkAuthorization}
                    />
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="text-[11px] font-semibold text-[#dce2ec]">Need employer sponsorship?</legend>
                  <div className="mt-2">
                    <OptionCards
                      columns={3}
                      name="Employer sponsorship requirement"
                      value={requiresSponsorship === null ? "unknown" : requiresSponsorship ? "yes" : "no"}
                      options={[
                        { label: "No", description: "No sponsorship needed", value: "no" },
                        { label: "Yes", description: "Employer must sponsor", value: "yes" },
                        { label: "Keep private", description: "Do not filter on this", value: "unknown" },
                      ] as const}
                      onChange={(value) => setRequiresSponsorship(value === "unknown" ? null : value === "yes")}
                    />
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="text-[11px] font-semibold text-[#dce2ec]">When salary is missing</legend>
                  <div className="mt-2">
                    <OptionCards
                      columns={3}
                      name="Missing salary policy"
                      value={missingSalaryPolicy}
                      options={[
                        { label: "Credible Stretch", description: "Show it only as a clearly labeled stretch", value: "explore_only" },
                        { label: "Show it", description: "Let ranking decide", value: "show" },
                        { label: "Hide it", description: "Salary must be listed", value: "hide" },
                      ] as const}
                      onChange={setMissingSalaryPolicy}
                    />
                  </div>
                </fieldset>
                <details className="group rounded-[1rem] border border-white/10 bg-white/[0.035]">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-[11px] font-semibold text-[#cbd2de] outline-none focus-visible:ring-2 focus-visible:ring-[#8176ff]/40 [&::-webkit-details-marker]:hidden">
                    Optional exclusions
                    <span className="text-[#6e7a8f] group-open:rotate-45" aria-hidden="true">+</span>
                  </summary>
                  <div className="space-y-4 border-t border-white/8 p-4">
                    <TokenEditor
                      label="Titles to hide"
                      addLabel="Add excluded title"
                      placeholder="Add a title"
                      value={excludedTitles}
                      onChange={setExcludedTitles}
                    />
                    <TokenEditor
                      label="Companies to hide"
                      addLabel="Add excluded company"
                      placeholder="Add a company"
                      value={excludedCompanies}
                      onChange={setExcludedCompanies}
                    />
                    <TokenEditor
                      label="Industries to hide"
                      addLabel="Add excluded industry"
                      placeholder="Add an industry"
                      value={excludedIndustries}
                      onChange={setExcludedIndustries}
                    />
                  </div>
                </details>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div>
              <StepHeader
                headingRef={stepHeadingRef}
                icon={<BriefcaseBusiness className="size-5" aria-hidden="true" />}
                title="Your feed has rules now"
                description="JobSwipe will qualify first, rank second, and learn from your swipes without weakening your hard limits."
              />
              <div className="mt-7 divide-y divide-white/9 border-y border-white/9">
                <div className="flex items-start gap-3 py-4">
                  <Target className="mt-0.5 size-4 shrink-0 text-[#71d7ad]" aria-hidden="true" />
                  <div>
                    <p className="text-[11px] font-semibold text-[#dfe5ee]">Target roles</p>
                    <p className="mt-1 text-[11px] leading-4 text-[#8f9aae]">{roleTargets.slice(0, 4).map((target) => target.label).join(" · ")}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 py-4">
                  <CircleDollarSign className="mt-0.5 size-4 shrink-0 text-[#71d7ad]" aria-hidden="true" />
                  <div>
                    <p className="text-[11px] font-semibold text-[#dfe5ee]">Pay floor</p>
                    <p className="mt-1 text-[11px] leading-4 text-[#8f9aae]">${Number(minimumSalary || 0).toLocaleString()} base · missing salary: {missingSalaryPolicy === "explore_only" ? "Credible Stretch" : missingSalaryPolicy}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 py-4">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#71d7ad]" aria-hidden="true" />
                  <div>
                    <p className="text-[11px] font-semibold text-[#dfe5ee]">Hard filters</p>
                    <p className="mt-1 text-[11px] leading-4 text-[#8f9aae]">
                      {selectedLabels(seniority, SENIORITY_OPTIONS)} · {selectedLabels(workModes, WORK_MODE_OPTIONS)}
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => void prepareCalibration()}
                className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-5 text-[13px] font-semibold text-[#111827] outline-none transition hover:bg-[#f0f2ff] disabled:cursor-wait disabled:opacity-55 focus-visible:ring-2 focus-visible:ring-white/50"
              >
                {pending ? "Finding qualified roles…" : "Save and calibrate"}
                {!pending ? <ArrowRight className="size-4" aria-hidden="true" /> : null}
              </button>
            </div>
          ) : null}

          {step === 4 ? (
            <div>
              <StepHeader
                headingRef={stepHeadingRef}
                icon={<Sparkles className="size-5" aria-hidden="true" />}
                title={calibrationComplete ? "Your feed is ready" : "Teach the feed your taste"}
                description={
                  calibrationComplete
                    ? "Your hard limits stay fixed. These choices only help order the qualified roles that remain."
                    : "Make eight quick choices. Pass or save—the next card appears immediately, and reasons are always optional."
                }
              />

              {calibrationGoal > 0 ? (
                <div className="mt-6" aria-label={`${calibrationDecisions} of ${calibrationGoal} calibration choices complete`}>
                  <div className="flex items-center justify-between gap-3 text-[10px] font-semibold text-[#8f9aae]">
                    <span>Quick calibration</span>
                    <span>{Math.min(calibrationDecisions, calibrationGoal)} / {calibrationGoal}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <span
                      className="block h-full rounded-full bg-[linear-gradient(90deg,#8176ff,#70d8b0)] transition-[width] duration-300"
                      style={{
                        width: `${Math.round((Math.min(calibrationDecisions, calibrationGoal) / calibrationGoal) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ) : null}

              {calibrationFeedback ? (
                <aside className="mt-4 rounded-[1rem] border border-white/10 bg-white/[0.045] p-3.5" aria-label="Optional swipe feedback">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold text-[#e1e6ef]">
                        {calibrationFeedback.decision === "saved" ? "What stood out?" : "What was off?"}
                      </p>
                      <p className="mt-0.5 text-[9px] leading-4 text-[#77849a]">Optional · the next card is already ready</p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Dismiss feedback for ${calibrationFeedback.title}`}
                      onClick={() => setCalibrationFeedback(null)}
                      className="grid size-11 shrink-0 place-items-center rounded-full text-[#7f8ba0] outline-none hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-white/30"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {(calibrationFeedback.decision === "saved"
                      ? CALIBRATION_SAVE_REASONS
                      : CALIBRATION_PASS_REASONS
                    ).map((reason) => (
                      <button
                        key={reason.code}
                        type="button"
                        disabled={feedbackPending}
                        onClick={() => void saveCalibrationFeedback(reason.code)}
                        className="min-h-11 shrink-0 rounded-full border border-white/10 bg-white/[0.045] px-3.5 text-[10px] font-semibold text-[#b9c2d0] outline-none transition hover:border-[#8176ff]/32 hover:bg-[#8176ff]/12 hover:text-white disabled:cursor-wait disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[#a9a3ff]/55"
                      >
                        {reason.label}
                      </button>
                    ))}
                  </div>
                </aside>
              ) : null}

              {currentCalibrationJob ? (
                <div className="mt-4">
                  <article
                    key={currentCalibrationJob.id}
                    aria-label={`${currentCalibrationJob.title} at ${currentCalibrationJob.company}`}
                    className="overflow-hidden rounded-[1.35rem] border border-white/14 bg-[linear-gradient(145deg,rgba(27,35,54,.94),rgba(10,16,29,.94))] shadow-[0_24px_65px_rgba(0,0,0,.28),inset_0_1px_0_rgba(255,255,255,.1)]"
                  >
                    <div className="border-b border-white/9 bg-[radial-gradient(circle_at_20%_0%,rgba(129,118,255,.2),transparent_55%)] px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-[#bdb7ff]">
                          {calibrationTierLabel(currentCalibrationJob)}
                        </span>
                        <span className="text-[9px] font-medium text-[#7f8ba0]">
                          {currentCalibrationJob.evidenceConfidence} evidence
                        </span>
                      </div>
                      <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#8f9aae]">
                        {currentCalibrationJob.company}
                      </p>
                      <h2 className="mt-1 text-[clamp(1.45rem,7vw,2rem)] font-semibold leading-[1.03] tracking-[-0.045em] text-white">
                        {currentCalibrationJob.title}
                      </h2>
                    </div>
                    <div className="p-4">
                      <p className="text-xl font-semibold tracking-[-0.035em] text-white">
                        {currentCalibrationJob.salaryDisplay}
                      </p>
                      <p className="mt-1 text-[9px] font-medium text-[#77849a]">
                        {currentCalibrationJob.salarySource === "employer_posted" ? "Employer posted" : "Clearly labeled estimate"}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-medium text-[#b7c0cf]">
                        <span className="rounded-full border border-white/9 bg-white/[0.035] px-3 py-2">{currentCalibrationJob.location}</span>
                        <span className="rounded-full border border-white/9 bg-white/[0.035] px-3 py-2">{currentCalibrationJob.workArrangement}</span>
                      </div>
                      <dl className="mt-4 divide-y divide-white/9 border-y border-white/9">
                        <div className="py-3">
                          <dt className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#70d8b0]">Why it fits</dt>
                          <dd className="mt-1 text-[11px] leading-5 text-[#c3cbd8]">{currentCalibrationJob.whyItFits}</dd>
                        </div>
                        <div className="py-3">
                          <dt className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#aaa3ff]">What to verify</dt>
                          <dd className="mt-1 text-[11px] leading-5 text-[#9ca7b9]">{currentCalibrationJob.biggestRisk}</dd>
                        </div>
                      </dl>
                    </div>
                  </article>

                  <div className="mt-3 grid grid-cols-2 gap-2" aria-busy={pending}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => void recordCalibrationDecision("skipped")}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.045] px-4 text-[12px] font-semibold text-[#d4dae4] outline-none transition hover:bg-white/[0.08] disabled:cursor-wait disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-white/35"
                    >
                      <ThumbsDown className="size-4" aria-hidden="true" /> Pass
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => void recordCalibrationDecision("saved")}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-4 text-[12px] font-semibold text-[#111827] outline-none transition hover:bg-[#f0f2ff] disabled:cursor-wait disabled:opacity-55 focus-visible:ring-2 focus-visible:ring-white/55"
                    >
                      <ThumbsUp className="size-4" aria-hidden="true" /> Save
                    </button>
                  </div>
                  <p className="mt-3 text-center text-[9px] leading-4 text-[#657287]">
                    Both choices teach role taste. Neither can weaken pay, location, eligibility, or seniority limits.
                  </p>
                </div>
              ) : null}

              {calibrationComplete ? (
                <div className="mt-5 rounded-[1.15rem] border border-white/10 bg-white/[0.035] p-4 text-center">
                  <p className="text-[13px] font-semibold text-white">
                    {calibrationDecisions > 0
                      ? `${calibrationDecisions} choices saved`
                      : calibrationLoadFailed
                        ? "Calibration can wait"
                        : "No qualified cards are waiting"}
                  </p>
                  <p className="mx-auto mt-1.5 max-w-sm text-[10px] leading-4 text-[#8995a9]">
                    {calibrationDecisions > 0
                      ? "Your first queue is tuned and your hard filters are unchanged."
                      : "Your search contract is saved. You can start now and calibrate naturally as new roles arrive."}
                  </p>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void completeAndOpenFeed()}
                    className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-5 text-[13px] font-semibold text-[#111827] outline-none transition hover:bg-[#f0f2ff] disabled:cursor-wait disabled:opacity-55 focus-visible:ring-2 focus-visible:ring-white/50"
                  >
                    {pending ? "Opening your feed…" : "Open For You"}
                    {!pending ? <ArrowRight className="size-4" aria-hidden="true" /> : null}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {message ? (
            <p role="alert" className="mt-5 rounded-[.9rem] border border-[#e36b7b]/20 bg-[#e36b7b]/10 px-3.5 py-3 text-[11px] leading-4 text-[#f2a9b5]">
              {message}
            </p>
          ) : null}

          {step > 0 && step < 3 ? (
            <div className="mt-7 flex items-center gap-2 border-t border-white/9 pt-5">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setMessage(null);
                  setStep((current) => Math.max(0, current - 1));
                }}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/10 px-4 text-[11px] font-semibold text-[#aeb8c9] outline-none hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-white/30"
              >
                <ArrowLeft className="size-3.5" aria-hidden="true" /> Back
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (step === 1) void saveDirection();
                  else {
                    setMessage(null);
                    setStep(3);
                  }
                }}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[#8176ff] px-4 text-[12px] font-semibold text-white outline-none hover:bg-[#7165f2] disabled:cursor-wait disabled:opacity-55 focus-visible:ring-2 focus-visible:ring-[#aaa3ff]/55"
              >
                {pending ? "Saving…" : "Continue"}
                {!pending ? <ArrowRight className="size-3.5" aria-hidden="true" /> : null}
              </button>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
