# Native client architecture decision

## Decision

Do not submit a Capacitor build that points `server.url` at the production website. Capacitor documents that setting as a live-reload option and says it is not intended for production. It also leaves JobSwipe exposed to App Review’s minimum-functionality concern for repackaged websites.

The production iPhone app should use a **bundled client** and versioned JobSwipe APIs. SwiftUI is preferred for the highest-quality result; a bundled React/Capacitor client is acceptable if it ships its UI assets locally.

## Required backend boundary

The current Next.js Server Components and Server Actions assume a same-origin browser cookie. A native client needs explicit, versioned endpoints:

- `POST /api/v1/native/installations` — issue a revocable installation session after App Attest/DeviceCheck verification where available.
- `POST /api/v1/native/pair` — redeem the existing one-time pairing code without exposing a browser cookie.
- `GET /api/v1/feed?lane=matches|stretch&cursor=…`
- `POST /api/v1/jobs/:id/decisions`
- `POST /api/v1/jobs/:id/pass-reasons`
- `GET /api/v1/jobs/:id`
- `GET /api/v1/saved`
- `GET/PATCH /api/v1/profile`
- `GET /api/v1/export`
- `DELETE /api/v1/workspace`

The versioned server boundary is now implemented locally, including revocable
installation credentials, rotating refresh credentials, 15-minute access
tokens, pairing, feed/job/saved reads, decisions and pass reasons, profile
reads/updates, export, deletion, and contract tests. Production remains
fail-closed behind `JOBSWIPE_NATIVE_API=enabled` until migration 0008 and the
production release gate pass. App Attest/DeviceCheck verification is still a
native-release task; the current installation record deliberately reports
attestation as unavailable rather than pretending the device was verified.

The bundled SwiftUI target is implemented locally at `ios/JobSwipe`.
It includes first-run guided onboarding, Keychain-backed installation sessions,
Matches and Stretch feeds, native swipe haptics, pass/save actions, Saved and
Profile tabs, job detail, employer links, the system share sheet, follow-up
notifications, offline retry, profile editing, workspace pairing, export and
deletion, custom `jobswipe://` deep links, an App Store icon, and a privacy
manifest. Both Simulator and optimized unsigned iPhoneOS Release builds pass.
Signing, App Attest, associated-domain universal links, and physical-device QA
still require the final Apple Team ID, bundle identifier, and production backend
release.

Every endpoint must derive workspace identity from a scoped native token, validate input, enforce visitor ownership, rate-limit mutation families, and support token revocation. No endpoint should return résumé text or private evidence unless that screen needs it.

## Native screens

1. Guided onboarding
2. Discover deck with Matches and Stretch
3. Job detail with original employer link and native share
4. Saved search/filter and application planner
5. You/profile, evidence, workspace pairing, export, and deletion
6. Offline/network recovery screen

## Native capabilities that make the app more than a wrapper

- Haptics synchronized with card resistance, save, pass, and snap-back
- Local notifications for application deadlines and follow-ups
- Native share sheet for job links
- Universal links into job detail and pairing
- Secure Keychain session storage
- Background refresh for a small count badge, within iOS limits
- Native reachability/offline state and retry
- VoiceOver rotor order and Dynamic Type validation

## Security defaults

- Keychain token storage; never local storage
- Short-lived access token plus rotatable installation credential
- TLS only; no broad App Transport Security exception
- No release WebView debugging or sensitive console logging
- App Attest/DeviceCheck as abuse signals, not the sole identity check
- Remote employer pages open in `SFSafariViewController` or the system browser
- Deletion revokes installation sessions before deleting workspace data

## Delivery sequence

1. Stabilize the current web product and hosted database.
2. Add the versioned native session and feed/profile APIs with contract tests.
3. Build the bundled iPhone client and native capabilities.
4. Run physical-device, accessibility, offline, and interrupted-write tests.
5. Produce App Store screenshots and submit the tested TestFlight build.
