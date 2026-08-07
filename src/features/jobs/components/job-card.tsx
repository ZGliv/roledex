import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Gauge,
  GraduationCap,
  Laptop2,
  Lightbulb,
  MapPin,
  Route,
  ShieldAlert,
  Target,
  TrendingUp,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Progress,
  ProgressLabel,
} from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import {
  ScoreBreakdown,
  type ScoreBreakdownItemViewModel,
} from "./score-breakdown";
import { ScoreRing } from "./score-ring";

export type JobCardVerdict =
  | "Strong Apply"
  | "Apply"
  | "Apply as a Stretch"
  | "Save for Later"
  | "Learn First"
  | "Skip";

export type JobCardReadiness =
  | "Ready Now"
  | "Ready With Positioning"
  | "Ready After Skill Sprint"
  | "Not Yet Efficient"
  | "Not enough information";

export type JobCardWorkArrangement =
  | "Remote"
  | "Hybrid"
  | "On-site"
  | "Unclear";

export type JobCardSalarySource =
  | "employer_posted"
  | "externally_estimated"
  | "unknown";

export type JobCardDecision =
  | "unseen"
  | "saved"
  | "skipped"
  | "stretch"
  | "learn_first"
  | "apply"
  | "applied"
  | "interview"
  | "rejected"
  | "offer"
  | "archived";

export interface JobDecisionBrief {
  confidence: "high" | "medium" | "low";
  edge: string;
  opportunity: string;
  positioningMove: string;
  risk: string;
}

/**
 * A presentation-only, JSON-serializable contract for the central job card.
 * Dates and money arrive preformatted; persistence and domain models stay upstream.
 */
export interface JobCardViewModel {
  id: string;
  title: string;
  company: string;
  location: string;
  workArrangement: JobCardWorkArrangement;
  salaryDisplay: string;
  salarySource: JobCardSalarySource;
  annualSalaryEstimateCents: number | null;
  salaryConfidence: "high" | "medium" | "low";
  salaryDisclosure: string;
  salaryMethod: string;
  salaryBenchmarkOccupation: string | null;
  salarySourceName: string;
  salarySourceUrl: string | null;
  salaryModelVersion: string;
  salaryIsEstimate: boolean;
  salaryAnnualMinimumCents: number;
  salaryAnnualMaximumCents: number;
  personalizationScore: number;
  personalizationAdjustment: number;
  personalizationReasons: readonly string[];
  personalizationSignalCount: number;
  personalizationModelVersion: string;
  isExploration: boolean;
  currentDecision: JobCardDecision;
  employmentType: string;
  sourceName: string;
  sourceUrl: string | null;
  datePosted: string | null;
  summary: string;
  responsibilities: readonly string[];
  requiredQualifications: readonly string[];
  preferredQualifications: readonly string[];
  technologies: readonly string[];
  travelRequirement: string | null;
  seniority: string | null;
  applicationDeadline: string | null;
  deterministicFitScore: number;
  deterministicFitCoverage: number;
  stretchScore: number;
  careerValueScore: number;
  verdict: JobCardVerdict;
  verdictExplanation: string;
  readiness: JobCardReadiness;
  strongestMatches: readonly string[];
  biggestGaps: readonly string[];
  reasonsNotToApply: readonly [string, ...string[]];
  reasonsToApply: readonly [string, ...string[]];
  warnings: readonly string[];
  scoreBreakdown: readonly ScoreBreakdownItemViewModel[];
  /** A compact, evidence-backed decision summary. Optional for legacy fixtures. */
  decisionBrief?: JobDecisionBrief;
}

export interface JobCardProps {
  job: JobCardViewModel;
  className?: string;
  embedded?: boolean;
}

const salarySourceLabels: Record<JobCardSalarySource, string> = {
  employer_posted: "Employer-posted",
  externally_estimated: "Market estimate",
  unknown: "Source unknown",
};

