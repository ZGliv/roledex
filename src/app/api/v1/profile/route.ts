import { getCandidateProfileViewForVisitor } from "@/features/candidate/queries";
import {
  CandidateProfileConflictError,
  CandidateProfileRateLimitError,
  updateCandidateProfileAndRescoreForVisitor,
} from "@/features/candidate/service";
import { updateCandidateSearchPreferencesForVisitor } from "@/features/candidate/profile-foundation-service";
import { replaceCandidateRoleTargetsForVisitor } from "@/features/candidate/search-contract-service";
import {
  nativeError,
  nativeJson,
  nativeRouteError,
  parseNativeJson,
  requireNativeSession,
} from "@/features/native/http";
import { NativeProfileUpdateSchema } from "@/features/native/input";
import {
  getProductSettings,
  markOnboardingComplete,
} from "@/features/product/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const installation = await requireNativeSession(request);
    const [profile, settings] = await Promise.all([
      getCandidateProfileViewForVisitor(installation.visitorId, false),
      getProductSettings(installation.visitorId),
    ]);
    return nativeJson({
      data: {
        revision: profile.revision,
        onboardingCompleted: Boolean(settings.onboardingCompletedAt),
        currentRole: profile.currentRole,
        currentSalaryCents: profile.currentSalaryCents,
        yearsExperience: profile.yearsExperience,
        location: profile.location,
        relocationPreference: profile.relocationPreference,
        targetRoleFamilies: profile.targetRoleFamilies,
        desiredSeniorityLevels: profile.desiredSeniorityLevels,
        preferredSalaryMinimumCents: profile.preferredSalaryMinimumCents,
        preferredSalaryTargetCents: profile.preferredSalaryTargetCents,
        preferredWorkModes: profile.preferredWorkModes,
        strictWorkModes: profile.strictWorkModes,
        acceptedEmploymentTypes: profile.acceptedEmploymentTypes,
        preferredIndustries: profile.preferredIndustries,
        strengths: profile.strengths,
        weaknesses: profile.weaknesses,
        interests: profile.interests,
        careerGoals: profile.careerGoals,
        dealBreakers: profile.dealBreakers,
        interviewConcerns: profile.interviewConcerns,
        excludedTitles: profile.excludedTitles,
        excludedCompanies: profile.excludedCompanies,
        excludedIndustries: profile.excludedIndustries,
        commuteRadiusMiles: profile.commuteRadiusMiles,
        maxOfficeDaysPerWeek: profile.maxOfficeDaysPerWeek,
        relocationDestinations: profile.relocationDestinations,
        maxTravelPercent: profile.maxTravelPercent,
        workAuthorization: profile.workAuthorization,
        requiresSponsorship: profile.requiresSponsorship,
        missingSalaryPolicy: profile.missingSalaryPolicy,
        skills: profile.skills,
        evidence: {
          workHistoryCount: profile.workHistory.length,
          educationCount: profile.educationRecords.length,
          skillEvidenceCount: profile.skillEvidence.length,
          projectCount: profile.projects.length,
        },
        updatedAt: profile.updatedAt,
        settings: {
          dailyDigestEnabled: settings.dailyDigestEnabled,
          reminderNotificationsEnabled:
            settings.reminderNotificationsEnabled,
        },
      },
    });
  } catch (error) {
    return nativeRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const installation = await requireNativeSession(request);
    const input = await parseNativeJson(request, NativeProfileUpdateSchema);
    let result;
    if (input.section === "core") {
      result = await updateCandidateProfileAndRescoreForVisitor(
        installation.visitorId,
        input.values,
      );
    } else if (input.section === "search") {
      result = await updateCandidateSearchPreferencesForVisitor(
        installation.visitorId,
        input.values,
      );
    } else if (input.section === "role_targets") {
      result = await replaceCandidateRoleTargetsForVisitor(
        installation.visitorId,
        input.values,
      );
    } else {
      await markOnboardingComplete(installation.visitorId);
      result = { completed: true };
    }
    return nativeJson({ data: result });
  } catch (error) {
    if (error instanceof CandidateProfileConflictError) {
      return nativeError(409, "profile_conflict", error.message);
    }
    if (error instanceof CandidateProfileRateLimitError) {
      return nativeError(429, "profile_rate_limited", error.message);
    }
    return nativeRouteError(error);
  }
}
