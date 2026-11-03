-- Read-only export for scripts/audit-names.mjs.
SELECT 'account' AS source, nickname, NULL AS session_id, NULL AS lap FROM verified_accounts
UNION ALL SELECT 'guest', nickname, NULL, NULL FROM verified_guests
UNION ALL SELECT 'verified_lap', nickname, session_id, lap FROM verified_laps
UNION ALL SELECT 'legacy_lap', nickname, lap_id, NULL FROM laps
UNION ALL SELECT 'chat', nickname, id, NULL FROM verified_chat_messages;
