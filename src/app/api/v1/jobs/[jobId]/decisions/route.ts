import { recordJobDecisionForVisitor } from "@/features/decisions/service";
import {
  nativeJson,
  nativeRouteError,
  parseNativeJson,
  requireNativeSession,
} from "@/features/native/http";
import {
  NativeDecisionInputSchema,
  NativeJobIdSchema,
} from "@/features/native/input";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const installation = await requireNativeSession(request);
    const { jobId } = await context.params;
    const id = NativeJobIdSchema.parse(jobId);
    const input = await parseNativeJson(request, NativeDecisionInputSchema);
    const result = await recordJobDecisionForVisitor(installation.visitorId, {
      jobId: id,
      ...input,
    });
    return nativeJson({ data: result });
  } catch (error) {
    return nativeRouteError(error);
  }
}
