"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  ArrowUpRight,
  BookmarkCheck,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { restoreJobToDeckAction } from "@/features/jobs/actions";
import { CompanyMark } from "@/features/jobs/components/company-mark";
import { companyVisual } from "@/features/jobs/components/company-visual";
import type { JobCardViewModel } from "@/features/jobs/components/job-card";
import { cn } from "@/lib/utils";

export function SavedJobList({ initialJobs }: { initialJobs: JobCardViewModel[] }) {
  const [jobs, setJobs] = useState(initialJobs);
  const [error, setError] = useState<string | null>(null);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const restore = (jobId: string) => {
    if (pending) return;
    setError(null);
    setPendingJobId(jobId);
    startTransition(async () => {
      try {
        const expectedDecision = jobs.find((job) => job.id === jobId)?.currentDecision;
        if (!expectedDecision) throw new Error("This saved job is no longer available.");
        const result = await restoreJobToDeckAction(jobId, expectedDecision);
        if (!result.ok) throw new Error(result.message);
        setJobs((current) => current.filter((job) => job.id !== jobId));
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : "That job could not be returned to the deck.",
        );
      } finally {
        setPendingJobId(null);
      }
    });
  };

  if (jobs.length === 0) {
    return (
      <Card className="border-dashed bg-white shadow-none">
        <CardContent className="flex flex-col items-center px-6 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-[#fff0ed] text-primary">
            <BookmarkCheck className="size-5" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-xl font-semibold">No saved jobs yet</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Roles you save from the deck will wait here.
          </p>
          <Link href="/" className={cn(buttonVariants(), "mt-6")}>
            Browse the deck
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      {error ? (
        <p className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {jobs.map((job) => {
          const visual = companyVisual(job.company);

          return (
            <article
              key={job.id}
              className="overflow-hidden rounded-[1.4rem] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_rgba(17,24,39,0.05)] ring-1 ring-black/[0.06] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(17,24,39,0.05),0_18px_42px_rgba(17,24,39,0.08)]"
            >
              <div className="flex h-full flex-col p-4 sm:p-5">
                <div className="flex items-start gap-3.5">
                  <div
                    aria-hidden="true"
                    className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-[1.1rem]"
                    style={{
                      backgroundColor: visual.background,
                      color: visual.foreground,
                    }}
                  >
                    <CompanyMark compact company={job.company} className="size-8" />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[13px] font-medium text-muted-foreground">
                        {job.company}
                      </p>
                      <span className="ml-auto shrink-0 rounded-full bg-[#f1f5f2] px-2.5 py-1 text-[11px] font-semibold text-[#28563f]">
                        {Math.round(job.deterministicFitScore * 10)}% fit
                      </span>
                    </div>
                    <h2 className="mt-1 line-clamp-2 text-[17px] font-semibold leading-[1.25] tracking-[-0.02em]">
                      {job.title}
                    </h2>
                  </div>
                </div>

                <p className="mt-4 truncate text-[13px] text-muted-foreground">
                  {job.salaryDisplay} <span aria-hidden="true">·</span> {job.workArrangement}{" "}
                  <span aria-hidden="true">·</span> {job.location}
                </p>

                <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
                  <Link
                    href={`/jobs/${job.id}`}
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "rounded-full px-3",
                    )}
                  >
                    Details
                  </Link>
                  {job.sourceUrl ? (
                    <a
                      href={job.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(buttonVariants({ size: "sm" }), "rounded-full px-3")}
                    >
                      Apply
                      <ArrowUpRight data-icon="inline-end" />
                    </a>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => restore(job.id)}
                    disabled={pending}
                    className="ml-auto rounded-full text-muted-foreground"
                  >
                    {pendingJobId === job.id ? (
                      <LoaderCircle className="animate-spin" data-icon="inline-start" />
                    ) : (
                      <RotateCcw data-icon="inline-start" />
                    )}
                    Return
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
