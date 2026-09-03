"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowUpRight,
  BookmarkCheck,
  CalendarPlus,
  CalendarClock,
  Check,
  ChevronDown,
  GitCompareArrows,
  LoaderCircle,
  Mail,
  MoreHorizontal,
  RotateCcw,
  Search,
  SlidersHorizontal,
  StickyNote,
  X,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  addJobNoteAction,
  restoreJobToDeckAction,
  updateJobStatusAction,
} from "@/features/jobs/actions";
import { CompanyMark } from "@/features/jobs/components/company-mark";
import { companyVisual } from "@/features/jobs/components/company-visual";
import { saveJobFeedSnapshot } from "@/features/jobs/feed-snapshot";
import type {
  JobCardDecision,
  JobCardViewModel,
} from "@/features/jobs/components/job-card";
import { cn } from "@/lib/utils";
import { saveApplicationDetailsAction } from "@/features/product/actions";
import {
  buildApplicationWorkspace,
  calendarFileForApplication,
  suggestedFollowUpDate,
} from "@/features/jobs/application-workspace";

export type ApplicationDetailsView = {
  applicationDeadline: string | null;
  contactEmail: string | null;
  contactName: string | null;
  createdAt: string;
  followUpAt: string | null;
  jobListingId: string;
  nextStep: string | null;
  resumeLabel: string | null;
  updatedAt: string;
  visitorId: string;
};

const NEXT_STEP_PRESETS = [
  "Tailor résumé",
  "Ask for a referral",
  "Submit application",
  "Follow up",
  "Prepare for interview",
] as const;
const FOLLOW_UP_PRESETS = [
  { days: 1, label: "Tomorrow" },
  { days: 3, label: "3 days" },
  { days: 7, label: "1 week" },
] as const;
const INITIAL_VISIBLE_JOB_COUNT = 40;

const PIPELINE_STATUSES = [
  "saved",
  "stretch",
  "learn_first",
  "apply",
  "applied",
  "interview",
  "offer",
  "rejected",
  "archived",
] as const satisfies readonly JobCardDecision[];

type PipelineStatus = (typeof PIPELINE_STATUSES)[number];
type StatusFilter =
  | "all"
  | "shortlist"
  | "learning"
  | "applications"
  | "interviews"
  | "offers"
  | "closed";
type SortKey = "fit" | "career" | "salary" | "stretch" | "company";

const STATUS_FILTER_OPTIONS = [
  { label: "Everything", value: "all" },
  { label: "Saved", value: "shortlist" },
  { label: "Learning", value: "learning" },
  { label: "Applying", value: "applications" },
  { label: "Interviews", value: "interviews" },
  { label: "Offers", value: "offers" },
  { label: "Closed", value: "closed" },
] as const satisfies readonly { label: string; value: StatusFilter }[];

const ARRANGEMENT_FILTER_OPTIONS = [
  { label: "Any", value: "all" },
  { label: "Remote", value: "Remote" },
  { label: "Hybrid", value: "Hybrid" },
  { label: "On-site", value: "On-site" },
  { label: "Not listed", value: "Unclear" },
] as const;

const SORT_OPTIONS = [
  { label: "Recommended", value: "fit" },
  { label: "Career upside", value: "career" },
  { label: "Highest salary", value: "salary" },
  { label: "Most realistic", value: "stretch" },
  { label: "Company A–Z", value: "company" },
] as const satisfies readonly { label: string; value: SortKey }[];

const STATUS_META: Record<PipelineStatus, { label: string }> = {
  saved: { label: "Saved" },
  stretch: { label: "Stretch" },
  learn_first: { label: "Learn first" },
  apply: { label: "Planning to apply" },
  applied: { label: "Applied" },
  interview: { label: "Interview" },
  offer: { label: "Offer" },
  rejected: { label: "Closed" },
  archived: { label: "Archived" },
};

const DISPOSITION_META: Record<
  JobCardViewModel["verdict"],
  { label: string; tone: string }
> = {
  "Strong Apply": {
    label: "Strong opportunity",
    tone: "text-[#65d7aa]",
  },
  Apply: {
    label: "Worth applying",
    tone: "text-[#65d7aa]",
  },
  "Apply as a Stretch": {
    label: "Credible stretch",
    tone: "text-[#a49cff]",
  },
  "Save for Later": {
    label: "Keep watching",
    tone: "text-[#b3bdd0]",
  },
  "Learn First": {
    label: "Skill sprint first",
    tone: "text-[#e5b96b]",
  },
  Skip: {
    label: "Low priority",
    tone: "text-[#ed8f9e]",
  },
};

function isPipelineStatus(decision: JobCardDecision): decision is PipelineStatus {
  return PIPELINE_STATUSES.includes(decision as PipelineStatus);
}

function statusMatches(decision: PipelineStatus, filter: StatusFilter) {
  if (filter === "all") return true;
  if (filter === "shortlist") return decision === "saved" || decision === "stretch";
  if (filter === "learning") return decision === "learn_first";
  if (filter === "applications") {
    return ["apply", "applied", "interview", "offer"].includes(decision);
  }
  if (filter === "interviews") return decision === "interview";
  if (filter === "offers") return decision === "offer";
  return decision === "rejected" || decision === "archived";
}

