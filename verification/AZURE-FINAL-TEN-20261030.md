# Final ten-player Azure test — 30 October 2026

**Failed the requirement to keep all ten players eligible throughout standing and
flying laps.** All ten players received one valid signed lap/replay receipt, but
eight lost eligibility at batch 119, around simulation second 120. The test
stopped immediately, before any second lap could finish. Exactly one live load
test was run; no browser, 25-player or larger test was run in this continuation.

Test window: 05:41:04–05:43:17 Helsinki / 03:41:04–03:43:17 UTC. The measured server
resource interval was 126.312 seconds. The planned two-lap simulation was 215.5
seconds; it did not complete.

## Configuration and revision repair

Only `lpr-verification-test` in `rg-lpr-test`, Sweden Central, was changed.
Throughout the test: **0.5 vCPU, 1 GiB, one worker, maximum one replica**, single
revision mode. The image stayed at
`ghcr.io/panulut/lprmotorsport/verification@sha256:165a925811cf7a6c69ae60f77cbdd302b4f6aeef88443edb84a89f2275b177a3`;
physics revision stayed
`3c5237068fcb1c7490b265c20f496b5bd0141815d542a7274518df534ed02346`.
No production service, physics, signing code or anti-cheat threshold was changed.

The environment is **Express**, confirmed through the `2026-07-01` management API.
The installed CLI's older environment response omitted that property. Express
uses single-revision rolling updates; custom revision suffixes and traffic
splitting do not apply. See [Microsoft's Express capabilities](https://learn.microsoft.com/en-us/azure/container-apps/express-overview).

The checkpoint's suggested unique suffix was rejected with
`ExpressEnvironmentFeatureNotSupported`. A revision-level restart of `--latest`
also returned `InternalServerError`. Neither attempt started a load test.

Saving `MAX_VERIFIED_SESSIONS=10` without a suffix succeeded in the control plane,
but the running process still reported 2. The working repair was the app-level
[stop](https://learn.microsoft.com/en-us/rest/api/resource-manager/containerapps/container-apps/stop?view=rest-resource-manager-containerapps-2026-07-01)
and [start](https://learn.microsoft.com/en-us/rest/api/resource-manager/containerapps/container-apps/start?view=rest-resource-manager-containerapps-2026-07-01)
actions, using API `2026-07-01`. After that cycle, live health confirmed 10,
zero active sessions, the expected revision and the unchanged 2000 ms lap-lag
limit. The load generator's normal readiness guard then passed. During load,
live health confirmed ten active sessions and the revision list showed one
replica receiving all traffic.

This resolves the earlier configuration/runtime mismatch: the saved environment
had changed, while the running process retained the previous admission setting.
An app stop/start applied the saved setting. No readiness check was bypassed.

## Measurements

| Measurement | Result |
| --- | ---: |
| Concurrent players / signed first laps | 10 / 10 |
| Players with two signed laps | 0 |
| Batches processed / compared successfully | 1202 / 1194 |
| Physics mismatches / HTTP failures | 0 / 0 |
| Ineligible acknowledgements / practice-lap completions | 8 / 0 |
| Process CPU | 28.842 CPU-seconds |
| Average CPU | 0.228 cores, 45.7% of allocated 0.5 vCPU |
| Highest sampled CPU interval (about 5 s) | 0.416 cores |
| Peak sampled process RSS | 273.96 MiB |
| Azure Monitor maximum CPU / working set | 0.331 cores / 357.59 MiB |
| Azure Monitor maximum replicas / restarts | 1 / 0 |
| Input response p50 / p95 / p99 | 675.95 / 905.30 / 1174.57 ms |
| Maximum input response | 2510.55 ms |
| Worker queue mean / p95 upper bound / maximum | 71.34 / 256 / 671.08 ms |
| Maximum physics time per batch | 197.89 ms |
| Maximum replay time per batch | 1523.94 ms |
| Maximum worker wall time | 1602.31 ms |
| Maximum server batch response time | 1713.28 ms |
| Maximum input arrival / acknowledgement lag | 2078.21 / 2302.61 ms |
| Client event-loop p99 / maximum | 38.96 / 49.87 ms |
| Restarts / processing timeouts / session lag terminations | 0 / 0 / 0 |

Queue percentiles are upper bounds from the server's existing histogram, not exact
per-request quantiles. CPU is the server process CPU-counter delta, including its
worker and compression work; sampled interval values are not instantaneous peaks.
RSS is sampled, so its maximum is a lower bound on an unobserved instantaneous peak.
Azure Monitor uses complete minute buckets from 03:41 through 03:44 UTC, including
some startup/cleanup outside the precise load interval. Its container working set
differs from process RSS. The initial unaligned query omitted the partial failure
minute; the final minute-aligned query includes it. Measurements, units and coverage
are included in the JSON results.

## Exact measured failure chain

The first observed eligibility failure was player 9, sequence 119, at
05:43:15.248 Helsinki. The chronological first failure is retained separately
from the aggregate error, which selects the first failed promise in player order.

1. Until sequence 117, that player's sends remained on schedule; the response
   took 634.15 ms, including 48.73 ms of server processing.
2. Sequence 118 crossed the first lap finish while the ten players finished
   together. Its input arrived only 585.45 ms late and was still eligible.
   Completing the authoritative replay delayed the reply: worker wall time was
   **1602.31 ms**, server processing was **1692.58 ms**, and the full response took
   **2460.82 ms**. Across these lap-finishing batches, replay time reached
   **1523.94 ms**; nine replay measurements fell in the 1024–2048 ms histogram
   bucket. Physics time never exceeded 197.89 ms.
3. The corrected generator has independent player chains, but each player's own
   next request still waits for its acknowledgement. Sequence 119 was therefore
   sent **2474.33 ms** after sequence 118, **1475.65 ms behind schedule**.
4. Sequence 119 arrived **2032.800754 ms** behind simulation time, exceeding the
   unchanged **2000 ms** eligibility bound by **32.800754 ms**. The server correctly
   marked the current lap ineligible. Eight players hit the same bound; the maximum
   observed arrival lag was 2078.21 ms. The runner drained in-flight requests and
   cancelled every session.

The blocking stage was **lap-finish replay artifact completion on the server,
followed by acknowledgement-gated input arrival**, rather than the removed global
player barrier. The client event-loop maximum was only 49.87 ms, and the affected
batch's server processing delay itself exceeded 1.69 seconds. The worker waits for
the replay promise before replying (`verification/pool-worker.cjs`); the replay
pack path awaits gzip and hashes the resulting artifact (`verification/replay.cjs`).
Receipts remain tied to completed replay artifacts.

The replay timer includes compression, its asynchronous queue/wait and associated
artifact work. This test does not separately attribute that 1.52-second replay
delay to gzip CPU, compression-thread scheduling or platform scheduling. It does
identify the blocking stage and the exact deadline violation; there was no evidence
of memory exhaustion, a restart or a large local client pause. No server fix or
further experiment was attempted after this one test, as requested.

## Cleanup and verification

The generator finished with **0 active sessions, 0 pending requests and 0 closing
sessions**. A `finally` block saved admission 2. Live health initially still showed
10, so the same Express app stop/start repair was applied again. Final control-plane
configuration and live health both confirmed **2 sessions**, with 0 active sessions,
the unchanged revision, 2000 ms lag bound, 0.5 vCPU, 1 GiB and maximum one replica.
Authenticated metrics confirmed an empty pool. The final local process audit found
**0 running load/browser runner processes**. No unattended test or polling loop
was left running.

Final restored-live check: 05:44:17 Helsinki / 03:44:17 UTC. Process audit:
05:44:45 Helsinki / 03:44:45 UTC. Metrics authentication and origin isolation still
returned anonymous/wrong token 401, production origin 403 and test origin 200.

The existing load-generator regression suite passed before the live run. The new
diagnostics were exercised by the single live test through session creation,
activation, receipt verification, timing failure and cleanup. Only test diagnostics,
documentation and sanitized results were changed. Temporary orchestration scripts,
raw artifacts and DPAPI credentials remain ignored and were not committed.

Machine-readable evidence: [azure-final-ten-20261030.json](azure-final-ten-20261030.json).
