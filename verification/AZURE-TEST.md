# Isolated Azure verification test

This branch prepares a manually deployed verification API in `rg-lpr-test`,
`swedencentral`, with app name `lpr-verification-test`. It does not provision the
test game, account service, or a production leaderboard. Production integrations
remain disabled. No Azure deployment is triggered by a branch push.

## Deployment prerequisites

- Confirm the dedicated test resource group and registered `Microsoft.App`
  resource provider in the intended test subscription (both already ready on
  2026-10-28; see readiness below).
- Configure a GitHub `azure-test` environment restricted to `deploy/azure-test`,
  with required reviewers if desired. The manual deployment job uses this
  environment; its Azure OIDC federated credential must match the environment
  subject, for example `repo:OWNER/REPO:environment:azure-test`.
- Set `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` secrets.
  Scope the Azure identity to the test resource group and the operations needed
  to create the managed environment, app, and resource group deployments.
- Generate independent random `AZURE_VERIFICATION_SECRET` and
  `AZURE_METRICS_TOKEN` secrets of at least 32 characters. Never copy production
  credentials. Startup validates length, but cannot establish their provenance.
- Set `GHCR_PULL_TOKEN` to a package-reading token and `GHCR_PULL_USER` to its
  matching GitHub username (a GitHub variable). Grant access to this private
  package, including organization SSO authorization when applicable.
- Provision a separate Azure test game and supply its exact HTTPS origin as the
  manual workflow's `test_game_origin` input. Supported host suffixes are
  `.azurecontainerapps.io`, `.azurewebsites.net`, and `.azurestaticapps.net`.
  Paths, trailing slashes, credentials, HTTP, and production origins are rejected.

Run **Deploy Azure verification test** only from `deploy/azure-test`. Start with
`max_sessions=2`. Its reusable verification job runs the tests, compiles Bicep,
builds the container, checks HTTP driving sessions, and verifies graceful shutdown
before the deployment job publishes an image. The app uses the published digest,
HTTPS-only public ingress, one replica at most, authenticated metrics, health
probes, and no external capacity/chat storage endpoints. The post-deployment check
verifies health, simulation revision, and authenticated metrics.

