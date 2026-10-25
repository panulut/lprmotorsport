const {parentPort}=require('node:worker_threads');
const {createWorld,revision}=require('./world.cjs');
const {world,api}=createWorld();
const recorder=new (require('./replay.cjs').Recorder)(world,revision);
parentPort.postMessage({ready:true,result:world.result()});
parentPort.on('message',({id,inputs})=>{
 const start=performance.now();
 try{
  const laps=[];
  for(const value of inputs){const event=world.step(api.decode(value)),replay=recorder.step(value,event);if(event.completed)laps.push({...event.completed,replay});}
  parentPort.postMessage({id,result:world.result(),laps,wallMs:performance.now()-start});
 }catch(error){parentPort.postMessage({id,error:error.message});}
});
