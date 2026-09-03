import {
  nativeJson,
  nativeRouteError,
  requireNativeSession,
} from "@/features/native/http";
import { revokeNativeInstallation } from "@/features/native/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(request: Request) {
  try {
    const installation = await requireNativeSession(request);
    await revokeNativeInstallation(installation.id);
    return nativeJson({ data: { revoked: true } });
  } catch (error) {
    return nativeRouteError(error);
  }
}
