import { describe, expect, it } from "vitest";

import { DEFAULT_JOB_SOURCES } from "@/features/discovery/default-sources";
import {
  JOB_CARD_TEMPLATE_COUNT,
  JOB_CARD_TEMPLATES,
  jobCardTemplateForCompany,
} from "@/features/jobs/components/job-card-templates";

describe("job card templates", () => {
  it("ships exactly two dozen complete, uniquely named templates", () => {
    expect(JOB_CARD_TEMPLATE_COUNT).toBe(24);
    expect(new Set(JOB_CARD_TEMPLATES.map((template) => template.id)).size).toBe(
      24,
    );

    for (const template of JOB_CARD_TEMPLATES) {
      expect(template.backgroundColor).not.toBe("");
      expect(template.backgroundImage).toContain("url(");
      expect(template.backgroundPosition).not.toBe("");
      expect(template.backgroundSize).not.toBe("");
      expect(template.borderClassName).not.toBe("");
      expect(template.previewBorderClassName).not.toBe("");
      expect(template.previewVeilClassName).not.toBe("");
      expect(template.titleClassName).not.toBe("");
    }
  });

  it("keeps a company's visual identity stable across input normalization", () => {
    const canonical = jobCardTemplateForCompany("Cresta").id;

    expect(jobCardTemplateForCompany("  CRESTA  ").id).toBe(canonical);
    expect(jobCardTemplateForCompany("Ｃｒｅｓｔａ").id).toBe(canonical);
    expect(jobCardTemplateForCompany("Cresta").id).toBe(canonical);
  });

  it("uses all 24 looks across the built-in company network", () => {
    const assignedTemplates = new Set(
      DEFAULT_JOB_SOURCES.map(
        (source) => jobCardTemplateForCompany(source.companyName).id,
      ),
    );

    expect(assignedTemplates.size).toBe(JOB_CARD_TEMPLATE_COUNT);
  });

  it("keeps every template reachable for companies outside the starter network", () => {
    const assignedTemplates = new Set(
      Array.from(
        { length: 5_000 },
        (_, index) => jobCardTemplateForCompany("Company " + index).id,
      ),
    );

    expect(assignedTemplates.size).toBe(JOB_CARD_TEMPLATE_COUNT);
  });
});
