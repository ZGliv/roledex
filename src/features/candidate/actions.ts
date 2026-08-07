"use server";

import { revalidatePath } from "next/cache";

import { requireVisitorId } from "@/features/auth/visitor";
import { CandidateProfileUpdateSchema } from "@/features/candidate/input";
import {
  CandidateProfileConflictError,
  CandidateProfileRateLimitError,
  updateCandidateProfileAndRescoreForVisitor,
} from "@/features/candidate/service";

export type CandidateProfileActionState = {
  fieldErrors?: Record<string, string[]>;
  message: string;
  ok: boolean;
  rescoredJobs?: number;
  revision?: number;
};

export async function updateCandidateProfileAction(
  _previousState: CandidateProfileActionState,
  formData: FormData,
): Promise<CandidateProfileActionState> {
  const visitorId = await requireVisitorId();

  const parsed = CandidateProfileUpdateSchema.safeParse({
    expectedRevision: formData.get("expectedRevision"),
    currentRole: formData.get("currentRole"),
    location: formData.get("location"),
    relocationPreference: formData.get("relocationPreference"),
    currentSalaryCents: formData.get("currentSalaryCents"),
    preferredSalaryMinimumCents: formData.get("preferredSalaryMinimumCents"),
    preferredSalaryTargetCents: formData.get("preferredSalaryTargetCents"),
    yearsExperience: formData.get("yearsExperience"),
    preferredWorkArrangements: formData.getAll("preferredWorkArrangements"),
    preferredIndustries: formData.get("preferredIndustries"),
    targetRoleFamilies: formData.get("targetRoleFamilies"),
    skills: formData.get("skills"),
    strengths: formData.get("strengths"),
    weaknesses: formData.get("weaknesses"),
    interests: formData.get("interests"),
    careerGoals: formData.get("careerGoals"),
    dealBreakers: formData.get("dealBreakers"),
    interviewConcerns: formData.get("interviewConcerns"),
  });

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message: fieldErrors.expectedRevision
        ? "This profile form is out of date. Reload it before saving again."
        : "Check the highlighted fields and try again.",
      fieldErrors,
    };
  }

  try {
    const result = await updateCandidateProfileAndRescoreForVisitor(
      visitorId,
      parsed.data,
    );
    revalidatePath("/profile");
    revalidatePath("/");
    revalidatePath("/saved");
    revalidatePath("/jobs/[jobId]", "page");
    return {
      ok: true,
      message:
        "unchanged" in result
          ? "Your preferences are already up to date."
          : `Preferences saved. Updated ${result.rescoredJobs} ${
              result.rescoredJobs === 1 ? "job" : "jobs"
            } for your feed.`,
      ...result,
    };
  } catch (error) {
    if (error instanceof CandidateProfileConflictError) {
      return { ok: false, message: error.message };
    }
    if (error instanceof CandidateProfileRateLimitError) {
      return { ok: false, message: error.message };
    }
    console.error("Candidate profile update failed.", error);
    return {
      ok: false,
      message: "Your preferences could not be saved. Nothing was changed.",
    };
  }
}
