const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const nodes=new Map(),handlers=new Map(),clients=[];
const node=id=>{if(!nodes.has(id))nodes.set(id,{checked:true,value:'test-only',disabled:false,textContent:'',focus(){},getContext:()=>({})});return nodes.get(id);};
let ticks=0;
const world={reset(){ticks=0},step(){ticks++},driver:()=>({gas:1,brake:0,steer:0}),result:()=>({finished:ticks===60,crashed:false,ticks,lapMs:ticks*1000/120}),position:()=>({x:0,y:0,angle:0}),track:[]};
class FakeClient {
 constructor(options){this.options=options;this.active=false;this.sent=[];clients.push(this);}
 async start(){this.active=true;this.options.onUpdate({phase:'ready',ackTick:0});}
 enqueue(input){if(this.active)this.sent.push(input);}
 async flush(final){if(final){this.active=false;this.options.onUpdate({verified:true,ackTick:ticks,seq:0,result:world.result()});}}
 lose(message){this.active=false;this.options.onLost(message);}
 async cancel(){this.active=false;}
}
const context={window:{ReplayLab:{createWorld:()=>world,revision:'test',hz:120},LPRLiveClient:FakeClient,addEventListener(){}},
 document:{hidden:false,querySelector:node,addEventListener:(n,f)=>handlers.set(n,f)},requestAnimationFrame(){},JSON,Blob,URL,setTimeout};
vm.createContext(context);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../experiment/lab.js'),'utf8'),context);
(async()=>{
 const api=context.window.ReplayLabTest;await api.start(true);for(let i=0;i<60;i++)api.step();
 assert.equal(clients[0].sent.length,60);assert.equal(JSON.parse(node('#report').textContent).matches,true);
 assert.match(node('#live-status').textContent,/varmennettu/);assert(node('#verify').disabled,'Streaming finish cannot fall back to the whole-lap endpoint');
 await api.start(true);api.step();context.document.hidden=true;handlers.get('visibilitychange')();
 assert(!clients[1].active);assert.match(node('#live-status').textContent,/Harjoittelu/);
 context.document.hidden=false;node('#streaming').checked=false;await api.start(true);for(let i=0;i<60;i++)api.step();
 assert(!node('#verify').disabled,'Explicit offline practice retains the diagnostic whole-replay check');
 console.log('PASS: UI waits for session, streams inputs, requires server confirmation, cancels hidden driving and separates practice replay');
})().catch(e=>{console.error(e);process.exitCode=1});
