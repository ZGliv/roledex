import type { Metadata } from "next";

import type { ProfileDashboardValue } from "@/features/candidate/components/profile-dashboard";
import { ResilientFeedFallback } from "@/features/jobs/components/resilient-feed-fallback";
import { loadWhenProductionDatabaseReady } from "@/features/production/database-release";

export const metadata: Metadata = { title: "You" };
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function ProfilePage() {
  const release = await loadWhenProductionDatabaseReady(async () => {
    const [identity, visitor, candidate, jobs, product, dashboard] =
      await Promise.all([
        import("@/features/auth/identity"),
        import("@/features/auth/visitor"),
        import("@/features/candidate/queries"),
        import("@/features/jobs/queries"),
        import("@/features/product/service"),
        import("@/features/candidate/components/profile-dashboard"),
      ]);
    const visitorId = await visitor.requireVisitorId();
    const [profile, impact, stats, productSettings, resumes] = await Promise.all([
      candidate.getCandidateProfileView(false),
      jobs.getProfileFeedImpact(),
      jobs.getJobWorkspaceStats(),
      product.getProductSettings(visitorId),
      product.getResumeSourcesForVisitor(visitorId),
    ]);
    return {
      OWNER_VISITOR_ID: identity.OWNER_VISITOR_ID,
      ProfileDashboard: dashboard.ProfileDashboard,
      impact,
      productSettings,
      profile,
      resumes,
      stats,
    };
  });
  if (!release.ready) return <ResilientFeedFallback />;

  const {
    OWNER_VISITOR_ID,
    ProfileDashboard,
    impact,
    productSettings,
    profile,
    resumes,
    stats,
  } = release.value;
  const dashboardProfile: ProfileDashboardValue = {
    ...profile,
    preferredWorkModes: profile.preferredWorkModes.filter(
      (mode): mode is "remote" | "hybrid" | "on_site" => mode !== "unclear",
    ),
  };

  return (
    <div className="job-deck-bg min-h-dvh overflow-x-clip pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <ProfileDashboard
        profile={dashboardProfile}
        impact={impact}
        stats={{
          reviewed: stats.reviewed,
          saved: stats.saved,
          skipped: stats.skipped,
        }}
        isGuest={profile.visitorId !== OWNER_VISITOR_ID}
        productSettings={{
          dailyDigestEnabled: productSettings.dailyDigestEnabled,
          onboardingCompletedAt:
            productSettings.onboardingCompletedAt?.toISOString() ?? null,
          reminderNotificationsEnabled:
            productSettings.reminderNotificationsEnabled,
        }}
        resumes={resumes.map((resume) => ({
          ...resume,
          createdAt: resume.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
