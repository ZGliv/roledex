import type { Metadata } from "next";
import { FolderKanban, LockKeyhole } from "lucide-react";

import { OWNER_VISITOR_ID } from "@/features/auth/identity";
import {
  CandidateProfileForm,
  type CandidateProfileFormValue,
} from "@/features/candidate/components/candidate-profile-form";
import { getCandidateProfileView } from "@/features/candidate/queries";
import { ResetWorkspaceControl } from "@/features/visitor/components/reset-workspace-control";

export const metadata: Metadata = { title: "Your profile" };
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

  return (
    <div className="job-deck-bg app-viewport overflow-x-clip">
      <div className="safe-page-top mx-auto w-full max-w-3xl px-4 pb-8 sm:px-6 sm:pb-10">
        <header className="border-b border-white/10 pb-5 pt-2 sm:pb-6 sm:pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8176ff]">
            Personal ranking
          </p>
          <h1 className="mt-2 text-[1.75rem] font-semibold leading-8 tracking-[-0.04em] text-[#f6f8fc] sm:text-[2rem]">
            Your profile
          </h1>
          <p className="mt-2 max-w-xl text-[13px] leading-5 text-[#9da8bb] sm:text-sm sm:leading-6">
            The evidence JobSwipe uses to rank roles, estimate fit, and explain the tradeoffs. Nothing here is shared with employers.
          </p>
        </header>

        <div className="mt-5" id="profile-editor">
          <CandidateProfileForm profile={editableProfile} />
        </div>

        <section
          className="editorial-dark-surface mt-5 overflow-hidden rounded-[1.35rem]"
          aria-labelledby="supporting-context-heading"
        >
          <div className="flex items-center justify-between gap-4 border-b border-white/[0.09] px-4 py-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <FolderKanban className="size-4 shrink-0 text-[#8176ff]" aria-hidden="true" />
              <div className="min-w-0">
                <h2 id="supporting-context-heading" className="text-sm font-semibold text-[#edf1f8]">
                  Portfolio evidence
                </h2>
                <p className="mt-0.5 text-[11px] leading-4 text-[#8995aa]">
                  Supporting proof, never substituted for professional tenure.
                </p>
              </div>
            </div>
            <span className="shrink-0 text-[11px] font-medium tabular-nums text-[#8f9aae]">
              {profile.projects.length} {profile.projects.length === 1 ? "project" : "projects"}
            </span>
          </div>

          {profile.projects.length > 0 ? (
            <div>
              {profile.projects.map((project) => (
                <article
                  key={project.id}
                  className="border-b border-white/[0.08] px-4 py-4 last:border-b-0 sm:px-5"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="truncate text-[13px] font-semibold text-[#e8ecf4]">
                      {project.name}
                    </h3>
                    <span className="shrink-0 text-[11px] capitalize text-[#8995aa]">
                      {project.status}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#9da8bb]">
                    {project.description}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="px-4 py-5 text-[12px] leading-5 text-[#98a4b8] sm:px-5">
              No portfolio projects are attached yet. Your professional experience still drives ranking.
            </p>
          )}

          <div className="border-t border-white/[0.09] px-4 py-5 sm:px-5">
            <div className="flex items-start gap-3">
              <LockKeyhole className="mt-0.5 size-4 shrink-0 text-[#8176ff]" aria-hidden="true" />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[#edf1f8]">Private workspace</h2>
                <p className="mt-1 text-[12px] leading-5 text-[#98a4b8]">
                  Salary, preferences, saves, and decisions stay inside your JobSwipe workspace.
                </p>
                {profile.visitorId !== OWNER_VISITOR_ID ? (
                  <div className="[&_[data-slot=button]]:text-[#d7ddea] [&_p]:text-[#aeb8ca] [&_[role=alert]]:text-[#ff9aaa]">
                    <p className="mt-2 text-[11px] leading-4">
                      This guest workspace belongs to this browser and can be erased at any time.
                    </p>
                    <ResetWorkspaceControl />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
