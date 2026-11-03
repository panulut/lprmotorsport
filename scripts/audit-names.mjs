// Finds stored nicknames that the current name policy would refuse, from a D1 export.
//
// 1. Export (read-only):
//    npx wrangler d1 execute lpr-times --remote --json --file scripts/audit-names-export.sql > names.json
// 2. Review:
//    node scripts/audit-names.mjs names.json > name-cleanup.sql
//    The report goes to stderr; stdout is SQL that hides the flagged verified laps through
//    verified_lap_exclusions (reason 'name-policy'). Nothing is deleted.
// 3. Undo, if needed:
//    DELETE FROM verified_lap_exclusions WHERE reason='name-policy';
import {readFileSync} from 'node:fs';
import {allowedName} from '../verification/name-policy.mjs';

export function auditNames(rows){
  const flagged=rows.filter(row=>typeof row.nickname==='string'&&!allowedName(row.nickname));
  const bySource={};
  for(const row of flagged)(bySource[row.source]??=new Set()).add(row.nickname);
  const laps=flagged.filter(row=>row.source==='verified_lap'&&row.session_id!=null&&row.lap!=null);
  const quote=value=>`'${String(value).replaceAll("'","''")}'`;
  const sql=laps.map(row=>`INSERT OR IGNORE INTO verified_lap_exclusions(session_id,lap,reason,created_ms) VALUES (${quote(row.session_id)},${Number(row.lap)},'name-policy',${Date.now()});`);
  return {bySource:Object.fromEntries(Object.entries(bySource).map(([k,v])=>[k,[...v].sort()])),lapCount:laps.length,sql};
}

// wrangler --json prints [{results:[...]}, ...]; plain row arrays are accepted too.
export function rowsFromExport(data){
  const list=Array.isArray(data)?data:[data];
  const rows=list.flatMap(item=>{
    if(item?.success===false)throw Error('Name export contains a failed query');
    if(Array.isArray(item?.results))return item.results;
    if(item&&typeof item==='object'&&'nickname' in item)return [item];
    throw Error('Invalid or truncated name export');
  });
  if(rows.some(row=>!row||typeof row!=='object'||typeof row.nickname!=='string'||typeof row.source!=='string'))
    throw Error('Invalid or truncated name export');
  return rows;
}

if(import.meta.url===`file://${process.argv[1].replaceAll('\\','/').replace(/^(?=[A-Za-z]:)/,'/')}`){
  const file=process.argv[2];
  if(!file){console.error('Usage: node scripts/audit-names.mjs <wrangler-export.json>');process.exit(2);}
  const {bySource,lapCount,sql}=auditNames(rowsFromExport(JSON.parse(readFileSync(file,'utf8'))));
  const sources=Object.keys(bySource);
  if(!sources.length)console.error('No stored nickname fails the current name policy.');
  for(const source of sources)console.error(`${source}: ${bySource[source].length} name(s)\n  ${bySource[source].join('\n  ')}`);
  if(sources.some(s=>s==='account'||s==='guest'))console.error('\nAccounts and guests are listed only: free or rename them from the admin view.');
  console.error(`\n${lapCount} verified lap(s) will be hidden by the SQL on stdout.`);
  process.stdout.write(sql.join('\n')+(sql.length?'\n':''));
}
