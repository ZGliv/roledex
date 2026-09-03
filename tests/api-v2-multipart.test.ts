import { describe, expect, it } from "vitest";

import { readMultipartFormDataWithinLimit } from "@/features/api-v2/multipart";

function multipartRequest(body: BodyInit, contentLength?: string) {
  return new Request("http://jobswipe.local/api/v2/resume-import", {
    method: "POST",
    headers: {
      "content-type": "multipart/form-data; boundary=jobswipe-test",
      ...(contentLength ? { "content-length": contentLength } : {}),
    },
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("bounded multipart parsing", () => {
  it("parses a valid multipart body", async () => {
    const body = [
      "--jobswipe-test\r\n",
      'Content-Disposition: form-data; name="label"\r\n\r\n',
      "Primary résumé\r\n",
      "--jobswipe-test--\r\n",
    ].join("");
    const form = await readMultipartFormDataWithinLimit(multipartRequest(body), 1_024);
    expect(form.get("label")).toBe("Primary résumé");
  });

  it("rejects a chunked body as soon as its actual bytes exceed the limit", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(7));
        controller.enqueue(new Uint8Array(7));
        controller.close();
      },
    });
    await expect(
      readMultipartFormDataWithinLimit(multipartRequest(stream), 10),
    ).rejects.toMatchObject({
      status: 413,
      code: "payload_too_large",
    });
  });

  it("rejects an oversized or malformed declared length before reading", async () => {
    await expect(
      readMultipartFormDataWithinLimit(multipartRequest("ignored", "11"), 10),
    ).rejects.toMatchObject({ status: 413, code: "payload_too_large" });
    await expect(
      readMultipartFormDataWithinLimit(multipartRequest("ignored", "not-a-number"), 10),
    ).rejects.toMatchObject({ status: 400, code: "invalid_content_length" });
  });
});
