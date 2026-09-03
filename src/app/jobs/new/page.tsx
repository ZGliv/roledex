import type { Metadata } from "next";
import { connection } from "next/server";

import { requireOwnerSession } from "@/features/auth/session";
import { JobEntryForm } from "@/features/jobs/components/job-entry-form";

export const metadata: Metadata = { title: "Add a job" };

const pipeline = [
  {
    title: "Keep the source",
    body: "The original text, URL, and retrieval time stay attached to an immutable revision.",
  },
  {
    title: "Extract conservatively",
    body: "The parser separates required from preferred qualifications and leaves ambiguous facts unknown.",
  },
  {
    title: "Score transparently",
    body: "Eight weighted dimensions produce a versioned score with visible coverage and rationale.",
  },
  {
    title: "Deduplicate safely",
    body: "The same URL or company-title-location identity becomes a new revision, not a mystery duplicate.",
  },
];

export default async function NewJobPage() {
  await connection();
  await requireOwnerSession();
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="mb-7 max-w-3xl">
        <h1 className="text-balance text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
          Add a job
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          Enter the title and company, then paste the complete listing. RoleDex only scores information present in the source text.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <section className="rounded-xl border border-border/80 bg-card p-4 sm:p-6" aria-labelledby="listing-details-title">
          <h2 id="listing-details-title" className="mb-6 text-base font-semibold">
            Listing details
          </h2>
          <JobEntryForm />
        </section>

        <aside className="h-fit rounded-xl border border-border/80 bg-card lg:sticky lg:top-24" aria-label="Import pipeline">
          <div className="border-b border-border/80 p-4">
            <h2 className="text-sm font-semibold">What happens next</h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              No scraping, hidden model call, or invented salary data.
            </p>
          </div>
          <ol className="divide-y divide-border/80">
            {pipeline.map((step, index) => (
              <li key={step.title} className="flex gap-3 p-4">
                <span className="w-5 shrink-0 text-sm tabular-nums text-muted-foreground">
                  {index + 1}.
                </span>
                <div>
                  <h3 className="text-sm font-semibold">{step.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
