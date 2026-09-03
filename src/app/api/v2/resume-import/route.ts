import { CandidateResumeImportCreateSchema } from "@/features/candidate/input";
import {
  extractResumeFileText,
  ResumeFileError,
} from "@/features/candidate/resume-file-extractor";
import { createCandidateResumeImportForVisitor } from "@/features/candidate/search-contract-service";
import {
  apiV2Json,
  apiV2Options,
  ApiV2RequestError,
  apiV2RouteError,
  parseApiV2Json,
  requireApiV2Session,
} from "@/features/api-v2/http";
import { readMultipartFormDataWithinLimit } from "@/features/api-v2/multipart";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return apiV2Options(request);
}

export async function POST(request: Request) {
  try {
    const installation = await requireApiV2Session(request);
    const contentType = request.headers.get("content-type") ?? "";
    const input = contentType.toLocaleLowerCase("en-US").startsWith("multipart/form-data")
      ? await (async () => {
          const formData = await readMultipartFormDataWithinLimit(request);
          const file = formData.get("file");
          if (!(file instanceof File)) {
            throw new ApiV2RequestError(
              422,
              "resume_file_missing",
              "Choose a résumé file first.",
            );
          }
          const requestedLabel = formData.get("label");
          const label =
            typeof requestedLabel === "string" && requestedLabel.trim()
              ? requestedLabel.trim()
              : file.name.replace(/\.[^.]+$/, "") || "Primary résumé";
          try {
            return CandidateResumeImportCreateSchema.parse({
              label,
              rawText: await extractResumeFileText(file),
              sourceFileName: file.name,
            });
          } catch (error) {
            if (error instanceof ResumeFileError) {
              throw new ApiV2RequestError(
                422,
                "resume_file_invalid",
                error.message,
              );
            }
            throw error;
          }
        })()
      : await parseApiV2Json(
          request,
          CandidateResumeImportCreateSchema,
          128 * 1024,
        );
    const result = await createCandidateResumeImportForVisitor(
      installation.visitorId,
      input,
    );
    return apiV2Json(
      request,
      {
        data: result,
        meta: {
          requiresConfirmation: true,
          rawTextPolicy: "deleted_after_confirmation_by_default",
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return apiV2RouteError(request, error);
  }
}
