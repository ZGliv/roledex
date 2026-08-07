# Project Plan

## Product outcome

JobSwipe should reduce uncertainty and procrastination by turning job descriptions into concrete, auditable decisions. Success is not the number of cards viewed; it is a shortlist of credible opportunities, a clear understanding of repeated gaps, and timely targeted applications.

## Phase 1 — Working vertical slice

Status: complete.

Deliver a stable end-to-end workflow before adding breadth:

- Seed one editable candidate profile and three portfolio projects.
- Accept a manually pasted listing plus explicit title and company.
- Preserve the raw description and source metadata.
- Parse supported fields with extraction warnings and parser versioning.
- Calculate a deterministic score using the brief's eight weighted dimensions.
- Display a high-signal card and full score explanation.
- Record save, skip, and stretch decisions as append-only events.
- Cover parsing, scoring, decisions, and provider contracts with tests.

Exit criteria:

- A fresh clone can initialize the database and run locally from the README.
- A user can paste a listing and reach its analyzed card without editing code.
- Unknown salary stays unknown and every score component has a rationale.
- Refreshing the browser preserves the job and decision.
- Lint, tests, and production build pass.

## Phase 2 — Complete Job Gauntlet and manual AI

- Add the complete validated Job Gauntlet schema.
- Generate a provider-neutral prompt from a frozen candidate/job snapshot.
- Import and validate a pasted JSON response.
- Store prompt, raw response, normalized response, versions, and input hash.
- Display reasons not to apply, reasons to apply anyway, readiness, interview risk, callback probability, and verdict.
- Add notes and a full decision/status history.

## Phase 3 — Research workflow

- Saved-jobs view with filtering, sorting, and comparison.
- Research sessions and end-of-session summaries.
- Market insights from normalized skill signals.
- Repeated-gap recommendations and focused skill sprints.
- Browser text-to-speech and a low-interaction driving view.

## Phase 4 — Optional local and API providers

- Ollama provider implementing the same analysis contract.
- OpenAI-compatible provider configured only through environment variables.
- Exact cache keys across listing, profile, prompt, schema, provider, and model versions.
- Conversational questions grounded in the stored profile and full listing.

## Phase 5 — Broader ingestion and application support

- CSV/JSON import and stable public feeds.
- Browser-extension handoff or company-career-page import where permitted.
- Resume positioning, interview preparation, and application tracking.

## Explicitly deferred

- High-volume scraping
- Automatic applications or form filling
- LinkedIn automation
- Autonomous email
- Multi-user authentication or billing
- Vector search before structured search is insufficient
- Native mobile clients
- Complex agent orchestration

## Product guardrails

- Never invent salary, company facts, dates, requirements, or interview formats.
- Do not treat every gap as disqualifying or every AI title as relevant.
- Keep source facts separate from deterministic and model-generated judgments.
- Make uncertainty visible and preserve the evidence needed to challenge a result.
- Compare opportunities with the candidate's current job, not with unemployment.
