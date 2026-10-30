# Azure load/browser checkpoint — 29 October 2026

> Superseded by the [single final ten-player test on 30 October](AZURE-FINAL-TEN-20261030.md).
> The environment is Express: revision suffixes are unsupported, and app-level
> stop/start resolved the saved/live admission mismatch. The final test failed on
> lap-finish replay latency, was cleaned up, and admission was restored to 2.
> The historical resume instructions below are not authorization for more tests;
> the user explicitly requested stopping after that final run, with no 25+ test.

Stopped safely at the user's checkpoint request. No load runner or browser remains
running. Azure control-plane configuration and the live `/health` endpoint both
report **2 sessions maximum**; live metrics report **0 active sessions**, 0 pending
requests and 0 closing sessions. Restored state was verified at 22:15:02 Helsinki
and rechecked after the push at 22:18:17 Helsinki / 20:18:17 UTC.
This work made no changes to production or `main`. Local `main` and the cached
`origin/main` ref remained at `5e6bb8f9f1a023038e9991edba7f04251ef3df94`.
The final remote check after pushing only `deploy/azure-test` observed remote
`main` at `93b64c97fb895e99bb29d06fadcd95d9ed4292ef`; that advancement occurred
outside this worktree. No push, merge or other write targeted `main`.

The test image remains
`ghcr.io/panulut/lprmotorsport/verification@sha256:165a925811cf7a6c69ae60f77cbdd302b4f6aeef88443edb84a89f2275b177a3`:
0.5 vCPU, 1 GiB, one worker, 0–1 replicas. No server clock, physics, signing,
admission defaults or anti-cheat limits changed.

## Completed and tested

- Reused the existing untracked browser and full-lap load scripts. Added npm
  commands and usage instructions in [AZURE-TEST.md](AZURE-TEST.md).
- Fixed the load generator's global acknowledgement barrier. Every player now
  has an independent activation clock and request chain. A regression holds one
  player's response while another advances; failures still drain requests and
  clean up all known sessions. This fix is locally tested; its ten-player Azure
  capacity result is still outstanding.
- Fixed browser setup: register at a desktop viewport, finish initializing both
  contexts before driving, then use 640×480 driving views. Optional external fonts
  are served offline, while unexpected service origins still fail the test.
- The baseline browser saved standing and flying laps. Two concurrent real Chrome
  browsers then saved **4 verified laps**, including a player with **250 ms added
  input-request delay**. No physics mismatches, practice laps, lag terminations,
  processing timeouts or unexpected origins occurred. Normal animation and server
  clocks were used. The frontend was routed locally inside browser contexts, with
  disposable local SQLite accounts; no public frontend/account service was deployed.
- Concurrent browser response p95: **701.5 / 968.9 ms**. Maximum arrival lag:
  **1233.6 / 1935.8 ms**. The delayed player was close to the unchanged 2000 ms
  eligibility limit, so this is not evidence for raising production capacity.
- The browser run counted one non-200 input response, without retaining its status
  or distinguishing cancellation. Four laps still saved and cleanup reached zero
  sessions. The script now records non-200 status codes and whether they arrived
  during cleanup; this added diagnostic has passed syntax checks but awaits a live
  repeat. Do not assume the earlier response was caused by cleanup.

Passed local checks: `npm run test:azure-verification`, `npm run test:staging`,
`npm run test:verified`, `npm run test:worker-pool`, `npm run test:azure-deployment`,
`node tests/azure-oidc.test.cjs`, and `./tests/azure-deploy-script.test.ps1`.
The mocked PowerShell check needed execution outside the process sandbox to set
temporary-file ACLs; it performed no Azure writes. Both new scripts pass
`node --check`. Final live security checks: anonymous/wrong metrics token 401,
production origin 403, allowed test origin 200.

Sanitized measurements: [azure-load-browser-20261029.json](azure-load-browser-20261029.json).
The five-player success in that file predates this continuation.

## Outstanding findings

The original ten-player failure reached 2014.4 ms input arrival lag, crossing the
2000 ms eligibility bound. It had 963 matching authoritative batches, no HTTP
failures, no restart and no processing timeout. Maximum worker queue time was
964.6 ms, worker wall time 561.8 ms and acknowledgement lag 2406.1 ms. Average CPU
was 0.260 cores and sampled peak process RSS 249.3 MiB. These aggregate measurements
do not establish one exclusive cause. The confirmed global barrier unnecessarily
spread each slow response to every player; it has been removed, without granting
any extra server time budget.

