# Live Delta

The timing panel compares the driver's elapsed lap time with a recorded lap at the same normalized track distance. The value is `current elapsed − reference elapsed`: negative is faster and green; positive is slower and red. The reference trace is frozen when a lap starts.

A revision-matched PB trace is preferred. If no local PB trace exists, the signed-in driver's own public PB replay can supply one. Otherwise, the fastest clean, complete trace recorded locally for the current track revision can be used as a reference lap. A slower reference is labeled as a reference lap, never as a PB. Continuous Delta requires at least 100 recorded positions, with no adjacent samples more than 2.5% of track progress apart. The game interpolates only between adjacent samples in that dense trace. Sector-only data, including local preview fixtures and an official personal best whose replay cannot be turned into samples, never creates a continuous curve. It reports the exact cumulative delta only when a sector gate is crossed, and keeps that value until the next gate. A dense local trace is left in place. A faster local sector personal best is also left in place.

The local game records position and elapsed time on each update. Verified driving runs at 120 Hz, so an 84.5-second lap contains about 10,141 samples. The trace validator accepts up to 72,002 samples, matching the verified replay limit of 72,000 ticks plus the origin sample. A completed local trace must cover start to finish, contain three monotonic split checkpoints whose times match the lap, remain on track, and match the current track revision. Off-track and materially reverse progress invalidates the trace. Existing local `trace` and `referenceTrace` records are loaded on startup, so a saved clean local trace can be used immediately.

For authenticated accounts, the read-only timing-panel endpoint returns a replay pointer only for the owner's ranked PB. The client fetches that public replay and validates its protocol, revision, track geometry, lap duration, frame ordering and on-track progress before deriving a trace. This lets an existing verified PB provide the first comparison after sign-in without another lap. The browser integration test removes local traces and confirms that the server replay restores the PB baseline.

## Source locations

- `timing.js`: validates traces and checkpoints, snapshots the current reference, performs same-position comparisons, and suspends the comparison during reverse progress.
- `game.js`: loads saved traces, validates replay-derived PB traces, captures local and verified game updates, persists accepted PB/reference traces, and assigns PB/reference state.
- `lap-panel.js` and `cloudflare/verified-worker.mjs`: fetch the authenticated owner's read-only PB replay pointer and return only that owner's ranked replay metadata.
- `sector-panel.js`: displays the localized Delta label, signed value, and faster/slower state.
- `tests/timing.test.cjs`: covers trace-only comparison, sign, snapshots, reloads, invalid traces, and 120 Hz trace lengths.
- `tests/leaderboard-start.test.cjs`: drives both local and verified update paths through lap completion and checks the next lap's delta.
- `scripts/check-verified-browser.cjs`: verifies real 120 Hz trace persistence, next-lap delta, and replay recovery after removing local traces.

## Verification

- `node tests/timing.test.cjs` — passed.
- `node tests/leaderboard-start.test.cjs` — passed, including an 84.5-second verified-mode lap with more than 10,000 samples and a delta on the following lap.
- `node tests/verified-accounts.test.cjs` — passed, including the authenticated owner-only PB replay pointer.
- `NODE_PATH=/tmp/lpr-layout-check/node_modules npm run test:verified-browser` — passed; the actual 3D game recorded a verified lap and recovered its PB trace in a second tab.
