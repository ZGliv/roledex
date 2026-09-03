import { apiV2SavedJob } from "@/features/api-v2/dto";
import {
  apiV2Json,
  apiV2Options,
  apiV2RouteError,
  parseApiV2Json,
  requireApiV2Session,
} from "@/features/api-v2/http";
import {
  ApiV2SavedQuerySchema,
  ApiV2SavedUpdateSchema,
} from "@/features/api-v2/input";
import {
  applyApiV2SavedUpdate,
  savedJobMetadata,
} from "@/features/api-v2/service";
import { getSavedJobCardsForVisitor } from "@/features/jobs/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return apiV2Options(request);
}

function annualSalary(job: { salaryAnnualMaximumCents: number }) {
  return job.salaryAnnualMaximumCents || 0;
}

export async function GET(request: Request) {
  try {
    const installation = await requireApiV2Session(request);
    const search = new URL(request.url).searchParams;
    const input = ApiV2SavedQuerySchema.parse({
      q: search.get("q") ?? undefined,
      status: search.get("status") ?? undefined,
      sort: search.get("sort") ?? undefined,
    });
    const jobs = await getSavedJobCardsForVisitor(installation.visitorId);
    const metadata = await savedJobMetadata(
      installation.visitorId,
      jobs.map((job) => job.id),
    );
    const normalizedQuery = input.q.toLocaleLowerCase("en-US");
    const filtered = jobs
      .filter((job) => {
        if (
          normalizedQuery &&
          !`${job.title} ${job.company} ${job.location}`
            .toLocaleLowerCase("en-US")
            .includes(normalizedQuery)
        ) {
          return false;
        }
        if (input.status === "saved") {
          return ["saved", "stretch", "learn_first", "apply"].includes(job.currentDecision);
        }
        if (input.status === "applied") {
          return ["applied", "interview", "offer"].includes(job.currentDecision);
        }
        if (input.status === "active") return job.currentDecision !== "archived";
        if (input.status === "archived") return job.currentDecision === "archived";
        return true;
      })
      .toSorted((left, right) => {
        if (input.sort === "company") return left.company.localeCompare(right.company);
        if (input.sort === "fit") return right.deterministicFitScore - left.deterministicFitScore;
        if (input.sort === "salary") return annualSalary(right) - annualSalary(left);
        const leftTime = metadata.get(left.id)?.updatedAt ?? left.datePosted ?? "";
        const rightTime = metadata.get(right.id)?.updatedAt ?? right.datePosted ?? "";
        return rightTime.localeCompare(leftTime);
      });
    const data = filtered.map((job) =>
      apiV2SavedJob(
        job,
        metadata.get(job.id) ?? { note: null, updatedAt: null },
      ),
    );
    return apiV2Json(request, {
      data,
      meta: { count: data.length, total: jobs.length },
    });
  } catch (error) {
    return apiV2RouteError(request, error);
  }
}

export async function PATCH(request: Request) {
  try {
    const installation = await requireApiV2Session(request);
    const input = await parseApiV2Json(request, ApiV2SavedUpdateSchema);
    const result = await applyApiV2SavedUpdate(installation.visitorId, input);
    return apiV2Json(request, { data: result, meta: {} });
  } catch (error) {
    return apiV2RouteError(request, error);
  }
}