function compareJobs(left: JobCardViewModel, right: JobCardViewModel, sort: SortKey) {
  if (sort === "fit") return right.deterministicFitScore - left.deterministicFitScore;
  if (sort === "career") return right.careerValueScore - left.careerValueScore;
  if (sort === "stretch") return left.stretchScore - right.stretchScore;
  if (sort === "salary") {
    return (right.annualSalaryEstimateCents ?? -1) - (left.annualSalaryEstimateCents ?? -1);
  }
  return left.company.localeCompare(right.company) || left.title.localeCompare(right.title);
}

function evidenceBackedOpportunity(job: JobCardViewModel) {
  const opportunity = job.decisionBrief?.opportunity.trim();
  const opportunitySegments = opportunity
    ?.split(/\s*·\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const isOnlyWorkMode =
    opportunitySegments &&
    opportunitySegments.length > 0 &&
    opportunitySegments.every((segment) =>
      /^(?:remote|hybrid|on[- ]site)\b.*\b(?:preferred|setup|arrangement)\b/i.test(
        segment,
      ),
    );

  return !opportunity || isOnlyWorkMode
    ? job.decisionBrief?.edge ?? job.strongestMatches[0] ?? job.reasonsToApply[0]
    : opportunity;
}

function decisionBrief(job: JobCardViewModel) {
  const cautionFirst =
    job.verdict === "Skip" ||
    job.verdict === "Learn First" ||
    job.readiness === "Not Yet Efficient";
  const primary = cautionFirst
    ? job.decisionBrief?.risk ?? job.biggestGaps[0] ?? job.reasonsNotToApply[0]
    : evidenceBackedOpportunity(job);

  return primary?.trim() || job.verdictExplanation.trim();
}

function dateInputValue(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function dateTimeInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function ApplicationDetailsEditor({
  initialValue,
  jobId,
  jobTitle,
  company,
  sourceUrl,
  onSaved,
}: {
  initialValue: ApplicationDetailsView | null;
  jobId: string;
  jobTitle: string;
  company: string;
  sourceUrl: string | null;
  onSaved: (value: ApplicationDetailsView) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [deadline, setDeadline] = useState(dateInputValue(initialValue?.applicationDeadline ?? null));
  const [followUpAt, setFollowUpAt] = useState(dateTimeInputValue(initialValue?.followUpAt ?? null));
  const [contactName, setContactName] = useState(initialValue?.contactName ?? "");
  const [contactEmail, setContactEmail] = useState(initialValue?.contactEmail ?? "");
  const [resumeLabel, setResumeLabel] = useState(initialValue?.resumeLabel ?? "");
  const [nextStep, setNextStep] = useState(initialValue?.nextStep ?? "");

  const inputClass =
    "h-11 w-full rounded-xl border border-white/10 bg-white/[0.045] px-3 text-base text-[#e9edf4] outline-none placeholder:text-[#69758a] focus:border-[#8176ff]/45 focus:ring-2 focus:ring-[#8176ff]/18 sm:text-sm";

  function setFollowUpDays(days: number) {
    const date = suggestedFollowUpDate(days);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    setFollowUpAt(local.toISOString().slice(0, 16));
  }

  function downloadCalendar() {
    const calendar = calendarFileForApplication({
      company,
      deadline: deadline || null,
      followUpAt: followUpAt ? new Date(followUpAt).toISOString() : null,
      jobTitle,
      nextStep: nextStep || null,
      sourceUrl,
    });
    if (!calendar) {
      setMessage("Add an apply-by date or follow-up first.");
      return;
    }
    const url = URL.createObjectURL(new Blob([calendar], { type: "text/calendar" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${company}-${jobTitle}-follow-up`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") + ".ics";
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("Calendar reminder downloaded.");
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      try {
        const localFollowUp = followUpAt ? new Date(followUpAt).toISOString() : null;
        const result = await saveApplicationDetailsAction({
          applicationDeadline: deadline || null,
          contactEmail: contactEmail || null,
          contactName: contactName || null,
          followUpAt: localFollowUp,
          jobListingId: jobId,
          nextStep: nextStep || null,
          resumeLabel: resumeLabel || null,
        });
        if (!result.ok) {
          setMessage(result.message);
          return;
        }
        const now = new Date().toISOString();
        onSaved({
          applicationDeadline: deadline ? `${deadline}T12:00:00.000Z` : null,
          contactEmail: contactEmail || null,
          contactName: contactName || null,
          createdAt: initialValue?.createdAt ?? now,
          followUpAt: localFollowUp,
          jobListingId: jobId,
          nextStep: nextStep || null,
          resumeLabel: resumeLabel || null,
          updatedAt: now,
          visitorId: initialValue?.visitorId ?? "current",
        });
        setMessage(result.message);
      } catch {
        setMessage("The plan could not be saved. Your edits are still here.");
      }
    });
  }

  return (
    <div className="rounded-[1rem] border border-white/[0.09] bg-black/[0.1] p-3.5">
      <div className="flex items-center gap-2">
        <CalendarClock className="size-4 text-[#a49cff]" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-[#e7ebf3]">Application plan</h3>
      </div>
      <p className="mt-1 text-[11px] leading-5 text-[#7f8ba1]">Keep the next action for {jobTitle} visible.</p>
      <fieldset disabled={pending} className="mt-3 grid gap-3 disabled:opacity-65 sm:grid-cols-2">
        <label className="text-xs font-medium text-[#8e99ac]">
          Apply by
          <input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} className={`${inputClass} mt-1`} />
        </label>
        <div>
          <label className="text-xs font-medium text-[#8e99ac]">
            Follow up
            <input type="datetime-local" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} className={`${inputClass} mt-1`} />
          </label>
          <div className="mt-1.5 flex gap-1.5" aria-label="Quick follow-up times">
            {FOLLOW_UP_PRESETS.map((preset) => (
              <button key={preset.label} type="button" onClick={() => setFollowUpDays(preset.days)} className="min-h-11 rounded-lg border border-white/[0.08] px-3 text-[11px] font-semibold text-[#98a4b8] hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8176ff]/35">
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <label className="text-xs font-medium text-[#8e99ac]">
          Contact
          <input value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="Name" className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs font-medium text-[#8e99ac]">
          Contact email
          <input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder="name@company.com" className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs font-medium text-[#8e99ac] sm:col-span-2">
          Résumé version
          <input value={resumeLabel} onChange={(event) => setResumeLabel(event.target.value)} placeholder="Primary résumé" className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs font-medium text-[#8e99ac] sm:col-span-2">
          Next step
          <input value={nextStep} onChange={(event) => setNextStep(event.target.value)} placeholder="Ask Jordan for a referral" className={`${inputClass} mt-1`} />
        </label>
        <div className="flex flex-wrap gap-1.5 sm:col-span-2" aria-label="Suggested next steps">
          {NEXT_STEP_PRESETS.map((preset) => (
            <button key={preset} type="button" onClick={() => setNextStep(preset)} className="min-h-11 rounded-full border border-white/[0.08] bg-white/[0.025] px-3.5 text-[11px] font-semibold text-[#98a4b8] hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8176ff]/35">
              {preset}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" className="h-11" disabled={pending} onClick={save}>
          {pending ? <LoaderCircle className="animate-spin" /> : <Check />}
          Save plan
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-11 border-white/10 bg-white/[0.04] text-[#aab4c6]" disabled={pending} onClick={downloadCalendar}>
          <CalendarPlus /> Add to calendar
        </Button>
        {contactEmail ? (
          <a href={`mailto:${contactEmail}?subject=${encodeURIComponent(`${jobTitle} at ${company}`)}`} className="inline-flex h-11 items-center gap-2 rounded-lg px-3 text-[11px] font-semibold text-[#aaa3ff] outline-none hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-[#8176ff]/35">
            <Mail className="size-3.5" aria-hidden="true" /> Email contact
          </a>
        ) : null}
        {message ? <p role="status" className="w-full text-[11px] text-[#91a0b6]">{message}</p> : null}
      </div>
    </div>
  );
}

function displayLocation(job: JobCardViewModel) {
  const arrangement = job.workArrangement.toLocaleLowerCase("en-US");
  const locationParts = job.location
    .split(/\s*(?:·|—|\|)\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part.toLocaleLowerCase("en-US") !== arrangement);
  const location = locationParts.join(" — ") || job.location;

  return job.workArrangement === "Unclear"
    ? location
    : `${location} · ${job.workArrangement}`;
}

function careerValueLabel(score: number) {
  if (score >= 7.5) return "High career upside";
  if (score >= 6) return "Solid career upside";
  if (score >= 4.5) return "Moderate career upside";
  return "Limited career upside";
}

function FilterChoice({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "saved-filter-choice relative inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold outline-none transition-[color,background-color,border-color,box-shadow,transform] duration-200 focus-visible:ring-3 focus-visible:ring-[#8176ff]/25 active:scale-[0.98]",
        active
          ? "border-[#9a91ff]/35 bg-[#8176ff]/16 text-[#f4f2ff] shadow-[inset_0_1px_0_rgba(255,255,255,.14),0_7px_20px_rgba(62,51,144,.16)]"
          : "border-white/[0.08] bg-white/[0.035] text-[#96a1b5] hover:border-white/[0.14] hover:bg-white/[0.07] hover:text-[#e5e9f2]",
      )}
    >
      {active ? <Check className="size-3.5 text-[#aaa3ff]" aria-hidden="true" /> : null}
      {label}
    </button>
  );
}

function ComparisonPanel({
  jobs,
  onClear,
  onRemove,
}: {
  jobs: JobCardViewModel[];
  onClear: () => void;
  onRemove: (jobId: string) => void;
}) {
  if (jobs.length < 2) return null;

  return (
    <section
      className="glass-dark mb-4 overflow-hidden rounded-[1.25rem] text-white"
      aria-label="Job comparison"
    >
      <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-3.5 sm:px-5">
        <GitCompareArrows className="size-4 text-[#a9a4ff]" aria-hidden="true" />
        <h2 className="text-sm font-semibold">Compare</h2>
        <span className="text-xs text-white/48">{jobs.length} roles</span>
        <button
          type="button"
          onClick={onClear}
          className="ml-auto rounded-md px-2.5 py-1 text-xs font-medium text-white/58 transition hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
        >
          Clear
        </button>
      </div>
      <div className="overflow-x-auto overscroll-x-contain">
        <div
          className="grid min-w-max divide-x divide-white/10"
          style={{ gridTemplateColumns: `repeat(${jobs.length}, minmax(16rem, 1fr))` }}
        >
          {jobs.map((job) => {
            const disposition = DISPOSITION_META[job.verdict];
            return (
              <div key={job.id} className="relative p-4 sm:p-5">
                <button
                  type="button"
                  onClick={() => onRemove(job.id)}
                  aria-label={`Remove ${job.title} from comparison`}
                  className="absolute right-2 top-2 grid size-11 place-items-center rounded-full bg-white/8 text-white/55 transition hover:bg-white/14 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
                <p className="pr-12 text-xs font-medium text-white/52">{job.company}</p>
                <h3 className="mt-1 line-clamp-2 min-h-10 text-sm font-semibold leading-5">
                  {job.title}
                </h3>
                <span className="mt-3 inline-flex text-[11px] font-medium text-white/70">
                  {disposition.label}
                </span>
                <dl className="mt-5 space-y-4 text-xs">
                  <div>
                    <dt className="text-white/42">Compensation</dt>
                    <dd className="mt-1 font-medium text-white/88">{job.salaryDisplay}</dd>
                  </div>
                  <div>
                    <dt className="text-white/42">Work</dt>
                    <dd className="mt-1 line-clamp-2 font-medium text-white/82">
                      {displayLocation(job)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-white/42">Readiness</dt>
                    <dd className="mt-1 font-medium text-white/82">{job.readiness}</dd>
                  </div>
                  <div>
                    <dt className="text-white/42">Trajectory</dt>
                    <dd className="mt-1 font-medium text-white/82">
                      {careerValueLabel(job.careerValueScore)}
                    </dd>
                  </div>
                  <div className="border-t border-white/10 pt-4">
                    <dt className="text-white/42">Best case</dt>
                    <dd className="mt-1 line-clamp-3 leading-5 text-white/76">
                      {evidenceBackedOpportunity(job)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-white/42">Main risk</dt>
                    <dd className="mt-1 line-clamp-3 leading-5 text-white/76">
                      {job.decisionBrief?.risk ??
                        job.biggestGaps[0] ??
                        job.reasonsNotToApply[0]}
                    </dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ApplicationCommandCenter({
  view,
  onFilter,
  onOpenJob,
}: {
  view: ReturnType<typeof buildApplicationWorkspace>;
  onFilter: (filter: StatusFilter) => void;
  onOpenJob: (jobId: string) => void;
}) {
  const pipeline = [
    { count: view.counts.shortlist, filter: "shortlist", label: "Shortlist" },
    { count: view.counts.applying, filter: "applications", label: "Applying" },
    { count: view.counts.interviews, filter: "interviews", label: "Interviews" },
    { count: view.counts.offers, filter: "offers", label: "Offers" },
  ] as const;
  const visibleActions = view.actions.slice(0, 4);

  return (
    <section className="saved-action-center mb-4 overflow-hidden rounded-[1.25rem] border border-white/[0.1] bg-[linear-gradient(145deg,rgba(27,34,51,.9),rgba(13,18,30,.94))] shadow-[0_20px_60px_rgba(0,3,12,.26),inset_0_1px_0_rgba(255,255,255,.08)]">
      <div className="flex items-start justify-between gap-4 px-4 pb-3 pt-4 sm:px-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#8d98ac]">
            Next up
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#f5f7fb]">
            {view.urgentCount > 0
              ? `${view.urgentCount} ${view.urgentCount === 1 ? "action needs" : "actions need"} you`
              : "Your search is under control"}
          </h2>
        </div>
        {view.actions.length > visibleActions.length ? (
          <span className="shrink-0 rounded-full border border-white/[0.08] px-2.5 py-1 text-[10px] font-semibold text-[#8f9aae]">
            +{view.actions.length - visibleActions.length} later
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-4 border-y border-white/[0.07] bg-black/[0.1]">
        {pipeline.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => onFilter(item.filter)}
            className="min-h-[4.25rem] border-r border-white/[0.07] px-1.5 text-center outline-none last:border-r-0 hover:bg-white/[0.045] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8176ff]/40"
            aria-label={`Show ${item.count} ${item.label.toLowerCase()} jobs`}
          >
            <span className="block text-lg font-semibold tabular-nums text-[#f3f5fa]">{item.count}</span>
            <span className="mt-0.5 block text-[10px] font-medium text-[#7f8a9d]">{item.label}</span>
          </button>
        ))}
      </div>

      {visibleActions.length > 0 ? (
        <ol className="divide-y divide-white/[0.07]">
          {visibleActions.map((action) => (
            <li key={`${action.jobId}-${action.kind}`}>
              <button
                type="button"
                onClick={() => onOpenJob(action.jobId)}
                className="group flex min-h-[4.65rem] w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-white/[0.035] focus-visible:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8176ff]/35 sm:px-5"
              >
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    action.priority <= 1 ? "bg-[#ff8d9d] shadow-[0_0_14px_rgba(255,109,132,.5)]" : "bg-[#8f87ff]",
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-[#eef1f7]">{action.label}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-[#7f8a9d]">
                    {action.company} · {action.description}
                  </span>
                </span>
                <ArrowUpRight className="size-4 shrink-0 text-[#737e91] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[#b2abff]" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="px-4 py-4 text-[12px] leading-5 text-[#8f9aae] sm:px-5">
          Nothing is time-sensitive. Add a next step or follow-up to any role and it will appear here.
        </p>
      )}
    </section>
  );
}

export function SavedJobList({
  initialApplicationDetails,
  initialJobs,
  reminderNotificationsEnabled,
}: {
  initialApplicationDetails: ApplicationDetailsView[];
  initialJobs: JobCardViewModel[];
  reminderNotificationsEnabled: boolean;
}) {
  const [jobs, setJobs] = useState(initialJobs);
  const [applicationDetails, setApplicationDetails] = useState(
    () => new Map(initialApplicationDetails.map((details) => [details.jobListingId, details])),
  );
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [arrangement, setArrangement] = useState("all");
  const [sort, setSort] = useState<SortKey>("fit");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_VISIBLE_JOB_COUNT);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [noteEditor, setNoteEditor] = useState<{
    draft: string;
    jobId: string | null;
  }>({ draft: "", jobId: null });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const noteInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    saveJobFeedSnapshot("saved", jobs);
  }, [jobs]);

  useEffect(() => {
    if (noteEditor.jobId) noteInputRef.current?.focus();
  }, [noteEditor.jobId]);

  useEffect(() => {
    if (
      !reminderNotificationsEnabled ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    ) {
      return;
    }
    const now = Date.now();
    const due = initialApplicationDetails.find((details) => {
      if (!details.followUpAt) return false;
      const followUp = new Date(details.followUpAt).getTime();
      return followUp <= now && followUp >= now - 24 * 60 * 60_000;
    });
    if (!due) return;
    const job = initialJobs.find((candidate) => candidate.id === due.jobListingId);
    if (!job) return;
    const notification = new Notification(`Follow up on ${job.company}`, {
      body: due.nextStep || job.title,
      tag: `jobswipe-follow-up-${job.id}`,
    });
    return () => notification.close();
  }, [initialApplicationDetails, initialJobs, reminderNotificationsEnabled]);

  const visibleJobs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return jobs
      .filter((job) => {
        if (!isPipelineStatus(job.currentDecision)) return false;
        if (!statusMatches(job.currentDecision, statusFilter)) return false;
        if (arrangement !== "all" && job.workArrangement !== arrangement) return false;
        if (!normalizedQuery) return true;
        return [job.title, job.company, job.location, ...job.technologies]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .toSorted((left, right) => compareJobs(left, right, sort));
  }, [arrangement, jobs, query, sort, statusFilter]);

  const comparedJobs = useMemo(
    () => compareIds.flatMap((id) => jobs.find((job) => job.id === id) ?? []),
    [compareIds, jobs],
  );
  const applicationWorkspace = useMemo(
    () => buildApplicationWorkspace(jobs, applicationDetails),
    [applicationDetails, jobs],
  );
  const renderedJobs = visibleJobs.slice(0, visibleLimit);

  const activeFilterCount =
    Number(statusFilter !== "all") +
    Number(arrangement !== "all") +
    Number(sort !== "fit");
  const showsResultContext =
    query.trim().length > 0 || activeFilterCount > 0 || compareIds.length > 0;

  function resetFilters() {
    setQuery("");
    setStatusFilter("all");
    setArrangement("all");
    setSort("fit");
  }

  function openWorkspaceJob(jobId: string) {
    setQuery("");
    setStatusFilter("all");
    setArrangement("all");
    setVisibleLimit(jobs.length);
    requestAnimationFrame(() => {
      const element = document.getElementById(`saved-job-${jobId}`);
      const details = element?.querySelector("details");
      if (details instanceof HTMLDetailsElement) details.open = true;
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => element?.focus({ preventScroll: true }), 350);
    });
  }

  function runJobAction(jobId: string, action: () => Promise<void>) {
    if (pending) return;
    setError(null);
    setMessage(null);
    setPendingJobId(jobId);
    startTransition(async () => {
      try {
        await action();
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : "That change could not be saved.",
        );
      } finally {
        setPendingJobId(null);
      }
    });
  }

  function restore(jobId: string) {
    runJobAction(jobId, async () => {
      const job = jobs.find((candidate) => candidate.id === jobId);
      if (!job) throw new Error("This saved job is no longer available.");
      const result = await restoreJobToDeckAction(
        jobId,
        job.currentDecision,
        job.currentDecisionEventId,
      );
      if (!result.ok) throw new Error(result.message);
      setJobs((current) => current.filter((job) => job.id !== jobId));
      setCompareIds((current) => current.filter((id) => id !== jobId));
      setMessage("Returned to your active deck.");
      requestAnimationFrame(() => searchInputRef.current?.focus());
    });
  }

  function updateStatus(jobId: string, status: PipelineStatus) {
    runJobAction(jobId, async () => {
      const selectedJob = jobs.find((job) => job.id === jobId);
      if (!selectedJob) throw new Error("This saved job is no longer available.");
      const result = await updateJobStatusAction(
        jobId,
        status,
        selectedJob.currentDecision,
        selectedJob.currentDecisionEventId,
      );
      if (!result.ok) throw new Error(result.message);
      setJobs((current) =>
        current.map((job) =>
          job.id === jobId
            ? {
                ...job,
                currentDecision: status,
                currentDecisionEventId: result.value.decisionEventId,
              }
            : job,
        ),
      );
      setMessage(`Status changed to ${STATUS_META[status].label.toLowerCase()}.`);
    });
  }

  function saveNote(jobId: string) {
    const submittedDraft = noteEditor.draft;
    const cleanNote = submittedDraft.trim();
    if (!cleanNote) return;
    runJobAction(jobId, async () => {
      const result = await addJobNoteAction(jobId, cleanNote);
      if (!result.ok) throw new Error(result.message);
      setNoteEditor((current) =>
        current.jobId === jobId && current.draft === submittedDraft
          ? { draft: "", jobId: null }
          : current,
      );
      setMessage("Note saved to this job's history.");
    });
  }

  function toggleCompare(jobId: string) {
    setError(null);
    setCompareIds((current) => {
      if (current.includes(jobId)) return current.filter((id) => id !== jobId);
      if (current.length >= 3) {
        setError("Compare up to three opportunities at a time.");
        return current;
      }
      return [...current, jobId];
    });
  }

  return (
    <div className="saved-workspace">
      <header className="mb-5 px-1 sm:mb-6">
        <div className="flex items-end justify-between gap-4">
        <h1 className="text-[1.75rem] font-semibold tracking-[-0.04em] text-[#f6f8fc]">
          Saved
        </h1>
        <p className="pb-1 text-[12px] font-medium text-[#9ba6ba]">
          {jobs.length} saved {jobs.length === 1 ? "role" : "roles"}
        </p>
        </div>
      </header>

      {jobs.length === 0 ? (
        <section className="editorial-dark-surface mx-auto max-w-xl rounded-[1.25rem] px-6 py-14 text-center sm:py-18">
          <BookmarkCheck className="mx-auto size-5 text-[#9b92ff]" aria-hidden="true" />
          <h2 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-[#f5f7fb]">
            Nothing saved yet
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#9ba6ba]">
            Roles you keep will wait here for a closer look.
          </p>
          <Link href="/" className={cn(buttonVariants(), "mt-6 px-5")}>
            Browse jobs
          </Link>
        </section>
      ) : (
        <>
          <ApplicationCommandCenter
            view={applicationWorkspace}
            onFilter={(filter) => {
              setStatusFilter(filter);
              setQuery("");
            }}
            onOpenJob={openWorkspaceJob}
          />
          <section
            className="editorial-dark-surface mb-5 rounded-[1.25rem] p-2.5"
            aria-label="Search and filter saved jobs"
          >
            <div className="flex gap-2">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Search saved jobs</span>
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#8a94a5]"
                  aria-hidden="true"
                />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search saved roles"
                  className="h-11 w-full rounded-[0.9rem] border border-white/10 bg-white/[0.055] pl-10 pr-3 text-base text-[#f0f3fa] outline-none placeholder:text-[#6f7a90] focus:border-[#8176ff]/45 focus:ring-3 focus:ring-[#8176ff]/12 sm:text-sm"
                />
              </label>
              <button
                type="button"
                onClick={() => setFiltersOpen((current) => !current)}
                aria-expanded={filtersOpen}
                aria-controls="saved-job-filters"
                className={cn(
                  "inline-flex h-11 shrink-0 items-center gap-2 rounded-[0.9rem] border border-white/10 bg-white/[0.055] px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#8176ff]/22",
                  filtersOpen || activeFilterCount > 0
                    ? "border-[#8176ff]/35 bg-[#8176ff]/12 text-[#b3adff]"
                    : "text-[#a6b0c3] hover:bg-white/[0.09]",
                )}
              >
                <SlidersHorizontal className="size-4" aria-hidden="true" />
                <span className="hidden min-[360px]:inline">Filters</span>
                {activeFilterCount > 0 ? (
                  <span className="grid size-5 place-items-center rounded-full bg-[#8176ff] text-[10px] text-white">
                    {activeFilterCount}
                  </span>
                ) : null}
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform duration-200",
                    filtersOpen && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </button>
            </div>

            {filtersOpen ? (
              <div
                id="saved-job-filters"
                className="saved-filter-panel relative mt-2 overflow-hidden rounded-[1.05rem] border border-white/[0.1] px-3 pb-3 pt-2.5 shadow-[0_20px_50px_rgba(0,3,12,.32),inset_0_1px_0_rgba(255,255,255,.08)] sm:px-4 sm:pb-4 sm:pt-3.5"
              >
                <div className="relative flex min-h-9 items-center gap-2 border-b border-white/[0.07] pb-2.5">
                  <span className="grid size-7 place-items-center rounded-lg border border-[#8176ff]/20 bg-[#8176ff]/10 text-[#aaa3ff]">
                    <SlidersHorizontal className="size-3.5" aria-hidden="true" />
                  </span>
                  <p className="text-[13px] font-semibold tracking-[-0.01em] text-[#e9ecf4]">
                    Refine saved roles
                  </p>
                  {activeFilterCount > 0 ? (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="ml-auto min-h-8 rounded-lg px-2 text-[11px] font-semibold text-[#aaa3ff] outline-none transition hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-[#8176ff]/30"
                    >
                      Reset
                    </button>
                  ) : (
                    <span className="ml-auto text-[11px] text-[#707b90]">Optional</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(false)}
                    aria-label="Close filters"
                    className="grid size-8 place-items-center rounded-lg text-[#7f8a9e] outline-none transition hover:bg-white/[0.07] hover:text-white focus-visible:ring-2 focus-visible:ring-[#8176ff]/30"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </div>

                <div className="relative divide-y divide-white/[0.07]">
                  <fieldset className="py-3.5">
                    <legend className="mb-2.5 flex w-full items-center justify-between px-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#778399]">
                      Stage
                      <span className="normal-case tracking-normal text-[#626d81]">Where it stands</span>
                    </legend>
                    <div className="flex flex-wrap gap-1.5">
                      {STATUS_FILTER_OPTIONS.map((option) => (
                        <FilterChoice
                          key={option.value}
                          active={statusFilter === option.value}
                          label={option.label}
                          onClick={() => setStatusFilter(option.value)}
                        />
                      ))}
                    </div>
                  </fieldset>

                  <fieldset className="py-3.5">
                    <legend className="mb-2.5 flex w-full items-center justify-between px-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#778399]">
                      Work style
                      <span className="normal-case tracking-normal text-[#626d81]">Where you work</span>
                    </legend>
                    <div className="flex flex-wrap gap-1.5">
                      {ARRANGEMENT_FILTER_OPTIONS.map((option) => (
                        <FilterChoice
                          key={option.value}
                          active={arrangement === option.value}
                          label={option.label}
                          onClick={() => setArrangement(option.value)}
                        />
                      ))}
                    </div>
                  </fieldset>

                  <fieldset className="pt-3.5">
                    <legend className="mb-2.5 flex w-full items-center justify-between px-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#778399]">
                      Sort
                      <span className="normal-case tracking-normal text-[#626d81]">What comes first</span>
                    </legend>
                    <div className="flex flex-wrap gap-1.5">
                      {SORT_OPTIONS.map((option) => (
                        <FilterChoice
                          key={option.value}
                          active={sort === option.value}
                          label={option.label}
                          onClick={() => setSort(option.value)}
                        />
                      ))}
                    </div>
                  </fieldset>
                </div>
              </div>
            ) : null}
          </section>

          {error ? (
            <p
              role="alert"
              className="mb-4 rounded-xl border border-[#ed8f9e]/20 bg-[#ed8f9e]/10 px-4 py-3 text-sm text-[#f1a8b4]"
            >
              {error}
            </p>
          ) : null}
          {message ? (
            <p
              role="status"
              className="mb-4 rounded-xl border border-[#65d7aa]/18 bg-[#65d7aa]/10 px-4 py-3 text-sm text-[#82ddb9]"
            >
              {message}
            </p>
          ) : null}

          <ComparisonPanel
            jobs={comparedJobs}
            onClear={() => setCompareIds([])}
            onRemove={(jobId) =>
              setCompareIds((current) => current.filter((id) => id !== jobId))
            }
          />

          {showsResultContext ? (
            <div className="mb-3 flex min-h-6 items-center justify-between px-1 text-xs text-[#8f9aae]">
              <span>
                {visibleJobs.length}{" "}
                {visibleJobs.length === 1 ? "opportunity" : "opportunities"}
              </span>
              {compareIds.length > 0 ? (
                <span>
                  {compareIds.length}/3 selected
                  {compareIds.length === 1 ? " · choose one more" : ""}
                </span>
              ) : null}
            </div>
          ) : null}

          {visibleJobs.length === 0 ? (
            <section className="editorial-dark-surface rounded-[1.25rem] px-6 py-14 text-center">
              <p className="text-sm font-semibold text-[#f0f3f9]">
                No saved roles match.
              </p>
              <button
                type="button"
                className="mt-3 rounded-lg px-2 py-1 text-sm font-semibold text-[#aaa3ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8176ff]/30"
                onClick={resetFilters}
              >
                Clear search and filters
              </button>
            </section>
          ) : (
            <div className="editorial-dark-surface overflow-hidden rounded-[1.35rem]">
              {renderedJobs.map((job) => {
                const visual = companyVisual(job.company);
                const status = isPipelineStatus(job.currentDecision)
                  ? job.currentDecision
                  : "saved";
                const selected = compareIds.includes(job.id);
                const insight = decisionBrief(job);

                return (
                  <article
                    key={job.id}
                    id={`saved-job-${job.id}`}
                    tabIndex={-1}
                    className="saved-job-listing relative overflow-hidden border-b border-white/[0.09] bg-transparent transition-[background-color] duration-200 last:border-b-0 hover:bg-white/[0.035] [content-visibility:auto] [contain-intrinsic-size:110px]"
                  >
                    <div className="flex min-h-[6.75rem] items-center gap-3.5 px-4 py-3.5 pr-14 sm:px-5 sm:pr-16">
                      <div
                        aria-hidden="true"
                        className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-[0.85rem] border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,.16),0_8px_20px_rgba(0,0,0,.18)]"
                        style={{ backgroundColor: visual.background, color: visual.foreground }}
                      >
                        <CompanyMark compact company={job.company} className="max-h-5 max-w-7" />
                      </div>
                      <Link
                        href={`/jobs/${job.id}`}
                        aria-label={`Open ${job.title} at ${job.company}`}
                        className="min-w-0 flex-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[#8176ff]/50"
                      >
                        <p className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-[#929db2]">
                          <span className="truncate">{job.company}</span>
                          <span className="size-1 shrink-0 rounded-full bg-white/25" aria-hidden="true" />
                          <span className="shrink-0 text-[#aaa3ff]">{STATUS_META[status].label}</span>
                        </p>
                        <h2 className="mt-0.5 truncate text-[1rem] font-semibold leading-5 tracking-[-0.02em] text-[#f4f6fb]">
                          {job.title}
                        </h2>
                        <p className="mt-1 truncate text-[12px] text-[#9da8bb]">
                          <span className="font-semibold text-[#dfe4ed]">{job.salaryDisplay}</span>
                          <span className="mx-1.5 text-white/25" aria-hidden="true">·</span>
                          {displayLocation(job)}
                        </p>
                      </Link>
                    </div>

                    <details className="group bg-black/[0.08]">
                      <summary
                        className="absolute right-2.5 top-3 grid size-11 cursor-pointer list-none place-items-center rounded-xl text-[#8f9aae] outline-none transition hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-[#8176ff]/35 [&::-webkit-details-marker]:hidden sm:right-4"
                        aria-label={`More options for ${job.title}`}
                      >
                        <MoreHorizontal className="size-4" aria-hidden="true" />
                      </summary>
                      <div className="space-y-3 border-t border-white/[0.07] px-4 pb-4 pt-3 sm:px-5">
                        <p className="border-l border-[#8176ff]/45 pl-3 text-[12px] leading-5 text-[#aab4c6]">
                          {insight}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="relative min-w-36 flex-1">
                            <span className="sr-only">Pipeline stage for {job.title}</span>
                            <select
                              value={status}
                              onChange={(event) => updateStatus(job.id, event.target.value as PipelineStatus)}
                              disabled={pending}
                              className="h-11 w-full appearance-none rounded-xl border border-white/10 bg-white/[0.05] py-0 pl-3 pr-8 text-[12px] font-semibold text-[#c4ccda] outline-none focus:border-[#8176ff]/40 focus:ring-2 focus:ring-[#8176ff]/20 disabled:opacity-50"
                            >
                              {PIPELINE_STATUSES.map((value) => (
                                <option key={value} value={value}>{STATUS_META[value].label}</option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-[#8f9aae]" aria-hidden="true" />
                          </label>
                          {job.sourceUrl ? (
                          <a
                            href={job.sourceUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            aria-label={`Apply to ${job.title} at ${job.company} (opens in a new tab)`}
                            aria-disabled={pending}
                            tabIndex={pending ? -1 : undefined}
                            onClick={(event) => {
                              if (pending) {
                                event.preventDefault();
                                return;
                              }
                              if (!["applied", "interview", "offer"].includes(status)) {
                                updateStatus(job.id, "apply");
                              }
                            }}
                            className={cn(
                              buttonVariants({ size: "lg" }),
                              "h-11 rounded-xl bg-[#f4f6fb] px-4 text-sm text-[#101726] hover:bg-white",
                              pending && "pointer-events-none opacity-45",
                            )}
                          >
                            Apply
                            <ArrowUpRight data-icon="inline-end" />
                          </a>
                        ) : null}
                      </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => toggleCompare(job.id)}
                            aria-pressed={selected}
                            className={cn(
                              "h-11 border-white/10 bg-white/[0.05] text-[#aab4c6] hover:bg-white/[0.09] hover:text-white",
                              selected && "border-[#8176ff]/30 bg-[#8176ff]/12 text-[#b6afff]",
                            )}
                          >
                            {selected ? (
                              <Check data-icon="inline-start" />
                            ) : (
                              <GitCompareArrows data-icon="inline-start" />
                            )}
                            Compare
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setNoteEditor((current) =>
                                current.jobId === job.id
                                  ? { draft: "", jobId: null }
                                  : { draft: "", jobId: job.id },
                              )
                            }
                            aria-expanded={noteEditor.jobId === job.id}
                            className="h-11 border-white/10 bg-white/[0.05] text-[#aab4c6] hover:bg-white/[0.09] hover:text-white"
                          >
                            <StickyNote data-icon="inline-start" />
                            Note
                          </Button>
                          {status !== "rejected" && status !== "offer" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => restore(job.id)}
                              disabled={pending}
                              className="h-11 border-white/10 bg-white/[0.05] text-[#aab4c6] hover:bg-white/[0.09] hover:text-white"
                            >
                              {pendingJobId === job.id ? (
                                <LoaderCircle
                                  className="animate-spin"
                                  data-icon="inline-start"
                                />
                              ) : (
                                <RotateCcw data-icon="inline-start" />
                              )}
                              Return to feed
                            </Button>
                          ) : null}
                        </div>

                        <ApplicationDetailsEditor
                          initialValue={applicationDetails.get(job.id) ?? null}
                          jobId={job.id}
                          jobTitle={job.title}
                          company={job.company}
                          sourceUrl={job.sourceUrl}
                          onSaved={(details) =>
                            setApplicationDetails((current) => {
                              const next = new Map(current);
                              next.set(job.id, details);
                              return next;
                            })
                          }
                        />

                        {noteEditor.jobId === job.id ? (
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <label className="min-w-0 flex-1">
                              <span className="sr-only">Add a note about {job.title}</span>
                              <input
                                ref={noteInputRef}
                                value={noteEditor.draft}
                                onChange={(event) => {
                                  const draft = event.target.value;
                                  setNoteEditor((current) =>
                                    current.jobId === job.id
                                      ? { ...current, draft }
                                      : current,
                                  );
                                }}
                                maxLength={2_000}
                                placeholder="Why is this worth pursuing?"
                                className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 text-base text-[#edf0f6] outline-none placeholder:text-[#727e92] focus:ring-2 focus:ring-[#8176ff]/25 sm:text-sm"
                              />
                            </label>
                            <Button
                              type="button"
                              size="sm"
                              className="h-11 px-4"
                              disabled={pending || noteEditor.draft.trim().length === 0}
                              onClick={() => saveNote(job.id)}
                            >
                              {pendingJobId === job.id ? (
                                <LoaderCircle className="animate-spin" />
                              ) : (
                                "Save note"
                              )}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </details>
                  </article>
                );
              })}
              {renderedJobs.length < visibleJobs.length ? (
                <button
                  type="button"
                  onClick={() => setVisibleLimit((current) => current + INITIAL_VISIBLE_JOB_COUNT)}
                  className="min-h-12 w-full border-t border-white/[0.08] px-4 text-[12px] font-semibold text-[#aaa3ff] outline-none hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8176ff]/35"
                >
                  Show {Math.min(INITIAL_VISIBLE_JOB_COUNT, visibleJobs.length - renderedJobs.length)} more
                </button>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}
