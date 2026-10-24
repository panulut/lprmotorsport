const {parentPort}=require('node:worker_threads');
const {createWorld}=require('./world.cjs');
const {world,api}=createWorld();
parentPort.postMessage({ready:true,result:world.result()});
parentPort.on('message',({id,inputs})=>{
 const start=performance.now();
 try{
  const laps=[];
  for(const value of inputs){const event=world.step(api.decode(value));if(event.completed)laps.push(event.completed);}
  parentPort.postMessage({id,result:world.result(),laps,wallMs:performance.now()-start});
 }catch(error){parentPort.postMessage({id,error:error.message});}
});
