"use client";

import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  DEFAULT_EMERGENCY_PROFILE,
  type EmergencyFeedProfile,
} from "@/features/jobs/emergency-feed";
import {
  readEmergencyProfile,
  saveEmergencyProfileWithStatus,
} from "@/features/jobs/emergency-feed-storage";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS = DEFAULT_EMERGENCY_PROFILE.targetRoleFamilies;
const SENIORITY_OPTIONS = ["entry", "mid", "senior"] as const;
const WORK_MODE_OPTIONS = ["remote", "hybrid", "on_site"] as const;
const SALARY_OPTIONS = [0, 60_000, 70_000, 80_000, 90_000] as const;
const LOCATION_OPTIONS = [
  { label: "Pittsburgh area", value: "Pittsburgh, PA" },
  { label: "Remote, US", value: "Remote, US" },
  { label: "Anywhere in US", value: null },
] as const;

const ROLE_LABELS: Record<string, string> = {
  "AI business analyst": "Business analysis",
  "AI enablement specialist": "AI enablement",
  "AI implementation specialist": "AI implementation",
  "AI operations analyst": "AI operations",
  "AI solutions consultant": "Solutions consulting",
  "Associate product manager": "Associate product",
  "Automation specialist": "Automation",
  "Health-tech implementation specialist": "Health-tech implementation",
  "Junior solutions engineer": "Solutions engineering",
  "Product operations analyst": "Product operations",
  "Technical customer success": "Technical success",
};

const WORK_MODE_LABELS: Record<(typeof WORK_MODE_OPTIONS)[number], string> = {
  hybrid: "Hybrid",
  on_site: "On-site",
  remote: "Remote",
};

const SENIORITY_LABELS: Record<(typeof SENIORITY_OPTIONS)[number], string> = {
  entry: "Entry",
  mid: "Mid-level",
  senior: "Senior",
};

function profileFingerprint(profile: EmergencyFeedProfile) {
  return JSON.stringify(profile);
}

function toggleValue<T extends string>(values: readonly T[], value: T) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function shortRoleSummary(roles: readonly string[]) {
  if (roles.length === 0) return "No role directions selected";
  const visible = roles.slice(0, 2).map((role) => ROLE_LABELS[role] ?? role);
  return roles.length > 2
    ? `${visible.join(", ")} +${roles.length - 2}`
    : visible.join(", ");
}

function salaryLabel(cents: number) {
  return cents > 0 ? `$${Math.round(cents / 100_000)}K+ posted pay` : "No posted-pay floor";
}

function ChoiceButton({
  active,
  children,
  disabled = false,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-xl border px-3 text-[12px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-[#aaa3ff]/55 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none",
        active
          ? "border-[#aaa3ff]/38 bg-[#8176ff]/18 text-[#e1deff] shadow-[inset_0_1px_0_rgba(255,255,255,.1)]"
          : "border-white/[0.09] bg-white/[0.035] text-[#9da8b9] hover:bg-white/[0.07] hover:text-[#dce1e9]",
      )}
    >
      {children}
    </button>
  );
}

