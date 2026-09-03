# JobSwipe submission checklist

## Accounts and legal

- [ ] Active Apple Developer Program membership
- [ ] Final legal owner name, support email, support phone, and mailing jurisdiction
- [ ] Unique bundle identifier controlled by that Apple team
- [ ] Agreements, tax, and banking complete if any paid feature will exist
- [ ] Privacy policy and terms approved with final contact/entity language

## Backend release gate

- [ ] Durable hosted database selected and production migrations applied
- [ ] Production UI enabled on the permanent custom/public domain
- [ ] Visitor session secret configured and rotated safely
- [ ] `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` stable across deployments
- [ ] Refresh cron authenticated and monitored
- [ ] Support, privacy, and terms URLs return 200 without authentication
- [ ] No preview/Vercel SSO URL appears in App Store metadata
- [ ] Data export and deletion verified against production
- [ ] `JOBSWIPE_SMOKE_BASE_URL=https://<production-host> JOBSWIPE_SMOKE_REQUIRE_JOBS=true npm run native:smoke` passes

## Native client

- [x] Bundled native client; no production `server.url` remote-wrapper shortcut
- [x] Native session issuance, rotation, logout/delete, and device pairing
- [x] Offline/network error screen with retry
- [x] Native haptic feedback for swipe decisions
- [x] Native share sheet for job links
- [x] Native local reminders for follow-ups/deadlines
- [ ] Universal links/deep links for job details and pairing
- [x] Custom-scheme deep links for Discover, Saved, Profile, and job details
- [x] External employer links visibly leave JobSwipe
- [x] Privacy manifest included for the dependency-free target
- [x] App Transport Security has no broad exception
- [x] Release logging excludes profile, résumé, tokens, and application content

## Product QA

- [x] Simulator fresh install reaches guided onboarding
- [x] Matches/Stretch distinction is explained in the feed
- [x] Every visible native filter maps to a persisted admission/ranking input
- [x] Zero-result states explain the lane and offer an edit path
- [x] Swipe, tilt, tap-to-open, and explicit decision buttons work in Simulator
- [ ] VoiceOver and reduced-motion paths pass on a physical device
- [x] Simulator iPhone SE-sized and current large iPhone layouts do not clip
- [ ] Background/foreground, interrupted writes, and poor network recover cleanly
- [ ] Saved search/filter/application plan and original listing links work
- [ ] Cross-device pairing is one-time, expires, and cannot leak another workspace

## App Store Connect

- [ ] Name and subtitle fit Apple’s current character limits
- [ ] Description, keywords, categories, age rating, and copyright final
- [ ] App privacy questionnaire matches the shipping binary and backend
- [ ] 1–10 representative iPhone screenshots uploaded at an accepted size
- [ ] App icon and launch experience verified on device
- [ ] Review contact and review notes complete
- [ ] Review workspace/sample inventory is live for the entire review window
- [ ] Export-compliance questions answered

## TestFlight and submission

- [ ] Run `scripts/ios-app-store-archive.sh` with the final team, bundle, domain, version, and build values
- [ ] Validate archive and upload to App Store Connect
- [ ] Internal TestFlight smoke test on at least two iPhone sizes
- [ ] External TestFlight beta feedback resolved
- [ ] App Review submission uses the exact tested build
- [ ] Production monitoring watched during phased release
