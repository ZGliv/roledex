import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  extractResumeFileText,
  ResumeFileError,
} from "@/features/candidate/resume-file-extractor";

describe("resume file extraction", () => {
  it("extracts a real PDF through the Node parser and worker", async () => {
    const file = new File([readFileSync("tests/fixtures/pilot-resume.pdf")], "pilot-resume.pdf", { type: "application/pdf" });
    const text = await extractResumeFileText(file);
    expect(text).toContain("Implementation Analyst");
    expect(text).toContain("Information Systems");
  });

  it("accepts plain text resumes and normalizes nulls and spacing", async () => {
    const text = [
      "Zack Example",
      "Implementation Analyst",
      "\u0000Supported hospital staff and automated recurring workflows.",
      "Built internal tools, documented requirements, and trained end users.",
      "Skills: SQL, customer onboarding, workflow automation, technical support.",
    ].join("\n\n");
    const file = new File([text], "resume.txt", { type: "text/plain" });

    await expect(extractResumeFileText(file)).resolves.toContain(
      "Implementation Analyst",
    );
    await expect(extractResumeFileText(file)).resolves.not.toContain("\u0000");
  });

  it("rejects unsupported files without attempting to parse them", async () => {
    const file = new File(["x".repeat(200)], "resume.rtf", {
      type: "application/rtf",
    });

    await expect(extractResumeFileText(file)).rejects.toEqual(
      expect.objectContaining<Partial<ResumeFileError>>({
        message: "Use a PDF, DOCX, TXT, or Markdown résumé file.",
      }),
    );
  });

  it("validates PDF magic bytes before invoking the parser", async () => {
    const file = new File(["not really a pdf".repeat(20)], "resume.pdf", {
      type: "application/pdf",
    });

    await expect(extractResumeFileText(file)).rejects.toEqual(
      expect.objectContaining<Partial<ResumeFileError>>({
        message: "That file does not appear to be a valid PDF.",
      }),
    );
  });
});
