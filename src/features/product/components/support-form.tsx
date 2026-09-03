"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, LoaderCircle, Send } from "lucide-react";

import { submitBetaFeedbackAction } from "@/features/product/actions";

export function SupportForm() {
  const [kind, setKind] = useState<"general" | "bug" | "idea">("general");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mt-8 rounded-[1.5rem] border border-white/12 bg-white/[0.055] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.1)] backdrop-blur-xl"
      onSubmit={(event) => {
        event.preventDefault();
        setResult(null);
        startTransition(async () => {
          const response = await submitBetaFeedbackAction({
            kind,
            message,
            pagePath: "/support",
          });
          setResult({ ok: response.ok, text: response.message });
          if (response.ok) setMessage("");
        });
      }}
    >
      <fieldset disabled={pending} className="space-y-5 disabled:opacity-65">
        <label className="block">
          <span className="text-[11px] font-semibold text-[#dfe4ed]">What do you need help with?</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as typeof kind)}
            className="mt-2 min-h-12 w-full rounded-[.95rem] border border-white/10 bg-[#111827] px-3.5 text-[13px] text-white outline-none focus:border-[#8176ff]/45 focus:ring-2 focus:ring-[#8176ff]/20"
          >
            <option value="general">General question</option>
            <option value="bug">Something is broken</option>
            <option value="idea">Product suggestion</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-[#dfe4ed]">Message</span>
          <textarea
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              if (result) setResult(null);
            }}
            minLength={5}
            maxLength={2_000}
            required
            rows={6}
            className="mt-2 w-full resize-y rounded-[.95rem] border border-white/10 bg-[#111827] px-3.5 py-3 text-[13px] leading-5 text-white outline-none placeholder:text-[#5f6b80] focus:border-[#8176ff]/45 focus:ring-2 focus:ring-[#8176ff]/20"
            placeholder="Tell us what happened, what you expected, and which screen you were on."
          />
        </label>
        <button
          type="submit"
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-5 text-[13px] font-semibold text-[#111827] outline-none hover:bg-[#eff1ff] disabled:cursor-wait focus-visible:ring-2 focus-visible:ring-white/50"
        >
          {pending ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-4" aria-hidden="true" />
          )}
          {pending ? "Sending…" : "Send to support"}
        </button>
      </fieldset>
      {result ? (
        <p
          role={result.ok ? "status" : "alert"}
          className={`mt-4 flex items-center gap-2 text-[11px] ${result.ok ? "text-[#71d7ad]" : "text-[#f2a9b5]"}`}
        >
          {result.ok ? <CheckCircle2 className="size-4" aria-hidden="true" /> : null}
          {result.text}
        </p>
      ) : null}
    </form>
  );
}
