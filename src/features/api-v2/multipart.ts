import "server-only";

import {
  readRequestBytesWithinLimit,
  RequestBodyLimitError,
} from "@/lib/http/read-request-text";

import { ApiV2RequestError } from "./http";

export const MAX_RESUME_MULTIPART_BYTES = 6 * 1024 * 1024;

export async function readMultipartFormDataWithinLimit(
  request: Request,
  maximumBytes = MAX_RESUME_MULTIPART_BYTES,
) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) {
    throw new ApiV2RequestError(
      415,
      "unsupported_media_type",
      "Send a multipart form upload.",
    );
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && !/^\d+$/.test(contentLength)) {
    throw new ApiV2RequestError(
      400,
      "invalid_content_length",
      "The content length is invalid.",
    );
  }
  if (Number(contentLength ?? "0") > maximumBytes) {
    throw new ApiV2RequestError(
      413,
      "payload_too_large",
      "Keep résumé uploads under 5 MB.",
    );
  }

  let body: Uint8Array<ArrayBuffer>;
  try {
    body = await readRequestBytesWithinLimit(request, maximumBytes);
  } catch (error) {
    if (error instanceof RequestBodyLimitError) {
      throw new ApiV2RequestError(
        413,
        "payload_too_large",
        "Keep résumé uploads under 5 MB.",
      );
    }
    throw error;
  }

  try {
    return await new Request("http://jobswipe.local/resume-import", {
      method: "POST",
      headers: { "content-type": contentType },
      body,
    }).formData();
  } catch {
    throw new ApiV2RequestError(
      400,
      "invalid_multipart_body",
      "The résumé upload could not be read.",
    );
  }
}
