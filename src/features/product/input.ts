import { z } from "zod";

export const DevicePairingCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())
  .pipe(z.string().length(12, "Enter the 12-character pairing code."));

const optionalDate = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.")
    .nullable(),
);

const optionalDateTime = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z
    .string()
    .datetime({ local: true, offset: true, message: "Use a valid reminder time." })
    .nullable(),
);

const optionalText = (maximum: number) =>
  z.preprocess(
    (value) => (value === "" || value === undefined ? null : value),
    z.string().trim().min(1).max(maximum).nullable(),
  );

export const ApplicationDetailsSchema = z
  .object({
    jobListingId: z.uuid(),
    applicationDeadline: optionalDate,
    followUpAt: optionalDateTime,
    contactName: optionalText(160),
    contactEmail: z.preprocess(
      (value) => (value === "" || value === undefined ? null : value),
      z.email("Enter a valid email address.").max(254).nullable(),
    ),
    resumeLabel: optionalText(160),
    nextStep: optionalText(500),
  })
  .strict();

export const ProductSettingsSchema = z
  .object({
    dailyDigestEnabled: z.boolean(),
    reminderNotificationsEnabled: z.boolean(),
  })
  .strict();

export const ResumeSourceSchema = z
  .object({
    label: z.string().trim().min(1, "Name this résumé.").max(120),
    sourceFileName: optionalText(255),
    rawText: z
      .string()
      .trim()
      .min(100, "Paste at least 100 characters from your résumé.")
      .max(100_000, "Keep résumé text under 100,000 characters."),
  })
  .strict();

export const ResumeDeleteSchema = z.object({ id: z.uuid() }).strict();

export const BetaFeedbackSchema = z
  .object({
    kind: z.enum(["general", "bug", "idea", "listing_issue"]),
    jobListingId: z.uuid().nullable().optional(),
    message: z.string().trim().min(5, "Add a little more detail.").max(2_000),
    pagePath: optionalText(500),
  })
  .strict();

export type ApplicationDetailsInput = z.output<typeof ApplicationDetailsSchema>;
export type ProductSettingsInput = z.output<typeof ProductSettingsSchema>;
export type ResumeSourceInput = z.output<typeof ResumeSourceSchema>;
export type BetaFeedbackInput = z.output<typeof BetaFeedbackSchema>;
