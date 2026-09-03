# Production release runbook

This runbook is intentionally fail-closed. Do not enable the native API or mark
the database ready until every preceding verification passes.

## Current release gate

- Turso marketplace installation: `starter` (`$0/month`)
- Included monthly reads: 500,000,000 rows
- Observed August usage on 2026-08-14: 608,094,673 rows
- Writes: 81,630 of 10,000,000
- Smallest currently offered paid plan: `developer` (`$5.99/month`)

Changing the marketplace billing plan requires the owner's explicit approval.
The safe alternative is to wait for the next monthly usage reset, but production
release and reliable review inventory remain blocked until then.

## Release order

1. With explicit billing approval, change the existing Turso installation to
   `developer`; do not create, disconnect, rotate, or replace the database.
2. Back up or verify point-in-time recovery for the existing resource.
3. Run `npm run db:migrate` against production and confirm migration
   `0008_complex_toro.sql` is recorded exactly once.
4. Run read/write/schema checks before changing any public release gate.
5. Deploy the current production build while `JOBSWIPE_NATIVE_API` is absent or
   disabled.
6. Verify `/privacy`, `/terms`, `/support`, and the web app on the canonical
   domain.
7. Enable `JOBSWIPE_NATIVE_API=enabled` in Production and redeploy.
8. Run the strict native journey:

   ```sh
   JOBSWIPE_SMOKE_BASE_URL=https://jobswipe-amber.vercel.app \
   JOBSWIPE_SMOKE_REQUIRE_JOBS=true \
   npm run native:smoke
   ```

9. Only after that journey passes, set
   `JOBSWIPE_PRODUCTION_DATABASE_READY=true` and perform the final deployment.
10. Verify the Apple association endpoint returns JSON without authentication,
    then build the signed archive with `scripts/ios-app-store-archive.sh`.

## Rollback

- If migration or smoke verification fails, keep the native API disabled and
  the database-ready gate false. Do not delete or recreate the database.
- If the web deployment regresses, promote the previous known-good Vercel
  production deployment; schema changes in `0008` are additive and may remain.
- If the native API regresses after enablement, remove or disable
  `JOBSWIPE_NATIVE_API` and redeploy. Existing installation credentials remain
  revocable and do not need to be exposed or rotated for an application bug.
