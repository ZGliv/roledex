# App Store screenshots

`draft/` contains simulator captures at 1206 × 2622, an App Store accepted
iPhone screenshot size. They are evidence for local QA, not the final marketing
set.

- `01-onboarding.png` — fresh-install guided setup
- `02-discover-card.png` — populated Matches feed and native decision card
- `03-deep-link-confirmation.png` — iOS confirmation that the custom JobSwipe URL
  scheme is registered

Replace the third capture and add Saved, job detail, and Profile screenshots
after the signed TestFlight build is running against production. Final captures
must not contain Simulator chrome, test-only data, permission prompts, or a
custom-scheme confirmation sheet.

For repeatable local navigation captures after completing onboarding in a
Simulator workspace, run:

```sh
scripts/ios-simulator-capture.sh <booted-simulator-udid>
```

The Debug-only `--jobswipe-tab` launch argument does not exist in Release
behavior; it only makes the three primary surfaces deterministic for QA.

Additional unedited runtime captures live in `runtime/` (current large iPhone)
and `runtime-small/` (iPhone SE). They verify Discover, Saved, Profile, and
fresh-onboarding layouts across both supported size classes; they are QA
artifacts, not final App Store marketing screenshots.
