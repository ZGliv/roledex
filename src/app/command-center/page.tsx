import type { Metadata } from "next";

import { ApplicationTracker } from "@/features/jobs/components/application-tracker";
import { loadWhenProductionDatabaseReady } from "@/features/production/database-release";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Applications",
};

export default async function CommandCenterPage() {
  const release = await loadWhenProductionDatabaseReady(async () => {
    const { getSavedJobCards } = await import("@/features/jobs/queries");
    return getSavedJobCards();
  });
  return <ApplicationTracker initialSaved={release.ready ? release.value : []} />;
}
