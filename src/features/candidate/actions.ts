"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireVisitorId } from "@/features/auth/visitor";
import {
  CandidateEducationCreateSchema,
  CandidateEducationUpdateSchema,
  CandidateProfileRecordDeleteSchema,
  CandidateProfileUpdateSchema,
  CandidateResumeImportConfirmSchema,
  CandidateResumeImportCreateSchema,
  CandidateResumeImportDiscardSchema,
  CandidateRoleTargetsReplaceSchema,
  CandidateSearchPreferencesUpdateSchema,
  CandidateSkillEvidenceCreateSchema,
  CandidateSkillEvidenceUpdateSchema,
  CandidateWorkExperienceCreateSchema,
  CandidateWorkExperienceUpdateSchema,
  PortfolioProjectCreateSchema,
  PortfolioProjectUpdateSchema,
} from "@/features/candidate/input";
import type { CandidateResumeDraft } from "@/features/candidate/input";
import {
  CandidateProfileRecordNotFoundError,
  CandidateProfileRecordLimitError,
  createCandidateEducationForVisitor,
  createCandidateSkillEvidenceForVisitor,
  createCandidateWorkExperienceForVisitor,
  createPortfolioProjectForVisitor,
  deleteCandidateEducationForVisitor,
  deleteCandidateSkillEvidenceForVisitor,
  deleteCandidateWorkExperienceForVisitor,
  deletePortfolioProjectForVisitor,
  updateCandidateEducationForVisitor,
  updateCandidateSearchPreferencesForVisitor,
  updateCandidateSkillEvidenceForVisitor,
  updateCandidateWorkExperienceForVisitor,
  updatePortfolioProjectForVisitor,
} from "@/features/candidate/profile-foundation-service";
import {
  CandidateResumeImportNotFoundError,
  CandidateResumeImportSelectionError,
  confirmCandidateResumeImportForVisitor,
  createCandidateResumeImportForVisitor,
  discardCandidateResumeImportForVisitor,
  replaceCandidateRoleTargetsForVisitor,
} from "@/features/candidate/search-contract-service";
import {
  extractResumeFileText,
  ResumeFileError,
} from "@/features/candidate/resume-file-extractor";
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

export type CandidateProfileMutationState = {
  fieldErrors?: Record<string, string[]>;
  id?: string;
  message: string;
  ok: boolean;
  revision?: number;
  unchanged?: boolean;
};

export type CandidateResumeImportActionState = {
  draft?: CandidateResumeDraft;
  fieldErrors?: Record<string, string[]>;
  importId?: string;
  imported?: {
    education: number;
    projects: number;
    skills: number;
    work: number;
  };
  message: string;
  ok: boolean;
  revision?: number;
};

function revalidateCandidateSurfaces() {
  revalidatePath("/profile");
  revalidatePath("/");
  revalidatePath("/saved");
  revalidatePath("/jobs/[jobId]", "page");
}

async function runCandidateMutation<T>(
  schema: z.ZodType<T>,
  rawInput: unknown,
  mutation: (visitorId: string, input: T) => Promise<{
    id?: string;
    revision: number;
    unchanged?: true;
  }>,
  successMessage: string,
): Promise<CandidateProfileMutationState> {
  const parsed = schema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const visitorId = await requireVisitorId();
    const result = await mutation(visitorId, parsed.data);
    revalidateCandidateSurfaces();
    return {
      ok: true,
      message: result.unchanged
        ? "Everything is already up to date."
        : successMessage,
      ...result,
    };
  } catch (error) {
    if (
      error instanceof CandidateProfileConflictError ||
      error instanceof CandidateProfileRecordLimitError ||
      error instanceof CandidateProfileRecordNotFoundError
    ) {
      return { ok: false, message: error.message };
    }
    console.error("Candidate profile record mutation failed.", error);
    return {
      ok: false,
      message: "That profile change could not be saved. Nothing was changed.",
    };
  }
}

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

