# App privacy disclosure draft

This is an implementation-derived draft, not a substitute for the final App Store Connect questionnaire. Re-audit every production SDK immediately before submission.

## Data collected for app functionality/personalization

| Apple data category | JobSwipe examples | Linked to workspace | Tracking |
| --- | --- | --- | --- |
| User Content | Profile text, résumé text, notes, portfolio and evidence | Yes | No |
| Employment Info | Current role, experience, skills, education, salary preferences | Yes | No |
| Contact Info | Optional application contact name/email entered by the user | Yes | No |
| Identifiers | Random visitor/workspace identifier and signed session | Yes | No |
| Product Interaction | Saves, passes, pass reasons, application states | Yes | No |
| Other User Content | Support feedback | Yes | No |

## Current processing purpose

- App functionality
- Product personalization
- Developer support for feedback the user explicitly submits

## Current negative assertions

- No advertising SDK.
- No cross-company tracking.
- No sale of personal information.
- Private candidate information is not sent to employers by JobSwipe.
- No precise location, contacts, photos, microphone, camera, health, fitness, payment, or government-ID collection in the current app.

## Infrastructure to disclose in the privacy policy

- Vercel hosts the web/API service and may process network and operational logs.
- Turso stores application data until the production database decision changes.
- Apple processes App Store/TestFlight diagnostics according to the owner’s App Store Connect settings.

## Pre-submission recheck

- Confirm whether production monitoring, analytics, email, push, crash-reporting, or authentication SDKs were added.
- Confirm retention windows for server logs and support feedback.
- Confirm the privacy manifest reasons contributed by every native dependency.
- Verify export and deletion on a production TestFlight workspace.
