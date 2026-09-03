import { Suspense } from "react";

import { FeedLoading } from "@/components/loading-states";
import { ResilientFeedFallback } from "@/features/jobs/components/resilient-feed-fallback";
import { loadWhenProductionDatabaseReady } from "@/features/production/database-release";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function HomeFeed() {
  const release = await loadWhenProductionDatabaseReady(async () => {
    const [navigation, visitor, jobs, product, deck] = await Promise.all([
      import("next/navigation"),
      import("@/features/auth/visitor"),
      import("@/features/jobs/queries"),
      import("@/features/product/service"),
      import("@/features/jobs/components/job-deck"),
    ]);
    const productSettings = await product.getProductSettings(
      await visitor.requireVisitorId(),
    );
    if (!productSettings.onboardingCompletedAt) navigation.redirect("/onboarding");

    return {
      JobDeck: deck.JobDeck,
      deckPage: await jobs.getInitialDeckJobCardPage(20),
    };
  });
  if (!release.ready) return <ResilientFeedFallback />;

  const { JobDeck, deckPage } = release.value;
  const deckVersion = `profile-${deckPage.profileRevision}`;

  return (
    <div className="app-viewport job-deck-bg relative isolate overflow-x-hidden">
      <div className="safe-page-top relative mx-auto w-full px-4 pb-2 sm:px-6 sm:pb-4">
        <JobDeck
          initialAdmissionCounts={deckPage.admissionCounts}
          key={deckVersion}
          initialHasMore={deckPage.hasMore}
          initialJobs={deckPage.jobs}
          initialNextCursor={deckPage.nextCursor}
        />
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<FeedLoading />}>
      <HomeFeed />
    </Suspense>
  );
}
