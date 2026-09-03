import {
  apiV2Json,
  apiV2Options,
  apiV2RouteError,
  requireApiV2Session,
} from "@/features/api-v2/http";
import { exportVisitorWorkspace } from "@/features/product/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return apiV2Options(request);
}

export async function GET(request: Request) {
  try {
    const installation = await requireApiV2Session(request);
    const generatedAt = new Date();
    return apiV2Json(
      request,
      {
        data: await exportVisitorWorkspace(installation.visitorId),
        meta: { generatedAt: generatedAt.toISOString() },
      },
      {
        headers: {
          "Content-Disposition": `attachment; filename="jobswipe-export-${generatedAt.toISOString().slice(0, 10)}.json"`,
        },
      },
    );
  } catch (error) {
    return apiV2RouteError(request, error);
  }
}
