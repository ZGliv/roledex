# Architecture

## Shape of the application

JobSwipe is a guest-first Next.js App Router application with a server-rendered data shell and small client islands for forms, gestures, optimistic feedback, and browser speech.

```text
Browser UI
  ├─ Server Components: profile, deck reads, job detail reads
  └─ Client Components: forms, decisions, shortcuts, speech
           │
           ▼
  Signed HttpOnly visitor session
           │
           ▼
     Server Actions
           │
           ▼
  Feature services and pure domain logic
    ├─ bounded ATS feed adapters
    ├─ deterministic discovery filter
    ├─ conservative listing parser
    ├─ deterministic fit scorer
    ├─ decision service
    └─ AI provider contracts
           │
           ▼
  Drizzle ORM → local SQLite or remote Turso/libSQL
```

There is no internal REST layer in the first slice. Route Handlers are reserved for later external ingestion, webhooks, or streaming provider responses.

## Source layout

```text
src/
  app/                 routes, layouts, and server actions
  components/          product components and shadcn/ui primitives
  db/                  schema, connection, migrations, and seed
  features/
    candidate/         profile queries and DTOs
    jobs/              parser, job service, queries, UI
    discovery/         source registry, ATS adapters, relevance, ingestion
    fit/               scoring policy and breakdowns
    decisions/         decision mutations and event history
    analysis/          Job Gauntlet schema and provider contracts
  lib/                 shared utilities and validation helpers
tests/                 domain and service tests
drizzle/               committed SQL migrations
data/                  ignored local database files
```

## Data boundaries

Five kinds of information must remain distinct:

1. **Source facts** — the raw listing, URL, retrieval time, and fields explicitly supplied by the user.
2. **Parser output** — structured fields, confidence, evidence excerpts, warnings, and parser version.
3. **Deterministic judgment** — score, coverage, weighted component breakdown, and scoring version.
4. **AI judgment** — optional validated Gauntlet output with exact prompt/provider/model/schema versions.
5. **User judgment** — visitor-scoped save/skip/stretch/apply state plus append-only decision and note history.

An AI analysis may inform a final score later, but it never overwrites the deterministic run or source facts.

## Persistence model

- IDs are text UUIDs.
- Money is stored as integer cents plus currency and pay period.
- Dates are ISO-8601 strings at the server/client boundary.
- Filterable fields are columns; irregular evidence and arrays are validated JSON.
- The raw description is immutable for a given revision.
- Decisions are append-only events with a current projection for each visitor and listing.
- Database migrations are committed; the local SQLite file and cloud credentials are not.

The current tables are:

- `visitors`
- `candidate_profiles`
- `portfolio_projects`
- `job_listings`
- `job_revisions`
- `fit_score_runs`
- `visitor_job_states`
- `job_decision_events`
- `analysis_runs`
- `job_sources`
- `ingestion_runs`
- `source_sightings`

`source_sightings` uses provider source + external job ID as durable identity. A content hash decides whether to reuse the current revision or create a new immutable one. `visitor_job_states` prevents a later feed refresh from resurrecting a job that one visitor passed while leaving that listing available to everyone else.

## Visitor and administrator boundaries

- Proxy overwrites the internal visitor header on every matched request; browser-supplied identity headers are never trusted.
- A signed, one-year `HttpOnly`, `SameSite=Lax` cookie maps a browser to a guest visitor. A rolling renewal avoids needless workspace loss for active visitors.
- Candidate profiles, fit runs, decision projections, event history, notes, saved jobs, sessions, and manual analyses resolve through the current visitor.
- The migrated owner session maps to a fixed owner visitor ID so the original profile and decisions remain available only to the administrator.
- Source management, manual job import, and source-ingestion actions repeat the owner-session check server-side. The cron route has a separate bearer secret.
- Guest sessions are device/browser scoped. Account-based cross-device sync is a future layer, not an implicit property of the anonymous cookie.

## Discovery policy

- Only allowlisted Greenhouse, Lever, and Ashby JSON endpoints are fetched.
- Each response has a timeout, byte cap, item cap, and Zod boundary.
- Up to four sources are fetched concurrently; one refill imports at most 40 new or changed roles.
- Unchanged sightings update freshness without rerunning parsing or fit scoring.
- A title/geography prefilter runs before persistence, while the deterministic fit scorer remains the auditable ranking signal.
- One failed feed produces a partial run and cannot discard jobs from successful sources.
- On-demand refreshes have a six-hour cooldown; the browser requests a refresh on open when the last completed run is at least one day old.

## Parsing policy

The parser is a deterministic, versioned pure function. Title and company are required inputs because inferring them from arbitrary pasted text is unreliable. Every extracted field can include confidence and evidence. Unsupported or ambiguous values remain null/`unknown` and create a warning instead of a guess.

Exact content hashes and normalized company/title/location keys provide first-pass deduplication. Description-similarity matching is deferred.

## Scoring policy

The brief's weights are the source of truth:

| Component | Weight |
| --- | ---: |
| Role-family match | 20% |
| Skills match | 15% |
| Experience match | 15% |
| Compensation match | 15% |
| Work-arrangement match | 10% |
| Portfolio relevance | 10% |
| Career-value heuristic | 10% |
| Industry interest | 5% |

Each component stores its raw 0–100 score, weight, contribution, known/unknown state, matched evidence, and rationale. Unknown values receive a visible neutral prior rather than a hidden failure score. The total remains on a 0–100 scale and is displayed as both a percentage and a 0–10 fit value.

## AI provider boundary

UI components never call a model vendor directly. Providers implement a shared contract and all outputs pass through the same Zod schema.

```ts
interface AIProvider {
  analyzeJob(input: AnalyzeJobInput): Promise<JobAnalysis>
  answerJobQuestion(input: JobQuestionInput): Promise<string>
  compareJobs(input: CompareJobsInput): Promise<JobComparison>
}
```

Manual mode stores the generated prompt and accepts pasted JSON. Future cache keys combine the listing content hash, candidate/project fingerprint, provider, model, prompt version, and output-schema version.

## Runtime choices

- Node.js 24 runtime only; database and local model clients use normal Node APIs.
- The libSQL adapter opens a local SQLite file in development and a remote Turso database when cloud credentials are present.
- Server-only modules are explicitly marked to prevent accidental client bundling.
- Mutable local data is read directly; framework data caching is intentionally avoided in the first slice.
- The database connection is isolated so a later Drizzle/Postgres move does not require UI rewrites.

## Deployment model

Local development remains file-backed and needs no cloud service. Vercel deployments connect to Turso through server-only `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` values; the application refuses a file-backed database when `VERCEL` is present. Preview URLs may stay behind Vercel Authentication for QA. The canonical Production domain is the stable public phone/PWA origin. Proxy issues and verifies anonymous visitor identity, administrator actions repeat the owner-session check, and the cron route uses its independent bearer secret. Production UI and visitor signing fail closed when their required configuration is missing or weak.
