import {
  apiV2Json,
  apiV2Options,
  apiV2RouteError,
  requireApiV2Session,
} from "@/features/api-v2/http";
import { revokeNativeInstallation } from "@/features/native/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return apiV2Options(request);
}

export async function DELETE(request: Request) {
  try {
    const installation = await requireApiV2Session(request);
    await revokeNativeInstallation(installation.id);
    return apiV2Json(request, { data: { revoked: true }, meta: {} });
  } catch (error) {
    return apiV2RouteError(request, error);
  }
}
