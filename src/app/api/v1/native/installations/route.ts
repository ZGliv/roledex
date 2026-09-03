import { NativeInstallationInputSchema } from "@/features/native/input";
import {
  nativeJson,
  nativeRouteError,
  parseNativeJson,
} from "@/features/native/http";
import {
  enforceNativeInstallationCreationRateLimit,
  nativeInstallationNetworkHint,
} from "@/features/native/rate-limit";
import { createNativeInstallation } from "@/features/native/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = await parseNativeJson(request, NativeInstallationInputSchema);
    await enforceNativeInstallationCreationRateLimit(
      nativeInstallationNetworkHint(request),
    );
    return nativeJson(
      { data: await createNativeInstallation(input) },
      { status: 201 },
    );
  } catch (error) {
    return nativeRouteError(error);
  }
}
