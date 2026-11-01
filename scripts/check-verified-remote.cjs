// Real-clock HTTP clients exercising accounts, verified guests, in-session promotion,
// timing-panel, daily/monthly championship, chat tickets, leaderboard and replays.
// No renderer, signing secrets or production writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomBytes,randomUUID}=require('node:crypto');
const {createWorld,revision}=require('../verification/world.cjs');
const {driver}=require('../tests/helpers-driving.cjs');
const {testURL}=require('./build-staging.cjs');
const LiveClient=require('../experiment/live-client.js');
async function request(base,route,{token,body,method=body?'POST':'GET',origin,timeout=25000}={}){
 const response=await fetch(base+route,{method,headers:{...(origin?{Origin:origin}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(timeout)});
 const raw=await response.text();
 let data=null;
 if(raw){
  try{data=JSON.parse(raw);}catch{
   if(response.ok)throw Object.assign(Error(`${route}: invalid JSON response`),{status:response.status,body:raw.slice(0,200)});
  }
 }
 if(!response.ok){
  const detail=data?.code||data?.error||(raw?raw.replace(/\s+/g,' ').trim().slice(0,120):'request failed');
  throw Object.assign(Error(`${route}: HTTP ${response.status} (${detail})`),{status:response.status,code:data?.code,data});
 }
 return data??{};
}
async function expectFailure(promise,expectedStatus,label){
 let actualStatus=null,actualCode=null;
 try{await promise;}catch(error){actualStatus=error.status;actualCode=error.code||null;}
 assert.equal(actualStatus,expectedStatus,`${label} must fail with HTTP ${expectedStatus}`);
 return {status:actualStatus,code:actualCode};
}
function fixture(){
 const {world,api}=createWorld(),batches=[];let inputs=[],fromTick=0;
 batches.inputs=[];batches.states=new Map();batches.finishes=new Set();
 for(let tick=0;tick<72000&&world.result().lap<3;tick++){
  const input=driver(world),encoded=api.encode(input);inputs.push(encoded);batches.inputs.push(encoded);const event=world.step(input);
  batches.states.set(world.ticks,world.result());if(event.completed)batches.finishes.add(world.ticks);
  if(inputs.length===60||event.completed){batches.push({fromTick,inputs,expected:world.result()});fromTick+=inputs.length;inputs=[];}
 }
 assert.equal(world.result().lap,3,'Fixture must complete a standing and a flying lap');return batches;
}
async function run({
 site,
 count=2,
 output=path.resolve(__dirname,'../artifacts/verification/remote-two-players.json'),
 progress=()=>{},
 allowLoopback=false,
 clock=()=>performance.now(),
 intervalMs=20,
 requestTimeoutMs=25000,
 healthTimeoutMs=90000,
 driveTimeoutMs=null,
 cleanupTimeoutMs=5000,
 maxPromotionHoldMs=1000
}={}){
 assert(Number.isSafeInteger(count)&&count>=1&&count<=16,'Player count must be 1..16');
 const call=(base,route,options={})=>request(base,route,{timeout:requestTimeoutMs,...options});
 const origin=testURL(site,{allowLoopback});
 const report={generatedAt:new Date().toISOString(),site:origin,revision,requestedPlayers:count,
  scope:'Paced Node clients through public HTTPS, signed account/guest/promotion/start/lap/timing-panel/championship/chat-ticket APIs and D1; excludes real browser rendering and human input',
  passed:false,players:[],featureChecks:{guest:{},promotion:{},timingPanel:{},championship:{},chat:{}}};
 const players=[];
 let service=null,leaderboard=null;
 try{
  const manifest=await call(origin,'/staging.json');
  assert.equal(manifest.environment,'staging');assert.equal(manifest.revision,revision,'Test page must match this checkout');
  service=testURL(manifest.service,{allowLoopback});
  leaderboard=testURL(manifest.leaderboard,{allowLoopback});
  report.service=service;report.leaderboard=leaderboard;report.commit=manifest.commit;
  const health=await call(service,'/health',{origin,timeout:healthTimeoutMs});
  assert.equal(health.revision,revision);assert(health.ready&&health.streaming);assert.equal(health.activeSessions,0,'Wait until other testers finish');
  progress({phase:'preparing',revision});
  const batches=fixture(),runId=randomBytes(4).toString('hex');
  report.runId=runId;
  const unauthTiming=await expectFailure(call(leaderboard,'/api/verified/timing-panel?series=human',{origin}),401,'Unauthenticated timing-panel');
  report.featureChecks.timingPanel.unauthenticatedStatus=unauthTiming.status;

  for(let i=0;i<count;i++){
   const isGuest=i===0;
   const nickname=`Net${isGuest?'G':'P'}${runId}${i+1}`;
   const password=randomBytes(24).toString('hex');
   let auth;
   if(isGuest){
    const created=await call(leaderboard,'/api/verified/guest',{origin,body:{nickname,series:'human'}});
    assert.equal(created.guest,true,'First player must start as a verified guest');
    assert.equal(created.nickname,nickname);
    assert.equal(created.series,'human');
    const resumed=await call(leaderboard,'/api/verified/guest',{origin,token:created.token,body:{series:'human'}});
    assert.equal(resumed.guest,true,'Guest token must resume the same guest session');
    assert.equal(resumed.nickname,nickname);
    assert.equal(resumed.token,created.token);
    const [initialPanel,initialChamp,guestChatTicket]=await Promise.all([
     call(leaderboard,'/api/verified/timing-panel?series=human',{origin,token:created.token}),
     call(leaderboard,'/api/verified/championship?series=human',{origin,token:created.token}),
     call(leaderboard,'/api/verified/chat-ticket',{origin,token:created.token,body:{}})
    ]);
    assert.equal(initialPanel.series,'human');
    assert.equal(initialPanel.personalBest,null,'Fresh guest has no personal best before completing a lap');
    assert.equal(initialPanel.rank,null);
    assert.equal(initialChamp.me,null,'Unclaimed guest is not enrolled in championship standings');
    assert.equal(guestChatTicket.nickname,nickname);
    const guestChatPost=await call(service,'/api/chat',{origin,token:guestChatTicket.ticket,body:{text:`Guest start ${runId}`}});
    assert.equal(guestChatPost.message.nickname,`${nickname} (vierailija)`);
    const anonName=`ChatG${runId}`;
    const anonGuestTicket=await call(leaderboard,'/api/verified/guest-chat-ticket',{origin,body:{nickname:anonName}});
    assert.equal(anonGuestTicket.nickname,anonName);
    const anonChatPost=await call(service,'/api/chat',{origin,token:anonGuestTicket.ticket,body:{text:`Anon guest ${runId}`}});
    assert.equal(anonChatPost.message.nickname,`${anonName} (vierailija)`);
    report.featureChecks.guest={nickname,displayNickname:`${nickname} (vierailija)`,resumed:resumed.token===created.token};
    report.featureChecks.chat.guestTicketVerified=true;
    report.featureChecks.chat.anonymousGuestTicketVerified=true;
    auth=created;
   }else{
    auth=await call(leaderboard,'/api/verified/account',{origin,body:{nickname,password,create:true,series:'human'}});
    assert.equal(auth.created,true);
    if(i===1){
     await Promise.all([
      expectFailure(call(leaderboard,'/api/verified/guest',{origin,body:{nickname,series:'human'}}),409,'Guest registration with registered account nickname'),
      expectFailure(call(leaderboard,'/api/verified/guest-chat-ticket',{origin,body:{nickname}}),409,'Guest chat ticket with registered account nickname')
     ]);
     const accountChatTicket=await call(leaderboard,'/api/verified/chat-ticket',{origin,token:auth.token,body:{}});
     assert.equal(accountChatTicket.nickname,nickname);
     const accountChatPost=await call(service,'/api/chat',{origin,token:accountChatTicket.ticket,body:{text:`Account start ${runId}`}});
     assert.equal(accountChatPost.message.nickname,nickname);
     report.featureChecks.chat.accountTicketVerified=true;
     report.featureChecks.chat.takenNicknameRejected=true;
    }
   }
   const {ticket}=await call(leaderboard,'/api/verified/start',{origin,token:auth.token,body:{revision}});
   const responseTimes=[];
   const client=new LiveClient({base:service,revision,ticket,armed:true,fetch:async(url,options={})=>{
    const before=clock();const response=await fetch(url,{...options,headers:{...options.headers,Origin:origin},signal:AbortSignal.timeout(requestTimeoutMs)});
    if(url.endsWith('/inputs'))responseTimes.push({ms:clock()-before,status:response.status});return response;
   }});
   const session=await client.start();
   players.push({nickname,password,isGuest,promoted:false,account:auth,session,client,responseTimes,savedLaps:[]});
   report.testAccounts=players.map(player=>player.nickname);
  }
  assert.equal((await call(service,'/health',{origin})).activeSessions,count);
  report.rejectionChecks=[];
  const probe=players[0],route=`/sessions/${probe.session.id}/inputs`;
  for(const [name,token,body,status] of [
   ['wrong-owner','invalid-token',{revision},401],
   ['wrong-revision',probe.session.sessionToken,{revision:'0'.repeat(64)},409],
   ['invalid-controls',probe.session.sessionToken,{revision,seq:0,fromTick:0,inputs:[[2,0,0,false,false,false]]},400]
  ]){
   const result=await expectFailure(call(service,route,{origin,token,body}),status,name);
   report.rejectionChecks.push({name,status:result.status});
  }
  report.startedAt=new Date().toISOString();
  progress({phase:'running',players:players.map(p=>p.nickname)});
  const outcomes=await Promise.allSettled(players.map(async p=>{
   const {client}=p,saves=[],latencies=[],completed=[];let timer,deadline,started,enqueued=0,maxAckLagMs=0,acks=0,recoveries=0;
   let resolve,reject;const finished=new Promise((yes,no)=>{resolve=yes;reject=no;});finished.catch(()=>{});
   let promotionDone=Promise.resolve(),promotionInFlight=false,holdStartedRealMs=null;
   client.onLost=(message,details)=>reject(Error(p.nickname+': '+message+' ('+(details.code||'unknown')+')'));
   client.onUpdate=ack=>{
    if(ack.phase==='recovering')recoveries++;
    if(!ack.result||ack.seq===undefined)return;
    try{
     acks++;assert.deepEqual(ack.result,batches.states.get(ack.ackTick),'Server world equals local fixture');
     const lag=ack.serverElapsedMs-ack.ackTick*1000/120;maxAckLagMs=Math.max(maxAckLagMs,lag);
     latencies.push(lag);
     assert.equal(ack.eligibility.eligible,true,`The run lost eligibility at tick ${ack.ackTick}; arrival lag ${ack.eligibility.lagMs.toFixed(1)} ms, ack lag ${lag.toFixed(1)} ms`);assert.deepEqual(ack.practiceLaps,[]);
     for(const lap of ack.laps||[]){
      assert(lap.replay&&lap.receipt,'A verified lap must include its signed recording');completed.push(lap.lap.lap);progress({phase:'lap',nickname:p.nickname,lap:lap.lap.lap});
      if(p.isGuest&&lap.lap.lap===1){
       const guestDisplay=`${p.nickname} (vierailija)`;
       const guestToken=p.account.token;
       promotionInFlight=true;
       promotionDone=(async()=>{
        try{
         const lap1Save=await call(leaderboard,'/api/verified/laps',{origin,token:guestToken,body:{receipt:lap.receipt,replay:lap.replay}});
         assert(lap1Save.verified&&lap1Save.saved,'Guest standing lap must be verified and saved');
         p.savedLaps.push(lap.lap.lap);
         const [guestPanel,guestBoard,preChamp]=await Promise.all([
          call(leaderboard,'/api/verified/timing-panel?series=human',{origin,token:guestToken}),
          call(leaderboard,'/api/verified/leaderboard?series=human',{origin}),
          call(leaderboard,'/api/verified/championship?series=human',{origin,token:guestToken}),
          expectFailure(call(leaderboard,'/api/verified/account',{origin,token:guestToken,body:{nickname:p.nickname,password:p.password,create:true,series:'bot'}}),409,'Guest promotion with mismatched series')
         ]);
         assert(guestPanel.personalBest,'Guest timing-panel must return personalBest after Lap 1');
         assert.equal(guestPanel.personalBest.nickname,guestDisplay,'Guest personalBest must carry (vierailija) suffix');
         assert(Number.isSafeInteger(guestPanel.rank)&&guestPanel.rank>=1);
         assert(guestPanel.personalBest.replay,'Guest personalBest must expose replay pointer');
         if(guestPanel.rank<=10){
          const guestRow=guestBoard.results.find(row=>row.session_id===p.session.id&&row.lap===1);
          assert(guestRow,'Top-10 guest lap must appear on public leaderboard');
          assert.equal(guestRow.nickname,guestDisplay);
         }
         assert.equal(preChamp.me,null,'Unclaimed guest lap must not appear in championship personal summary');
         assert(!preChamp.fastest.some(row=>row.nickname===guestDisplay||row.nickname===p.nickname),'Unclaimed guest lap must not enter championship standings');
         assert(client.active&&client.tick<batches.inputs.length,'Guest promotion must occur while the active drive is still running Lap 2');
         const promoted=await call(leaderboard,'/api/verified/account',{origin,token:guestToken,body:{nickname:p.nickname,password:p.password,create:true,series:'human'}});
         assert.equal(promoted.claimed,true,'Guest promotion must succeed during active session');
         assert.equal(promoted.created,true);
         assert.equal(promoted.guest,false);
         assert.equal(promoted.nickname,p.nickname);
         assert.equal(promoted.token,guestToken,'Guest promotion must preserve the active session bearer token');
         const [idempotent,liveStatus,promotedPanel,midChamp]=await Promise.all([
          call(leaderboard,'/api/verified/account',{origin,token:guestToken,body:{nickname:p.nickname,password:p.password,create:true,series:'human'}}),
          call(service,`/sessions/${p.session.id}`,{origin,token:p.session.sessionToken}),
          call(leaderboard,'/api/verified/timing-panel?series=human',{origin,token:promoted.token}),
          call(leaderboard,'/api/verified/championship?series=human',{origin,token:promoted.token})
         ]);
         assert.equal(idempotent.claimed,true,'Repeated promotion with same token and credentials must be idempotent');
         assert.equal(idempotent.guest,false);
         assert.equal(idempotent.token,guestToken);
         assert.equal(liveStatus.phase,'running','Verification session must remain running across guest-to-account promotion');
         p.account=promoted;
         p.promoted=true;
         assert(promotedPanel.personalBest);
         assert.equal(promotedPanel.personalBest.nickname,p.nickname,'Promoted timing-panel must immediately drop (vierailija) suffix');
         assert(midChamp.me,'Promoted driver must receive championship personal summary');
         assert.equal(midChamp.me.todayLaps,1,'Open-day guest lap must be retroactively enrolled into championship on promotion');
         assert(midChamp.me.selectedDay.points>0,'Promoted driver must earn open-day championship points for Lap 1');
         report.featureChecks.promotion={
          nickname:p.nickname,
          promotedDuringActiveDrive:true,
          sessionPhaseDuringPromotion:liveStatus.phase,
          tokenPreserved:promoted.token===guestToken&&idempotent.token===guestToken,
          backfilledTodayLaps:midChamp.me.todayLaps
         };
        }finally{
         promotionInFlight=false;
        }
       })();
       promotionDone.catch(reject);
       saves.push(promotionDone);
      }else{
       const pending=promotionDone.then(()=>call(leaderboard,'/api/verified/laps',{origin,token:p.account.token,body:{receipt:lap.receipt,replay:lap.replay}})).then(async result=>{
        assert(result.verified&&result.saved);p.savedLaps.push(lap.lap.lap);
        if(p.isGuest&&lap.lap.lap===2){
         const dup=await call(leaderboard,'/api/verified/laps',{origin,token:p.account.token,body:{receipt:lap.receipt,replay:lap.replay}});
         assert.equal(dup.verified,true);
         assert.equal(dup.saved,false,'Duplicate verified lap submission must be idempotent');
        }
       });
       pending.catch(reject);saves.push(pending);
      }
     }
     if(ack.ackTick===batches.inputs.length)resolve();
    }catch(error){reject(error);}
   };
   try{
    await client.activate();started=clock();
    const timeoutMs=driveTimeoutMs??(batches.inputs.length*1000/120+45000);
    deadline=setTimeout(()=>reject(Error('Remote load test timed out')),timeoutMs);
    timer=setInterval(()=>{
     let target=Math.min(batches.inputs.length,Math.floor((clock()-started)*120/1000));
     if(promotionInFlight&&target>batches.inputs.length-60){
      if(holdStartedRealMs===null)holdStartedRealMs=performance.now();
      if(performance.now()-holdStartedRealMs<maxPromotionHoldMs)target=batches.inputs.length-60;
     }
     while(client.active&&enqueued<target){client.enqueue(batches.inputs[enqueued++]);if(batches.finishes.has(enqueued))void client.flush(true).catch(reject);}
    },intervalMs);
    await finished;await Promise.all(saves);assert.deepEqual(completed,[1,2]);latencies.sort((a,b)=>a-b);
    const responseMs=p.responseTimes.map(x=>x.ms).sort((a,b)=>a-b);
    return {nickname:p.nickname,promotedFromGuest:p.promoted,sessionId:p.session.id,completedLaps:completed,elapsedMs:clock()-started,batches:acks,recoveries,httpErrors:p.responseTimes.filter(x=>x.status!==200).length,responseP95Ms:responseMs[Math.ceil(responseMs.length*.95)-1],ackLagP50Ms:latencies[Math.ceil(latencies.length*.5)-1],ackLagP95Ms:latencies[Math.ceil(latencies.length*.95)-1],ackLagP99Ms:latencies[Math.ceil(latencies.length*.99)-1],maxAckLagMs};
   }finally{clearInterval(timer);clearTimeout(deadline);await client.cancel();}
  }));
  report.players=outcomes.filter(result=>result.status==='fulfilled').map(result=>result.value);
  report.savedLaps=players.map(p=>({nickname:p.nickname,promotedFromGuest:p.promoted,laps:p.savedLaps}));
  report.finishedAt=new Date().toISOString();
  report.failures=outcomes.flatMap((result,i)=>result.status==='rejected'?[{nickname:players[i].nickname,error:result.reason.message}]:[]);
  const failed=outcomes.find(result=>result.status==='rejected');if(failed)throw failed.reason;

  const promotedPlayer=players[0];
  assert.equal(promotedPlayer.promoted,true,'First player must have completed guest-to-account promotion');
  const promotedChatTicket=await call(leaderboard,'/api/verified/chat-ticket',{origin,token:promotedPlayer.account.token,body:{}});
  assert.equal(promotedChatTicket.nickname,promotedPlayer.nickname,'Promoted account chat ticket must use clean account nickname');
  const promotedChatPost=await call(service,'/api/chat',{origin,token:promotedChatTicket.ticket,body:{text:`Promoted finish ${runId}`}});
  assert.equal(promotedChatPost.message.nickname,promotedPlayer.nickname);
  const [,chatHistory,presence]=await Promise.all([
   expectFailure(call(leaderboard,'/api/verified/guest-chat-ticket',{origin,body:{nickname:promotedPlayer.nickname}}),409,'Guest chat ticket for newly promoted nickname'),
   call(service,'/api/chat',{origin}),
   call(service,`/api/chat/presence?visitor=${randomUUID()}`,{origin})
  ]);
  assert(Array.isArray(chatHistory.messages)&&chatHistory.messages.some(m=>m.nickname===`${promotedPlayer.nickname} (vierailija)`));
  assert(chatHistory.messages.some(m=>m.nickname===promotedPlayer.nickname));
  assert(Number.isSafeInteger(presence.onlineCount)&&presence.onlineCount>=1);
  report.featureChecks.chat.promotedTicketVerified=true;
  report.featureChecks.chat.onlineCount=presence.onlineCount;

  for(const p of players){
   const [panel,champ]=await Promise.all([
    call(leaderboard,'/api/verified/timing-panel?series=human',{origin,token:p.account.token}),
    call(leaderboard,'/api/verified/championship?series=human',{origin,token:p.account.token})
   ]);
   assert.equal(panel.series,'human');
   assert(panel.personalBest&&panel.trackBest,'Timing panel must include personalBest and trackBest after completing laps');
   assert.equal(panel.personalBest.nickname,p.nickname,'Timing panel personalBest must match account nickname without guest suffix');
   assert(Number.isSafeInteger(panel.rank)&&panel.rank>=1);
   assert(Array.isArray(panel.personalBest.sectors)&&panel.personalBest.sectors.length===3,'Timing panel personalBest must include 3 sector splits');
   assert(panel.personalBest.replay,'Timing panel personalBest must include replay descriptor');

   assert.equal(champ.series,'human');
   assert.equal(champ.timeZone,'Europe/Helsinki');
   assert(Array.isArray(champ.scoring?.speed)&&Array.isArray(champ.scoring?.volume));
   assert(champ.me,'Authenticated account must receive championship personal standing');
   assert.equal(champ.me.todayLaps,2,`Driver ${p.nickname} must have 2 counted laps today`);
   assert(champ.me.selectedDay&&champ.me.selectedDay.points>0,'Driver must have positive daily championship points');
   assert(Array.isArray(champ.monthly));
  }
  const [publicChamp,pastChamp,board]=await Promise.all([
   call(leaderboard,'/api/verified/championship?series=human',{origin}),
   call(leaderboard,'/api/verified/championship?series=human&day=2026-01-01',{origin}),
   call(leaderboard,'/api/verified/leaderboard?series=human',{origin})
  ]);
  assert.equal(publicChamp.me,null,'Unauthenticated championship query must omit personal summary');
  assert.equal(pastChamp.day,'2026-01-01');
  assert.equal(pastChamp.final,true,'Past championship day must be marked final');
  report.featureChecks.timingPanel.verifiedPlayers=players.length;
  report.featureChecks.championship={
   day:publicChamp.today,
   month:publicChamp.month,
   fastestCount:publicChamp.fastest.length,
   monthlyCount:publicChamp.monthly.length,
   pastDayFinalVerified:pastChamp.final
  };

  assert(!board.results.some(row=>row.nickname===`${promotedPlayer.nickname} (vierailija)`),'Promoted player must not retain (vierailija) suffix on leaderboard');
  for(const p of report.players){
   const rows=board.results.filter(row=>row.session_id===p.sessionId);
   // The public leaderboard is capped at ten rows; saved lap acknowledgements
   // above verify every submission even when this run has more than ten laps.
   assert(rows.length<=2,'No duplicate test laps on public leaderboard');
   for(const row of rows){
    assert.equal(row.nickname,p.nickname);
    const replay=await call(leaderboard,`/api/verified/replays/${row.session_id}/${row.lap}`,{origin});
    assert.equal(replay.format,'lpr-replay-v1');
    assert.equal(replay.sceneRevision,revision);
   }
  }
  report.passed=true;return report;
 }catch(error){report.error=error.message;throw error;}
 finally{
  await Promise.all(players.map(async p=>{
   if(service&&p.session?.id)try{await request(service,`/sessions/${p.session.id}`,{origin,token:p.session.sessionToken,method:'DELETE',timeout:cleanupTimeoutMs});}catch{}
   if(leaderboard&&p.account?.token)try{await request(leaderboard,'/api/verified/logout',{origin,token:p.account.token,method:'POST',timeout:cleanupTimeoutMs});}catch{}
  }));
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 }
}
module.exports={run,fixture,request};
if(require.main===module)run({site:process.env.LPR_TEST_SITE_URL,count:Number(process.env.LPR_TEST_PLAYERS||2),output:process.env.LPR_TEST_REPORT||path.resolve(__dirname,'../artifacts/verification/remote-two-players.json'),progress:event=>console.log(JSON.stringify(event))}).then(report=>console.log(JSON.stringify(report,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
