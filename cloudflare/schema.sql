CREATE TABLE IF NOT EXISTS best_laps (
  version TEXT NOT NULL,
  player_hash TEXT NOT NULL,
  nickname TEXT NOT NULL,
  lap_ms INTEGER NOT NULL CHECK(lap_ms > 5000),
  sector1 INTEGER NOT NULL,
  sector2 INTEGER NOT NULL,
  sector3 INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(version, player_hash)
);
CREATE INDEX IF NOT EXISTS leaderboard_order ON best_laps(version, lap_ms, updated_at);
CREATE TABLE IF NOT EXISTS submission_limits (
  ip_hash TEXT PRIMARY KEY,
  expires INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS limits_expiry ON submission_limits(expires);
