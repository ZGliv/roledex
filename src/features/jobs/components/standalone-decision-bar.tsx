"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowLeft, Bookmark, BookmarkPlus, BriefcaseBusiness, LoaderCircle, X } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import type { DeckDecision } from "@/features/decisions/policy";
import { decideJobAction, updateJobStatusAction } from "@/features/jobs/actions";
import type { JobCardDecision } from "@/features/jobs/components/job-card";
import { cn } from "@/lib/utils";

const labels: Record<DeckDecision, string> = {
  saved: "Saved",
  skipped: "Passed",
  stretch: "Saved as a stretch",
  learn_first: "Saved for later preparation",
};

export function StandaloneDecisionBar({
  currentDecision,
  jobId,
}: {
  currentDecision: JobCardDecision;
  jobId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [decisionState, setDecisionState] = useState(currentDecision);

  function decide(decision: DeckDecision) {
    startTransition(async () => {
      try {
        const result = await decideJobAction(jobId, decision, decisionState);
        if (!result.ok) throw new Error(result.message);
        setDecisionState(decision);
        setMessage(labels[decision]);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "The decision could not be saved.");
      }
    });
  }

  function planToApply() {
    startTransition(async () => {
      try {
        const result = await updateJobStatusAction(jobId, "apply", decisionState);
        if (!result.ok) throw new Error(result.message);
        setDecisionState("apply");
        setMessage("Moved to your application pipeline");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "The status could not be saved.");
      }
    });
  }

  return (
    <div className="glass-panel-strong sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 mx-auto mt-5 flex w-fit max-w-[calc(100vw-1.5rem)] flex-wrap items-center justify-center gap-2 rounded-2xl p-2 shadow-[0_12px_36px_rgba(22,33,52,.14)]">
      <Link
        href="/"
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "rounded-xl px-3 text-[#5f6a7d] hover:bg-white/65",
        )}
      >
        <ArrowLeft />
        Jobs
      </Link>
      <span className="mx-0.5 hidden h-6 w-px bg-[#283750]/10 sm:block" aria-hidden="true" />
      <Button
        variant="outline"
        className="rounded-xl border-[#29374f]/10 bg-white/60 px-3 text-[#566175] hover:bg-white/88"
        onClick={() => decide("skipped")}
        disabled={pending}
        aria-pressed={decisionState === "skipped"}
      >
        <X />
        Pass
      </Button>
      <Button
        variant="outline"
        className="rounded-xl border-[#6259df]/15 bg-[#eeecff]/60 px-3 text-[#5b53d4] hover:bg-[#e7e4ff]/80"
        onClick={() => decide("stretch")}
        disabled={pending}
        aria-pressed={decisionState === "stretch"}
      >
        <BookmarkPlus />
        <span className="hidden sm:inline">Save as </span>stretch
      </Button>
      <Button
        className="min-w-24 rounded-xl border-[#4e47c8] bg-[#5d56d8] px-4 text-white shadow-[0_2px_7px_rgba(66,59,177,.18)] hover:bg-[#514acb]"
        onClick={() => decide("saved")}
        disabled={pending}
        aria-pressed={decisionState === "saved"}
      >
        {pending ? <LoaderCircle className="animate-spin" /> : <Bookmark />}
        Save
      </Button>
      <Button
        variant="outline"
        className="rounded-xl border-[#182235] bg-[#182235] px-3 text-white shadow-[0_2px_7px_rgba(15,23,42,.14)] hover:border-[#253149] hover:bg-[#253149] hover:text-white"
        onClick={planToApply}
        disabled={pending}
        aria-pressed={decisionState === "apply"}
      >
        <BriefcaseBusiness />
        <span className="hidden sm:inline">Plan to </span>apply
      </Button>
      {message ? (
        <span className="basis-full px-3 pb-1 pt-0.5 text-center text-[11px] text-[#687386]" aria-live="polite">
          {message}
        </span>
      ) : null}
    </div>
  );
}
