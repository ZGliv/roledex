import { getCandidateProfileViewForVisitor } from "@/features/candidate/queries";
import { replaceCandidateRoleTargetsForVisitor } from "@/features/candidate/search-contract-service";
import {
  CandidateProfileConflictError,
  CandidateProfileRateLimitError,
  updateCandidateProfileAndRescoreForVisitor,
} from "@/features/candidate/service";
import { updateCandidateSearchPreferencesForVisitor } from "@/features/candidate/profile-foundation-service";
import { apiV2SearchContract } from "@/features/api-v2/dto";
import {
  apiV2Error,
  apiV2Json,
  apiV2Options,
  apiV2RouteError,
  parseApiV2Json,
  requireApiV2Session,
} from "@/features/api-v2/http";
import { NativeProfileUpdateSchema } from "@/features/native/input";
import { getProfileFeedImpactForVisitor } from "@/features/jobs/queries";
import {
  getProductSettings,
  getResumeSourcesForVisitor,
  markOnboardingComplete,
} from "@/features/product/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return apiV2Options(request);
}

function improveFeedTask(contract: ReturnType<typeof apiV2SearchContract>) {
  if (contract.evidence.length === 0) {
    return {
      id: "add-evidence",
      title: "Add your résumé",
      detail: "Confirming real work and project evidence makes role fit more precise.",
    };
  }
  if (contract.roleTargets.length < 2) {
    return {
      id: "choose-role-directions",
      title: "Choose another role direction",
      detail: "Two or three focused directions create a stronger feed without making it generic.",
    };
  }
  if (contract.constraints.workAuthorization === "prefer_not_to_say") {
    return {
      id: "confirm-work-authorization",
      title: "Confirm work authorization",
      detail: "This keeps incompatible sponsorship requirements out of the feed.",
    };
  }
  return {
    id: "review-learned-signals",
    title: "Review what the feed learned",
    detail: "Keep useful patterns and reset any signal that does not reflect your intent.",
  };
}

export async function GET(request: Request) {
  try {
    const installation = await requireApiV2Session(request);
    const [profile, settings, resumes, feedImpact] = await Promise.all([
      getCandidateProfileViewForVisitor(installation.visitorId, false),
      getProductSettings(installation.visitorId),
      getResumeSourcesForVisitor(installation.visitorId),
      getProfileFeedImpactForVisitor(installation.visitorId),
    ]);
    const contract = apiV2SearchContract(profile);
    return apiV2Json(request, {
      data: {
        searchContract: contract,
        onboardingCompleted: Boolean(settings.onboardingCompletedAt),
        editor: {
          currentRole: profile.currentRole,
          currentSalaryCents: profile.currentSalaryCents,
          location: profile.location,
          relocationPreference: profile.relocationPreference,
          yearsExperience: profile.yearsExperience,
          preferredIndustries: profile.preferredIndustries,
          targetRoleFamilies: profile.targetRoleFamilies,
          skills: profile.skills,
          strengths: profile.strengths,
          weaknesses: profile.weaknesses,
          interests: profile.interests,
          careerGoals: profile.careerGoals,
          dealBreakers: profile.dealBreakers,
          interviewConcerns: profile.interviewConcerns,
        },
        improveFeed: improveFeedTask(contract),
        learnedPreferences: {
          ...feedImpact.learnedPreferences,
          controls: {
            actions: ["more", "less", "ignore", "reset", "reset_all"],
            endpoint: "/api/v2/profile/learned-preferences",
            resetMeaning:
              "Remove explicit adjustments and return to the swipe-derived baseline.",
          },
        },
        resumes: resumes.map((resume) => ({
          ...resume,
          createdAt: resume.createdAt.toISOString(),
        })),
        settings: {
          dailyDigestEnabled: settings.dailyDigestEnabled,
          reminderNotificationsEnabled: settings.reminderNotificationsEnabled,
        },
      },
      meta: {
        fieldSemantics: {
          roleTargets: "retrieval",
          constraints: "hard_constraint",
          evidence: "qualification",
          preferences: "taste",
          settings: "workflow",
        },
      },
    });
  } catch (error) {
    return apiV2RouteError(request, error);
  }
}

export async function PATCH(request: Request) {
  try {
    const installation = await requireApiV2Session(request);
    const input = await parseApiV2Json(request, NativeProfileUpdateSchema);
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
    return apiV2Json(request, { data: result, meta: {} });
  } catch (error) {
    if (error instanceof CandidateProfileConflictError) {
      return apiV2Error(request, 409, "profile_conflict", error.message);
    }
    if (error instanceof CandidateProfileRateLimitError) {
      return apiV2Error(request, 429, "profile_rate_limited", error.message);
    }
    return apiV2RouteError(request, error);
  }
}
