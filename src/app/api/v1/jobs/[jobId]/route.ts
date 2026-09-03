import { getJobCardForVisitor } from "@/features/jobs/queries";
import { nativeJobDetail } from "@/features/native/dto";
import {
  nativeError,
  nativeJson,
  nativeRouteError,
  requireNativeSession,
} from "@/features/native/http";
import { NativeJobIdSchema } from "@/features/native/input";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const installation = await requireNativeSession(request);
    const { jobId } = await context.params;
    const id = NativeJobIdSchema.parse(jobId);
    const job = await getJobCardForVisitor(installation.visitorId, id);
    return job
      ? nativeJson({ data: nativeJobDetail(job) })
      : nativeError(404, "job_not_found", "This job is no longer available.");
  } catch (error) {
    return nativeRouteError(error);
  }
}
