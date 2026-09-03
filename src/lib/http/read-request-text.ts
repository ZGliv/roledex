import "server-only";

export class RequestBodyLimitError extends Error {
  constructor() {
    super("The request body is too large.");
    this.name = "RequestBodyLimitError";
  }
}

/** Reads binary request data incrementally so chunked bodies cannot bypass caps. */
export async function readRequestBytesWithinLimit(
  request: Request,
  maximumBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!request.body) return new Uint8Array(new ArrayBuffer(0));
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maximumBytes) {
        await reader.cancel();
        throw new RequestBodyLimitError();
      }
      chunks.push(value);
    }

    const result = new Uint8Array(new ArrayBuffer(byteLength));
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  } finally {
    reader.releaseLock();
  }
}

/** Reads a request incrementally so chunked bodies cannot bypass memory caps. */
export async function readRequestTextWithinLimit(
  request: Request,
  maximumBytes: number,
) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteLength = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maximumBytes) {
        await reader.cancel();
        throw new RequestBodyLimitError();
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } catch (error) {
    if (error instanceof RequestBodyLimitError) throw error;
    throw new TypeError("The request body is not valid UTF-8.");
  } finally {
    reader.releaseLock();
  }
}
