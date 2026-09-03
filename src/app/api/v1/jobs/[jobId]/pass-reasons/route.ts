import { recordJobDecisionReasonsForVisitor } from "@/features/decisions/service";
import {
  nativeJson,
  nativeRouteError,
  parseNativeJson,
  requireNativeSession,
} from "@/features/native/http";
import {
  NativeDecisionReasonsInputSchema,
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
    const input = await parseNativeJson(
      request,
      NativeDecisionReasonsInputSchema,
    );
    const result = await recordJobDecisionReasonsForVisitor(
      installation.visitorId,
      {
        jobId: id,
        expectedDecision: "skipped",
        expectedDecisionEventId: input.expectedDecisionEventId,
        reasonCodes: input.reasonCodes,
      },
    );
    return nativeJson({ data: result });
  } catch (error) {
    return nativeRouteError(error);
  }
}
