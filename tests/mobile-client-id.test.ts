import { describe, expect, it } from "vitest";

import { mobileClientId } from "../mobile/src/client-id";

describe("mobile client IDs", () => {
  it("creates an RFC 4122 version 4 UUID without randomUUID support", () => {
    const source = {
      getRandomValues<T extends ArrayBufferView>(array: T) {
        const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
        bytes.forEach((_, index) => { bytes[index] = index; });
        return array;
      },
    };

    expect(mobileClientId(source)).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  });
});
