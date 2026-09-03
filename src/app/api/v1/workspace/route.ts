import {
  nativeError,
  nativeJson,
  nativeRouteError,
  requireNativeSession,
} from "@/features/native/http";
import {
  deleteGuestWorkspaceForVisitor,
  OwnerWorkspaceDeletionError,
} from "@/features/visitor/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(request: Request) {
  try {
    const installation = await requireNativeSession(request);
    const result = await deleteGuestWorkspaceForVisitor(
      installation.visitorId,
    );
    return nativeJson({ data: result });
  } catch (error) {
    if (error instanceof OwnerWorkspaceDeletionError) {
      return nativeError(403, "owner_workspace_protected", error.message);
    }
    return nativeRouteError(error);
  }
}
