import {
  apiV2Error,
  apiV2Json,
  apiV2Options,
  apiV2RouteError,
  parseApiV2Json,
  requireApiV2Session,
} from "@/features/api-v2/http";
import { ApiV2WorkspaceClaimSchema } from "@/features/api-v2/input";
import { pairNativeInstallation } from "@/features/native/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return apiV2Options(request);
}

export async function POST(request: Request) {
  try {
    const installation = await requireApiV2Session(request);
    const input = await parseApiV2Json(request, ApiV2WorkspaceClaimSchema);
    if (input.method === "sign_in_with_apple") {
      return apiV2Error(
        request,
        501,
        "sign_in_with_apple_not_configured",
        "Sign in with Apple requires the final Apple Team ID, Services ID, bundle ID, and signing key.",
      );
    }
    const session = await pairNativeInstallation(installation.id, input.code);
    return session
      ? apiV2Json(request, {
          data: session,
          meta: { claimed: true, method: input.method },
        })
      : apiV2Error(
          request,
          409,
          "pairing_code_unavailable",
          "The pairing code is invalid, expired, or already used.",
        );
  } catch (error) {
    return apiV2RouteError(request, error);
  }
}
