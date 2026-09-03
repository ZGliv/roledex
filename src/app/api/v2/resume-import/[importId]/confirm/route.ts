import { CandidateResumeImportConfirmSchema } from "@/features/candidate/input";
import { confirmCandidateResumeImportForVisitor } from "@/features/candidate/search-contract-service";
import {
  apiV2Json,
  apiV2Options,
  apiV2RouteError,
  parseApiV2Json,
  requireApiV2Session,
} from "@/features/api-v2/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ConfirmBodySchema = CandidateResumeImportConfirmSchema.omit({
  importId: true,
});

export function OPTIONS(request: Request) {
  return apiV2Options(request);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ importId: string }> },
) {
  try {
    const installation = await requireApiV2Session(request);
    const [{ importId }, body] = await Promise.all([
      context.params,
      parseApiV2Json(request, ConfirmBodySchema),
    ]);
    const input = CandidateResumeImportConfirmSchema.parse({
      ...body,
      importId,
    });
    const result = await confirmCandidateResumeImportForVisitor(
      installation.visitorId,
      input,
    );
    return apiV2Json(request, {
      data: result,
      meta: {
        rawTextRetained: input.retainRawSource,
      },
    });
  } catch (error) {
    return apiV2RouteError(request, error);
  }
}
