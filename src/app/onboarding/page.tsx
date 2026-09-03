import type { Metadata } from "next";

import {
  OnboardingWizard,
  type OnboardingProfileValue,
} from "@/features/candidate/components/onboarding-wizard";
import { getCandidateProfileView } from "@/features/candidate/queries";
import { requireVisitorId } from "@/features/auth/visitor";
import { getProductSettings } from "@/features/product/service";

export const metadata: Metadata = {
  title: "Set up your search",
  description: "Choose the roles and hard limits RoleDex should use for your feed.",
};
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const visitorId = await requireVisitorId();
  const [profile, settings] = await Promise.all([
    getCandidateProfileView(false),
    getProductSettings(visitorId),
  ]);

  const onboardingProfile: OnboardingProfileValue = {
    ...profile,
    preferredWorkModes: profile.preferredWorkModes.filter(
      (mode): mode is "remote" | "hybrid" | "on_site" => mode !== "unclear",
    ),
  };

  return (
    <div className="job-deck-bg min-h-dvh overflow-x-clip">
      <OnboardingWizard
        alreadyCompleted={settings.onboardingCompletedAt !== null}
        profile={onboardingProfile}
      />
    </div>
  );
}
