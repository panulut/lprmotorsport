const assert=require('node:assert/strict');
const {SOURCE,TEST_WORKER,wrapperHash}=require('../../verification/azure-test-bootstrap.cjs');
const APP='lpr-verification-capacity-test';
function targets(service,worker,{loopback=false}={}){
 const a=new URL(service),b=new URL(worker);
 const local=u=>loopback&&u.protocol==='http:'&&u.hostname==='127.0.0.1';
 for(const u of [a,b])assert(!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/', 'Bare origin required');
 assert(local(a)||(a.protocol==='https:'&&a.hostname.startsWith(APP+'.')&&a.hostname.endsWith('.azurecontainerapps.io')),'Only isolated Azure capacity-test app allowed');
 assert(local(b)||b.origin===TEST_WORKER,'Only the verified TEST Worker is allowed');
 return {service:a.origin,worker:b.origin};
}
function validateProof(p,{loopback=false}={}){
 assert.equal(p.name,APP);assert.match(p.id,/\/resourceGroups\/rg-lpr-prod\/providers\/Microsoft.App\/containerApps\/lpr-verification-capacity-test$/i);
 assert.equal(p.resources.cpu,.5);assert.match(p.resources.memory,/^1(?:\.0)?Gi$/);assert.equal(p.minReplicas,1);assert.equal(p.maxReplicas,1);
 assert.equal(p.activeRevisionsMode,'Single');assert.equal(p.workloadProfileName,'Consumption');
 assert.match(p.image,/@sha256:[a-f0-9]{64}$/);assert.equal(p.commit,SOURCE);assert.equal(p.wrapperHash,wrapperHash);
 const t=targets(p.service,p.worker,{loopback});assert.equal(t.worker,new URL(p.worker).origin);return p;
}
function assess(run){
 const errors=[],need=(ok,message)=>{if(!ok)errors.push(message);};
 need(run.players?.length===10&&run.players.every(p=>p.verifiedLaps?.length===2&&p.verifiedLaps.every(v=>v.signatureValid===true&&v.replayHashValid===true)),'20 verified signed replay receipts required');
 const samples=run.metrics||[],first=samples[0]?.data,last=samples.at(-1)?.data;
 need(samples.length>=3&&samples.some(s=>s.phase==='during'),'Before/during/final server metrics required');
 need(!(run.metricErrors||[]).length,'Server metric collection failed');
 need(first&&last&&samples.every(s=>s.data.capacityTest.instance===first.capacityTest.instance),'Service restarted or changed instance');
 const delta=key=>(last?.counters?.[key]??NaN)-(first?.counters?.[key]??NaN);
 for(const k of ['practiceLaps','lagTerminations','processingTimeouts'])need(delta(k)===0,k+' must remain zero');
 need(delta('verifiedLaps')===20,'Server verifiedLaps delta must equal 20');
 need((last?.invalidations?.replay||0)-(first?.invalidations?.replay||0)===0,'Replay-invalidated sessions detected');
 need(samples.length&&samples.every(s=>s.data.serverMaxRssBytes>0&&s.data.serverMaxRssBytes<800*1048576),'Server RSS high-water must stay below 800 MiB');
 need(Number.isFinite(run.ackLagMs?.max)&&run.ackLagMs.max>=0&&run.ackLagMs.max<1000,'ackLagMs max must be below 1000 ms');
 need(Number.isFinite(run.serverAckLagMaxMsSinceStart)&&run.serverAckLagMaxMsSinceStart<1000,'Server ackLagMs high-water must remain below 1000 ms');
 need(!run.failures?.length,'Client/protocol/receipt failures detected');
 need(last?.activeSessions===0,'Driving sessions did not close');
 need(samples.every(s=>Array.isArray(s.data.workerStats)&&s.data.workerStats.length<=1)&&last?.workerStats?.length===1,'One physics worker and final worker diagnostics required');
 need((last?.timings?.replayPackMs?.count||0)-(first?.timings?.replayPackMs?.count||0)===20,'Twenty replayPackMs observations required');
 need(first?.pool?.limit===1&&first?.pool?.workerHeapMb===256&&first?.maxSessions===10,'Worker/capacity configuration mismatch');
 const queue=(last?.workerStats||[]);
 need(queue.every(w=>w.worlds===0&&w.queued===0&&w.pendingRecordings===0&&!w.packing),'Pending worker work remained after cleanup');
 return {passed:errors.length===0,errors};
}
module.exports={targets,validateProof,assess,SOURCE,TEST_WORKER,APP};
