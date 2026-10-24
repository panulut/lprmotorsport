const {parentPort,workerData}=require('node:worker_threads');
const {performance}=require('node:perf_hooks');
const {createWorld,replayLap}=require('../scripts/lib/replay-probe.cjs');
const cpu=process.threadCpuUsage(),start=performance.now();
try{const result=replayLap(createWorld(),workerData),usage=process.threadCpuUsage(cpu);
  parentPort.postMessage({result,wallMs:performance.now()-start,cpuMs:(usage.user+usage.system)/1000});}
catch(error){parentPort.postMessage({error:error.message});}
