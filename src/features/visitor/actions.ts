"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { requireVisitorId } from "@/features/auth/visitor";
import { VISITOR_SESSION_COOKIE } from "@/features/auth/visitor-session-token";
import {
  deleteGuestWorkspaceForVisitor,
  OwnerWorkspaceDeletionError,
} from "@/features/visitor/service";

export type ResetGuestWorkspaceActionResult = {
  message: string;
  ok: boolean;
};

export async function resetGuestWorkspaceAction(): Promise<ResetGuestWorkspaceActionResult> {
  const visitorId = await requireVisitorId();

  try {
    await deleteGuestWorkspaceForVisitor(visitorId);
  } catch (error) {
    if (error instanceof OwnerWorkspaceDeletionError) {
      return { ok: false, message: error.message };
    }
    console.error("Guest workspace reset failed.", error);
    return {
      ok: false,
      message: "Your workspace could not be reset. No partial deletion was committed.",
    };
  }

  try {
    const cookieStore = await cookies();
    cookieStore.delete(VISITOR_SESSION_COOKIE);
  } catch (error) {
    console.error("Guest session cookie cleanup failed after data deletion.", error);
  }
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: "Your RoleDex profile, decisions, notes, and analyses were deleted.",
  };
}
