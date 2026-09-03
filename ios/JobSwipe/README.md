# JobSwipe iOS

This is a bundled SwiftUI client. It does not embed the production website.

The local target includes native onboarding, Keychain sessions, Matches and
Stretch feeds, pass/save gestures with haptics, Saved search and Profile views,
editable search criteria, job detail, the system share sheet, employer links,
follow-up reminders, workspace pairing, export and deletion, offline retry,
`jobswipe://` deep links, an App Store icon, and a privacy manifest.

## Local simulator build

```sh
xcodebuild \
  -project ios/JobSwipe/JobSwipe.xcodeproj \
  -scheme JobSwipe \
  -sdk iphonesimulator \
  -configuration Debug \
  build
```

Do not disable signing for Simulator QA. Xcode's local ad-hoc Simulator
signature supplies the application identifier entitlement Keychain requires.
`CODE_SIGNING_ALLOWED=NO` is used only for the compile-only iPhoneOS Release
check before the real Apple team is configured.

Debug points at `http://localhost:3100/`; Release points at the stable Vercel
domain. Local development prefers the configured SQLite database even when a
Turso credential exists, preventing Simulator QA from mutating production.
The production API remains fail-closed until migration `0008` is
applied and `JOBSWIPE_NATIVE_API=enabled` plus a separate native signing secret
are configured.

## Signed App Store archive

After production passes the strict native smoke test and the Apple values are
available, create the signed archive with:

```sh
APPLE_TEAM_ID=XXXXXXXXXX \
JOBSWIPE_BUNDLE_ID=com.example.jobswipe \
JOBSWIPE_PUBLIC_URL=https://example.com \
JOBSWIPE_BUILD_NUMBER=1 \
scripts/ios-app-store-archive.sh
```

The script derives the associated-domain entitlement from that same permanent
HTTPS host, so the binary, native API, legal links, and universal links cannot
accidentally target different environments. Inspect the archive in Xcode
Organizer before explicitly opting into upload with
`JOBSWIPE_UPLOAD_TO_APP_STORE=true`.

`com.example.jobswipe` is an intentional placeholder. Replace it only after the
Apple team and final bundle identifier are confirmed.

App Attest and associated-domain universal links should be enabled only after
those identifiers and the permanent production domain are final. The custom
`jobswipe://discover`, `jobswipe://saved`, `jobswipe://profile`, and job-detail
routes are already registered for local/native navigation.
