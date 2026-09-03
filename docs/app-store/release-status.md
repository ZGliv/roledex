# Release status

Last verified: 2026-08-14

## Completed locally

- Bundled SwiftUI iPhone app and versioned native API
- Revocable installation sessions, pairing, profile/feed/job/saved actions,
  export, and deletion
- Migration `0008_complex_toro.sql`
- App icon without alpha, privacy manifest, metadata, privacy-label draft, and
  submission checklist
- iPhone Simulator launch against the isolated local SQLite database
- Fresh-install onboarding and populated-card runtime captures at 1206 × 2622
- Custom `jobswipe://` URL scheme registration
- Fail-closed Apple association endpoint and associated-domain entitlement
- Debug-only deterministic tab capture workflow
- iPhone SE fresh-onboarding and populated-card layout verification
- Per-lane native feed cache, background replenishment, deduplication, and
  pull-to-refresh
- Correct first-use Saved empty state
- Live local native API journey: installation, credential rotation, profile,
  onboarding, 22-role Stretch feed, job detail/save/Saved, export, deletion, and
  post-deletion revocation
- Native JSON onboarding contract regression coverage
- Guarded archive/upload automation with one source of truth for the Apple team,
  bundle identifier, public API URL, and associated domain
- Optimized unsigned iPhoneOS Release build
- Web lint, 47 test files / 288 tests, TypeScript, and production Next.js build
- App Store preflight: 29 of 40 checks ready locally; the remaining 11 are
  production/Apple environment checks. Vercel's redacted environment listing
  confirms that three newly staged values and the existing production values
  are present without exposing their contents.
- Local preview on port 3100; Parl.ai remains isolated on port 3000

## Production state observed

- The Vercel project is linked and its `jobswipe-db` Turso resource reports
  Available.
- Production already has the existing UI/session/admin/cron variables and Turso
  connection variables.
- Production now has the separate native signing secret, stable Server Action
  encryption key, and canonical public URL pre-staged. The native API remains
  deliberately disabled and the database-ready release gate remains closed.
- Migration 0008 is intentionally not applied while the current Turso plan is
  unable to accept the required production operation.
- The exact Turso blocker is now known: August usage is 608,094,673 reads
  against the Starter plan's 500,000,000-row monthly allowance. The smallest
  offered upgrade is Developer at $5.99/month; changing it requires owner
  approval.
- No production deployment containing the native API changes has been made.

## Owner inputs required for the next release step

1. Upgrade the existing Turso resource or approve migration to another durable
   database.
2. Provide the Apple Developer Team ID and choose a final bundle identifier.
3. Provide the monitored App Review email and phone number.
4. Confirm whether `jobswipe-amber.vercel.app` is the permanent public URL or
   provide the final custom domain.

Once item 1 is resolved, apply migration 0008, verify production read/write,
cron, export, deletion, and installation-session flows, add the native release
environment variables, and deploy. Once items 2–4 are resolved, configure
signing/associated domains, archive, upload to TestFlight, run physical-device
QA, replace draft screenshots, and complete App Store Connect.
