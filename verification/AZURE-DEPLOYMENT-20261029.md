# Isolated Azure test deployment — 2026-10-29

Deployed with the user's explicit approval of test resources and costs. Production
and `main` were not changed. Only `aca-lpr-test` and `lpr-verification-test` were
created in `rg-lpr-test`, Sweden Central, in Azure for Students.

- Endpoint: https://lpr-verification-test.jollyflower-664bfb1f.swedencentral.azurecontainerapps.io
- Image: `ghcr.io/panulut/lprmotorsport/verification@sha256:165a925811cf7a6c69ae60f77cbdd302b4f6aeef88443edb84a89f2275b177a3`
- Image source: `5ab897e510eb3e1e07cba3c4057c600f5124897f`.
- Simulation revision: `3c5237068fcb1c7490b265c20f496b5bd0141815d542a7274518df534ed02346`.
- Deployment: `verification-5eda7cdb152b42ddad00b6e1a368c9b932f7e965`, Succeeded.
- Consumption profile; 0.5 vCPU, 1 GiB RAM, two simultaneous verified sessions,
  one worker, 0 minimum / 1 maximum replicas, single active revision.
- HTTPS ingress, dedicated test credentials, reserved Azure test origin, no external
  capacity/chat/database integrations, no saved Log Analytics logs.

## Verification

The [deployment workflow](https://github.com/panulut/lprmotorsport/actions/runs/40863219528)
successfully authenticated with OIDC and created the resources. Its original
long-running 60-tick verification failed on accumulated client/network lag. A repeat
from Finland reproduced the failure. A diagnostic measured 560–640 ms round trips
for an acknowledgement-gated client sending 500 ms of inputs per request; server
batch processing was at most about 100 ms. No server security limits were widened.

The deployment checker now uses the protocol's existing maximum of 120 ticks per
request (one simulated second), maintaining real-time pacing. The default load
helper remains at 60 ticks; its 120-tick option has a targeted local HTTP pacing,
cleanup and maximum-size regression check. Runtime image and server configuration
were unchanged for the successful repeat.

Successful live API verification, completed 2026-10-29 11:25:17 UTC / 13:25:17 Helsinki:

| Check | Result |
| --- | --- |
| HTTPS health, expected revision/protocol, session limit | Passed |
| Plain HTTP redirects to HTTPS | Passed |
| Anonymous / incorrect metrics credential | 401 |
| Production / unrelated test origin | 403 |
| Configured test origin | 200, exact CORS allow-origin |
| Invalid start ticket / wrong session owner | 401 |
| Third simultaneous player | 429 |
| Concurrent players | 2 |
| Standing and flying laps | Both completed by both players |
| Signed receipts and matching replay hashes | 4 verified |
| Authoritative batch states compared to local reference | 432 matched |
| Simulation / wall time | 215.5 s / 216.47 s |
| Batch latency p95 | 665.05 ms |
| Maximum acknowledgement lag | 880.44 ms |
| Ineligible batches / practice laps | 0 / 0 |
| New lag terminations / processing timeouts in passing run | 0 / 0 |
| Active sessions after cleanup | 0 |

The counters include two earlier failed timing attempts; their lag terminations
did not increase during the passing run. This verifies simulated API players and
signed replays. A separate live browser game/account/database deployment was not
part of this task. The reserved test origin is not a published game URL.

## Actual usage

The passing run consumed 10.54 process CPU-seconds over 216.47 seconds, averaging
0.0487 CPU cores (about 9.7% of the allocated 0.5 core). Process RSS after the test
was 165.38 MiB; one verification worker was running.

Azure Monitor, 2026-10-29 11:12–11:32 UTC, including startup and diagnostic attempts:

- Reported maximum CPU: 0.064 cores, about 12.8% of allocated CPU.
- Reported maximum working-set memory: 286,892,032 bytes, about 273.60 MiB.
- Maximum replicas: 1. Container restarts: 0.
- HTTP requests: 1,031 during that window.

Subsequent control-plane inspection confirmed `replicas: 0` and
`runningState: ScaledToZero`. No HTTP polling was left running. A first request
after idle will therefore have a cold start.

List-rate active compute remains approximately $0.054/hour before monthly free
allowances, requests and networking; the passing 216-second run corresponds to
about $0.00325 of active compute before allowances. This is not an invoiced charge:
actual billed credit consumption has not been confirmed in Cost Management.

Sanitized live results: [azure-two-player-20261029.json](azure-two-player-20261029.json).
