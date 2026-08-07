import { z } from "zod";

export const ManualJobInputSchema = z
  .object({
    title: z.string().trim().min(2, "Enter the job title.").max(180),
    company: z.string().trim().min(2, "Enter the company name.").max(180),
    location: z.string().trim().max(220).optional().default(""),
    sourceName: z.string().trim().max(120).optional().default("Manual paste"),
    sourceUrl: z
      .string()
      .trim()
      .max(2_000)
      .refine((value) => value === "" || /^https?:\/\//i.test(value), {
        message: "Use a full http:// or https:// listing URL.",
      })
      .optional()
      .default(""),
    salarySource: z
      .enum(["employer_posted", "externally_estimated", "unknown"])
      .default("unknown"),
    descriptionRaw: z
      .string()
      .min(120, "Paste more of the listing so the parser has enough evidence.")
      .max(120_000, "The listing is too large to import safely."),
  })
  .strict();

export type ManualJobInput = z.infer<typeof ManualJobInputSchema>;
