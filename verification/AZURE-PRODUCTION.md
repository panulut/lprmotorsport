# Azure production verification

The production UI was released as PR #22. This branch prepares a separate Azure
production service; the existing `rg-lpr-test` application, origins and signing key
remain isolated. Collision optimization PR #20 is excluded.

Target: Azure subscription `41128d20-bcb4-4799-80ce-ac23952b4bdd`, Sweden Central,
resource group `rg-lpr-prod`, standard Container Apps environment `aca-lpr-prod`,
Consumption profile only, application `lpr-verification-prod`.
Resources: 0.5 vCPU / 1 GiB, one verification worker, five sessions (raised from two
on 2026-11-02 at the owner's request), 0–1 replicas,
8 starts/minute, unchanged 2000 ms lap eligibility bound and other realtime rules.

Use a standard environment to measure the public ingress independently of the
Express test environment's observed ~0.51 second transit overhead. This choice
does not establish a latency improvement before the new route is measured.
No dedicated workload profile, private endpoint, custom VNet, paid registry,
Log Analytics workspace or additional compute is required. Logs destination is
`none`; authenticated application metrics and Azure Monitor resource metrics remain
available. The prior Render deployment remains ready for rollback.

Consumption bills allocated CPU/memory time and external requests, with the
subscription's shared monthly free allowances. Zero running replicas incur no
compute charge; sustained traffic, including chat polling, can keep a replica
running. The free allowance is shared with tests, so zero total cost is not promised.
See https://learn.microsoft.com/en-us/azure/container-apps/billing .

`Dockerfile.azure-production` defaults to explicit `azure-production` mode.
Startup rejects other environment modes, missing commit identity, changed
capacity/realtime defaults, test origins, test storage URLs, session overrides or
missing/semi-shared signing and metrics keys. This does not repurpose or weaken
the isolated azure-test image. Only these production origins are permitted:

- https://panulut.github.io
- https://lprmotorsports.me

Chat storage and capacity history retain the existing production Cloudflare/D1
endpoints. Transfer the current Render signing and metrics keys in memory through
authenticated APIs to Azure secret references; never print or commit them.
The current Cloudflare signing keys and D1 records do not need to change.

Release gates: local production/configuration and verification tests, full Tests
CI, image HIGH/CRITICAL scan, container startup/origin/shutdown smoke, GHCR push,
verified immutable digest and OCI source commit. Deploy only the digest. Then
validate health/protocol/revision, origins and protected metrics, genuine signed
driving and D1 receipt persistence, replay, chat and session release before changing
the public frontend endpoint. Measure the warm public route; keep rendering and
batch collection separate from HTTP transit.

Save Render live deploy/settings/environment (DPAPI), production Worker version
and settings, current Pages/main commit and Azure template before mutations.
Do not delete/recreate the production D1 database or reset results.
Rollback: revert the frontend endpoint commit through a normal main commit and
wait for successful Pages deployment; Render still uses the same production key,
protocol, revision and storage. Preserve Azure for diagnosis or stop its app after
confirming no active sessions. Do not force-push main or delete shared resources.

Capacity evidence: the 30 October 10-client test on the same 0.5 vCPU / 1 GiB
Express host produced ten first-lap receipts, then lost eligibility for eight
players after lap-finish replay completion delayed acknowledgments. It did not
pass a complete two-lap 10-player test. Five sessions have not been load-tested;
watch "practice laps" and "lag terminations" in the admin capacity history and
lower the limit again if they appear. Anti-cheat rules are unchanged.


## Background replay packing — local evidence, 5 November 2026

Baseline at commit `2502acb` (before the gzip-3 / scheduling follow-up below).

The original implementation acknowledges physics without waiting for replay
serialization, gzip or signing. Finished recordings are serialized in separate
worker turns (admitted physics takes priority), with one gzip level 1 job active
at a time. Eligible boundaries keep their original arrival/crossing decision;
ready signed receipts use a later batch's existing `laps[]`. An owner-authenticated
`GET /sessions/:id/laps` also drains accepted finishes without driving another
batch, including after cancellation or TTL. Cached sequence responses are immutable.
The browser fetches final receipts separately and deduplicates them with later acks.

A fresh local Node process with one physics worker and ten synchronized real-clock
HTTP clients completed **two full laps each: 20/20 signed replay receipts,
practiceLaps = 0, lagTerminations = 0**. Across 4,310 batches, ackLagMs p95 was
**160.04 ms**, maximum **358.48 ms**, and peak process RSS was **587.70 MiB**
(includes local HTTP clients and their replay copies). Finish-batch HTTP response
p95/max was 78.18/79.13 ms. Both finish ticks were identical for every client:
14,208 and 25,854. After cancellation, worker worlds, physics jobs and recording
jobs were all zero. Receipt signatures and the existing SHA-256 of each base64
payload were checked for every lap.

On those same two replays, gzip level 6/3/1 median times were 52.02/24.74/16.92 ms
and 40.77/20.55/17.62 ms. Level 1 payloads were 697,040 and 623,552 characters
(level 6: 619,848 and 550,280), below the unchanged 900,000-character bound.
JSON serialization measured 12.86 and 8.59 ms separately. Moving it to another
turn removes it from the finish's physics task; it can still delay newly arriving
physics by one serialization turn.

Reproduce with `npm run measure:background-replay`; raw results are in
[background-replay-load.json](../artifacts/verification/background-replay-load.json).
This host provides eight CPUs, without a 0.5-vCPU quota. **This is not a passing
Azure capacity test** and does not supersede the failed 30 October evidence.
Production remains `MAX_VERIFIED_SESSIONS=5`; 2000-ms lapLagMs, all other realtime
rules, simulation revision, 120 Hz, receipt format and replayHash are unchanged.
No production deployment was performed. Repeat on an isolated Azure test host
before drawing conclusions about ten-player capacity on production resources.


## PR #30 follow-up: bounded scheduling and one-CPU evidence

Replay deadlines no longer terminate the shared worker. A deadline removes only
that recording's timer and queued document, or aborts its active gzip stream.
Only the affected session receives the replay error; other sessions and the
worker remain alive. Actual worker loss and unresponsive physics/control requests
retain their separate existing cleanup policy.

Physics retains priority, with a starvation guard: when the compressor is free,
the oldest recording gets a turn after at most eight further physics tasks or
500 ms of queue wait (whichever threshold is reached first). This does not preempt
a running physics task or the previous gzip. Compression now uses gzip level 3.
A fixture continuously replenishes 16 worker-side physics jobs and verifies that
a recording completes while the FIFO stays nonempty. A separate short deadline
test verifies another player's physics and next replay succeed on the same thread.

The repeated real-clock **10 clients × 2 full laps** test was run with:

```sh
taskset -c 0 node scripts/measure-background-replay.cjs --output=artifacts/verification/background-replay-load-cpu1-gzip3.json
```

Both parent and load child reported availableParallelism=1 and CPU affinity `0`.
The server, physics worker, zlib and local HTTP clients all share this one CPU.
The enclosing cgroup remains 8 CPUs (`cpu.max=800000 100000`); **this is one-core
affinity, not a 0.5-CPU quota or an Azure production capacity test**.

| Metric | Result |
| --- | ---: |
| Signed replay receipts | 20/20 |
| practiceLaps / lagTerminations | 0 / 0 |
| ackLagMs p95 / max | 236.95 / 470.82 ms |
| HTTP response p95 / max | 223.78 / 468.26 ms |
| Finish-batch HTTP response p95 / max | 133.42 / 163.65 ms |
| Peak process RSS, including local clients | 639.04 MiB |
| Post-cleanup worlds / physics jobs / recordings | 0 / 0 / 0 |

Two scheduling turns used the starvation guard. Maximum replay queue wait was
1062.88 ms, including preceding serial gzip jobs; physics acknowledgments do not
wait for that queue. Gzip-3 payloads were 671,420 and 599,508 characters, about
3.7%/3.9% smaller than level 1, below the unchanged 900,000-character bound.
Signatures and the base64-payload SHA-256 were checked for every receipt.
Detailed timings and compression comparisons are in WORKER_POOL.md and
[background-replay-load-cpu1-gzip3.json](../artifacts/verification/background-replay-load-cpu1-gzip3.json).

No production deployment. Production remains MAX_VERIFIED_SESSIONS=5, with
unchanged anti-cheat thresholds, simulation revision, 120 Hz and receipt fields.


## Azure 0.5-vCPU capacity gate — preparation only, 6 November 2026

**NOT RUN.** The execution environment has no Azure CLI, Docker, Azure authentication, ARM
credentials, or Container Apps connector. No test Container App was created; no
production settings were read or changed. There are **zero completed Azure runs**
and no Azure capacity pass. MAX_VERIFIED_SESSIONS stays 5.

[AZURE-TEST.md](AZURE-TEST.md) contains the ready deployment, three-run measurement
and shutdown commands. The test image's verification/simulation code is archived
from immutable e70218a; a separately hashed test-only bootstrap adds authenticated
worker stats, durable invalidation counts and server-process RSS high-water.

The harness rejects production URLs and mutable images, checks the Azure resource
proof for 0.5 vCPU / 1 GiB / one worker / 256 MiB heap, uses TEST Worker start
tickets and verifies every receipt signature and replayHash. It records metrics
before, every 15 seconds and after each of three runs. Actual runs must each
produce 20/20 receipts, no practice/lag/processing/replay failures, ackLagMs max
<1000 ms and server RSS high-water <800 MiB. All raw samples survive failures.

The existing TEST Worker's revision and test D1 binding were checked read-only and
match this source. Neither signing key was read or changed. Locally executed
synthetic HTTP smoke checks validate the harness's three-run control flow and
credential redaction; they are **not Azure load-test results**.

Microsoft documents maxReplicas >=1. The prepared script sets test min=0/max=1
and calls the Container Apps Stop API in its EXIT/INT/TERM cleanup, then requires
a read-back Stopped state. This achieves zero running replicas without claiming
that an unsupported 0/0 setting was applied. Only the isolated test app is targeted.

Execution status: [status.json](../artifacts/verification/azure-ten-player/status.json).
After actual execution, attach run-1/2/3.json, summary.json and stop-proof.json,
then record the observed metrics here. No production capacity decision is made
from an unexecuted test.
