"use client";

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
        "min-h-11 rounded-lg border px-3 text-[12px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#6f9bea] disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none",
        active
          ? "border-[#4f7fd8] bg-[#203658] text-[#bcd0f5]"
          : "border-[#303b49] bg-[#18212c] text-[#9da8b9] hover:bg-[#202b38] hover:text-[#dce1e9]",
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

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const stored = readEmergencyProfile() ?? DEFAULT_EMERGENCY_PROFILE;
      setProfile(stored);
      setSavedFingerprint(profileFingerprint(stored));
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const activeRoles = useMemo(
    () => new Set(profile.targetRoleFamilies),
    [profile.targetRoleFamilies],
  );
  const currentFingerprint = profileFingerprint(profile);
  const dirty = currentFingerprint !== savedFingerprint;
  function update(next: EmergencyFeedProfile) {
    setSavedAnnouncement("");
    setProfile(next);
  }

  function persist() {
    const result = saveEmergencyProfileWithStatus(profile);
    setProfile(result.profile);
    if (!result.persisted) {
      setSavedAnnouncement(
        "Couldn’t save",
      );
      return false;
    }
    setSavedFingerprint(profileFingerprint(result.profile));
    setSavedAnnouncement("Saved");
    return true;
  }

  return (
    <section className="mx-auto mt-2 w-full max-w-[27rem] pb-8 text-white">
      <header className="flex min-h-12 items-center px-1">
        <h1 className="text-xl font-semibold tracking-[-0.03em]">Preferences</h1>
      </header>

      <div className="mt-3 rounded-[1.25rem] border border-[#2b3542] bg-[#151d27] p-4 sm:p-5">
        <div className="space-y-6">
          <fieldset>
            <legend className="text-[13px] font-semibold text-white">Roles</legend>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {ROLE_OPTIONS.map((role) => {
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
          </fieldset>

          <fieldset className="border-t border-[#2b3542] pt-5">
            <legend className="text-[13px] font-semibold text-white">Level</legend>
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

          <fieldset className="border-t border-[#2b3542] pt-5">
            <legend className="text-[13px] font-semibold text-white">Location</legend>
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

          <fieldset className="border-t border-[#2b3542] pt-5">
            <legend className="text-[13px] font-semibold text-white">Work mode</legend>
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

          <fieldset className="border-t border-[#2b3542] pt-5">
            <legend className="text-[13px] font-semibold text-white">Salary</legend>
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

          <div className="border-t border-[#2b3542] pt-5">
            <button
              type="button"
              onClick={persist}
              disabled={!dirty}
              className="min-h-12 w-full rounded-xl bg-[#4f7fd8] px-5 text-sm font-semibold text-white outline-none transition-colors hover:bg-[#6693e2] focus-visible:ring-2 focus-visible:ring-[#8caef0] disabled:bg-[#26313e] disabled:text-[#7f8a99] motion-reduce:transition-none"
            >
              {dirty ? "Save" : "Saved"}
            </button>
            <p
              className={cn(
                "min-h-5 pt-2 text-center text-[11px]",
                savedAnnouncement.startsWith("Couldn’t")
                  ? "text-amber-200"
                  : "text-[#7da4ed]",
              )}
              role="status"
              aria-live="polite"
            >
              {savedAnnouncement}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
