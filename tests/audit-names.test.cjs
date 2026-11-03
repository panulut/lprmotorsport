const assert = require('node:assert/strict');

(async () => {
  const {auditNames, rowsFromExport} = await import('../scripts/audit-names.mjs');
  const exported = [{results: [
    {source: 'account', nickname: 'Panu', session_id: null, lap: null},
    {source: 'account', nickname: 'Racer1488', session_id: null, lap: null},
    {source: 'verified_lap', nickname: 'Racer1488', session_id: "s'1", lap: 2},
    {source: 'verified_lap', nickname: 'Panu', session_id: 's2', lap: 1},
    {source: 'chat', nickname: 'Racer1488', session_id: 'm1', lap: null}
  ], success: true}];
  const {bySource, lapCount, sql} = auditNames(rowsFromExport(exported));
  assert.deepEqual(bySource, {account: ['Racer1488'], verified_lap: ['Racer1488'], chat: ['Racer1488']});
  assert.equal(lapCount, 1);
  assert.equal(sql.length, 1);
  assert.match(sql[0], /^INSERT OR IGNORE INTO verified_lap_exclusions\(session_id,lap,reason,created_ms\) VALUES \('s''1',2,'name-policy',\d+\);$/);
  assert.deepEqual(auditNames(rowsFromExport([{results: [{source: 'guest', nickname: 'Panu'}]}])).sql, []);
  assert.deepEqual(rowsFromExport([]), []);
  assert.deepEqual(rowsFromExport([{source: 'guest', nickname: 'Panu'}]), [{source: 'guest', nickname: 'Panu'}]);
  assert.throws(() => rowsFromExport([{results: [{source: 'guest', nickname: 'Panu'}, '--- TRUNCATED --- 414 more items']}]), /Invalid or truncated/);
  assert.throws(() => rowsFromExport([{success: false, results: []}]), /failed query/);
  assert.throws(() => rowsFromExport({unexpected: []}), /Invalid or truncated/);
  console.log('audit-names: ok');
})().catch(error => { console.error(error); process.exit(1); });
