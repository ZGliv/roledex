import {
  apiV2Error,
  apiV2Json,
  apiV2Options,
  apiV2RouteError,
  parseApiV2Json,
  requireApiV2Session,
} from "@/features/api-v2/http";
import { ApiV2AccountDeleteSchema } from "@/features/api-v2/input";
import { verifyNativeInstallationCredential } from "@/features/native/service";
import {
  deleteGuestWorkspaceForVisitor,
  OwnerWorkspaceDeletionError,
} from "@/features/visitor/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return apiV2Options(request);
}

export async function DELETE(request: Request) {
  try {
    const installation = await requireApiV2Session(request);
    await parseApiV2Json(request, ApiV2AccountDeleteSchema, 1_024);
    const reauthenticated = await verifyNativeInstallationCredential(
      installation.id,
      request.headers.get("x-installation-credential"),
    );
    if (!reauthenticated) {
      return apiV2Error(
        request,
        401,
        "account_deletion_reauthentication_required",
        "Confirm account deletion from this device again.",
      );
    }
    const result = await deleteGuestWorkspaceForVisitor(installation.visitorId);
    return apiV2Json(request, { data: result, meta: { irreversible: true } });
  } catch (error) {
    if (error instanceof OwnerWorkspaceDeletionError) {
      return apiV2Error(request, 403, "owner_workspace_protected", error.message);
    }
    return apiV2RouteError(request, error);
  }
}
