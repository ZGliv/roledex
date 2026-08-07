import { getCompanyIntelligence } from "@/features/companies/intelligence";
import type { JobCompanyPayload } from "@/features/jobs/dossier";
import { getJobDossierSource } from "@/features/jobs/queries";

function validJobId(jobId: string) {
  return /^[a-zA-Z0-9_-]{1,160}$/.test(jobId);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  if (!validJobId(jobId)) {
    return Response.json({ error: "Invalid job identifier." }, { status: 400 });
  }

  const source = await getJobDossierSource(jobId);
  if (!source) {
    return Response.json({ error: "Job not found." }, { status: 404 });
  }

  const company = await getCompanyIntelligence(
    source.company,
    source.listing.companyDomain,
    source.listing.descriptionRaw,
  );
  const payload: JobCompanyPayload = { company };

  return Response.json(payload, {
    headers: {
      "Cache-Control": "private, max-age=300, stale-while-revalidate=86400",
    },
  });
}
