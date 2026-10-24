const {parentPort}=require('node:worker_threads');
const {createWorld}=require('../scripts/lib/replay-probe.cjs');
const world=createWorld();
parentPort.postMessage({ready:true,result:world.result()});
parentPort.on('message',({id,inputs})=>{
 const start=performance.now(),cpu=process.threadCpuUsage();
 try{
  for(const [gas,brake,steer] of inputs)world.step({gas,brake,steer,analog:true,wheel:true});
  const usage=process.threadCpuUsage(cpu);
  parentPort.postMessage({id,result:world.result(),wallMs:performance.now()-start,cpuMs:(usage.user+usage.system)/1000});
 }catch(error){parentPort.postMessage({id,error:error.message});}
});
