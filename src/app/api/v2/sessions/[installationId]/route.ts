import {
  apiV2Error,
  apiV2Json,
  apiV2Options,
  apiV2RouteError,
  requireApiV2Session,
} from "@/features/api-v2/http";
import { ApiV2InstallationIdSchema } from "@/features/api-v2/input";
import { revokeApiV2Session } from "@/features/api-v2/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return apiV2Options(request);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ installationId: string }> },
) {
  try {
    const current = await requireApiV2Session(request);
    const { installationId } = await context.params;
    const id = ApiV2InstallationIdSchema.parse(installationId);
    const revoked = await revokeApiV2Session(current.visitorId, id);
    return revoked
      ? apiV2Json(request, { data: { revoked: true }, meta: {} })
      : apiV2Error(
          request,
          404,
          "session_not_found",
          "That device session is no longer active.",
        );
  } catch (error) {
    return apiV2RouteError(request, error);
  }
}
