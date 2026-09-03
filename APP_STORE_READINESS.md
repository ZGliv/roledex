# JobSwipe App Store readiness

Status: **shared React/Capacitor release foundation implemented and simulator-verified; blocked on production rollout and Apple signing inputs.**

JobSwipe now has a single tiered For You feed and a locally bundled React/Capacitor iPhone client that reuses the polished web card system. It includes deterministic admission, structured Ready Now and Credible Stretch targets, persistent save/pass history, résumé review, user-controlled hard filters, an offline decision outbox, cached cards, data export, workspace deletion, privacy terms, and support intake. The versioned v2 API, materialized queues, exposures, and revocable installation sessions are implemented. The remaining work is production migration/release engineering, final account-provider configuration, physical-device QA, TestFlight, and App Store Connect inputs.

## Product model reviewers and users should understand

- **Ready Now** cards are direct target roles that clear every hard rule and have defensible qualification evidence.
- **Credible Stretch** cards are plausible adjacent moves that still clear every hard rule.
- **Discovery** adds controlled novelty without bypassing salary, seniority, authorization, location, or explicit exclusions.
- **Filtered** jobs never enter the For You feed.

Cards, job details, onboarding, and profile impact use this language. There is no Matches/Explore switch.

## What is implemented

- Guided onboarding with structured role directions, pay, location, work-mode, seniority, employment, authorization, sponsorship, salary-visibility, and exclusion controls.
- Structured profile editing and evidence management.
- Saved-job search, sorting, filtering, private notes, applied marker, archive, and removal.
- Same-workspace device pairing without a mandatory account.
- In-app data export and full guest-workspace deletion.
- Public `/privacy`, `/terms`, and `/support` pages.
- PWA manifest, maskable icons, Apple web-app metadata, safe-area handling, reduced-motion support, and keyboard/screen-reader alternatives to swiping.
- Server-side validation and visitor-scoped authorization for mutations.
- Versioned v2 feed, saved, profile, interaction-batch, résumé, pairing, session, export, and deletion endpoints.
- Revocable native installation credentials in Keychain, rotating refresh credentials, and short-lived access tokens.
- Locally bundled React/Capacitor app with shared card visuals, swipe/tilt interactions, haptics, system sharing, cached cards, an offline interaction outbox, Saved tools, and Keychain-backed sessions.
- App Store icon, privacy manifest, draft metadata, review notes, submission checklist, and accepted-size draft screenshots.
- Simulator Debug and unsigned optimized iPhoneOS Release builds verified locally.

## Release blockers that cannot be guessed

1. **Apple Developer membership and signing identity.** The owner must enroll or provide the existing team, legal entity name, Team ID, and the final bundle identifier.
2. **A durable production release.** Apply migrations through the current release, verify read amplification stays within budget, and pass the production smoke suite before enabling the v2 native API. An App Store binary cannot point at an unverified backend.
3. **Public production contact details.** App Review needs a real contact name, phone number, and email. The public support form is implemented, but review contact details still belong in App Store Connect.
4. **Final legal review.** The current privacy policy and terms accurately describe the beta implementation, but the owner should approve the legal entity/contact language before submission.

## Definition of done for TestFlight

- Native client launches from bundled assets, has a useful offline/error state, and does not depend on an unreviewed remote UI shell.
- API versioning, native session issuance/revocation, CORS/origin controls, and rate limits are in place.
- Native haptics, share sheet, deep links, and local application reminders work on a physical iPhone.
- Production database, cron refresh, monitoring, and deletion/export paths pass a release smoke test.
- App icon, launch experience, iPhone screenshots, privacy manifest, privacy labels, age rating, review notes, and support/privacy URLs are final.
- An archived Release build installs through TestFlight and passes onboarding → swipe → save → detail → apply tracking → delete workspace.

See [`docs/app-store/submission-checklist.md`](docs/app-store/submission-checklist.md) for the operational checklist and [`docs/app-store/metadata.md`](docs/app-store/metadata.md) for the draft listing.
