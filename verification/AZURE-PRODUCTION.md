# Azure production verification

The production UI was released as PR #22. This branch prepares a separate Azure
production service; the existing `rg-lpr-test` application, origins and signing key
remain isolated. Collision optimization PR #20 is excluded.

Target: Azure subscription `41128d20-bcb4-4799-80ce-ac23952b4bdd`, Sweden Central,
resource group `rg-lpr-prod`, standard Container Apps environment `aca-lpr-prod`,
Consumption profile only, application `lpr-verification-prod`.
Resources: 0.5 vCPU / 1 GiB, one verification worker, ten sessions (raised from two
to five on 2026-11-02 and to ten on 2026-11-06 at the owner's request), 0–1 replicas,
32 starts/minute, unchanged 2000 ms lap eligibility bound and other realtime rules.

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

Ten sessions (2026-11-06): the isolated 0.5-vCPU Azure run with the lighter
physics (source `7788a00`, same simulation revision) produced 20/20 signed
receipts in each of three runs, with ten synchronized clients finishing on the
same tick. ackLag p95 was 529-562 ms and max 1003-1175 ms: above that test's
1000 ms gate but below the 2000 ms production lap eligibility bound, so no lap
became a practice lap. The owner chose to raise production to ten. Starts per
minute rise to 32, the value used in that test, so ten drivers restarting after
crashes are not rejected. The image guard requires `MAX_VERIFIED_SESSIONS=10` and
`MAX_VERIFIED_STARTS_PER_MINUTE=32`, so image and settings change together.
Watch practice laps and lag terminations. Rollback: the previous image digest with
`MAX_VERIFIED_SESSIONS=5` and `MAX_VERIFIED_STARTS_PER_MINUTE=8`. The game shows
occupancy from `/health`; when the server is full it keeps the driver in practice,
polls `/health` only, and starts the official run when a slot frees up.
