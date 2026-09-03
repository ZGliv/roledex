"use client";

import { useState, useTransition } from "react";

import { updatePreferenceOverrideAction } from "@/features/personalization/actions";
import { cn } from "@/lib/utils";

export type LearnedPreferenceControlSignal = {
  confidence: "early" | "developing" | "confident";
  direction: "up" | "down" | "neutral";
  featureKey: string;
  key: string;
  label: string;
  learnedDirection: "up" | "down";
  observationCount: number;
  override: "more" | "less" | "ignore" | null;
};

type OverrideMode = Exclude<LearnedPreferenceControlSignal["override"], null>;

const choices: readonly { label: string; value: OverrideMode }[] = [
  { label: "More", value: "more" },
  { label: "Less", value: "less" },
  { label: "Ignore", value: "ignore" },
];

export function LearnedPreferenceControls({
  overrideCount,
  signals,
}: {
  overrideCount: number;
  signals: readonly LearnedPreferenceControlSignal[];
}) {
  const [overrides, setOverrides] = useState<Record<string, OverrideMode>>(() =>
    Object.fromEntries(
      signals.flatMap((signal) =>
        signal.override ? [[signal.featureKey, signal.override]] : [],
      ),
    ),
  );
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(
    input:
      | { action: OverrideMode | "reset"; featureKey: string }
      | { action: "reset_all" },
  ) {
    const key = "featureKey" in input ? input.featureKey : "all";
    setPendingKey(key);
    setMessage("");
    startTransition(async () => {
      const result = await updatePreferenceOverrideAction(input);
      if (result.ok) {
        setOverrides(
          Object.fromEntries(
            result.overrides.map((override) => [
              override.featureKey,
              override.mode,
            ]),
          ),
        );
      }
      setMessage(result.message);
      setPendingKey(null);
    });
  }

  const hasOverrides = overrideCount > 0 || Object.keys(overrides).length > 0;

  return (
    <div>
      <div className="divide-y divide-white/[0.07]">
        {signals.map((signal) => {
          const selected = overrides[signal.featureKey] ?? null;
          const busy = isPending && pendingKey === signal.featureKey;
          return (
            <div key={signal.key} className="py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium leading-5 text-[#c6cedb]">
                    {signal.label}
                  </p>
                  <p className="mt-0.5 text-[10px] text-[#778399]">
                    {selected
                      ? `Your adjustment: ${selected}`
                      : `Learned from ${signal.observationCount} ${signal.observationCount === 1 ? "decision" : "decisions"}`}
                  </p>
                </div>
                <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#6f7b90]">
                  {signal.confidence}
                </span>
              </div>

              <div
                className="mt-3 flex flex-wrap gap-1.5"
                role="group"
                aria-label={`Adjust ${signal.label}`}
              >
                {choices.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    aria-pressed={selected === choice.value}
                    disabled={isPending}
                    onClick={() =>
                      submit({
                        action: choice.value,
                        featureKey: signal.featureKey,
                      })
                    }
                    className={cn(
                      "min-h-9 rounded-full border px-3 text-[10px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-[#8176ff]/55 disabled:cursor-wait disabled:opacity-55 motion-reduce:transition-none",
                      selected === choice.value
                        ? "border-[#aaa3ff]/50 bg-[#8176ff]/20 text-[#dedbff]"
                        : "border-white/[0.1] bg-white/[0.025] text-[#9da8ba] hover:bg-white/[0.06] hover:text-[#d9dee7]",
                    )}
                  >
                    {choice.label}
                  </button>
                ))}
                {selected ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      submit({ action: "reset", featureKey: signal.featureKey })
                    }
                    className="min-h-9 rounded-full px-3 text-[10px] font-semibold text-[#8f9aab] outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-[#8176ff]/55 disabled:cursor-wait disabled:opacity-55 motion-reduce:transition-none"
                  >
                    Use learned
                  </button>
                ) : null}
                {busy ? (
                  <span className="self-center px-1 text-[10px] text-[#8e99ac]">
                    Saving…
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {hasOverrides ? (
        <button
          type="button"
          disabled={isPending}
          onClick={() => submit({ action: "reset_all" })}
          className="mt-3 min-h-10 text-[10px] font-semibold text-[#919caf] underline decoration-white/20 underline-offset-4 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-[#8176ff]/55 disabled:cursor-wait disabled:opacity-55"
        >
          Reset all adjustments to learned preferences
        </button>
      ) : null}

      <p className="mt-2 min-h-4 text-[10px] leading-4 text-[#8793a8]" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
