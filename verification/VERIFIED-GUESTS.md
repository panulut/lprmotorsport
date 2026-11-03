# Verified guests and account promotion

## Architecture and decisions

The existing verification service remains authoritative: signed start ticket →
live, clock-bounded server simulation → signed lap receipt and replay hash →
authenticated Worker upload → one D1 transaction. No physics, replay format,
timing threshold, signature requirement or legacy leaderboard trust rule changes.

`verified_guests` gives a guest a cryptographically random, persistent principal.
`verified_login_sessions` stores only the random bearer token's hash, the signing
secret's hash and its absolute expiry. Guest credentials last 24 hours and can be
revoked through the existing logout endpoint. Restarting a browser or server does
not change ownership when the original credential is retained. Nicknames are
display labels; two guests with the same nickname are distinct owners.

`POST /api/verified/guest` requires a nickname and explicit `human` or `bot` series.
With a bearer credential it resumes the existing session without extending it or
trusting the submitted name. Registered nicknames cannot be newly selected by
guests. Existing guest results cannot be stolen by subsequently registering their
nickname. Public names resolve to the account nickname, or `Nickname (vierailija)`
for an unclaimed guest. Stable identities and credentials stay out of public lists.

Registration uses the existing `POST /api/verified/account` with `create:true`,
credentials and the active guest bearer in `Authorization`. In one D1 batch it:

1. Inserts the new account using the **same** guest principal, conditional on a
   still-live, unrevoked session and signing secret.
2. Preserves the existing category; the client cannot change it while claiming.
3. Extends that session to the normal seven-day account lifetime, without rotating
   the token or disrupting the verification service's independent driving session.
4. Enrolls that principal's eligible laps from the currently open Helsinki day in
   the existing championship ledger, using its `(session_id, lap)` primary key.

The account and championship enrollment commit or roll back together. Database
time rechecks expiry, and the daily deadline is enforced inside the transaction.
Unique account identity and nickname constraints arbitrate competing claims.
Matching retries return the same account/session; a different password, nickname,
session, expired credential or existing account cannot take over this principal.
No lap, timestamp, sector, receipt, replay or original nickname field is rewritten.
Receipts arriving after promotion still authenticate to the same principal.

The game offers a non-modal registration form during driving. It does not call
cancel, reset or start a new physics session. Typing uses neutral controls through
the normal input path while simulation continues. Queued receipt/replay pairs
move from the guest token namespace to the account namespace only after durable
storage succeeds. Lost registration responses can be retried or recovered after
reload using the original guest credential. Account/password sign-in works after
session expiry or signing-secret rotation, as before.

The main trade-off is deliberately retaining the original bearer through
promotion. Treat it as an account credential after registration. A bearer stolen
from browser storage can act as its owner; this matches the existing account
authentication model. Do not log tokens, passwords or signed receipts publicly.

## Championship policy

Unregistered guests never get `championship_laps` entries. A claim backfills only
the still-open Europe/Helsinki day, from original `issued_ms` timestamps. Current
day speed/volume rankings, participation, milestones and streaks all use the
existing scorer; duplicate receipts and claims cannot create duplicate entries.
All-time lap ownership includes older days, but those laps get no retroactive
daily points or streak days. Original results remain visible regardless of expiry.

Monthly points in this repository are the sum of **finalized daily** awards. There
is no independent monthly lap or milestone award. Claimed open-day laps therefore
affect provisional daily standings immediately and monthly totals when that day
finalizes. Closed daily rows are never backfilled, even if their month is active;
closed month totals and previously awarded standings are unchanged by promotion.
The database deadline prevents a pre-midnight registration from enrolling that
day if its transaction executes after midnight. DST uses the existing IANA zone.

## Replay policy and diagnostics

`verified_lap_evidence` preserves the original signed receipt and replay hash for
every newly accepted upload, including laps outside the replay retention window.
`verified_record_archive` permanently protects recordings that have ever been
publicly pinned. Migration archives existing pins, including old revisions.
Rank, revision, review or category changes can make them private, but automatic
cleanup cannot delete their evidence. Administrators can retrieve old archived
replays. Deletion would require an explicit separate operator/data-erasure policy.

Other recordings retain the current revision's fastest twenty per category,
plus the best recording of each of its twenty fastest distinct drivers and
flagged/excluded recordings. Slower artifacts may not be retained. Lap rows and
receipt evidence remain. Public TOP 10 shows one personal best per stable
principal and still requires a
current-revision, non-excluded result and pinned replay. Archiving is **not** a
verification bypass. Storage grows with former public records instead of having
a fixed twenty-record ceiling; monitor D1 size and cost before release. Old
recordings already removed before migration cannot be reconstructed.

