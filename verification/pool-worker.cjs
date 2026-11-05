const {parentPort}=require('node:worker_threads');
const {createWorldFactory,revision}=require('./world.cjs');
const {Recorder}=require('./replay.cjs');
const factory=createWorldFactory(),sessions=new Map();let queue=[],scheduled=false,packing=false,packScheduled=false,packQueue=[];
const reply=(task,data)=>parentPort.postMessage({requestId:task.requestId,...data});
const error=(task,message,code='physics',status=422)=>reply(task,{error:message,code,status});
function schedule(){if(!scheduled&&queue.length){scheduled=true;setImmediate(runNext);}}
function schedulePack(){if(!packing&&!packScheduled&&packQueue.length){packScheduled=true;setImmediate(packNext);}}
function packNext(){
 packScheduled=false;
 // Physics already admitted to the FIFO always goes first. Serialize at most one
 // finished document per turn, never from Recorder.step() or an input reply.
 if(queue.length){schedulePack();return;}
 const task=packQueue.shift();if(!task)return;
 const s=sessions.get(task.sessionId);if(!s||s.cancelled){schedulePack();return;}
 packing=true;const start=performance.now(),document=task.document;task.document=null;
 Promise.resolve().then(()=>s.recorder.pack(document)).then(replay=>{
  if(!s.cancelled)parentPort.postMessage({packed:true,sessionId:task.sessionId,endTick:task.endTick,replay,replayMs:performance.now()-start});
 }).catch(()=>{
  if(!s.cancelled)parentPort.postMessage({packed:true,sessionId:task.sessionId,endTick:task.endTick,error:'Replay recording failed'});
 }).finally(()=>{s.pending--;packing=false;schedulePack();});
}
function runNext(){
 scheduled=false;const task=queue.shift();if(!task)return;
 const s=sessions.get(task.sessionId);
 if(!s||s.cancelled){error(task,'Verification session closed','session_closed',410);schedule();return;}
 const start=performance.now(),queueMs=start-task.received;
 try{
  if(task.kind==='create'){
   const {world,api}=factory.create();s.world=world;s.api=api;s.recorder=new Recorder(world,revision,{deferPacking:true});s.busy=false;
   reply(task,{result:world.result(),queueMs,live:{track:s.recorder.track,frames:[s.recorder.frame()],inputs:[]}});
  }else{
   const laps=[],frames=[],inputs=[];let physicsMs=0,replayMs=0,lapStartTick=null;
   for(const input of task.inputs){
    inputs.push([s.world.ticks,...input]);
    const before=performance.now(),event=s.world.step(s.api.decode(input));physicsMs+=performance.now()-before;
    if(event.started)lapStartTick=s.world.result().lapStartTick;
    const recordStart=performance.now(),document=s.recorder.step(input,event);replayMs+=performance.now()-recordStart;
    if(s.world.ticks%6===0)frames.push(s.recorder.frames.at(-1));
    if(event.completed){
     laps.push(event.completed);s.pending++;
     packQueue.push({sessionId:task.sessionId,endTick:event.completed.endTick,document});
    }
   }
   const result=s.world.result();s.busy=false;
   reply(task,{result,live:{frames,inputs,...(lapStartTick===null?{}:{lapStartTick})},laps,deferred:true,physicsMs,replayMs,queueMs,wallMs:performance.now()-start});
   schedulePack();
  }
 }catch(e){s.busy=false;error(task,e.message);}
 schedule();
}
parentPort.on('message',task=>{
 if(task.kind==='stats')return reply(task,{worlds:sessions.size,queued:queue.length,queuedRecordings:packQueue.length,pendingRecordings:[...sessions.values()].reduce((n,s)=>n+s.pending,0),packing,busy:[...sessions.values()].filter(s=>s.busy).length});
 if(task.kind==='drop'){
  const s=sessions.get(task.sessionId);if(s){s.cancelled=true;s.world=null;s.api=null;if(s.recorder)s.recorder.world=null;s.recorder=null;}sessions.delete(task.sessionId);
  packQueue=packQueue.filter(queued=>queued.sessionId!==task.sessionId);
  queue=queue.filter(queued=>{if(queued.sessionId!==task.sessionId)return true;error(queued,'Verification session closed','session_closed',410);return false;});
  return reply(task,{dropped:true});
 }
 if(task.kind==='create'){
  if(sessions.has(task.sessionId))return error(task,'Session already exists','conflict',409);
  sessions.set(task.sessionId,{busy:true,cancelled:false,pending:0});
 }else if(task.kind==='inputs'){
  const s=sessions.get(task.sessionId);
  if(!s?.world)return error(task,'Verification session closed','session_closed',410);
  if(s.busy)return error(task,'Previous batch is still being verified','busy',409);
  if(!Array.isArray(task.inputs)||task.inputs.length<1||task.inputs.length>120)return error(task,'Invalid input batch','batch',400);
  s.busy=true;
 }else return error(task,'Unknown worker command','command',400);
 queue.push({...task,received:performance.now()});schedule();
});
parentPort.postMessage({ready:true});
