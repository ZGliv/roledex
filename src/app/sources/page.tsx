import type { Metadata } from "next";

import { AddSourceForm } from "@/features/discovery/components/add-source-form";
import { requireOwnerSession } from "@/features/auth/session";
import { RefillJobsButton } from "@/features/discovery/components/refill-jobs-button";
import { SourceList } from "@/features/discovery/components/source-list";
import {
  getDiscoveryStatus,
  getJobSourcesView,
} from "@/features/discovery/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const metadata: Metadata = {
  title: "Job sources",
};

export default async function JobSourcesPage() {
  await requireOwnerSession();
  const [sources, status] = await Promise.all([
    getJobSourcesView(),
    getDiscoveryStatus(),
  ]);

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <header className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.035em]">Job sources</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Manage the official company feeds RoleDex checks for new roles. You can connect Greenhouse, Lever, and Ashby boards.
            </p>
          </div>
          <RefillJobsButton status={status} />
        </header>

        <dl className="mb-6 grid rounded-xl border border-border/80 bg-card sm:grid-cols-2 sm:divide-x sm:divide-border/80">
          <div className="px-4 py-3.5 sm:px-5">
            <dt className="text-xs text-muted-foreground">Active company feeds</dt>
            <dd className="mt-1 text-xl font-semibold">{status.enabledSources}</dd>
          </div>
          <div className="border-t border-border/80 px-4 py-3.5 sm:border-t-0 sm:px-5">
            <dt className="text-xs text-muted-foreground">Refresh order</dt>
            <dd className="mt-1 text-sm font-semibold">Oldest due source first</dd>
          </div>
        </dl>

        <div className="mb-6">
          <AddSourceForm />
        </div>

        {sources.length > 0 ? <SourceList initialSources={sources} /> : null}
      </div>
    </div>
  );
}