`GET /api/verified/admin/lap-status?sessionId=<32 hex>&lap=<integer>` requires the
existing `ANALYTICS_ADMIN_TOKEN`. It reports accepted evidence, ownership type,
category, revision, rank, exclusion, replay retention/archive state, and trusted
upload failures (missing/mismatched replay). `not_received` means no accepted
upload or signature-validated rejection is stored; inspect the browser's durable
upload queue, `LPRVerificationDiagnostics.lastMismatch` and verification-service
logs for disconnect, late input, physics mismatch or storage outage. Untrusted
signatures never populate arbitrary lap identifiers in the audit table. A total
database outage cannot record its own failure there. These diagnostics contain
private signed evidence and must stay administrator-only.

## Migration and release procedure (not executed against remote systems)

1. Back up/export the target **staging** D1 database through its established
   process. Confirm it already contains the verified schema; legacy results are
   a separate system and must not be imported as verified results.
2. Run `cloudflare/migrations/0001_verified_guests.sql` against staging. It creates
   four tables and an ownership/time index and copies existing pin identifiers.
   It is repeatable and performs no ALTER, DROP, DELETE, result reset or rewrite.
   `cloudflare/verified-schema.sql` also includes it for a fresh database. The
   Worker creates the additive tables/index if missing, preserving the existing
   deployment convention, but apply the migration before switching Worker code.
3. Run `npm run build:verified-worker`; use the resulting pasteable bundle with
   staging's existing DB binding, origins, simulation revision, admin token and
   verification secret. Do not copy production secrets or change infrastructure.
4. Build the staging game using the existing `verification/STAGING.md` procedure.
   Release the new Worker before the new game. The verification service protocol
   and physics revision do not change; no service deployment is required.
5. A rollback to the old Worker hides guest records and resumes its destructive
   replay cleanup. **Do not roll back old retention code** over archived data.
   Keep the archive-aware Worker and roll back the game alone if necessary.

## Staging validation

1. Confirm all URLs, secrets and DB bindings are staging-only. Record initial
   row counts and a sample registered result; preserve other testers' records.
2. In a fresh browser choose guest, nickname and human category. Drive a complete
   verified lap. Check the official leaderboard and track-record HUD suffix,
   replay URL, original signature/hash and absence from championship standings.
3. During the next flying lap use the non-modal registration form. Confirm the
   active driving session/tick sequence continues, the suffix disappears, the
   same lap IDs/timestamps/evidence persist, and current-day lap statistics and
   points appear once. Finish another lap and verify its replay and points.
4. Retry the identical registration and receipt requests; simulate a lost response
   and reload. Reconnect using the original session and ensure no duplicates.
   Repeat with two browsers sharing a nickname; one must not claim the other's
   laps. Test a taken account name, altered replay, revoked and expired sessions.
5. Repeat in the bot category and confirm no human leaderboard/points changes.
   Use admin lap diagnostics to check rejection, exclusion and old revision cases.
6. Run the automated boundary suite locally; for a real staging midnight test,
   drive before and after Helsinki midnight and register afterward. Only the new
   day gets awards; compare prior daily/monthly results. Do not change server time.
7. Let an unclaimed session expire; its official result and replay must remain.
   Run archive-aware retention and confirm previously public evidence survives
   revision/category changes. No test here authorizes resetting staging records.

## Automated validation

Node 24.19.0 and local SQLite, plus local Chrome 156.0.8078.73 with synthetic
controls and an accelerated verification clock. These are local functional tests,
not remote capacity, human usability or live D1 validation.

- `npm run test:guests`: ownership/security, atomic failure and concurrent claims,
  open-day scoring, Helsinki midnight/DST/month/year boundaries, duplicate points,
  restart/reconnect, bundled Worker, secret rotation and actual guest driving.
- `npm run test:guests-browser`: real 3D guest lap → live registration → flying
  lap, public replay, reports, category changes and physics/engine tamper rejection.
- Existing verification, championship, leaderboard, recordings, chat, spectating,
  live-client, replay-service, staging, physics and deterministic-math suites.
- Registered driving, guest chat, populated dashboard layout and release-screen
  Chrome regression checks, plus the existing language-switching unit test.
- Game and Worker builds, JavaScript syntax checks and `git diff --check`.

These checks were executed and passed locally on 29 October 2026. Security review
checked bound SQL, cryptographic identity generation, secret/session handling,
origin and payload limits, transaction guards, duplicate and race behavior,
administrator-only evidence and unchanged verification thresholds. A limited
diff scan also checked private-key, GitHub-token and AWS access-key patterns;
this is not a comprehensive secret-scanner or penetration-test certification.

Remote staging and production were not deployed or modified. Remaining limits:
browser storage loss/expired guest credentials cannot be recovered by nickname;
guest creation is IP-rate-limited but distributed abuse still needs the existing
edge controls; archive growth needs monitoring; legacy deleted replay evidence
is unavailable; administrator category/erasure operations retain their existing
competition semantics and are separate from guest conversion.