export function EmergencyProfilePanel() {
  const [profile, setProfile] = useState<EmergencyFeedProfile>(
    DEFAULT_EMERGENCY_PROFILE,
  );
  const [savedFingerprint, setSavedFingerprint] = useState(() =>
    profileFingerprint(DEFAULT_EMERGENCY_PROFILE),
  );
  const [savedAnnouncement, setSavedAnnouncement] = useState("");
  const [customRole, setCustomRole] = useState("");

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const stored = readEmergencyProfile() ?? DEFAULT_EMERGENCY_PROFILE;
      setProfile(stored);
      setSavedFingerprint(profileFingerprint(stored));
      if (window.location.hash === "#direction") {
        const editor = document.getElementById("direction");
        if (editor instanceof HTMLDetailsElement) editor.open = true;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const activeRoles = useMemo(
    () => new Set(profile.targetRoleFamilies),
    [profile.targetRoleFamilies],
  );
  const currentFingerprint = profileFingerprint(profile);
  const dirty = currentFingerprint !== savedFingerprint;
  const hardFilterSummary = `${salaryLabel(profile.preferredSalaryMinimumCents)} · ${
    profile.preferredWorkModes.length > 0
      ? profile.preferredWorkModes.map((mode) => WORK_MODE_LABELS[mode]).join(", ")
      : "Any work setup"
  } · ${profile.desiredSeniorityLevels
    .map((level) => SENIORITY_LABELS[level])
    .join(" + ")}`;

  function update(next: EmergencyFeedProfile) {
    setSavedAnnouncement("");
    setProfile(next);
  }

  function persist() {
    const result = saveEmergencyProfileWithStatus(profile);
    setProfile(result.profile);
    if (!result.persisted) {
      setSavedAnnouncement(
        "Couldn’t save on this device. Allow browser storage and try again.",
      );
      return false;
    }
    setSavedFingerprint(profileFingerprint(result.profile));
    setSavedAnnouncement("Saved. Your next feed uses these choices.");
    return true;
  }

  return (
    <section className="mx-auto mt-6 w-full max-w-[27rem] pb-8 text-white">
      <header className="px-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8f99aa]">
          Your feed
        </p>
        <h1 className="mt-1.5 font-display text-[2rem] font-semibold tracking-[-0.05em]">
          What shapes your feed
        </h1>
        <p className="mt-2 max-w-sm text-[13px] leading-5 text-[#9ca8bb]">
          The choices below are used when live company listings are collected and ordered for you.
        </p>
      </header>

      <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#0a101d]/76 shadow-[0_24px_80px_rgba(0,0,0,.32),inset_0_1px_0_rgba(255,255,255,.08)] backdrop-blur-2xl">
        <div className="grid grid-cols-2 divide-x divide-white/[0.08] border-b border-white/[0.08]">
          <div className="min-w-0 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#71d7ad]">
              Must match
            </p>
            <p className="mt-2 text-[12px] leading-5 text-[#d6dce6]">
              {hardFilterSummary}
            </p>
          </div>
          <div className="min-w-0 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#aaa3ff]">
              Rank higher
            </p>
            <p className="mt-2 text-[12px] leading-5 text-[#d6dce6]">
              {shortRoleSummary(profile.targetRoleFamilies)}
              {profile.location ? ` · ${profile.location}` : " · US-wide"}
            </p>
          </div>
        </div>

        <div className="px-4 py-3 text-[11px] leading-5 text-[#8995a7]">
          Known seniority, work setup, and employer-posted pay are hard filters. Role direction and home area change the order. Jobs with unclear details stay visible and say what is unknown.
        </div>
      </div>

      <details id="direction" className="group mt-4 scroll-mt-4 overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#090f1b]/78 shadow-[inset_0_1px_0_rgba(255,255,255,.06)] backdrop-blur-2xl">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-5 text-[13px] font-semibold text-[#edf0f5] outline-none hover:bg-white/[0.035] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#aaa3ff]/50 [&::-webkit-details-marker]:hidden">
          Edit what I see
          <ChevronDown
            className="size-4 text-[#9da8b9] transition-transform group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>

        <div className="space-y-6 border-t border-white/[0.08] p-4 sm:p-5">
          <fieldset>
            <legend className="text-[13px] font-semibold text-white">Role directions</legend>
            <p className="mt-1 text-[11px] leading-4 text-[#8490a3]">
              These roles are ranked first. Keep at least one.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {Array.from(new Set([...ROLE_OPTIONS, ...profile.targetRoleFamilies])).map((role) => {
                const active = activeRoles.has(role);
                return (
                  <ChoiceButton
                    key={role}
                    active={active}
                    disabled={active && activeRoles.size === 1}
                    onClick={() =>
                      update({
                        ...profile,
                        targetRoleFamilies: toggleValue(
                          profile.targetRoleFamilies,
                          role,
                        ),
                      })
                    }
                  >
                    {ROLE_LABELS[role] ?? role}
                  </ChoiceButton>
                );
              })}
            </div>
            <form className="mt-3 flex gap-2" onSubmit={(event) => {
              event.preventDefault();
              const role = customRole.trim();
              if (!role || profile.targetRoleFamilies.length >= 30) return;
              if (!profile.targetRoleFamilies.some((current) => current.toLowerCase() === role.toLowerCase())) update({ ...profile, targetRoleFamilies: [...profile.targetRoleFamilies, role] });
              setCustomRole("");
            }}>
              <label className="min-w-0 flex-1"><span className="sr-only">Custom role</span><input value={customRole} onChange={(event) => setCustomRole(event.target.value)} maxLength={100} placeholder="Add a role" className="h-12 w-full rounded-xl border border-white/15 bg-white/[0.04] px-3 text-base text-white outline-none placeholder:text-[#6f7c91] focus:border-[#aaa3ff]" /></label>
              <button type="submit" disabled={!customRole.trim() || profile.targetRoleFamilies.length >= 30} className="min-h-12 rounded-xl border border-[#aaa3ff]/30 bg-[#8176ff]/15 px-4 text-sm font-semibold text-[#c9c3ff] disabled:opacity-40">Add</button>
            </form>
          </fieldset>

          <fieldset className="border-t border-white/[0.08] pt-5">
            <legend className="text-[13px] font-semibold text-white">Level</legend>
            <p className="mt-1 text-[11px] leading-4 text-[#8490a3]">
              Jobs with a clearly stated level must be one you select. Keep at least one.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {SENIORITY_OPTIONS.map((level) => {
                const active = profile.desiredSeniorityLevels.includes(level);
                return (
                  <ChoiceButton
                    key={level}
                    active={active}
                    disabled={active && profile.desiredSeniorityLevels.length === 1}
                    onClick={() =>
                      update({
                        ...profile,
                        desiredSeniorityLevels: toggleValue(
                          profile.desiredSeniorityLevels,
                          level,
                        ),
                      })
                    }
                  >
                    {SENIORITY_LABELS[level]}
                  </ChoiceButton>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="border-t border-white/[0.08] pt-5">
            <legend className="text-[13px] font-semibold text-white">Home area</legend>
            <p className="mt-1 text-[11px] leading-4 text-[#8490a3]">
              All results remain US-compatible; this decides which locations rank first.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">
              {LOCATION_OPTIONS.map((option) => (
                <ChoiceButton
                  key={option.label}
                  active={profile.location === option.value}
                  onClick={() => update({ ...profile, location: option.value })}
                >
                  {option.label}
                </ChoiceButton>
              ))}
            </div>
          </fieldset>

          <label className="block border-t border-white/[0.08] pt-5 text-[13px] font-semibold text-white">City or region
            <input value={profile.location ?? ""} onChange={(event) => update({ ...profile, location: event.target.value || null })} maxLength={120} placeholder="Anywhere in the US" className="mt-3 h-12 w-full rounded-xl border border-white/15 bg-white/[0.04] px-3 text-base font-normal text-white outline-none placeholder:text-[#6f7c91] focus:border-[#aaa3ff]" />
          </label>

          <fieldset className="border-t border-white/[0.08] pt-5">
            <legend className="text-[13px] font-semibold text-white">Work setup</legend>
            <p className="mt-1 text-[11px] leading-4 text-[#8490a3]">
              A known setup must be one you select. Keep at least one.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {WORK_MODE_OPTIONS.map((mode) => {
                const active = profile.preferredWorkModes.includes(mode);
                return (
                  <ChoiceButton
                    key={mode}
                    active={active}
                    disabled={active && profile.preferredWorkModes.length === 1}
                    onClick={() =>
                      update({
                        ...profile,
                        preferredWorkModes: toggleValue(
                          profile.preferredWorkModes,
                          mode,
                        ),
                      })
                    }
                  >
                    {WORK_MODE_LABELS[mode]}
                  </ChoiceButton>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="border-t border-white/[0.08] pt-5">
            <legend className="text-[13px] font-semibold text-white">Minimum salary</legend>
            <p className="mt-1 text-[11px] leading-4 text-[#8490a3]">
              Roles with employer-posted maximum pay below this are hidden. Estimates stay visible and labeled.
            </p>
            <div className="mt-3 grid grid-cols-5 gap-1.5">
              {SALARY_OPTIONS.map((amount) => (
                <ChoiceButton
                  key={amount}
                  active={profile.preferredSalaryMinimumCents === amount * 100}
                  onClick={() =>
                    update({
                      ...profile,
                      preferredSalaryMinimumCents: amount * 100,
                    })
                  }
                >
                  {amount === 0 ? "Any" : `$${amount / 1_000}K`}
                </ChoiceButton>
              ))}
            </div>
          </fieldset>

          <div className="border-t border-white/[0.08] pt-5">
            <button
              type="button"
              onClick={persist}
              disabled={!dirty}
              className="min-h-12 w-full rounded-xl bg-white px-5 text-sm font-semibold text-[#172035] shadow-[0_14px_32px_rgba(0,0,0,.24)] outline-none transition hover:bg-[#f2f4ff] focus-visible:ring-2 focus-visible:ring-white/60 disabled:bg-white/12 disabled:text-white/45 disabled:shadow-none motion-reduce:transition-none"
            >
              {dirty ? "Save changes" : "Changes saved"}
            </button>
            <Link
              href="/"
              onClick={
                dirty
                  ? (event) => {
                      if (!persist()) event.preventDefault();
                    }
                  : undefined
              }
              className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-[12px] font-semibold text-[#c9c4ff] outline-none hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[#aaa3ff]/50"
            >
              See updated feed <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
            <p
              className={cn(
                "min-h-5 text-center text-[11px]",
                savedAnnouncement.startsWith("Couldn’t")
                  ? "text-amber-200"
                  : "text-[#71d7ad]",
              )}
              role="status"
              aria-live="polite"
            >
              {savedAnnouncement}
            </p>
          </div>
        </div>
      </details>

      <details className="mt-4 rounded-[1.25rem] border border-white/[0.08] bg-white/[0.025] px-4 text-[#8995a7]">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-[11px] font-semibold text-[#aeb7c5] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#aaa3ff]/45 [&::-webkit-details-marker]:hidden">
          What can the live feed use right now?
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </summary>
        <div className="border-t border-white/[0.07] py-4 text-[11px] leading-5">
          <p>
            <span className="font-semibold text-[#d5dbe5]">Used now:</span> target titles, seniority, US location, known work setup, employer-posted pay, and experience requirements.
          </p>
          <p className="mt-2">
            <span className="font-semibold text-[#d5dbe5]">Waiting for workspace sync:</span> résumé evidence, skill-level fit, authorization, and preferences learned from your swipes.
          </p>
        </div>
      </details>
    </section>
  );
}
