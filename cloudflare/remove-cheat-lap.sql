-- Run in Cloudflare D1 > lpr-times > Console.
-- Quarantine only the identified forged lap. Keep backups before deleting it.
CREATE TABLE IF NOT EXISTS removed_cheat_laps AS SELECT * FROM laps WHERE 0;
CREATE TABLE IF NOT EXISTS removed_cheat_best_laps AS SELECT * FROM best_laps WHERE 0;

INSERT INTO removed_cheat_laps
SELECT * FROM laps
WHERE version = 'lut-20261011-v3' AND nickname = 'OTTAKAA SIITÄ'
  AND lap_ms = 12345 AND sector1 = 4000 AND sector2 = 4000 AND sector3 = 4345
  AND id NOT IN (SELECT id FROM removed_cheat_laps);

INSERT INTO removed_cheat_best_laps
SELECT * FROM best_laps
WHERE version = 'lut-20261011-v3' AND nickname = 'OTTAKAA SIITÄ'
  AND lap_ms = 12345 AND sector1 = 4000 AND sector2 = 4000 AND sector3 = 4345
  AND NOT EXISTS (
    SELECT 1 FROM removed_cheat_best_laps backup
    WHERE backup.version = best_laps.version AND backup.player_hash = best_laps.player_hash
  );

-- Remove the legacy copy too, so the automatic migration cannot restore it.
DELETE FROM best_laps
WHERE version = 'lut-20261011-v3' AND nickname = 'OTTAKAA SIITÄ'
  AND lap_ms = 12345 AND sector1 = 4000 AND sector2 = 4000 AND sector3 = 4345
  AND EXISTS (
    SELECT 1 FROM removed_cheat_best_laps backup
    WHERE backup.version = best_laps.version AND backup.player_hash = best_laps.player_hash
      AND backup.nickname = best_laps.nickname AND backup.lap_ms = best_laps.lap_ms
      AND backup.sector1 = best_laps.sector1 AND backup.sector2 = best_laps.sector2 AND backup.sector3 = best_laps.sector3
  );

DELETE FROM laps
WHERE version = 'lut-20261011-v3' AND nickname = 'OTTAKAA SIITÄ'
  AND lap_ms = 12345 AND sector1 = 4000 AND sector2 = 4000 AND sector3 = 4345
  AND EXISTS (
    SELECT 1 FROM removed_cheat_laps backup
    WHERE backup.id = laps.id AND backup.version = laps.version AND backup.player_hash = laps.player_hash
      AND backup.lap_id = laps.lap_id AND backup.nickname = laps.nickname AND backup.lap_ms = laps.lap_ms
      AND backup.sector1 = laps.sector1 AND backup.sector2 = laps.sector2 AND backup.sector3 = laps.sector3
  );

SELECT nickname, lap_ms FROM laps
WHERE version = 'lut-20261011-v3' ORDER BY lap_ms, id LIMIT 10;