export async function updateCandidateSearchPreferencesAction(
  input: unknown,
): Promise<CandidateProfileMutationState> {
  return runCandidateMutation(
    CandidateSearchPreferencesUpdateSchema,
    input,
    updateCandidateSearchPreferencesForVisitor,
    "Search preferences saved.",
  );
}

export async function replaceCandidateRoleTargetsAction(
  input: unknown,
): Promise<CandidateProfileMutationState> {
  return runCandidateMutation(
    CandidateRoleTargetsReplaceSchema,
    input,
    replaceCandidateRoleTargetsForVisitor,
    "Role directions saved.",
  );
}

export async function createCandidateResumeImportAction(
  input: unknown,
): Promise<CandidateResumeImportActionState> {
  const parsed = CandidateResumeImportCreateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      message: "Check the résumé text and try again.",
      ok: false,
    };
  }
  try {
    const result = await createCandidateResumeImportForVisitor(
      await requireVisitorId(),
      parsed.data,
    );
    revalidatePath("/profile");
    revalidatePath("/onboarding");
    return {
      ...result,
      message: "Review the proposed facts before adding them.",
      ok: true,
    };
  } catch (error) {
    console.error("Résumé import draft creation failed.", error);
    return {
      message:
        error instanceof Error
          ? error.message
          : "The résumé could not be reviewed.",
      ok: false,
    };
  }
}

export async function createCandidateResumeImportFromFileAction(
  formData: FormData,
): Promise<CandidateResumeImportActionState> {
  const file = formData.get("file");
  const requestedLabel = formData.get("label");
  if (!(file instanceof File)) {
    return { message: "Choose a résumé file first.", ok: false };
  }
  const label =
    typeof requestedLabel === "string" && requestedLabel.trim()
      ? requestedLabel.trim()
      : file.name.replace(/\.[^.]+$/, "") || "Primary résumé";
  try {
    const rawText = await extractResumeFileText(file);
    return createCandidateResumeImportAction({
      label,
      rawText,
      sourceFileName: file.name,
    });
  } catch (error) {
    console.error("Résumé file extraction failed.", error);
    return {
      message:
        error instanceof ResumeFileError
          ? error.message
          : "That résumé could not be read. Try another file or paste the text instead.",
      ok: false,
    };
  }
}

export async function confirmCandidateResumeImportAction(
  input: unknown,
): Promise<CandidateResumeImportActionState> {
  const parsed = CandidateResumeImportConfirmSchema.safeParse(input);
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      message: "Review the selected résumé facts and try again.",
      ok: false,
    };
  }
  try {
    const result = await confirmCandidateResumeImportForVisitor(
      await requireVisitorId(),
      parsed.data,
    );
    revalidateCandidateSurfaces();
    revalidatePath("/onboarding");
    const total = Object.values(result.imported).reduce(
      (sum, value) => sum + value,
      0,
    );
    return {
      ...result,
      message: `${total} confirmed résumé ${total === 1 ? "fact" : "facts"} added.`,
      ok: true,
    };
  } catch (error) {
    if (
      error instanceof CandidateResumeImportNotFoundError ||
      error instanceof CandidateResumeImportSelectionError ||
      error instanceof CandidateProfileConflictError
    ) {
      return { message: error.message, ok: false };
    }
    console.error("Résumé import confirmation failed.", error);
    return {
      message: "The résumé facts could not be added. Nothing was changed.",
      ok: false,
    };
  }
}

export async function discardCandidateResumeImportAction(
  input: unknown,
): Promise<CandidateResumeImportActionState> {
  const parsed = CandidateResumeImportDiscardSchema.safeParse(input);
  if (!parsed.success) {
    return { message: "That résumé review is not valid.", ok: false };
  }
  try {
    await discardCandidateResumeImportForVisitor(
      await requireVisitorId(),
      parsed.data,
    );
    revalidatePath("/profile");
    revalidatePath("/onboarding");
    return { message: "Résumé review discarded and raw text deleted.", ok: true };
  } catch (error) {
    if (error instanceof CandidateResumeImportNotFoundError) {
      return { message: error.message, ok: false };
    }
    console.error("Résumé import discard failed.", error);
    return { message: "That résumé review could not be discarded.", ok: false };
  }
}

