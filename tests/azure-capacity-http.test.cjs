// Synthetic transport smoke: exercises all three runs and redaction, not capacity.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomBytes}=require('node:crypto'),{gzipSync}=require('node:zlib');
const {runOne}=require('../scripts/measure-azure-capacity.cjs');
const {SOURCE,TEST_WORKER,wrapperHash}=require('../verification/azure-test-bootstrap.cjs'),{revision}=require('../verification/world.cjs');
(async()=>{
 const {sign,verify,hash}=await import('../verification/protocol.mjs'),secret='http-smoke-test-key-'.repeat(4),metricsToken='http-smoke-metrics-'.repeat(4);
 const accounts=new Map(),sessions=new Map(),forbiddenArtifacts=[],directory=fs.mkdtempSync(path.join(os.tmpdir(),'azure-capacity-smoke-'));
 let verifiedLaps=0;
 const snapshot={ticks:60,lap:3,state:{x:0}},source={inputs:Array(60).fill([0,0,0,false,false,true]),states:new Map([[60,snapshot]]),finishes:[30,60]};
 const server=http.createServer(async(req,res)=>{
  try{
   const chunks=[];for await(const c of req)chunks.push(c);const data=chunks.length?JSON.parse(Buffer.concat(chunks)):{};
   const url=new URL(req.url,'http://local'),token=req.headers.authorization?.replace('Bearer ','');
   const reply=(value,code=200)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
   if(url.pathname==='/api/verified/leaderboard')return reply({revision,protocol:'driving-v1'});
   if(url.pathname==='/api/verified/account'){
    const t=randomBytes(32).toString('hex'),p={nickname:data.nickname,playerHash:randomBytes(32).toString('hex')};accounts.set(t,p);forbiddenArtifacts.push(t,data.password);return reply({token:t});
   }
   if(url.pathname==='/api/verified/start'){const ticket=await sign({kind:'start',revision,...accounts.get(token)},secret);forbiddenArtifacts.push(ticket);return reply({ticket});}
   if(url.pathname==='/api/verified/logout'){accounts.delete(token);return reply({signedOut:true});}
   const capacityTest={sourceCommit:SOURCE,wrapperHash,workerURL:TEST_WORKER,instance:'synthetic-test'};
   if(url.pathname==='/health')return reply({commit:SOURCE,revision,maxSessions:10,lapLagMs:2000,activeSessions:sessions.size,capacityTest});
   if(url.pathname==='/metrics'){
    if(token!==metricsToken)return reply({},401);
    return reply({capacityTest,activeSessions:sessions.size,maxSessions:10,pool:{limit:1,workerHeapMb:256},memoryBytes:{rss:100*1048576},serverMaxRssBytes:200*1048576,
     invalidations:{},counters:{verifiedLaps,practiceLaps:0,lagTerminations:0,processingTimeouts:0},
     workerStats:[{worlds:sessions.size,queued:0,pendingRecordings:0,packing:false,forcedRecordings:verifiedLaps,maxReplayQueueMs:10}],
     timings:{ackLagMs:{maxMs:50},replayPackMs:{count:verifiedLaps,sumMs:verifiedLaps*10,maxMs:10,buckets:Array(16).fill(0)}}});
   }
   if(url.pathname==='/sessions'){
    const claims=await verify(data.ticket,secret),id=randomBytes(16).toString('hex'),sessionToken=randomBytes(32).toString('hex');
    forbiddenArtifacts.push(sessionToken);sessions.set(id,{claims,sessionToken,laps:[]});return reply({id,sessionToken});
   }
   const match=url.pathname.match(/^\/sessions\/([^/]+)(\/.*)?$/),s=match&&sessions.get(match[1]);
   if(!s||token!==s.sessionToken)return reply({},401);
   if(req.method==='DELETE'){sessions.delete(match[1]);return reply({cancelled:true});}
   if(match[2]==='/start')return reply({phase:'running',ackTick:0});
   if(match[2]==='/inputs'){
    assert.equal(data.seq,0);assert.equal(data.fromTick,0);assert.equal(data.inputs.length,60);
    for(let lap=1;lap<=2;lap++){
     const boundary={lap,startTick:(lap-1)*30,endTick:lap*30,lapTicks:30};
     const replay=gzipSync(JSON.stringify({sceneRevision:revision,startTick:boundary.startTick,endTick:boundary.endTick})).toString('base64');
     s.laps.push({lap:boundary,replay,receipt:await sign({kind:'lap',protocol:'driving-v1',revision,sessionId:match[1],playerHash:s.claims.playerHash,...boundary,replayHash:await hash(replay)},secret)});
    }
    verifiedLaps+=2;return reply({seq:0,ackTick:60,result:snapshot,serverElapsedMs:550,eligibility:{eligible:true},practiceLaps:[],laps:s.laps.slice(0,1)});
   }
   if(match[2]==='/laps')return reply({laps:s.laps});
   return reply({},404);
  }catch(e){res.writeHead(500);res.end('{}');}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  for(let number=1;number<=3;number++){
   const output=path.join(directory,'run-'+number+'.json'),r=await runOne({service:base,worker:base,secret,metricsToken,source,number,output,metricsIntervalMs:50});
   assert.equal(r.passed,true,JSON.stringify(r.acceptanceErrors));assert.equal(r.players.flatMap(p=>p.verifiedLaps).length,20);assert.equal(r.replayPackMs.count,20);
   assert.equal(r.forcedRecordings,20);assert(r.metrics.some(s=>s.phase==='during'));assert.equal(sessions.size,0);assert.equal(accounts.size,0);
   const saved=fs.readFileSync(output,'utf8');for(const value of [secret,metricsToken,...forbiddenArtifacts])assert(!saved.includes(value),'Raw report must not contain credentials');
  }
  console.log('PASS: three synthetic HTTP runs, independent clients, TEST tickets, delayed final receipts, metric deltas/sampling, signature/hash checks, cleanup and credential-free raw reports (not a capacity test)');
 }finally{await new Promise(r=>server.close(r));fs.rmSync(directory,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
