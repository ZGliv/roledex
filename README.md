# JobSwipe

JobSwipe is a guest-first job discovery product. Anyone with the link can browse a continuously refreshed feed, tune a profile, and keep or pass on jobs without an access key. A signed browser session keeps each visitor's profile, saves, passes, notes, and fit results separate from everyone else's.

The first working slice covers the complete path from official employer feeds to a durable decision:

1. Rotate through a broad, editable network of official Greenhouse, Lever, and Ashby feeds.
2. Filter and rank roles for the active candidate profile, geography, and swipe history.
3. Deduplicate listings and parse only facts supported by employer text.
4. Calculate an explainable deterministic fit score for new or changed jobs.
5. Swipe right to save, left to skip, or mark a role as a stretch.
6. Review saved jobs separately or return them to the active deck while scheduled refreshes keep the stream current.

## Principles

- Employer-posted salary remains distinct from a clearly labeled BLS-based market estimate; modeled pay is never stored or presented as an employer fact.
- Raw job text is retained so every extracted fact can be audited.
- Deterministic scores, future AI scores, and final scores are separate values.
- Every fit judgment includes evidence, uncertainty, and a reason not to apply.
- AI providers are optional. The core workflow works without a paid API.
- Public feed refreshes are bounded, rate-limited, isolated by source, and rotated fairly across the full network.
- Normal product use is public; source management and manual imports remain restricted administrator tools.
- Visitor identity is signed server-side and never accepted from an untrusted request header.

## Stack

- Next.js 16 App Router, React 19, and TypeScript
- Tailwind CSS and local shadcn/ui components
- Local SQLite or Turso serverless SQLite through the libSQL client
- Drizzle ORM and committed SQL migrations
- Zod for boundary and structured-output validation
- Vitest for domain tests

## Local setup

Requirements: Node.js 24 or newer and npm.

```bash
npm install
cp .env.example .env.local
npm run db:migrate
npm run db:seed
npm run dev -- --port 3100
```

Open [http://localhost:3100](http://localhost:3100).

The default database is `data/jobswipe.db`. The `data/` directory is ignored by Git. Change `DATABASE_URL` in `.env.local` to keep the database elsewhere.

## Stable Vercel app and scheduled refreshes

The hosted version uses Turso because a SQLite file inside a Vercel Function is not durable. The public UI runs on the project's permanent Production domain. Each browser receives a signed, persistent, `HttpOnly` guest session; the access key is reserved for hidden administration routes. Preview deployments can remain behind Vercel Authentication for QA. The authenticated Vercel Cron route refreshes the shared listing catalog each day.

```bash
npx vercel link
npx vercel integration add tursocloud --name jobswipe-db --plan starter -m region=iad1 -e preview -e development
npx vercel env pull .env.local --environment=preview
npm run db:seed
npx vercel deploy . --prod --yes
```

The Turso integration supplies `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` to Vercel. Pulling the Preview environment first makes the local seed command target that Turso database instead of `./data/jobswipe.db`. `db:seed` applies committed migrations before inserting the idempotent owner profile, projects, and source catalog. Production requires a strong `CRON_SECRET`, `JOBSWIPE_PRODUCTION_UI=enabled`, and a 32-byte-or-longer `JOBSWIPE_SESSION_SECRET`. `JOBSWIPE_ACCESS_PASSWORD` protects only administration; `JOBSWIPE_VISITOR_SESSION_SECRET` may optionally provide a separate guest-signing secret.

On iPhone, open the canonical Production URL in Safari, tap Share, then choose **Add to Home Screen**. On Android, open that same URL in Chrome and choose **Install app** or **Add to Home screen**. Production deployments automatically update the same domain. The service worker always fetches documents from the network and caches only immutable build assets, so it cannot pin stale HTML or personal data.

## Commands

```bash
npm run dev          # Run the local app
npm run build        # Create a production build
npm run lint         # Run ESLint
npm run test         # Run the unit test suite once
npm run test:watch   # Run tests in watch mode
npm run db:generate  # Generate a migration after schema changes
npm run db:migrate   # Apply committed migrations
npm run db:seed      # Idempotently seed the profile and projects
```

## Seed data

The seed contains the administrator's editable candidate profile, structured evidence for Parl.ai, Hospital 3D Map, and U-Shop, and 62 verified starter company feeds across AI, SaaS, fintech, and health technology. New guests receive a neutral starter profile and never inherit that seeded profile or its evidence. The seed intentionally omits private contact details.

## Current scope

Implemented:

- Editable, revisioned candidate and portfolio evidence with atomic rescoring
- Manual job entry and source URL retention
- Deterministic extraction for salary, arrangement, experience, technologies, qualifications, and responsibilities
- Versioned, explainable fit scoring
- Always-present compensation display with a strict employer-posted/market-estimate boundary
- Deterministic swipe-learned ordering with freshness, diversity, exploration, and compensation-target signals
- Smooth pointer/keyboard job deck with detail expansion, optimistic decisions, persisted Undo, and focus recovery
- Bounded, round-robin Greenhouse, Lever, and Ashby ingestion across 62 starter boards
- Editable source registry, strict first-party URL validation, per-source schedules, health state, and a safe daily reconciliation route
- Exact source-ID/content-hash deduplication and immutable job revisions
- Searchable Saved pipeline with status changes, notes, compare, apply planning, and return-to-deck
- Auditable decision history and stale-write protection across tabs/devices
- Market Insights, 30-minute research-session summaries, and an evidence-based skill sprint
- Free browser-native Driving Mode with parked-use safety gate
- Manual Job Gauntlet prompt/export/import flow with strict versioned JSON validation
- Installable PWA shell with privacy-safe offline fallback; personal/job data remains network-only
- Signed anonymous visitor sessions with per-visitor profiles, fit runs, decisions, notes, and saved pipelines
- Tests for parsing, scoring, decisions, concurrency, feed normalization, reconciliation, bounds, insights, sessions, and manual analysis

The sequenced roadmap is in [PROJECT_PLAN.md](./PROJECT_PLAN.md), technical boundaries are in [ARCHITECTURE.md](./ARCHITECTURE.md), and the implementation checklist is in [TASKS.md](./TASKS.md).

## Important limitations

The parser and discovery filter are deliberately conservative heuristics. They can miss facts or adjacent roles, but should not invent information. JobSwipe uses official public employer ATS feeds; it does not scrape LinkedIn or Indeed, submit applications, or send messages. Always review the original listing before acting on a score.

Guest identity is tied to a signed cookie in one browser. Clearing site data or switching browsers creates a new guest workspace until optional account-based sync is added. The administrator key must still remain private; it unlocks source management, manual imports, and the migrated owner workspace. Rotating the signing secret invalidates all visitor sessions. The cron route remains independently protected by `CRON_SECRET`. The PWA deliberately does not cache jobs, profiles, HTML, RSC payloads, or API responses for offline use.
