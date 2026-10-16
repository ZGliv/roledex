"use client";

import { useState, useTransition } from "react";

import { replaceCandidateRoleTargetsAction } from "@/features/candidate/actions";
import { ROLE_DIRECTION_PRESETS } from "@/features/candidate/search-contract-defaults";
import { roleTargetInput } from "@/features/candidate/role-target-input";
import { cn } from "@/lib/utils";

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

function normalizeRoleFamilyKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export type RoleTargetValue = {
  aliases: string[];
  allowedSeniorityLevels: Seniority[];
  canonicalFamily: string;
  exclusions: string[];
  label: string;
  maximumRequiredExperienceYears: number | null;
  minimumRequiredExperienceYears: number | null;
  priorityRank: number;
  readiness: "ready_now" | "stretch";
};

function lines(value: string) {
  const seen = new Set<string>();
  return value
    .split(/\n|,/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => {
      const key = item.toLocaleLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function newTarget(
  label: string,
  canonicalFamily: string,
  readiness: "ready_now" | "stretch",
  aliases: readonly string[] = [],
): RoleTargetValue {
  return {
    aliases: [...aliases],
    allowedSeniorityLevels: ["entry", "mid"],
    canonicalFamily,
    exclusions: ["Senior", "Staff", "Principal", "Manager", "Requires 4+ years"],
    label,
    maximumRequiredExperienceYears: 3,
    minimumRequiredExperienceYears: 0,
    priorityRank: 1,
    readiness,
  };
}

export function RoleTargetEditor({
  initialTargets,
  onRevisionChange,
  onTargetsChange,
  revision,
}: {
  initialTargets: readonly RoleTargetValue[];
  onRevisionChange: (revision: number) => void;
  onTargetsChange?: (targets: RoleTargetValue[]) => void;
  revision: number;
}) {
  const [targets, setTargets] = useState<RoleTargetValue[]>(
    initialTargets.map((target) => ({ ...target })),
  );
  const [customLabel, setCustomLabel] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedFamilies = new Set(targets.map((target) => target.canonicalFamily));

  function updateTarget(index: number, patch: Partial<RoleTargetValue>) {
    setTargets((current) =>
      current.map((target, targetIndex) =>
        targetIndex === index ? { ...target, ...patch } : target,
      ),
    );
    setMessage(null);
  }

  function addPreset(preset: (typeof ROLE_DIRECTION_PRESETS)[number]) {
    if (selectedFamilies.has(preset.canonicalFamily) || targets.length >= 12) return;
    setTargets((current) => [
      ...current,
      newTarget(
        preset.label,
        preset.canonicalFamily,
        preset.readiness,
        preset.aliases,
      ),
    ]);
  }

  function addCustom() {
    const label = customLabel.replace(/\s+/g, " ").trim();
    const canonicalFamily = normalizeRoleFamilyKey(label);
    if (!label || !canonicalFamily || selectedFamilies.has(canonicalFamily)) return;
    setTargets((current) => [
      ...current,
      newTarget(label, canonicalFamily, "ready_now"),
    ]);
    setCustomLabel("");
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await replaceCandidateRoleTargetsAction({
        expectedRevision: revision,
        targets: targets.map((target, index) => roleTargetInput(target, index + 1)),
      });
      setMessage(
        result.ok
          ? result.message
          : Object.values(result.fieldErrors ?? {}).flat()[0] ?? result.message,
      );
      if (result.ok && result.revision !== undefined) {
        onRevisionChange(result.revision);
        onTargetsChange?.(
          targets.map((target, index) => ({
            ...target,
            priorityRank: index + 1,
          })),
        );
      }
    });
  }

  return (
    <div>
      <div className="border-b border-white/[0.08] pb-5">
        <p className="text-[13px] font-semibold text-[#f0f3f8]">Role directions</p>
        <p className="mt-1 text-[11px] leading-5 text-[#8b96a9]">
          Ready now drives most of the feed. Stretch stays plausible and can never bypass your hard filters.
        </p>
      </div>

      <ol className="divide-y divide-white/[0.08]">
        {targets.map((target, index) => (
          <li key={target.canonicalFamily} className="py-4">
            <div className="flex items-start gap-3">
              <span className="mt-1 w-5 shrink-0 font-mono text-[10px] tabular-nums text-[#68748a]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-5 text-[#e9edf4]">
                  {target.label}
                </p>
                <p className="mt-0.5 text-[10px] leading-4 text-[#7d899d]">
                  Up to {target.maximumRequiredExperienceYears ?? "any"} required years · {target.allowedSeniorityLevels.join(" / ")}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateTarget(index, {
                    readiness:
                      target.readiness === "ready_now" ? "stretch" : "ready_now",
                  })
                }
                className={cn(
                  "min-h-9 shrink-0 rounded-full border px-3 text-[9px] font-semibold uppercase tracking-[0.08em] outline-none transition focus-visible:ring-2 focus-visible:ring-[#8176ff]/55",
                  target.readiness === "ready_now"
                    ? "border-[#64d2a3]/25 bg-[#64d2a3]/10 text-[#79ddb5]"
                    : "border-[#948bff]/25 bg-[#8176ff]/10 text-[#b5afff]",
                )}
              >
                {target.readiness === "ready_now" ? "Ready now" : "Stretch"}
              </button>
            </div>
            <details className="group ml-8 mt-3 rounded-xl border border-white/[0.07] bg-white/[0.025]">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between px-3 text-[10px] font-medium text-[#8f9bad] [&::-webkit-details-marker]:hidden">
                Matching rules
                <span aria-hidden="true" className="group-open:rotate-45">+</span>
              </summary>
              <div className="grid gap-3 border-t border-white/[0.07] p-3 sm:grid-cols-2">
                <label className="text-[10px] text-[#8f9bad]">
                  Maximum required years
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={target.maximumRequiredExperienceYears ?? ""}
                    onChange={(event) =>
                      updateTarget(index, {
                        maximumRequiredExperienceYears:
                          event.target.value === "" ? null : Number(event.target.value),
                      })
                    }
                    className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-[#101726] px-3 text-[15px] text-white outline-none focus:border-[#8176ff]/55"
                  />
                </label>
                <label className="text-[10px] text-[#8f9bad]">
                  Title aliases
                  <input
                    value={target.aliases.join(", ")}
                    onChange={(event) =>
                      updateTarget(index, { aliases: lines(event.target.value) })
                    }
                    className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-[#101726] px-3 text-[13px] text-white outline-none focus:border-[#8176ff]/55"
                  />
                </label>
                <label className="text-[10px] text-[#8f9bad] sm:col-span-2">
                  Exclude within this direction
                  <input
                    value={target.exclusions.join(", ")}
                    onChange={(event) =>
                      updateTarget(index, { exclusions: lines(event.target.value) })
                    }
                    className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-[#101726] px-3 text-[13px] text-white outline-none focus:border-[#8176ff]/55"
                  />
                </label>
                <button
                  type="button"
                  disabled={targets.length === 1}
                  onClick={() =>
                    setTargets((current) =>
                      current.filter((_, targetIndex) => targetIndex !== index),
                    )
                  }
                  className="min-h-10 justify-self-start rounded-full px-2 text-[10px] font-semibold text-[#d995a0] disabled:opacity-35"
                >
                  Remove direction
                </button>
              </div>
            </details>
          </li>
        ))}
      </ol>

      <div className="border-t border-white/[0.08] pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#6f7b90]">
          Add a direction
        </p>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {ROLE_DIRECTION_PRESETS.filter(
            (preset) => !selectedFamilies.has(preset.canonicalFamily),
          ).map((preset) => (
            <button
              key={preset.canonicalFamily}
              type="button"
              disabled={targets.length >= 12}
              onClick={() => addPreset(preset)}
              className="min-h-10 shrink-0 rounded-full border border-white/[0.09] bg-white/[0.035] px-3 text-[10px] font-medium text-[#aeb8c8] outline-none hover:bg-white/[0.07] focus-visible:ring-2 focus-visible:ring-[#8176ff]/50"
            >
              + {preset.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={customLabel}
            onChange={(event) => setCustomLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCustom();
              }
            }}
            placeholder="Custom role direction"
            className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#101726] px-3 text-[14px] text-white outline-none placeholder:text-[#69758a] focus:border-[#8176ff]/55"
          />
          <button
            type="button"
            onClick={addCustom}
            className="min-h-11 rounded-xl border border-white/[0.12] px-4 text-[11px] font-semibold text-[#dce1eb]"
          >
            Add
          </button>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
        <p
          role={message?.includes("could") ? "alert" : "status"}
          className="text-[10px] leading-4 text-[#8f9bad]"
        >
          {message}
        </p>
        <button
          type="button"
          disabled={isPending || targets.length === 0}
          onClick={save}
          className="min-h-11 shrink-0 rounded-full bg-[#8176ff] px-5 text-[11px] font-semibold text-white disabled:opacity-45"
        >
          {isPending ? "Saving…" : "Save role directions"}
        </button>
      </div>
    </div>
  );
}
