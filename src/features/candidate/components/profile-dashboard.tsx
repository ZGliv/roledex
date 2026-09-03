"use client";

import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  Compass,
  History,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  CandidateProfileForm,
  type CandidateProfileFormValue,
} from "@/features/candidate/components/candidate-profile-form";
import {
  ProfileEvidenceEditor,
  type EducationValue,
  type PortfolioProjectValue,
  type SkillEvidenceValue,
  type WorkExperienceValue,
} from "@/features/candidate/components/profile-evidence-editor";
import {
  SearchPreferencesEditor,
  type SearchPreferencesValue,
} from "@/features/candidate/components/search-preferences-editor";
import {
  ResumeImportReview,
  type ResumeImportDraftValue,
} from "@/features/candidate/components/resume-import-review";
import {
  RoleTargetEditor,
  type RoleTargetValue,
} from "@/features/candidate/components/role-target-editor";
import { LearnedPreferenceControls } from "@/features/candidate/components/learned-preference-controls";
import {
  AccountDataControls,
  type ProductSettingsView,
  type ResumeSourceView,
} from "@/features/product/components/account-data-controls";
import { saveEmergencyProfile } from "@/features/jobs/emergency-feed-storage";
import { cn } from "@/lib/utils";

export type ProfileImpactValue = {
  counts: {
    blocked: number;
    explore: number;
    matches: number;
    totalUnseen: number;
  };
  learnedPreferences: {
    confidence: "none" | "early" | "developing" | "confident";
    negativeSignalCount: number;
    overrideCount: number;
    positiveSignalCount: number;
    signalCount: number;
    signals: readonly {
      confidence: "early" | "developing" | "confident";
      direction: "up" | "down" | "neutral";
      featureKey: string;
      key: string;
      label: string;
      learnedDirection: "up" | "down";
      learnedScore: number;
      observationCount: number;
      override: "more" | "less" | "ignore" | null;
      score: number;
    }[];
  };
  topExclusions: readonly {
    count: number;
    key: string;
    label: string;
  }[];
};

export type ProfileDashboardValue = CandidateProfileFormValue &
  SearchPreferencesValue & {
    educationRecords: EducationValue[];
    projects: PortfolioProjectValue[];
    resumeImportDrafts: ResumeImportDraftValue[];
    roleTargets: RoleTargetValue[];
    skillEvidence: SkillEvidenceValue[];
    updatedAt: string;
    workHistory: WorkExperienceValue[];
  };

type Props = {
  impact: ProfileImpactValue;
  isGuest: boolean;
  profile: ProfileDashboardValue;
  stats: {
    reviewed: number;
    saved: number;
    skipped: number;
  };
  productSettings: ProductSettingsView;
  resumes: ResumeSourceView[];
};

const compactUsdFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 0,
  notation: "compact",
  style: "currency",
});

const updatedAtFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
});

function money(cents: number) {
  return compactUsdFormatter.format(cents / 100);
}

function modeLabel(mode: string) {
  return mode === "on_site"
    ? "On-site"
    : `${mode.charAt(0).toLocaleUpperCase()}${mode.slice(1)}`;
}

function shortList(items: readonly string[], fallback: string, maximum = 2) {
  if (items.length === 0) return fallback;
  const visible = items.slice(0, maximum).join(", ");
  const remaining = items.length - maximum;
  return remaining > 0 ? `${visible} +${remaining}` : visible;
}

function SearchFact({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 border-t border-white/[0.09] py-3.5 first:border-t-0 sm:border-l sm:border-t-0 sm:px-4 sm:first:border-l-0 sm:first:pl-0">
      <p className="text-[12px] font-medium text-[#8f9aab]">{label}</p>
      <p className="mt-1 truncate text-[14px] font-semibold text-[#f0f2f6]">
        {value}
      </p>
    </div>
  );
}

