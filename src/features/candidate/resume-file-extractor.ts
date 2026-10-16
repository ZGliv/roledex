import "server-only";

const MAX_RESUME_FILE_BYTES = 5 * 1024 * 1024;
const MAX_RESUME_TEXT_CHARACTERS = 100_000;

export class ResumeFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResumeFileError";
  }
}

function extension(fileName: string) {
  const match = fileName.toLocaleLowerCase("en-US").match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

function hasPdfMagic(bytes: Uint8Array) {
  return String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
}

function hasZipMagic(bytes: Uint8Array) {
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function cleanExtractedText(value: string) {
  const cleaned = value
    .replaceAll("\u0000", "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
  if (cleaned.length < 100) {
    throw new ResumeFileError(
      "That file did not contain enough readable text. Try another résumé or paste the text instead.",
    );
  }
  if (cleaned.length > MAX_RESUME_TEXT_CHARACTERS) {
    throw new ResumeFileError(
      "That résumé contains too much text. Keep it under 100,000 characters.",
    );
  }
  return cleaned;
}

export async function extractResumeFileText(file: File) {
  if (file.size <= 0) throw new ResumeFileError("Choose a résumé file first.");
  if (file.size > MAX_RESUME_FILE_BYTES) {
    throw new ResumeFileError("Keep résumé files under 5 MB.");
  }

  const fileExtension = extension(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  if (fileExtension === "pdf") {
    if (!hasPdfMagic(bytes)) {
      throw new ResumeFileError("That file does not appear to be a valid PDF.");
    }
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: bytes });
    try {
      const result = await parser.getText();
      return cleanExtractedText(result.text);
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }

  if (fileExtension === "docx") {
    if (!hasZipMagic(bytes)) {
      throw new ResumeFileError("That file does not appear to be a valid Word document.");
    }
    const { default: mammoth } = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return cleanExtractedText(result.value);
  }

  if (fileExtension === "txt" || fileExtension === "md") {
    return cleanExtractedText(buffer.toString("utf8"));
  }

  throw new ResumeFileError("Use a PDF, DOCX, TXT, or Markdown résumé file.");
}
