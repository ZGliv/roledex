"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CircleAlert,
  Heart,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  SkipForward,
  TrendingUp,
  Volume2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { DeckDecision } from "@/features/decisions/policy";
import type { DrivingJob } from "@/features/driving/contracts";
import { decideJobAction } from "@/features/jobs/actions";

type SpeechAvailability = "checking" | "supported" | "unsupported";
type SpeechState = "idle" | "starting" | "speaking" | "paused";

const decisionLabels: Record<DeckDecision, string> = {
  saved: "Saved",
  skipped: "Passed",
  stretch: "Saved as a stretch",
  learn_first: "Marked learn first",
};

function speechStatusLabel(state: SpeechState) {
  if (state === "starting") return "Starting narration…";
  if (state === "speaking") return "Narration playing";
  if (state === "paused") return "Narration paused";
  return "Ready to play";
}

function subscribeToSpeechAvailability() {
  return () => undefined;
}

function getSpeechAvailability(): SpeechAvailability {
  if (typeof window === "undefined") return "checking";
  return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window
    ? "supported"
    : "unsupported";
}

function getServerSpeechAvailability(): SpeechAvailability {
  return "checking";
}

export function DrivingMode({
  hasMore,
  initialJobs,
  totalUnseen,
}: {
  hasMore: boolean;
  initialJobs: readonly DrivingJob[];
  totalUnseen: number;
}) {
  const router = useRouter();
  const [jobs, setJobs] = useState(() => [...initialJobs]);
  const [prepared, setPrepared] = useState(false);
  const speechAvailability = useSyncExternalStore(
    subscribeToSpeechAvailability,
    getSpeechAvailability,
    getServerSpeechAvailability,
  );
  const [speechState, setSpeechState] = useState<SpeechState>("idle");
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [decidedCount, setDecidedCount] = useState(0);
  const [pendingDecision, setPendingDecision] =
    useState<DeckDecision | null>(null);
  const [pending, startTransition] = useTransition();
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const decisionLockedRef = useRef(false);
  const completionHeadingRef = useRef<HTMLHeadingElement>(null);
  const currentJob = jobs[0] ?? null;

  useEffect(() => {
    return () => {
      utteranceRef.current = null;
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    if (!currentJob && decidedCount > 0) {
      completionHeadingRef.current?.focus();
    }
  }, [currentJob, decidedCount]);

  const stopSpeech = useCallback(() => {
    if (speechAvailability === "supported") {
      utteranceRef.current = null;
      window.speechSynthesis.cancel();
    }
    setSpeechState("idle");
  }, [speechAvailability]);

  const playFromStart = useCallback(() => {
    if (!currentJob || speechAvailability !== "supported") return;

    const synthesis = window.speechSynthesis;
    utteranceRef.current = null;
    synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(
      currentJob.spokenSummary.spokenText,
    );
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onstart = () => {
      if (utteranceRef.current === utterance) setSpeechState("speaking");
    };
    utterance.onpause = () => {
      if (utteranceRef.current === utterance) setSpeechState("paused");
    };
    utterance.onresume = () => {
      if (utteranceRef.current === utterance) setSpeechState("speaking");
    };
    utterance.onend = () => {
      if (utteranceRef.current !== utterance) return;
      utteranceRef.current = null;
      setSpeechState("idle");
      setAnnouncement(`Narration finished for ${currentJob.title}.`);
    };
    utterance.onerror = (event) => {
      if (utteranceRef.current !== utterance) return;
      utteranceRef.current = null;
      setSpeechState("idle");
      if (event.error !== "canceled" && event.error !== "interrupted") {
        setError(
          "This browser could not play the summary. You can still read it or use the decision controls while parked.",
        );
      }
    };

    utteranceRef.current = utterance;
    setError(null);
    setSpeechState("starting");
    synthesis.speak(utterance);
  }, [currentJob, speechAvailability]);

  const togglePlayPause = useCallback(() => {
    if (speechAvailability !== "supported") return;
    if (speechState === "speaking" || speechState === "starting") {
      window.speechSynthesis.pause();
      setSpeechState("paused");
      return;
    }
    if (speechState === "paused" && utteranceRef.current) {
      window.speechSynthesis.resume();
      setSpeechState("speaking");
      return;
    }
    playFromStart();
  }, [playFromStart, speechAvailability, speechState]);

  const showNext = useCallback(() => {
    if (pending || decisionLockedRef.current) return;
    stopSpeech();
    setError(null);
    setJobs((current) =>
      current.length > 1 ? [...current.slice(1), current[0]] : current,
    );
    setAnnouncement(
      jobs.length > 1
        ? "Moved to the next role without recording a decision."
        : "This is the only role in the current set.",
    );
  }, [jobs.length, pending, stopSpeech]);

  const decide = useCallback(
    (decision: DeckDecision) => {
      const job = currentJob;
      if (!job || pending || decisionLockedRef.current) return;
      const isFinalJob = jobs.length === 1;

      decisionLockedRef.current = true;
      setPendingDecision(decision);
      stopSpeech();
      setError(null);
      if (!isFinalJob) {
        setJobs((current) => current.filter((candidate) => candidate.id !== job.id));
        setDecidedCount((count) => count + 1);
        setAnnouncement(`${decisionLabels[decision]} ${job.title} at ${job.company}.`);
      } else {
        setAnnouncement(`Saving your final decision for ${job.title} at ${job.company}.`);
      }

      startTransition(async () => {
        try {
          const result = await decideJobAction(
            job.id,
            decision,
            job.currentDecision,
          );
          if (!result.ok) throw new Error(result.message);
          if (isFinalJob) {
            setJobs((current) => current.filter((candidate) => candidate.id !== job.id));
            setDecidedCount((count) => count + 1);
            setAnnouncement(`${decisionLabels[decision]} ${job.title} at ${job.company}.`);
          }
        } catch (actionError) {
          if (!isFinalJob) {
            setJobs((current) =>
              current.some((candidate) => candidate.id === job.id)
                ? current
                : [job, ...current],
            );
            setDecidedCount((count) => Math.max(0, count - 1));
          }
          setError(
            actionError instanceof Error
              ? `${actionError.message} The role was returned to this session.`
              : "That decision could not sync. The role was returned to this session.",
          );
        } finally {
          decisionLockedRef.current = false;
          setPendingDecision(null);
        }
      });
    },
    [currentJob, jobs.length, pending, stopSpeech],
  );

  if (!currentJob) {
    return (
      <div className="app-viewport mx-auto flex w-full max-w-xl flex-col justify-center px-4 py-12 text-center sm:px-6">
        <Check className="mx-auto size-8 text-[#168b5d]" aria-hidden="true" />
        <h1
          ref={completionHeadingRef}
          tabIndex={-1}
          className="mt-5 text-3xl font-semibold tracking-[-0.035em] text-[#15161a] outline-none"
        >
          {decidedCount > 0 ? "Driving session complete" : "No unseen roles ready"}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#656970]">
          {decidedCount > 0
            ? `You recorded ${decidedCount} ${decidedCount === 1 ? "decision" : "decisions"} in this set.`
            : "Refill your official sources or return to the deck when new roles arrive."}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          {hasMore ? (
            <Button
              type="button"
              onClick={() => router.refresh()}
              className="bg-[#15161a] text-white hover:bg-[#2a2c31]"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Load next set
            </Button>
          ) : null}
          <Link
            href="/"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-4 text-[13px] font-semibold text-[#34363b] transition-colors hover:bg-[#f1f2f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5577ff]/35 focus-visible:ring-offset-2"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Return to deck
          </Link>
        </div>
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </div>
    );
  }

  const speechDisabled =
    !prepared ||
    speechAvailability !== "supported" ||
    pending ||
    pendingDecision !== null;
  const interactionDisabled = !prepared || pending || pendingDecision !== null;
  const isPlaying = speechState === "speaking" || speechState === "starting";

  return (
    <div className="app-viewport bg-[#f5f6f8] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto w-full max-w-2xl px-3 pb-8 pt-4 sm:px-6 sm:pt-6">
        <header className="flex items-center justify-between gap-4 px-1">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#34363b]">
              <Volume2 className="size-4" aria-hidden="true" />
              Driving mode
            </div>
            <p className="mt-1 text-xs text-[#656970]">
              {jobs.length} in this audio set · {totalUnseen} unseen when opened
            </p>
          </div>
          <Link
            href="/"
            onClick={stopSpeech}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-4 text-[13px] font-semibold text-[#555960] transition-colors hover:bg-[#f0f1f3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5577ff]/35 focus-visible:ring-offset-2"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Exit
          </Link>
        </header>

        <section className="mt-4 rounded-2xl border border-[#efb94e]/35 bg-[#fff7e6] p-4 text-[#684b15] sm:p-5" aria-labelledby="driving-safety-title">
          <div className="flex gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <div>
              <h1 id="driving-safety-title" className="text-sm font-bold">
                Configure this while parked
              </h1>
              <p className="mt-1 text-xs leading-5 text-[#7a5b21] sm:text-sm sm:leading-6">
                Start playback before moving. Never read, tap, swipe, or make decisions while driving. Pull over safely before touching the app again.
              </p>
            </div>
          </div>
          {!prepared ? (
            <Button
              type="button"
              onClick={() => {
                setPrepared(true);
                setAnnouncement("Driving mode controls are ready. Remain parked while configuring playback.");
              }}
              size="lg"
              className="mt-4 w-full bg-[#15161a] text-white hover:bg-[#292b30] sm:w-auto"
            >
              <Check className="size-4" aria-hidden="true" />
              I’m parked — set up audio
            </Button>
          ) : (
            <p className="mt-3 flex items-center gap-2 text-xs font-bold text-[#765717]">
              <Check className="size-3.5" aria-hidden="true" />
              Setup acknowledged
            </p>
          )}
        </section>

        {error ? (
          <div role="alert" className="mt-3 flex gap-3 rounded-xl border border-[#e46a72]/25 bg-[#fff1f2] p-4 text-sm leading-5 text-[#96323a]">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        ) : null}

        {speechAvailability === "unsupported" ? (
          <div className="mt-3 flex gap-3 rounded-xl border border-black/[0.06] bg-white p-4 text-sm leading-5 text-[#64686f]">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              This browser does not expose text-to-speech. The grounded summary and large controls still work while parked; try Safari on iPhone or Chrome on Android for narration.
            </p>
          </div>
        ) : null}

        <article className="mt-3 overflow-hidden rounded-2xl border border-black/[0.07] bg-white">
          <div className="border-b border-black/[0.06] px-5 py-5 sm:px-7 sm:py-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#656970]">
              <span className="truncate">{currentJob.company}</span>
              <span className="size-1 rounded-full bg-[#b2b4b9]" aria-hidden="true" />
              <span className="shrink-0 text-[#168b5d]">
                {currentJob.deterministicFitScore.toFixed(1)}/10 fit
              </span>
            </div>
            <h2 className="mt-2 text-balance text-[2rem] font-semibold leading-[1.05] tracking-[-0.04em] text-[#15161a] sm:text-[2.5rem]">
              {currentJob.title}
            </h2>
            <p className="mt-4 text-sm font-semibold leading-6 text-[#555960]">
              {currentJob.salaryDisplay} · {currentJob.workArrangement} · {currentJob.location}
            </p>
            <p className="mt-2 text-xs leading-5 text-[#656970]">
              {currentJob.readiness} · {currentJob.verdict} · {currentJob.deterministicFitCoverage}% evidence coverage
            </p>
          </div>

          <section className="bg-[#15161a] px-4 py-5 text-white sm:px-6 sm:py-6" aria-label="Narration controls">
            <div>
                <p className="text-xs font-medium text-white/55">Audio summary</p>
                <p className="mt-1 text-sm font-semibold text-white/85" aria-live="polite">
                  {speechAvailability === "checking"
                    ? "Checking browser audio…"
                    : speechAvailability === "unsupported"
                      ? "Narration unavailable"
                      : speechStatusLabel(speechState)}
                </p>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              <Button
                type="button"
                onClick={togglePlayPause}
                disabled={speechDisabled}
                aria-label={isPlaying ? "Pause job summary" : speechState === "paused" ? "Resume job summary" : "Play job summary"}
                className="min-h-20 flex-col gap-1.5 bg-[#d63a52] px-2 text-white hover:bg-[#c92f49] focus-visible:ring-white/50"
              >
                {isPlaying ? <Pause className="size-6" aria-hidden="true" /> : <Play className="size-6 fill-current" aria-hidden="true" />}
                {isPlaying ? "Pause" : speechState === "paused" ? "Resume" : "Play"}
              </Button>
              <Button
                type="button"
                onClick={playFromStart}
                disabled={speechDisabled}
                className="min-h-20 flex-col gap-1.5 bg-white/10 px-2 text-white shadow-none hover:bg-white/15 focus-visible:ring-white/45"
              >
                <RotateCcw className="size-5" aria-hidden="true" />
                Replay
              </Button>
              <Button
                type="button"
                onClick={showNext}
                disabled={interactionDisabled || jobs.length < 2}
                aria-label="Show the next job without recording a decision"
                className="min-h-20 flex-col gap-1.5 bg-white/10 px-2 text-white shadow-none hover:bg-white/15 focus-visible:ring-white/45"
              >
                <SkipForward className="size-5" aria-hidden="true" />
                Next
              </Button>
            </div>
            {!prepared ? (
              <p className="mt-3 text-center text-[11px] leading-5 text-white/45">
                Acknowledge the parked setup above to enable controls.
              </p>
            ) : null}
          </section>

          <div className="divide-y divide-black/[0.06] px-5 sm:px-7">
            <section className="py-5">
              <h3 className="text-sm font-semibold text-[#34363b]">Day to day</h3>
              <p className="mt-2 text-sm leading-6 text-[#4f535a]">{currentJob.spokenSummary.dayToDay}</p>
            </section>
            <section className="py-5">
              <h3 className="text-sm font-semibold text-[#25805a]">Why it may fit</h3>
              <p className="mt-2 text-sm leading-6 text-[#4f535a]">{currentJob.spokenSummary.match}</p>
            </section>
            <section className="py-5">
              <h3 className="text-sm font-semibold text-[#a75f4b]">Biggest gap</h3>
              <p className="mt-2 text-sm leading-6 text-[#5e6167]">{currentJob.spokenSummary.gap}</p>
            </section>
            <section className="py-5">
              <h3 className="text-sm font-semibold text-[#9a5b61]">Strongest reason to pass</h3>
              <p className="mt-2 text-sm leading-6 text-[#5e6167]">{currentJob.spokenSummary.passReason}</p>
            </section>
          </div>

          <div className="border-t border-black/[0.06] bg-[#fafafa] px-4 py-5 sm:px-6">
            <p className="mb-3 text-center text-[11px] font-semibold text-[#64686f]">
              Only use these controls while safely parked
            </p>
            <div className="grid grid-cols-3 gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => decide("skipped")}
                disabled={interactionDisabled}
                className="min-h-16 flex-col gap-1 border-[#eb6570]/25 text-[#c63d4a] hover:bg-[#fff3f4] focus-visible:ring-[#eb6570]/30"
              >
                {pendingDecision === "skipped" ? (
                  <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
                ) : (
                  <X className="size-5" aria-hidden="true" />
                )}
                Pass
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => decide("stretch")}
                disabled={interactionDisabled}
                className="min-h-16 flex-col gap-1 border-[#5577ff]/20 text-[#3f5fd6] hover:bg-[#f2f4ff] focus-visible:ring-[#5577ff]/25"
              >
                {pendingDecision === "stretch" ? (
                  <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
                ) : (
                  <TrendingUp className="size-5" aria-hidden="true" />
                )}
                Stretch
              </Button>
              <Button
                type="button"
                onClick={() => decide("saved")}
                disabled={interactionDisabled}
                className="min-h-16 flex-col gap-1 bg-[#d63a52] text-white hover:bg-[#c92f49] focus-visible:ring-[#d63a52]/35"
              >
                {pendingDecision === "saved" ? (
                  <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
                ) : (
                  <Heart className="size-5 fill-current" aria-hidden="true" />
                )}
                Save
              </Button>
            </div>
            {prepared && currentJob.sourceUrl ? (
              <a
                href={currentJob.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-[#666a71] transition-colors hover:bg-[#f0f1f3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5577ff]/30 focus-visible:ring-offset-2"
              >
                Open original listing while parked
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </article>

        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </div>
    </div>
  );
}
