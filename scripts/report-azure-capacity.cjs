// Converts only completed, resource-proven Azure runs into the review document.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {validateProof,assess,SOURCE}=require('./lib/azure-capacity.cjs');
function publish(directory,{document=path.resolve('verification/AZURE-PRODUCTION.md'),status=path.resolve('artifacts/verification/azure-ten-player/status.json')}={}){
 const read=name=>JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));
 const summary=read('summary.json');validateProof(summary.proof);assert.equal(summary.sourceCommit,SOURCE);
 const runs=[1,2,3].map(i=>{const r=read('run-'+i+'.json');assert.equal(r.number,i);assert.equal(r.sourceCommit,SOURCE);assert.equal(r.service,summary.proof.service);assert.equal(r.worker,summary.proof.worker);return {...r,checked:assess(r)};});
 const stop=read('stop-proof.json'),shutdownConfirmed=stop.runningStatus==='Stopped'&&stop.id===summary.proof.id;
 const capacityPassed=runs.every(r=>r.checked.passed),accepted=capacityPassed&&shutdownConfirmed;
 const number=v=>Number.isFinite(v)?v.toFixed(2):'unavailable';
 let text='\n\n## Azure capacity execution '+new Date().toISOString()+'\n\n';
 text+='Source: `'+SOURCE+'`. Test app: `'+summary.proof.name+'`, 0.5 vCPU / 1 GiB, one replica.\n\n';
 text+='| Run | Receipts | ackLag p95 / max ms | Server peak RSS MiB | forcedRecordings | maxReplayQueueMs | replayPack mean / lifetime max ms | Capacity pass |\n';
 text+='| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |\n';
 for(const r of runs)text+='| '+r.number+' | '+r.players.flatMap(p=>p.verifiedLaps).length+'/20 | '+number(r.ackLagMs.p95)+' / '+number(r.ackLagMs.max)+' | '+number(r.serverPeakRssMiB)+' | '+r.forcedRecordings+' | '+number(r.maxReplayQueueMs)+' | '+number(r.replayPackMs?.meanMs)+' / '+number(r.replayPackMs?.maxMsSinceServiceStart)+' | '+r.checked.passed+' |\n';
 text+='\nAll three capacity runs passed: **'+capacityPassed+'**. Test app stop confirmed: **'+shutdownConfirmed+'**. Overall gate: **'+accepted+'**.\n';
 text+='RSS is the server-process lifetime high-water, not client RSS. Replay queue and packing maxima are lifetime values; counts and means use per-run deltas.\n';
 for(const r of runs)if(r.checked.errors.length)text+='\nRun '+r.number+' failed: '+r.checked.errors.join('; ')+'.\n';
 text+='\nRaw evidence: `'+path.relative(path.dirname(document),directory)+'`. Production MAX_VERIFIED_SESSIONS remains 5; no production deployment/capacity change.\n';
 fs.appendFileSync(document,text);
 const state={at:new Date().toISOString(),status:accepted?'completed_passed':'completed_failed',sourceCommit:SOURCE,azureRunsCompleted:3,capacityAllThreePassed:capacityPassed,
  allThreePassed:accepted,shutdownConfirmed,testContainerCreated:true,productionModified:false,productionMaxVerifiedSessions:5,directory:path.relative(process.cwd(),directory)};
 fs.mkdirSync(path.dirname(status),{recursive:true});fs.writeFileSync(status,JSON.stringify(state,null,2)+'\n');return state;
}
module.exports={publish};
if(require.main===module)try{publish(path.resolve(process.argv[2]));}catch{console.error('Azure evidence incomplete; not publishing a passing capacity result. Raw files retained.');process.exitCode=1;}
