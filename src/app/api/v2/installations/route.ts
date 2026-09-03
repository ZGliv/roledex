import {
  apiV2Json,
  apiV2Options,
  apiV2RouteError,
  parseApiV2Json,
} from "@/features/api-v2/http";
import { ApiV2InstallationSchema } from "@/features/api-v2/input";
import {
  enforceNativeInstallationCreationRateLimit,
  nativeInstallationNetworkHint,
} from "@/features/native/rate-limit";
import { createNativeInstallation } from "@/features/native/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return apiV2Options(request);
}

export async function POST(request: Request) {
  try {
    const input = await parseApiV2Json(request, ApiV2InstallationSchema);
    await enforceNativeInstallationCreationRateLimit(
      nativeInstallationNetworkHint(request),
    );
    return apiV2Json(
      request,
      { data: await createNativeInstallation(input), meta: { account: "guest" } },
      { status: 201 },
    );
  } catch (error) {
    return apiV2RouteError(request, error);
  }
}