const verdictStyles: Record<JobCardVerdict, string> = {
  "Strong Apply": "text-emerald-700",
  Apply: "text-emerald-700",
  "Apply as a Stretch": "text-amber-700",
  "Save for Later": "text-sky-700",
  "Learn First": "text-violet-700",
  Skip: "text-red-700",
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function companyInitials(company: string) {
  const words = company.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

function scoreProgressTone(score: number) {
  if (score >= 7.5) {
    return "[&_[data-slot=progress-indicator]]:bg-fit-high";
  }

  if (score >= 5) {
    return "[&_[data-slot=progress-indicator]]:bg-fit-mid";
  }

  return "[&_[data-slot=progress-indicator]]:bg-fit-low";
}

function stretchProgressTone(score: number) {
  if (score <= 4) {
    return "[&_[data-slot=progress-indicator]]:bg-fit-high";
  }

  if (score <= 6) {
    return "[&_[data-slot=progress-indicator]]:bg-fit-mid";
  }

  return "[&_[data-slot=progress-indicator]]:bg-fit-low";
}

function SectionHeading({
  icon: Icon,
  eyebrow,
  title,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <div>
        <p className="text-xs text-muted-foreground">
          {eyebrow}
        </p>
        <h3 className="mt-1 text-base font-semibold tracking-tight text-foreground">
          {title}
        </h3>
      </div>
    </div>
  );
}

function MetaItem({
  icon: Icon,
  label,
  value,
  secondary,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  secondary?: string | null;
}) {
  return (
    <div className="flex min-w-0 gap-2.5 border-l border-border/70 py-1 pl-3.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 truncate text-sm font-semibold text-foreground" title={value}>
          {value}
        </p>
        {secondary ? (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={secondary}>
            {secondary}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  score,
  helper,
  inverted = false,
}: {
  icon: LucideIcon;
  label: string;
  score: number;
  helper: string;
  inverted?: boolean;
}) {
  const normalizedScore = clamp(score, 0, 10);

  return (
    <div className="flex min-h-32 flex-col justify-between rounded-xl border border-border/70 bg-background/24 p-4">
      <div className="flex items-start justify-between gap-3">
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-xl font-semibold tracking-tight tabular-nums">
          {normalizedScore.toFixed(1)}
          <span className="ml-0.5 text-xs font-medium text-muted-foreground">/10</span>
        </span>
      </div>
      <Progress
        value={normalizedScore * 10}
        aria-label={`${label}: ${normalizedScore.toFixed(1)} out of 10`}
        className={cn(
          "mt-4 gap-y-2 [&_[data-slot=progress-track]]:h-1.5",
          inverted
            ? stretchProgressTone(normalizedScore)
            : scoreProgressTone(normalizedScore),
        )}
      >
        <ProgressLabel className="text-xs">{label}</ProgressLabel>
        <span className="ml-auto text-[10px] text-muted-foreground">{helper}</span>
      </Progress>
    </div>
  );
}

function BulletList({
  items,
  emptyLabel,
}: {
  items: readonly string[];
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm leading-relaxed text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-2.5 text-sm leading-relaxed text-foreground/85">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex gap-2.5">
          <span className="mt-[0.55rem] size-1 shrink-0 rounded-full bg-muted-foreground/70" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function SignalPanel({
  kind,
  title,
  items,
}: {
  kind: "match" | "gap";
  title: string;
  items: readonly string[];
}) {
  const isMatch = kind === "match";
  const Icon = isMatch ? CheckCircle2 : AlertTriangle;

  return (
    <section
      className={cn(
        "rounded-xl border p-4 sm:p-5",
        isMatch
          ? "border-emerald-400/20 bg-emerald-400/[0.055]"
          : "border-amber-400/20 bg-amber-400/[0.055]",
      )}
    >
      <h3
        className={cn(
          "flex items-center gap-2 text-sm font-semibold",
          isMatch ? "text-emerald-700" : "text-amber-700",
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
        {title}
      </h3>
      <div className="mt-3">
        <BulletList
          items={items}
          emptyLabel={isMatch ? "No strong match identified yet." : "No major gap identified."}
        />
      </div>
    </section>
  );
}

function ReasonPanel({
  kind,
  items,
}: {
  kind: "against" | "for";
  items: readonly string[];
}) {
  const isAgainst = kind === "against";
  const Icon = isAgainst ? ShieldAlert : Lightbulb;

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-xl border p-5",
        isAgainst
          ? "border-red-400/20 bg-red-400/[0.055]"
          : "border-primary/20 bg-primary/[0.055]",
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-0 w-0.5",
          isAgainst ? "bg-red-400/70" : "bg-primary/70",
        )}
      />
      <h3
        className={cn(
          "flex items-center gap-2 text-sm font-semibold",
          isAgainst ? "text-red-700" : "text-primary",
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
        {isAgainst ? "Strongest reasons not to apply" : "Reasons to apply anyway"}
      </h3>
      <div className="mt-3">
        <BulletList items={items} emptyLabel="No rationale supplied." />
      </div>
    </section>
  );
}

function RequirementColumn({
  title,
  items,
  preferred = false,
}: {
  title: string;
  items: readonly string[];
  preferred?: boolean;
}) {
  return (
    <section className="border-t border-border/70 pt-4 sm:pt-5">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <GraduationCap
          className={cn("size-4", preferred ? "text-sky-600" : "text-primary")}
          aria-hidden="true"
        />
        {title}
      </h4>
      <div className="mt-3">
        <BulletList items={items} emptyLabel="Not specified in the listing." />
      </div>
    </section>
  );
}

export function JobCard({ job, className, embedded = false }: JobCardProps) {
  const secondaryDetails = [
    job.seniority ? `Seniority: ${job.seniority}` : "Seniority unclear",
    job.travelRequirement ? `Travel: ${job.travelRequirement}` : "Travel not specified",
    job.applicationDeadline
      ? `Deadline: ${job.applicationDeadline}`
      : "Deadline not listed",
  ];

  return (
    <article
      aria-label={`${job.title} at ${job.company}`}
      className={cn("mx-auto w-full", embedded ? "max-w-none" : "max-w-6xl", className)}
    >
      <Card
        className={cn(
          "relative isolate gap-0 overflow-hidden border-border/80 bg-card/95 py-0",
          embedded
            ? "rounded-none ring-0 shadow-none"
            : "rounded-2xl shadow-[0_18px_48px_rgba(18,28,45,.12)]",
        )}
      >
        <CardHeader className="relative border-b border-border/70 px-5 py-6 sm:px-8 sm:py-8">
          <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className={cn("font-semibold", verdictStyles[job.verdict])}>
                  {job.verdict}
                </span>
                <span className="text-muted-foreground/45" aria-hidden="true">·</span>
                <span className="text-muted-foreground">
                  {job.readiness}
                </span>
              </div>

              <div className="flex items-start gap-3.5 sm:gap-4">
                <div
                  aria-hidden="true"
                  className="grid size-12 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/[0.06] text-sm font-semibold tracking-[-0.03em] text-primary sm:size-14 sm:text-base"
                >
                  {companyInitials(job.company)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                    <span className="truncate">{job.company}</span>
                  </div>
                  <CardTitle className="mt-1.5">
                    <h2 className="max-w-3xl text-balance text-2xl font-semibold leading-tight tracking-[-0.035em] sm:text-3xl lg:text-4xl">
                      {job.title}
                    </h2>
                  </CardTitle>
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground sm:text-sm">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="size-3.5" aria-hidden="true" />
                      {job.location}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 className="size-3.5" aria-hidden="true" />
                      {job.datePosted ? `Posted ${job.datePosted}` : "Posting date unknown"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <ScoreRing
              score={job.deterministicFitScore}
              coveragePercent={job.deterministicFitCoverage}
              className="mx-auto sm:mx-0 sm:size-36"
            />
          </div>
        </CardHeader>

        <CardContent className="relative space-y-8 px-5 py-6 sm:px-8 sm:py-8">
          <section aria-label="Core job facts" className="grid gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetaItem
              icon={CircleDollarSign}
              label="Compensation"
              value={job.salaryDisplay}
              secondary={salarySourceLabels[job.salarySource]}
            />
            <MetaItem
              icon={Laptop2}
              label="Work style"
              value={job.workArrangement}
              secondary={job.location}
            />
            <MetaItem
              icon={BriefcaseBusiness}
              label="Employment"
              value={job.employmentType}
              secondary={job.seniority ?? "Seniority unclear"}
            />
            <MetaItem
              icon={CalendarClock}
              label="Timing"
              value={job.applicationDeadline ?? "No deadline listed"}
              secondary={job.datePosted ? `Posted ${job.datePosted}` : "Posting date unknown"}
            />
          </section>

          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="Additional job facts">
            {secondaryDetails.map((detail) => (
              <span
                key={detail}
                className="border-r border-border/70 pr-3 last:border-r-0 last:pr-0"
              >
                {detail}
              </span>
            ))}
          </div>

          {job.warnings.length > 0 ? (
            <aside className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4" aria-label="Analysis warnings">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">Check before deciding</p>
                  <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-amber-800/75">
                    {job.warnings.map((warning, index) => (
                      <li key={`${warning}-${index}`}>{warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </aside>
          ) : null}

          <section className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)]">
            <div className="border-b border-border/70 pb-5 sm:pb-6 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6">
              <SectionHeading icon={Target} eyebrow="Role snapshot" title="What this opportunity is really offering" />
              <p className="mt-5 max-w-3xl text-base leading-7 text-foreground/85">
                {job.summary}
              </p>

              <div className="mt-5 border-l-2 border-primary/35 pl-4">
                  <div>
                    <p className="text-xs font-semibold text-primary">
                      {job.verdict}
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-foreground/80">
                      {job.verdictExplanation}
                    </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <MetricTile
                icon={Gauge}
                label="Stretch level"
                score={job.stretchScore}
                helper="Lower is easier"
                inverted
              />
              <MetricTile
                icon={TrendingUp}
                label="Career value"
                score={job.careerValueScore}
                helper="Long-term signal"
              />
            </div>
          </section>

          <ScoreBreakdown items={job.scoreBreakdown} />

          <Separator />

          <section className="grid gap-4 lg:grid-cols-2" aria-label="Fit evidence">
            <SignalPanel kind="match" title="Strongest matches" items={job.strongestMatches} />
            <SignalPanel kind="gap" title="Biggest qualification gaps" items={job.biggestGaps} />
          </section>

          <section className="grid gap-4 lg:grid-cols-2" aria-label="Application case">
            <ReasonPanel kind="against" items={job.reasonsNotToApply} />
            <ReasonPanel kind="for" items={job.reasonsToApply} />
          </section>

          <Separator />

          <section>
            <SectionHeading icon={Route} eyebrow="Day to day" title="Core responsibilities" />
            <div className="mt-5 border-t border-border/70 pt-4 sm:pt-5">
              <BulletList
                items={job.responsibilities}
                emptyLabel="The listing does not clearly describe day-to-day responsibilities."
              />
            </div>
          </section>

          <section>
            <SectionHeading icon={GraduationCap} eyebrow="Requirements" title="What the employer is asking for" />
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <RequirementColumn title="Required qualifications" items={job.requiredQualifications} />
              <RequirementColumn
                title="Preferred qualifications"
                items={job.preferredQualifications}
                preferred
              />
            </div>
          </section>

          <section>
            <SectionHeading icon={Lightbulb} eyebrow="Tooling" title="Technologies mentioned" />
            <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-sm text-foreground/80">
              {job.technologies.length > 0 ? (
                job.technologies.map((technology, index) => (
                  <span
                    key={`${technology}-${index}`}
                    className="border-r border-border/70 pr-3 last:border-r-0 last:pr-0"
                  >
                    {technology}
                  </span>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">
                  No specific technologies were extracted.
                </span>
              )}
            </div>
          </section>
        </CardContent>

        <CardFooter className="relative flex-col items-start gap-4 border-t border-border/70 bg-muted/25 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Building2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
              Source: {job.sourceName}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {job.datePosted ? `Originally posted ${job.datePosted}` : "Original posting date unavailable"}
            </p>
          </div>

          {job.sourceUrl ? (
            <a
              href={job.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 rounded-xl border border-border/80 bg-background/45 px-3.5 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Open original listing
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">
              Source URL unavailable
            </span>
          )}
        </CardFooter>
      </Card>
    </article>
  );
}