The Bicep workload profile is placed under app `properties`, following the
[2024-03-01 resource schema](https://learn.microsoft.com/en-us/azure/templates/microsoft.app/2024-03-01/containerapps).

## Local checks

Use Node 24:

```text
npm run test:azure-verification
npm run test:azure-deployment
npm run test:verified
npm run test:replay-service
npm run test:verification-capacity
npm run test:worker-pool
npm run test:chat
npm run test:spectate
npm run test:shared-track-state
```

The Azure suite includes local HTTP load checks and injected partial failures; it
sends no traffic to Azure. CI additionally compiles Bicep and exercises the actual
Docker image, scans HIGH/CRITICAL OS and library vulnerabilities with Trivy, and
validates the compiled resource graph. Compile the template to
`artifacts/verification/azure-template.json` before `test:azure-deployment` locally.
On Windows also run `./tests/azure-deploy-script.test.ps1`; it mocks all Azure
commands and tests approval, scope, secret-file permissions and cleanup.
Docker is not installed on the preparation workstation; image build, vulnerability,
HTTP and SIGTERM checks run on the GitHub Ubuntu runner.

The Dockerfile runs Node directly as the non-root `node` user and copies an explicit
list of server modules, simulation sources, recording code and track data without
credentials or npm dependencies. It excludes the production frontend configuration;
Docker context excludes credential directories, environment files and private keys.
The image uses official Node 24.22.1 on Alpine 3.24, upgrades OS packages and removes
unused npm/yarn/corepack payloads. The first Debian-based image failed the new
vulnerability gate; its findings were not suppressed. The base tag and GitHub action major tags remain mutable;
digest/SHA pinning is a follow-up for stronger build reproducibility.

## Azure load test

After approving and completing a test deployment, set these variables locally:

```text
AZURE_VERIFICATION_URL=https://lpr-verification-test.<environment>.azurecontainerapps.io
AZURE_VERIFICATION_TEST_SECRET=<dedicated test signing secret>
AZURE_LOAD_SECONDS=5
AZURE_LOAD_PLAYERS=2
```

Then run `npm run load:azure-verification`. Keep secrets out of shell history and
tracked files. The CLI permits only the HTTPS Azure test app hostname, rejects
custom ports and URL credentials/paths/query/fragment, and refuses redirects.
It checks revision and idle admission capacity, creates every player armed before
activation, paces 60-tick batches at 120 Hz, checks acknowledgements, and cancels
all known sessions even after partial initialization or batch failures. Failed
cleanup makes the command fail. A creation response lost over the network can
still leave an unknown session until the server's idle timeout.

Valid load points are `2,5,10,25,50,100`; omitting `AZURE_LOAD_PLAYERS` runs all of
them. Configure `max_sessions` to at least the largest requested point first. The
script waits 61 seconds between points to avoid overlapping the server's rolling
start-rate window; reserve the endpoint for the test and allow prior starts to
age out before beginning. The deployment allows 100 starts per minute.

JSON output contains batch p95, maximum acknowledgement lag, practice lap and
ineligible batch counts, and **client** event-loop p99, not server event-loop
measurements. Collect authenticated `/metrics` and Azure CPU/memory/restart
metrics separately. Two admitted players are the initial configuration, not a
measured capacity claim; 0.5 vCPU, 1 GiB, and one 256 MiB worker need measurement
before raising admission to 100.

## Remaining operational limits

The app scales to zero while idle, so cold starts affect the first request.
[Azure scaling behavior](https://learn.microsoft.com/en-us/azure/container-apps/scale-app)
also permits transient extra replicas during maintenance. Sessions and nonce
caches are in memory: restarts, revision changes, or routing to another replica
can invalidate unfinished sessions. Do not treat this as durable or horizontally
scalable verification. Test rollout and restart behavior before wider use.

Log Analytics is disabled (`appLogsConfiguration: null`); there is no durable application
log history or alerting configured. Azure identity permissions, quotas, region
availability, private registry access, frontend integration, and remote load
results require validation in the test subscription. No production configuration
or secrets should be attached to this deployment.

## Readiness observed on 2026-10-28

- Azure CLI 2.91.0; active subscription `Azure for Students`, enabled,
  `41128d20-bcb4-4799-80ce-ac23952b4bdd`; tenant
  `9d97530e-8f27-4137-a2a9-5cb4dcf26f2e`. Both deployment paths check this identity.
- `rg-lpr-test` exists in `swedencentral`, provisioning succeeded. The subscription
  resource inventory was empty: no app, environment, database, logging workspace,
  registry or frontend. `Microsoft.App` is registered. Sweden Central environment
  quota was 0 used / 1 allowed. Consumption core allocation is still unconfirmed.
- The inherited/resource-group role listing showed the user's subscription Owner
  role, but no deployment service principal with resource write permissions.
- GitHub `azure-test` environment returned 404; repository Actions secret-name
  listing was empty. Environment protections, OIDC federation, the Azure identity,
  package credentials and dedicated signing/metrics secrets still need setup.
  No secret values were requested from GitHub or printed.
- Bicep builds locally. Azure `deployment group validate` using synthetic values
  stopped at `AADSTS50076` (MFA required). Refresh with
  `az login --tenant 9d97530e-8f27-4137-a2a9-5cb4dcf26f2e`, then
  `az account set --subscription 41128d20-bcb4-4799-80ce-ac23952b4bdd`.
  Provider validation and regional allocation have not succeeded yet.
- The deployment workflow is absent from `main`. GitHub requires it on the default
  branch for the normal manual trigger
  ([documentation](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)).
  Do not merge it or change the default branch just to enable deployment. Use the
  guarded local fallback after approval, or agree a separate workflow solution.

## Credit consumption

Keep Consumption, 0 minimum / 1 maximum replicas, 0.5 vCPU / 1 GiB, no saved logs,
no ACR, no private endpoints, no dedicated profiles, no database and no always-on
health polling. Public requests can keep the app awake; CORS is not authentication
or a spending cap. Review usage after each test and remove the isolated app and
environment when finished. Budget alerts warn; they do not impose a hard cap.

The [Azure retail pricing API](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices)
returned Sweden Central USD list rates on 2026-10-28: active vCPU $0.000024/s,
memory $0.000003/GiB-s, requests $0.40/million. At the proposed size, active compute
is **$0.054/hour**, or **$0.009 per ten-minute test**, before allowances, networking,
currency conversion and taxes. A continuously active 30-day month is $38.88 before
allowances. Student credit balance and billing-period usage were not retrieved.

[Consumption allowances](https://azure.microsoft.com/en-us/pricing/details/container-apps/)
are 180,000 vCPU-seconds, 360,000 GiB-seconds and 2 million requests per subscription
per month. With no other usage, compute grants cover about 100 active hours at this
size. A five-minute point sends approximately `players * (600 + 3) + 2` requests;
all six points total about 109,758 requests. The five-second ladder totals about
2,378 requests, plus cold starts and cooldown. GitHub Actions/Packages, egress,
retries and continued polling have separate considerations. No cost is guaranteed.

## First deployment after explicit approval

1. Refresh MFA; confirm subscription, resource group and quota again. Complete
   identity/package setup above. For Actions use a dedicated OIDC identity with
   issuer `https://token.actions.githubusercontent.com`, audience
   `api://AzureADTokenExchange`, subject
   `repo:panulut/lprmotorsport:environment:azure-test`, and Contributor only on
   `rg-lpr-test` (or a narrower equivalent). Grant no production access. Restrict
   the GitHub environment to `deploy/azure-test` and require deployment review.
2. Choose the exact separate Azure frontend origin. API-only tests can use a
   reserved origin without a live site; this does not establish browser readiness.
   A live game also needs an independent test account/leaderboard service, signing
   key, database and analytics endpoint. Existing Render/Cloudflare staging in
   `STAGING.md` is a different environment; do not silently reuse keys or data.
   Build a test frontend with `build:staging`, never plain `build`; verify its
   manifest and browser network log contain only test endpoints before publishing
   to a separate Azure test site. Never publish the test build to GitHub Pages.
3. Require green branch CI including the container scan. On a Docker-equipped
   machine, build this exact commit, run the workflow image smoke tests and Trivy
   HIGH/CRITICAL scan, then push only `ghcr.io/panulut/lprmotorsport/verification`.
   Resolve its immutable `@sha256:...` digest. Private GHCR requires the independent
   read-only package token; CI's `GITHUB_TOKEN` is not a persistent app pull token.
4. On Windows, load `AZURE_VERIFICATION_TEST_SECRET`, `AZURE_METRICS_TOKEN`,
   `GHCR_PULL_TOKEN` and `GHCR_PULL_USER` into process environment variables from a
   secret manager without echoing values or putting them in shell history. Generate
   independent signing/metrics keys of at least 32 characters, distinct from all
   production and prior staging keys. Validate only:

   ```powershell
   ./scripts/deploy-azure-verification.ps1 -Image 'ghcr.io/panulut/lprmotorsport/verification@sha256:<verified-digest>' -TestGameOrigin 'https://<separate-test-game>.azurestaticapps.net' -MaxSessions 2
   ```

   This runs provider validation and creates no app. Parameters travel via a
   restricted temporary file and are removed afterwards. Obtain explicit approval
   for the two Container Apps resources and estimated costs; only then repeat with
   `-ApproveTestResourceCosts`. No deployment was run during preparation.
5. Confirm HTTPS `/health` is ready with this commit's protocol/revision and
   `maxSessions=2`; authenticated `/metrics` returns 200, anonymous metrics 401,
   production Origin 403. Run the two-player five-second load check; confirm zero
   active sessions after cleanup. Record the image digest, revision and results.
6. Progress through **2, 5, 10, 25, 50, 100** players, setting admission for one point
   per approved test revision. Test 5, 60, then 300 seconds before increasing. Reserve
   the app; allow 61 seconds after prior starts; capture private metrics before/after
   plus Azure CPU, memory and restarts. Stop on rejection, timeout, restart, nonzero
   ineligible batches/practice laps, or increasing queue/ack lag. Do not widen
   anti-cheat limits. The script stops the ladder on timing ineligibility.
   Retain reports without credentials. A short smoke does not establish completed
   lap verification: run full standing/flying-lap receipts and two real browsers
   before declaring player readiness. There is no measured 100-player capacity claim.
