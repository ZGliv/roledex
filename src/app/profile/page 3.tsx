import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  CircleDollarSign,
  Crosshair,
  LockKeyhole,
  MapPin,
  ShieldCheck,
} from "lucide-react";

import { OWNER_VISITOR_ID } from "@/features/auth/identity";
import {
  CandidateProfileForm,
  type CandidateProfileFormValue,
} from "@/features/candidate/components/candidate-profile-form";
import { getCandidateProfileView } from "@/features/candidate/queries";
import { ResetWorkspaceControl } from "@/features/visitor/components/reset-workspace-control";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Your preferences" };
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function readableArrangement(value: string) {
  return value.replaceAll("_", "-").replace(/^./, (letter) => letter.toUpperCase());
}

export default async function ProfilePage() {
  const profile = await getCandidateProfileView();
  const editableProfile: CandidateProfileFormValue = {
    careerGoals: profile.careerGoals,
    currentRole: profile.currentRole,
    currentSalaryCents: profile.currentSalaryCents,
    dealBreakers: profile.dealBreakers,
    interests: profile.interests,
    interviewConcerns: profile.interviewConcerns,
    location: profile.location,
    preferredIndustries: profile.preferredIndustries,
    preferredSalaryMinimumCents: profile.preferredSalaryMinimumCents,
    preferredSalaryTargetCents: profile.preferredSalaryTargetCents,
    preferredWorkArrangements: profile.preferredWorkArrangements,
    relocationPreference: profile.relocationPreference,
    revision: profile.revision,
    skills: profile.skills,
    strengths: profile.strengths,
    targetRoleFamilies: profile.targetRoleFamilies,
    weaknesses: profile.weaknesses,
    yearsExperience: profile.yearsExperience,
  };

  const targetRoles = profile.targetRoleFamilies.slice(0, 2).join(" · ") || "Choose a direction";
  const workStyles =
    profile.preferredWorkArrangements.map(readableArrangement).join(" · ") ||
    "Choose work modes";
  const targetCompensation =
    profile.preferredSalaryMinimumCents > 0 && profile.preferredSalaryTargetCents > 0
      ? `${formatMoney(profile.preferredSalaryMinimumCents)}–${formatMoney(profile.preferredSalaryTargetCents)}`
      : "Set your range";

  const signals = [
    { icon: Crosshair, label: "Direction", value: targetRoles },
    { icon: MapPin, label: "Home base", value: profile.location || "Add location" },
    { icon: ShieldCheck, label: "Work modes", value: workStyles },
    { icon: CircleDollarSign, label: "Target base", value: targetCompensation },
  ];

  return (
    <div className="ambient-page app-viewport overflow-x-clip">
      <div className="relative mx-auto w-full max-w-6xl px-4 pt-7 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-10 lg:px-8">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="ink-gradient max-w-2xl text-3xl font-semibold tracking-[-0.05em] sm:text-5xl">
              What does a good move look like?
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#626a7a]">
              Set the essentials once. JobSwipe uses them to rank openings and explain which ones deserve your time.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex h-11 w-fit items-center gap-2 rounded-lg px-2 text-xs font-medium text-[#4e576b] transition hover:bg-white/45 hover:text-[#202a3d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to jobs
          </Link>
        </header>

        <section
          className="glass-panel mt-7 overflow-hidden rounded-[1.35rem] p-4 sm:p-5"
          aria-labelledby="active-context-heading"
        >
          <div>
            <h2 id="active-context-heading" className="text-sm font-semibold tracking-[-0.02em] text-[#111828]">
              Current search profile
            </h2>
            <p className="mt-0.5 text-xs text-[#70788a]">Private signals used to rank every role</p>
          </div>

          <div className="mt-4 grid grid-cols-2 border-t border-[#27324a]/[0.08] lg:grid-cols-4">
            {signals.map(({ icon: Icon, label, value }) => (
              <div key={label} className="min-w-0 border-b border-[#27324a]/[0.07] px-1 py-3.5 odd:pr-3 even:border-l even:pl-3 lg:border-b-0 lg:border-l lg:px-4 lg:first:border-l-0 lg:first:pl-1">
                <div className="flex items-center gap-1.5 text-[#727a8b]">
                  <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                  <p className="text-[11px] font-medium">{label}</p>
                </div>
                <p className="mt-1.5 line-clamp-2 text-xs font-semibold leading-5 tracking-[-0.015em] text-[#172033] sm:text-sm">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]" id="profile-editor">
          <CandidateProfileForm profile={editableProfile} />

          <aside className="space-y-4 lg:sticky lg:top-20">
            <div className="glass-dark rounded-[1.25rem] p-5 text-white">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Crosshair className="size-4 text-[#8f85ff]" aria-hidden="true" />
                  What changes after save
                </p>
                <ol className="mt-4 divide-y divide-white/10 text-xs leading-5 text-white/68">
                  <li className="py-2.5 first:pt-0">
                    Jobs are reranked using your updated preferences.
                  </li>
                  <li className="py-2.5">
                    Better-fit roles move up; hard conflicts become visible.
                  </li>
                  <li className="py-2.5 last:pb-0">
                    You can revise anything later without losing saved jobs.
                  </li>
                </ol>
              </div>
            </div>

            <div className="glass-panel-strong rounded-[1.25rem] p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-[#111828]">Portfolio proof</h2>
                <span className="text-xs tabular-nums text-[#697185]">{profile.projects.length} projects</span>
              </div>
              {profile.projects.length > 0 ? (
                <div className="mt-4 space-y-4">
                  {profile.projects.map((project) => (
                    <article key={project.id} className="border-t border-[#27324a]/[0.07] pt-4 first:border-0 first:pt-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="truncate text-sm font-semibold text-[#172033]">{project.name}</h3>
                        <span className="shrink-0 text-[11px] capitalize text-[#697185]">
                          {project.status}
                        </span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[#697185]">{project.description}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs leading-5 text-[#697185]">No portfolio projects are attached yet. Your professional experience still drives the ranking.</p>
              )}
              <p className="mt-4 border-t border-[#27324a]/[0.07] pt-4 text-[11px] leading-5 text-[#697185]">
                Projects can support relevance, but never inflate professional tenure.
              </p>
            </div>

            <div className="glass-panel-strong rounded-[1.25rem] p-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-[#111828]">
                <LockKeyhole className="size-4 text-[#278e78]" aria-hidden="true" />
                Private by design
              </p>
              <p className="mt-2 text-xs leading-5 text-[#697185]">
                Salary and preferences stay inside your JobSwipe workspace. They are never sent to an employer.
              </p>
              {profile.visitorId !== OWNER_VISITOR_ID ? (
                <>
                  <p className="mt-2 text-[11px] leading-5 text-[#7a8190]">This guest workspace is tied to this browser and can be erased anytime.</p>
                  <ResetWorkspaceControl />
                </>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
