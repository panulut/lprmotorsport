const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {pathToFileURL}=require('node:url');

(async()=>{
  const worker=(await import(pathToFileURL(path.join(__dirname,'../cloudflare/worker.mjs')).href)).default;
  const db=new DatabaseSync(':memory:');
  const schema=fs.readFileSync(path.join(__dirname,'../cloudflare/schema.sql'),'utf8');
  db.exec(schema.split('-- Every completed lap')[0]);
  const seed=db.prepare('INSERT INTO best_laps(version,player_hash,nickname,lap_ms,sector1,sector2,sector3) VALUES (?,?,?,?,?,?,?)');
  const version='lut-20261011-v3';
  seed.run(version,'legacy-player','Panu',40000,10000,10000,20000);
  seed.run(version,'forged-player','OTTAKAA SIITÄ',12345,4000,4000,4345);
  let queue=Promise.resolve();
  const binding={batch(statements){
    const result=queue.then(async()=>{db.exec('BEGIN');try{
      const results=[];for(const statement of statements)results.push(await statement.run());
      db.exec('COMMIT');return results;
    }catch(error){db.exec('ROLLBACK');throw error;}});
    queue=result.catch(()=>{});return result;
  },prepare(sql){let values=[];return {
    bind(...args){values=args;return this;},async first(){return db.prepare(sql).get(...values);},
    async all(){return {results:db.prepare(sql).all(...values)};},
    async run(){return {meta:{changes:Number(db.prepare(sql).run(...values).changes)}};}
  };}};
  const env={DB:binding,ANALYTICS_ADMIN_TOKEN:'admin-'.repeat(12)};
  const realNow=Date.now;let now=1800000000000,sequence=0;
  Date.now=()=>now;
  try{
    const token='a'.repeat(64),origin='https://panulut.github.io';
    const id=()=> (++sequence).toString(16).padStart(64,'0');
    const call=(route,data,player=token,extra={})=>worker.fetch(new Request('https://service.test'+route,{
      method:data===undefined?'GET':'POST',headers:{Origin:origin,Authorization:`Bearer ${player}`,'Content-Type':'application/json',...extra},
      ...(data===undefined?{}:{body:JSON.stringify(data)})
    }),env);
    const admin=(route,data,secret=env.ANALYTICS_ADMIN_TOKEN)=>call('/api/admin/'+route,data,secret);
    const board=async()=> (await (await call('/api/leaderboard')).json()).results;
    const base={version,nickname:'Test Driver'};
    const begin=async(player=token,requestId=id())=>{
      const response=await call('/api/laps/start',{...base,requestId},player);
      assert.equal(response.status,200,await response.clone().text());
      const ticket=await response.json();assert.equal(ticket.mode,'timed-v1');assert.match(ticket.lapId,/^[a-f0-9]{64}$/);
      return {...ticket,requestId};
    };
    const payload=(ticket,lapMs=40000,sectors=[10000,10000,lapMs-20000])=>({...base,protocol:'timed-v1',lapId:ticket.lapId,lapMs,sectors});
    const finish=async(ticket,lapMs=40000,sectors)=>{now+=lapMs;return call('/api/laps',payload(ticket,lapMs,sectors));};
    assert.equal((await board()).length,1,'Known forgery is hidden during migration');
    assert.equal(db.prepare('SELECT count(*) n FROM laps').get().n,2,'Forged data is preserved');
    assert.equal(db.prepare('SELECT count(*) n FROM best_laps').get().n,2,'Legacy data is preserved');
    db.exec(schema);db.exec(schema);
    assert.equal((await board()).length,1,'Legacy migration cannot resurrect the hidden score');
    assert.equal((await call('/api/laps',payload({lapId:id()}))).status,403);
    assert.equal((await call('/api/laps',{...base,lapMs:40000,sectors:[10000,10000,20000]})).status,428);
    assert.equal((await call('/api/laps/start',{...base,requestId:id()},'bad')).status,401);
    assert.equal((await call('/api/laps/start',{...base,requestId:id()},token,{Origin:'https://other.example'})).status,403);
    assert.equal((await call('/api/laps/start',{...base,requestId:id(),padding:'x'.repeat(3000)})).status,413);
    assert.equal((await call('/api/laps/start',null)).status,400);
    assert.equal((await call('/api/laps/start',{...base,nickname:'<script>',requestId:id()})).status,400);
    now+=60000;
    const first=await begin();now+=1000;
    const repeated=await begin(token,first.requestId);
    assert.equal(repeated.lapId,first.lapId);assert.equal(repeated.startedAt,first.startedAt,'Retry cannot reset the clock');
    assert.equal((await call('/api/laps/start',{...base,nickname:'Someone Else',requestId:first.requestId})).status,409);
    assert.equal((await call('/api/laps',payload(first),'b'.repeat(64))).status,403,'Starts are player-bound');
    assert.equal((await call('/api/laps',{...payload(first),nickname:'Other'})).status,403,'Starts are name-bound');
    now+=39000;
    let response=await call('/api/laps',payload(first)),result=await response.json();
    assert.equal(response.status,200);assert.equal(result.moderation,'approved');assert.equal(result.rank,2);
    assert.equal(result.record,false);assert.equal(result.saved,true);
    const fast=await begin();response=await finish(fast,39000);result=await response.json();
    assert.equal(result.rank,1);assert.equal(result.record,true);
    const retryBody=payload(fast,39000);
    now+=600000;
    result=await (await call('/api/laps',retryBody)).json();
    assert.equal(result.saved,false);assert.equal(result.record,false,'Lost responses remain idempotent even after a long delay');
    assert.equal((await call('/api/laps',{...retryBody,lapMs:39500,sectors:[10000,10000,19500]})).status,409);
    const early=await begin();assert.equal((await call('/api/laps',payload(early))).status,422);
    now+=40000;
    assert.equal((await call('/api/laps',payload(early))).status,403,'An early attempt burns the ticket; waiting cannot legalize it');
    const race=await begin();now+=40000;
    const simultaneous=await Promise.all([call('/api/laps',payload(race)),call('/api/laps',payload(race))]);
    const raceResults=await Promise.all(simultaneous.map(r=>r.json()));
    assert.deepEqual(raceResults.map(r=>r.saved).sort(),[false,true]);
    assert.equal(db.prepare('SELECT count(*) n FROM laps WHERE lap_id=?').get(race.lapId).n,1);
    now+=60000;
    const startId=id();const twinStarts=await Promise.all([begin(token,startId),begin(token,startId)]);
    assert.equal(twinStarts[0].lapId,twinStarts[1].lapId,'Concurrent start retries return one ticket');
    for(let i=0;i<10;i++){
      const ticket=await begin();const r=await finish(ticket,36000+i);
      assert.equal(r.status,200,await r.clone().text());
    }
    let top=await board();assert.equal(top.length,10);assert(top.every(r=>r.nickname==='Test Driver'));
    assert.deepEqual(top.map(r=>r.lap_ms),Array.from({length:10},(_,i)=>36000+i));
    assert.equal(top[0].player_hash,undefined);
    const suspicious=await begin();response=await finish(suspicious,30000);result=await response.json();
    assert.equal(response.status,202);assert.equal(result.moderation,'quarantined');assert.equal(result.rank,null);assert.equal(result.record,false);
    const pendingId=db.prepare('SELECT id FROM laps WHERE lap_id=?').get(suspicious.lapId).id;
    assert.equal((await board())[0].lap_ms,36000,'Pending results do not affect rank or records');
    const cheat=await begin();response=await finish(cheat,12345,[4000,4000,4345]);
    assert.equal(response.status,202);
    assert.match(db.prepare('SELECT reason FROM lap_moderation WHERE lap_id=(SELECT id FROM laps WHERE lap_id=?)').get(cheat.lapId).reason,/sector_below_physical_estimate/);
    const late=await begin();now+=90000;response=await call('/api/laps',payload(late));
    assert.equal(response.status,202,'Delayed offline submissions require review');
    const old=await begin();now+=40000;await begin();now+=100;
    assert.equal((await call('/api/laps',payload(old))).status,200,'Next-start/finish request reordering has a bounded grace period');
    const superseded=await begin();now+=40000;await begin();now+=6000;
    assert.equal((await call('/api/laps',payload(superseded))).status,202,'Old unused tickets cannot be stockpiled for public results');
    const paused=await begin();response=await finish(paused,7200000);
    assert.equal(response.status,200,'Long pauses remain eligible when full wall time is counted');
    const expired=await begin();now+=86400001;
    assert([403,410].includes((await call('/api/laps',payload(expired))).status));
    assert.equal((await admin('laps',undefined,'wrong')).status,401);
    assert.equal((await worker.fetch(new Request('https://service.test/api/admin/laps'),{DB:binding})).status,503);
    assert.equal((await admin('laps/moderate',{id:pendingId,state:'approved',reason:'Reviewed'},'wrong')).status,401);
    let pending=await (await admin('laps')).json();assert(pending.results.some(r=>r.id===pendingId));
    assert.equal((await admin('laps/moderate',{id:pendingId,state:'approved',reason:'Reviewed driving time'})).status,200);
    assert.equal((await board())[0].lap_ms,30000,'Admin approval restores ranking');
    assert.equal((await admin('laps/moderate',{id:pendingId,state:'hidden',reason:'Confirmed report'})).status,200);
    assert.equal((await board())[0].lap_ms,36000);
    result=await (await call('/api/laps',payload(suspicious,30000))).json();
    assert.equal(result.moderation,'hidden');assert.equal(result.record,false,'Retry never unhides a moderated lap');
    db.exec(schema);assert.equal((await board())[0].lap_ms,36000);
    assert.equal(db.prepare('SELECT count(*) n FROM lap_moderation_audit WHERE lap_id=?').get(pendingId).n,2);
    assert.equal((await admin('laps/moderate',{id:pendingId,state:'deleted',reason:'Wrong'})).status,400);
    assert.equal((await admin('laps/moderate',{id:999999,state:'hidden',reason:'Missing'})).status,404);
    db.exec('DELETE FROM lap_limits');now+=60000;
    for(let i=0;i<12;i++)assert.equal((await call('/api/laps',{...base})).status,428);
    assert.equal((await call('/api/laps',{...base})).status,429,'Invalid attempts count against the player budget');
    db.exec('DELETE FROM lap_limits');now+=60000;
    for(let i=0;i<60;i++)assert.equal((await call('/api/laps',{...base},id())).status,428);
    assert.equal((await call('/api/laps',{...base},id())).status,429,'Rotating player tokens cannot evade the IP budget');
    const preflight=await worker.fetch(new Request('https://service.test/api/laps/start',{method:'OPTIONS',headers:{Origin:origin}}),env);
    assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
    assert.equal((await (await call('/')).json()).protection,'timed-v1');
    assert.deepEqual(require('../scripts/lap-policy.cjs')().minSectorMs,[3884,3110,5307]);
    console.log('PASS: timed starts, ownership, elapsed time, burned early tickets, concurrent retries, independent laps, quarantine, ranks, moderation authorization/audit, migration and player/IP throttling');
  }finally{Date.now=realNow;db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