export async function createCandidateWorkExperienceAction(
  input: unknown,
): Promise<CandidateProfileMutationState> {
  return runCandidateMutation(
    CandidateWorkExperienceCreateSchema,
    input,
    createCandidateWorkExperienceForVisitor,
    "Work experience added.",
  );
}

export async function updateCandidateWorkExperienceAction(
  input: unknown,
): Promise<CandidateProfileMutationState> {
  return runCandidateMutation(
    CandidateWorkExperienceUpdateSchema,
    input,
    updateCandidateWorkExperienceForVisitor,
    "Work experience updated.",
  );
}

export async function deleteCandidateWorkExperienceAction(
  input: unknown,
): Promise<CandidateProfileMutationState> {
  return runCandidateMutation(
    CandidateProfileRecordDeleteSchema,
    input,
    deleteCandidateWorkExperienceForVisitor,
    "Work experience removed.",
  );
}

export async function createCandidateEducationAction(
  input: unknown,
): Promise<CandidateProfileMutationState> {
  return runCandidateMutation(
    CandidateEducationCreateSchema,
    input,
    createCandidateEducationForVisitor,
    "Education added.",
  );
}

export async function updateCandidateEducationAction(
  input: unknown,
): Promise<CandidateProfileMutationState> {
  return runCandidateMutation(
    CandidateEducationUpdateSchema,
    input,
    updateCandidateEducationForVisitor,
    "Education updated.",
  );
}

export async function deleteCandidateEducationAction(
  input: unknown,
): Promise<CandidateProfileMutationState> {
  return runCandidateMutation(
    CandidateProfileRecordDeleteSchema,
    input,
    deleteCandidateEducationForVisitor,
    "Education removed.",
  );
}

export async function createPortfolioProjectAction(
  input: unknown,
): Promise<CandidateProfileMutationState> {
  return runCandidateMutation(
    PortfolioProjectCreateSchema,
    input,
    createPortfolioProjectForVisitor,
    "Project added.",
  );
}

export async function updatePortfolioProjectAction(
  input: unknown,
): Promise<CandidateProfileMutationState> {
  return runCandidateMutation(
    PortfolioProjectUpdateSchema,
    input,
    updatePortfolioProjectForVisitor,
    "Project updated.",
  );
}

export async function deletePortfolioProjectAction(
  input: unknown,
): Promise<CandidateProfileMutationState> {
  return runCandidateMutation(
    CandidateProfileRecordDeleteSchema,
    input,
    deletePortfolioProjectForVisitor,
    "Project removed.",
  );
}

export async function createCandidateSkillEvidenceAction(
  input: unknown,
): Promise<CandidateProfileMutationState> {
  return runCandidateMutation(
    CandidateSkillEvidenceCreateSchema,
    input,
    createCandidateSkillEvidenceForVisitor,
    "Skill evidence added.",
  );
}

export async function updateCandidateSkillEvidenceAction(
  input: unknown,
): Promise<CandidateProfileMutationState> {
  return runCandidateMutation(
    CandidateSkillEvidenceUpdateSchema,
    input,
    updateCandidateSkillEvidenceForVisitor,
    "Skill evidence updated.",
  );
}

export async function deleteCandidateSkillEvidenceAction(
  input: unknown,
): Promise<CandidateProfileMutationState> {
  return runCandidateMutation(
    CandidateProfileRecordDeleteSchema,
    input,
    deleteCandidateSkillEvidenceForVisitor,
    "Skill evidence removed.",
  );
}