The independent ten-player retry **did not launch players**: Azure's resource
template reported admission 10, but the live endpoint continued reporting 2. The
readiness preflight failed before session creation. The runner stopped, restored
the template to 2 in `finally`, and verified the live service at 2 with zero
sessions. The control-plane revision was named `lpr-verification-test--latest`.
Revision rollout/ingress convergence needs investigation. No 25/50/100-player run
was started. Ten-player capacity remains unverified.

## Exact resume steps

Use this worktree on `deploy/azure-test`; never switch to or push `main`. No test is
scheduled to resume automatically. The ignored `artifacts/verification/` directory
preserves raw reports, browser screenshots/builds, the DPAPI credential store,
`continue-azure-stage.py`, and the checkpoint orchestration scripts. Unrelated
untracked files and `.work/` were preserved without staging them. Do not commit
these files or print decrypted credentials.

1. Load dedicated test credentials into the documented environment variables, or
   reuse the preserved DPAPI runner. Repeat the browser diagnostic explicitly:

   ```powershell
   $env:AZURE_BROWSER_DELAYS='0,250'
   $env:AZURE_BROWSER_REPORT='artifacts/verification/azure-browser-resume.json'
   python artifacts/verification/continue-azure-stage.py browser
   ```

   Inspect `non200Responses` and cleanup metrics. For a fresh checkout with
   credentials already in its environment, use `npm run test:azure-browser`.

2. Inspect the test subscription's app and revisions before changing admission:

   ```powershell
   $sub='41128d20-bcb4-4799-80ce-ac23952b4bdd'
   az containerapp show --subscription $sub -g rg-lpr-test -n lpr-verification-test --query '{revision:properties.latestRevisionName,ingress:properties.configuration.ingress,admission:properties.template.containers[0].env[?name==`MAX_VERIFIED_SESSIONS`].value}'
   az containerapp revision list --subscription $sub -g rg-lpr-test -n lpr-verification-test --query '[].{name:name,active:properties.active,state:properties.runningState,admission:properties.template.containers[0].env[?name==`MAX_VERIFIED_SESSIONS`].value}'
   $base='https://lpr-verification-test.jollyflower-664bfb1f.swedencentral.azurecontainerapps.io'
   Invoke-RestMethod "$base/health"
   ```

   Compare the active revision, its environment and ingress routing. A unique
   `--revision-suffix` is an available next diagnostic, not a verified fix for the
   convergence problem. Do not bypass the load script's readiness checks.

3. After resolving rollout, retry ten players with guaranteed restoration. This
   stays in the same test app and does not increase its compute allocation:

   ```powershell
   try {
     $suffix='load10-'+[DateTime]::UtcNow.ToString('MMddHHmmss')
     az containerapp update --subscription $sub -g rg-lpr-test -n lpr-verification-test --revision-suffix $suffix --set-env-vars MAX_VERIFIED_SESSIONS=10 --output none
     if ($LASTEXITCODE -ne 0) { throw 'Test admission update failed' }
     python artifacts/verification/continue-azure-stage.py 10 artifacts/verification/azure-load-10-resume.json
     if ($LASTEXITCODE -ne 0) { throw 'Load stage failed; inspect its report' }
   } finally {
     $suffix='restore2-'+[DateTime]::UtcNow.ToString('MMddHHmmss')
     az containerapp update --subscription $sub -g rg-lpr-test -n lpr-verification-test --revision-suffix $suffix --set-env-vars MAX_VERIFIED_SESSIONS=2 --output none
     if ($LASTEXITCODE -ne 0) { throw 'RESTORE FAILED: resolve before leaving' }
     python artifacts/verification/continue-azure-stage.py inspect
     if ($LASTEXITCODE -ne 0) { throw 'RESTORE VERIFICATION FAILED: resolve before leaving' }
   }
   ```

   The script waits for idle health with the expected admission/revision. Keep the
   run attended. For an environment-only invocation, set `AZURE_LOAD_PLAYERS=10`
   and use `npm run measure:azure-load-stage` instead of the DPAPI runner.

4. Examine `firstIneligibleBatch`, arrival/ack/worker timings, client event-loop
   timing, sampled metrics, signed-receipt counts and cleanup. Only after a full
   ten-player pass consider 25, then 50 and 100, stopping at the first failure.
   Retain the same `finally` restoration and verify both control-plane admission
   and live health/metrics. Commit and push only verified results to
   `deploy/azure-test`.
