import { getDiscoveryStatus } from "@/features/discovery/queries";
import { JobDeck } from "@/features/jobs/components/job-deck";
import { getDeckJobCardsPage } from "@/features/jobs/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function HomePage() {
  const [deckPage, discoveryStatus] = await Promise.all([
    getDeckJobCardsPage({ limit: 25 }),
    getDiscoveryStatus(),
  ]);
  const deckVersion = discoveryStatus.latestRun
    ? `${discoveryStatus.latestRun.startedAt}:${discoveryStatus.latestRun.completedAt ?? discoveryStatus.latestRun.status}`
    : "unrefreshed";

  return (
    <div className="app-viewport job-deck-bg relative isolate overflow-hidden">
      <div className="safe-page-top relative mx-auto w-full px-4 pb-2 sm:px-6 sm:pb-4">
        <JobDeck
          key={deckVersion}
          initialHasMore={deckPage.hasMore}
          initialJobs={deckPage.jobs}
          initialNextCursor={deckPage.nextCursor}
        />
      </div>
    </div>
  );
}
