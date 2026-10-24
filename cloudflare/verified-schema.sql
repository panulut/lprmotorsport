-- Separate verified results; never migrates legacy lap times.
CREATE TABLE IF NOT EXISTS verified_laps (
  session_id TEXT NOT NULL,lap INTEGER NOT NULL,revision TEXT NOT NULL,player_hash TEXT NOT NULL,nickname TEXT NOT NULL,
  start_tick INTEGER NOT NULL,end_tick INTEGER NOT NULL,lap_ticks INTEGER NOT NULL,
  sector1 INTEGER NOT NULL,sector2 INTEGER NOT NULL,sector3 INTEGER NOT NULL,issued_ms INTEGER NOT NULL,
  PRIMARY KEY(session_id,lap));
CREATE INDEX IF NOT EXISTS verified_order ON verified_laps(revision,lap_ticks,issued_ms,session_id,lap);
CREATE TABLE IF NOT EXISTS verified_limits (key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires INTEGER NOT NULL);
