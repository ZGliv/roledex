import {
  nativeBearerToken,
  nativeError,
  nativeJson,
  nativeRouteError,
} from "@/features/native/http";
import { refreshNativeInstallation } from "@/features/native/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const credential = nativeBearerToken(request);
    if (!credential) {
      return nativeError(
        401,
        "invalid_installation_credential",
        "A valid installation credential is required.",
      );
    }
    return nativeJson({ data: await refreshNativeInstallation(credential) });
  } catch (error) {
    return nativeRouteError(error);
  }
}
