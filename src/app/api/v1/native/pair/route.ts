import {
  nativeError,
  nativeJson,
  nativeRouteError,
  parseNativeJson,
  requireNativeSession,
} from "@/features/native/http";
import { NativePairInputSchema } from "@/features/native/input";
import { pairNativeInstallation } from "@/features/native/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const installation = await requireNativeSession(request);
    const input = await parseNativeJson(request, NativePairInputSchema);
    const session = await pairNativeInstallation(
      installation.id,
      input.code,
    );
    return session
      ? nativeJson({ data: session })
      : nativeError(
          409,
          "pairing_code_unavailable",
          "The pairing code is invalid, expired, or already used.",
        );
  } catch (error) {
    return nativeRouteError(error);
  }
}
