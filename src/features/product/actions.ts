"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { requireVisitorId } from "@/features/auth/visitor";
import {
  getVisitorSessionSecret,
  issueVisitorSessionToken,
  visitorSessionCookieSecure,
  VISITOR_SESSION_COOKIE,
  VISITOR_SESSION_MAX_AGE_SECONDS,
} from "@/features/auth/visitor-session-token";
import {
  ApplicationDetailsSchema,
  BetaFeedbackSchema,
  DevicePairingCodeSchema,
  ProductSettingsSchema,
  ResumeDeleteSchema,
  ResumeSourceSchema,
} from "@/features/product/input";
import {
  addResumeSource,
  consumeDevicePairingCode,
  createDevicePairingCode,
  deleteResumeSource,
  markOnboardingComplete,
  saveApplicationDetails,
  submitBetaFeedback,
  updateProductSettings,
  ProductFeedbackRateLimitError,
} from "@/features/product/service";

export type ProductActionResult<T = undefined> =
  | { ok: true; message: string; value: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

export async function createDevicePairingCodeAction(): Promise<
  ProductActionResult<{ code: string; expiresAt: string }>
> {
  try {
    const visitorId = await requireVisitorId();
    const result = await createDevicePairingCode(visitorId);
    return {
      ok: true,
      message: "Pairing code created.",
      value: { code: result.code, expiresAt: result.expiresAt.toISOString() },
    };
  } catch (error) {
    console.error("Device pairing code creation failed.", error);
    return { ok: false, message: "A pairing code could not be created right now." };
  }
}

export async function redeemDevicePairingCodeAction(
  rawCode: string,
): Promise<ProductActionResult> {
  const parsed = DevicePairingCodeSchema.safeParse(rawCode);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the pairing code." };
  }
  const sessionSecret = getVisitorSessionSecret();
  if (!sessionSecret) return { ok: false, message: "Device sync is not configured." };

  try {
    const visitorId = await consumeDevicePairingCode(parsed.data);
    if (!visitorId) {
      return { ok: false, message: "That code is invalid, expired, or already used." };
    }
    const token = await issueVisitorSessionToken(visitorId, sessionSecret);
    const cookieStore = await cookies();
    cookieStore.set(VISITOR_SESSION_COOKIE, token, {
      httpOnly: true,
      maxAge: VISITOR_SESSION_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: visitorSessionCookieSecure(),
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "This device now uses the paired workspace.", value: undefined };
  } catch (error) {
    console.error("Device pairing failed.", error);
    return { ok: false, message: "This device could not be paired. Try a new code." };
  }
}

export async function saveApplicationDetailsAction(input: unknown): Promise<ProductActionResult> {
  const parsed = ApplicationDetailsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the application details.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  try {
    await saveApplicationDetails(await requireVisitorId(), parsed.data);
    revalidatePath("/saved");
    return { ok: true, message: "Application details saved.", value: undefined };
  } catch (error) {
    console.error("Application detail update failed.", error);
    return { ok: false, message: error instanceof Error ? error.message : "Application details could not be saved." };
  }
}

export async function updateProductSettingsAction(input: unknown): Promise<ProductActionResult> {
  const parsed = ProductSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the notification settings." };
  try {
    await updateProductSettings(await requireVisitorId(), parsed.data);
    revalidatePath("/profile");
    return { ok: true, message: "Notification preferences saved.", value: undefined };
  } catch (error) {
    console.error("Product settings update failed.", error);
    return { ok: false, message: "Notification preferences could not be saved." };
  }
}

export async function completeOnboardingAction(): Promise<ProductActionResult> {
  try {
    await markOnboardingComplete(await requireVisitorId());
    revalidatePath("/profile");
    return { ok: true, message: "Setup complete.", value: undefined };
  } catch (error) {
    console.error("Onboarding completion failed.", error);
    return { ok: false, message: "Setup could not be completed." };
  }
}

export async function addResumeSourceAction(input: unknown): Promise<ProductActionResult<{ id: string | null }>> {
  const parsed = ResumeSourceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the résumé text.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  try {
    const id = await addResumeSource(await requireVisitorId(), parsed.data);
    revalidatePath("/profile");
    return {
      ok: true,
      message: id ? "Résumé evidence saved for review." : "That résumé is already saved.",
      value: { id },
    };
  } catch (error) {
    console.error("Resume source creation failed.", error);
    return { ok: false, message: "Résumé evidence could not be saved." };
  }
}

export async function deleteResumeSourceAction(input: unknown): Promise<ProductActionResult> {
  const parsed = ResumeDeleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That résumé could not be identified." };
  try {
    const deleted = await deleteResumeSource(await requireVisitorId(), parsed.data.id);
    revalidatePath("/profile");
    return deleted
      ? { ok: true, message: "Résumé evidence deleted.", value: undefined }
      : { ok: false, message: "That résumé was not found." };
  } catch (error) {
    console.error("Resume source deletion failed.", error);
    return { ok: false, message: "Résumé evidence could not be deleted." };
  }
}

export async function submitBetaFeedbackAction(input: unknown): Promise<ProductActionResult> {
  const parsed = BetaFeedbackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check your feedback." };
  try {
    await submitBetaFeedback(await requireVisitorId(), parsed.data);
    return { ok: true, message: "Thanks—your feedback was sent.", value: undefined };
  } catch (error) {
    if (error instanceof ProductFeedbackRateLimitError) {
      return { ok: false, message: error.message };
    }
    console.error("Beta feedback submission failed.", error);
    return { ok: false, message: "Feedback could not be sent right now." };
  }
}
