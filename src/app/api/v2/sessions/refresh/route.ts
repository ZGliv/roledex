import {
  apiV2BearerToken,
  apiV2Error,
  apiV2Json,
  apiV2Options,
  apiV2RouteError,
} from "@/features/api-v2/http";
import { refreshNativeInstallation } from "@/features/native/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return apiV2Options(request);
}

export async function POST(request: Request) {
  try {
    const credential = apiV2BearerToken(request);
    if (!credential) {
      return apiV2Error(
        request,
        401,
        "invalid_installation_credential",
        "A valid installation credential is required.",
      );
    }
    return apiV2Json(request, {
      data: await refreshNativeInstallation(credential),
      meta: { credentialRotated: true },
    });
  } catch (error) {
    return apiV2RouteError(request, error);
  }
}