function FeedImpact({ impact }: { impact: ProfileImpactValue }) {
  const cells = [
    ["Ready now", impact.counts.matches, "text-[#71d7ad]"],
    ["Credible stretch", impact.counts.explore, "text-[#aaa3ff]"],
    ["Filtered", impact.counts.blocked, "text-[#d8a576]"],
  ] as const;
  const mainExclusion = impact.topExclusions[0];

  return (
    <div className="border-t border-white/[0.11] pt-4">
      <div className="grid grid-cols-3 divide-x divide-white/[0.09]">
        {cells.map(([label, value, color]) => (
          <div key={label} className="px-3 first:pl-0 last:pr-0 sm:px-5">
            <p
              className={cn(
                "text-xl font-semibold tabular-nums tracking-[-0.04em]",
                color,
              )}
            >
              {value}
            </p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.09em] text-[#748096]">
              {label}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[10px] leading-4 text-[#738097]">
        {impact.counts.totalUnseen} unseen jobs
        {mainExclusion
          ? ` · most filtered by ${mainExclusion.label.toLocaleLowerCase()}`
          : " · no hard-filter pattern yet"}
      </p>
    </div>
  );
}

function EditorDisclosure({
  children,
  description,
  step,
  title,
}: {
  children: React.ReactNode;
  description: string;
  step: string;
  title: string;
}) {
  return (
    <details className="group rounded-[1rem] border border-white/[0.13] bg-[#0b1220] shadow-[inset_0_1px_0_rgba(255,255,255,.05)]">
      <summary className="flex min-h-[5.25rem] cursor-pointer list-none items-center justify-between gap-4 rounded-[1rem] px-4 py-4 outline-none transition hover:bg-white/[0.035] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8176ff]/55 group-open:rounded-b-none sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 w-6 shrink-0 font-mono text-[11px] font-medium tabular-nums text-[#777f90]">
            {step}
          </span>
          <span className="min-w-0">
            <span className="block font-display text-[18px] font-semibold tracking-[-0.025em] text-[#f1f3f7]">
              {title}
            </span>
            <span className="mt-1 block text-[13px] leading-5 text-[#929cad]">
              {description}
            </span>
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-[#a9b3c3] group-open:text-[#c8c3ff]">
          <span>Edit</span>
          <ChevronDown
            className="size-3.5 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </span>
      </summary>
      <div className="rounded-b-[1rem] border-t border-white/[0.09] bg-[#080e19] p-3 sm:p-5">
        {children}
      </div>
    </details>
  );
}

function ActivityAndLearning({
  impact,
  stats,
}: {
  impact: ProfileImpactValue;
  stats: Props["stats"];
}) {
  const keepRate =
    stats.reviewed > 0 ? Math.round((stats.saved / stats.reviewed) * 100) : 0;
  const signals = impact.learnedPreferences.signals.slice(0, 6);

  return (
    <div>
      <div className="grid grid-cols-3 divide-x divide-white/[0.08] border-b border-white/[0.08] pb-5">
        {[
          ["Reviewed", stats.reviewed],
          ["Saved", stats.saved],
          ["Keep rate", `${keepRate}%`],
        ].map(([label, value]) => (
          <div key={label} className="px-3 first:pl-0 last:pr-0">
            <p className="text-lg font-semibold tabular-nums text-[#eef1f7]">
              {value}
            </p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#727e93]">
              {label}
            </p>
          </div>
        ))}
      </div>

      {signals.length > 0 ? (
        <LearnedPreferenceControls
          overrideCount={impact.learnedPreferences.overrideCount}
          signals={signals}
        />
      ) : (
        <p className="py-4 text-[11px] leading-5 text-[#8490a4]">
          Save and pass on roles to teach JobSwipe what to rank higher or lower.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 border-t border-white/[0.08] pt-4">
        <Link
          href="/sessions"
          className="inline-flex min-h-11 items-center justify-between rounded-full border border-white/[0.08] px-3.5 text-[11px] font-semibold text-[#b8c2d2] outline-none transition hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[#8176ff]/50"
        >
          <span className="inline-flex items-center gap-2">
            <History className="size-4" aria-hidden="true" /> Sessions
          </span>
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
        <Link
          href="/insights"
          className="inline-flex min-h-11 items-center justify-between rounded-full border border-white/[0.08] px-3.5 text-[11px] font-semibold text-[#b8c2d2] outline-none transition hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[#8176ff]/50"
        >
          <span className="inline-flex items-center gap-2">
            <Compass className="size-4" aria-hidden="true" /> Insights
          </span>
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

export function ProfileDashboard({
  impact,
  isGuest,
  productSettings,
  profile,
  resumes,
  stats,
}: Props) {
  const [localRevision, setLocalRevision] = useState(profile.revision);
  const [localRoleTargets, setLocalRoleTargets] = useState(profile.roleTargets);
  const setupComplete = productSettings.onboardingCompletedAt !== null;
  const revision = Math.max(localRevision, profile.revision);
  const onRevisionChange = useCallback((nextRevision: number) => {
    setLocalRevision(nextRevision);
  }, []);

  useEffect(() => {
    const supportedSeniority = profile.desiredSeniorityLevels.filter(
      (level): level is "entry" | "mid" | "senior" =>
        level === "entry" || level === "mid" || level === "senior",
    );
    saveEmergencyProfile({
      desiredSeniorityLevels:
        supportedSeniority.length > 0
          ? supportedSeniority
          : ["entry", "mid"],
      location: profile.location,
      preferredSalaryMinimumCents: profile.preferredSalaryMinimumCents,
      preferredWorkModes: profile.preferredWorkModes,
      targetRoleFamilies: localRoleTargets.map((target) => target.label),
      yearsExperience: profile.yearsExperience,
    });
  }, [localRoleTargets, profile]);
  const targetRoleLabels = localRoleTargets.map((target) => target.label);
  const coreProfile: CandidateProfileFormValue = {
    ...profile,
    revision,
    targetRoleFamilies: targetRoleLabels,
  };
  const searchPreferences: SearchPreferencesValue = {
    acceptedEmploymentTypes: profile.acceptedEmploymentTypes,
    commuteRadiusMiles: profile.commuteRadiusMiles,
    desiredSeniorityLevels: profile.desiredSeniorityLevels,
    excludedCompanies: profile.excludedCompanies,
    excludedIndustries: profile.excludedIndustries,
    excludedTitles: profile.excludedTitles,
    maxOfficeDaysPerWeek: profile.maxOfficeDaysPerWeek,
    maxTravelPercent: profile.maxTravelPercent,
    missingSalaryPolicy: profile.missingSalaryPolicy,
    preferredWorkModes: profile.preferredWorkModes,
    relocationDestinations: profile.relocationDestinations,
    requiresSponsorship: profile.requiresSponsorship,
    strictWorkModes: profile.strictWorkModes,
    workAuthorization: profile.workAuthorization,
  };
  const updatedAt = updatedAtFormatter.format(new Date(profile.updatedAt));
  const modeSummary = shortList(
    profile.preferredWorkModes.map(modeLabel),
    "Work mode not set",
    3,
  );
  const evidenceCount =
    profile.workHistory.length +
    profile.educationRecords.length +
    profile.skillEvidence.length +
    profile.projects.length;
  const setupChecks = [
    { label: "Target roles", complete: localRoleTargets.length > 0 },
    { label: "Location", complete: Boolean(profile.location?.trim()) },
    { label: "Pay floor", complete: profile.preferredSalaryMinimumCents > 0 },
    {
      label: "Experience",
      complete: profile.yearsExperience > 0 || evidenceCount > 0,
    },
  ];
  const completedSetupChecks = setupChecks.filter((check) => check.complete).length;

  return (
    <div className="profile-dashboard mx-auto w-full max-w-3xl px-4 pb-[calc(var(--dock-reserve)+1.5rem)] pt-[max(.75rem,env(safe-area-inset-top))] sm:px-6 sm:pt-[max(1rem,env(safe-area-inset-top))]">
      <section
        className="profile-passport profile-reveal relative mt-2 overflow-hidden rounded-[1.4rem] border border-white/[0.12] p-5 shadow-[0_24px_64px_rgba(0,3,12,.38),inset_0_1px_0_rgba(255,255,255,.08)] sm:p-7"
        aria-labelledby="profile-purpose-heading"
      >
        <div className="relative z-10">
          <p className="text-[12px] font-medium text-[#8993a4]">Updated {updatedAt}</p>

          <h1
            id="profile-purpose-heading"
            className="mt-5 max-w-lg font-display text-[clamp(2rem,8vw,2.75rem)] font-semibold leading-[1.03] tracking-[-0.04em] text-[#f8f9fc]"
          >
            Your job profile
          </h1>
          <p className="mt-3 max-w-lg text-[14px] leading-6 text-[#aeb8c8] sm:text-[15px]">
            This is the contract your feed follows: what you want, what you can defend, and what must stay out.
          </p>

          <div className="mt-6 border-y border-white/[0.1] sm:grid sm:grid-cols-4">
            <SearchFact
              label="Target roles"
              value={shortList(targetRoleLabels, "Not set")}
            />
            <SearchFact
              label="Home base"
              value={profile.location?.trim() || "Not set"}
            />
            <SearchFact
              label="Pay floor"
              value={
                profile.preferredSalaryMinimumCents > 0
                  ? money(profile.preferredSalaryMinimumCents)
                  : "Not set"
              }
            />
            <SearchFact
              label="Work setup"
              value={modeSummary}
            />
          </div>

          <div className="mt-5 flex flex-col gap-2 min-[380px]:flex-row">
            <Link
              href="/onboarding"
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[0.8rem] bg-[#8176ff] px-5 text-[13px] font-semibold text-white shadow-[0_14px_34px_rgba(73,60,211,.28)] transition hover:bg-[#7064f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8b2ff]/60 motion-reduce:transition-none"
            >
              {setupComplete ? "Guided setup" : "Finish setup"}
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[0.8rem] border border-white/[0.15] bg-white/[0.04] px-5 text-[13px] font-semibold text-[#e1e6ee] transition hover:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8176ff]/50 motion-reduce:transition-none"
            >
              View jobs <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

        </div>
      </section>

      {!setupComplete ? (
        <section className="profile-reveal mt-4 rounded-[1.25rem] border border-[#8176ff]/20 bg-[#8176ff]/[0.07] p-4" aria-labelledby="setup-heading">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="setup-heading" className="text-sm font-semibold text-[#edf0f8]">Finish your 90-second setup</h2>
              <p className="mt-1 text-[10px] leading-4 text-[#8f9aae]">These four facts decide what can enter your For You feed.</p>
            </div>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-[#aaa3ff]">{completedSetupChecks}/4</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {setupChecks.map((check) => (
              <div key={check.label} className="flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.07] px-3 text-[10px] text-[#b8c2d2]">
                <span className={`grid size-4 place-items-center rounded-full ${check.complete ? "bg-[#71d7ad] text-[#07120e]" : "border border-white/20 text-transparent"}`}>
                  <span aria-hidden="true">✓</span>
                </span>
                {check.label}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section
        id="search-settings"
        className="profile-reveal mt-7 scroll-mt-4"
        aria-labelledby="search-settings-heading"
      >
        <div className="px-1 pb-4 pt-2">
          <h2
            id="search-settings-heading"
            className="font-display text-[1.55rem] font-semibold tracking-[-0.035em] text-[#f3f5fa]"
          >
            Your search contract
          </h2>
          <p className="mt-1.5 max-w-xl text-[13px] leading-5 text-[#8e9aae]">
            Four focused editors control retrieval, hard filters, qualification evidence, learning, and account data. Each saves independently.
          </p>
        </div>
        <div className="space-y-3">
          <EditorDisclosure
            step="01"
            title="Search setup"
            description={`${shortList(targetRoleLabels, "Choose target roles")} · ${profile.preferredSalaryMinimumCents > 0 ? `${money(profile.preferredSalaryMinimumCents)} hard floor` : "set a pay floor"}`}
          >
            <div className="space-y-4">
              <RoleTargetEditor
                initialTargets={localRoleTargets}
                revision={revision}
                onRevisionChange={onRevisionChange}
                onTargetsChange={setLocalRoleTargets}
              />
              <details className="group rounded-xl border border-white/[0.08] bg-black/10">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-[11px] font-semibold text-[#cbd2dd] [&::-webkit-details-marker]:hidden">
                  Location, pay and background
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="border-t border-white/[0.08]">
                  <CandidateProfileForm
                    embedded
                    profile={coreProfile}
                    onRevisionChange={onRevisionChange}
                  />
                </div>
              </details>
              <details className="group rounded-xl border border-white/[0.08] bg-black/10">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-[11px] font-semibold text-[#cbd2dd] [&::-webkit-details-marker]:hidden">
                  Hard filters and eligibility
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="border-t border-white/[0.08] p-3">
                  <SearchPreferencesEditor
                    initialValue={searchPreferences}
                    revision={revision}
                    onRevisionChange={onRevisionChange}
                  />
                </div>
              </details>
            </div>
          </EditorDisclosure>

          <EditorDisclosure
            step="02"
            title="Experience & résumé"
            description={`${evidenceCount} confirmed evidence ${evidenceCount === 1 ? "record" : "records"} · raw résumé text deleted by default`}
          >
            <ResumeImportReview
              initialDrafts={profile.resumeImportDrafts}
              revision={revision}
              onRevisionChange={onRevisionChange}
            />
            <details className="group mt-4 rounded-xl border border-white/[0.08] bg-black/10">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-[11px] font-semibold text-[#cbd2dd] [&::-webkit-details-marker]:hidden">
                Edit confirmed evidence
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="border-t border-white/[0.08]">
                <ProfileEvidenceEditor
                  embedded
                  education={profile.educationRecords}
                  projects={profile.projects}
                  revision={revision}
                  skills={profile.skillEvidence}
                  workHistory={profile.workHistory}
                  onRevisionChange={onRevisionChange}
                />
              </div>
            </details>
          </EditorDisclosure>

          <EditorDisclosure
            step="03"
            title="What the feed learned"
            description={`${stats.reviewed} reviewed · ${impact.learnedPreferences.signalCount} explicit preference signals`}
          >
            <ActivityAndLearning impact={impact} stats={stats} />
            <div className="mt-5">
              <FeedImpact impact={impact} />
            </div>
          </EditorDisclosure>

          <EditorDisclosure
            step="04"
            title="Account, notifications & privacy"
            description={isGuest ? "Guest workspace · add recovery when you are ready" : "Recovery, notifications and data controls"}
          >
          <p className="text-[11px] leading-5 text-[#8793a8]">
            Salary, eligibility, evidence, saves, and decisions stay inside your JobSwipe workspace. Employers never receive this profile.
          </p>
          <div className="mt-4 [&_[data-slot=button]]:text-[#d9dfeb] [&_p]:text-[#9da8bb] [&_[role=alert]]:text-[#ff9aaa]">
            <AccountDataControls
              initialResumes={resumes}
              initialSettings={productSettings}
              isGuest={isGuest}
            />
          </div>
          </EditorDisclosure>
        </div>
      </section>
    </div>
  );
}
