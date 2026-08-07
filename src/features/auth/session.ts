import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  getOwnerAuthConfig,
  localOwnerAuthBypassEnabled,
  OWNER_SESSION_COOKIE,
  verifyOwnerSessionToken,
} from "@/features/auth/session-token";

export async function hasOwnerSession() {
  if (localOwnerAuthBypassEnabled()) return true;

  const config = getOwnerAuthConfig();
  if (!config) return false;

  const token = (await cookies()).get(OWNER_SESSION_COOKIE)?.value;
  return verifyOwnerSessionToken(token, config.sessionSecret);
}

export async function requireOwnerSession() {
  if (await hasOwnerSession()) return;
  redirect("/unlock");
}
