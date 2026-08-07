import type { Metadata } from "next";
import {
  BriefcaseBusiness,
  CircleDollarSign,
  MapPin,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { CandidateProfileForm } from "@/features/candidate/components/candidate-profile-form";
import { getCandidateProfileView } from "@/features/candidate/queries";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Candidate profile" };
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function ProfilePage() {
  const profile = await getCandidateProfileView();

  return (
    <div className="app-viewport bg-[#f5f6f8]">
      <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#c63d4a]">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Personal fit model
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-[-0.045em] text-[#15161a] sm:text-4xl">
              Make the ranking yours.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#656970]">
              Edit the facts and preferences behind every recommendation. Saving creates a new
              profile revision and recalculates the current job library without changing a listing.
            </p>
          </div>
          <Badge
            variant="outline"
            className="w-fit rounded-full border-black/[0.08] bg-white px-3 py-1.5 font-mono text-[11px] text-[#656970]"
          >
            Revision {profile.revision}
          </Badge>
        </header>

        <section
          className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          aria-label="Current profile baseline"
        >
          {[
            {
              icon: BriefcaseBusiness,
              label: "Current role",
              value: profile.currentRole,
            },
            {
              icon: CircleDollarSign,
              label: "Current salary",
              value: formatMoney(profile.currentSalaryCents),
            },
            {
              icon: RefreshCw,
              label: "Minimum → target",
              value: `${formatMoney(profile.preferredSalaryMinimumCents)} → ${formatMoney(
                profile.preferredSalaryTargetCents,
              )}`,
            },
            {
              icon: MapPin,
              label: "Location",
              value: profile.location ?? "Not set",
            },
          ].map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(24,28,38,.045)] ring-1 ring-black/[0.055]"
            >
              <Icon className="size-4 text-[#c63d4a]" aria-hidden="true" />
              <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.12em] text-[#60646b]">
                {label}
              </p>
              <p className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-[#15161a]">
                {value}
              </p>
            </div>
          ))}
        </section>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <CandidateProfileForm profile={profile} />

          <aside className="space-y-4 lg:sticky lg:top-20">
            <div className="rounded-2xl bg-[#15161a] p-5 text-white shadow-[0_18px_45px_rgba(18,22,32,.14)]">
              <p className="text-sm font-semibold">What changes after save</p>
              <ol className="mt-3 space-y-3 text-xs leading-5 text-white/65">
                <li className="flex gap-3">
                  <span className="font-mono text-[#f18a91]">01</span>
                  The profile revision and fingerprint advance together.
                </li>
                <li className="flex gap-3">
                  <span className="font-mono text-[#f18a91]">02</span>
                  Every current listing is scored against the new baseline.
                </li>
                <li className="flex gap-3">
                  <span className="font-mono text-[#f18a91]">03</span>
                  The deck keeps one newest score per job—never duplicate cards.
                </li>
              </ol>
            </div>

            <div className="rounded-2xl bg-white p-5 ring-1 ring-black/[0.06]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-[#15161a]">Portfolio proof</h2>
                <span className="text-xs tabular-nums text-[#60646b]">
                  {profile.projects.length}
                </span>
              </div>
              <div className="mt-4 space-y-4">
                {profile.projects.map((project) => (
                  <article key={project.id} className="border-t border-black/[0.06] pt-4 first:border-0 first:pt-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-[#15161a]">{project.name}</h3>
                      <span className="rounded-full bg-[#f1f2f4] px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-[#656970]">
                        {project.status}
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-3 text-xs leading-5 text-[#656970]">
                      {project.description}
                    </p>
                  </article>
                ))}
              </div>
              <p className="mt-4 border-t border-black/[0.06] pt-4 text-[11px] leading-5 text-[#60646b]">
                Projects support portfolio relevance but never count as professional tenure.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
