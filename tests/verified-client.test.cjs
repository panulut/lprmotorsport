const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function fixture(){
 const nodes=new Map(),storage=new Map(),requests=[],clients=[];let hidden=false,healthResolve,offline=false;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',dataset:{},disabled:false,handlers:{},append(){},addEventListener(name,fn){this.handlers[name]=fn;}});return nodes.get(id);};
 const identity={nickname:'Driver',token:'a'.repeat(64)};
 const fetch=async(url,options)=>{
  requests.push({url,options});
  if(url.endsWith('/health')){if(offline)throw Error('offline');return new Promise(resolve=>{healthResolve=()=>resolve({ok:true,json:async()=>({revision:'rev',protocol:'driving-v1'})});});}
  if(url.endsWith('/start'))return {ok:true,json:async()=>({ticket:'signed-start'})};
  if(url.endsWith('/laps'))return {ok:true,json:async()=>({protocol:'driving-v1',verified:true,lapMs:90000})};
  return {ok:true,json:async()=>({protocol:'driving-v1',revision:'rev',results:[]})};
 };
 class Client{
  constructor(options){this.options=options;this.active=false;this.tick=0;clients.push(this);}
  async start(){this.active=true;this.options.onUpdate({phase:'ready'});}
  async activate(){}
  async cancel(){this.active=false;}
  enqueue(){} async flush(){}
 }
 const document={get hidden(){return hidden;},querySelector:node,addEventListener(name,fn){this[name]=fn;}};
 const window={LPRVerificationConfig:{service:'service',leaderboard:'board'},LPRDrivingRevision:'rev',LPRLeaderboard:{identity},
  LPRLiveClient:Client,LPRDriving:{encode:i=>i},addEventListener(){}};
 const countdowns=[];let retry;
 const context={window,document,fetch,AbortSignal,console,setInterval(){},setTimeout(fn,ms){if(ms===3000){retry=fn;return null;}countdowns.push(ms);return setImmediate(fn);},clearTimeout(handle){if(handle)clearImmediate(handle);},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../verified-driving.js'),'utf8'),context);
 let starts=0,prepares=0;window.LPRVerifiedDriving.attach({prepare(){prepares++;},start(){starts++;}});
 return {api:window.LPRVerifiedDriving,nodes,node,storage,requests,clients,identity,document,countdowns,
  ready:()=>healthResolve(),retry:()=>retry(),setOffline(value){offline=value;},hide(){hidden=true;document.visibilitychange();},get starts(){return starts;},get prepares(){return prepares;}};
}
const settle=()=>new Promise(r=>setImmediate(r));
(async()=>{
 const a=fixture(),starting=a.api.start();assert(a.api.preparing);
 assert(a.api.waitingForStart,'Initial preparation holds the car until the official start');
 a.hide();a.ready();await starting;
 assert.equal(a.starts,0);assert.equal(a.clients.length,0,'Hiding while waking cannot allocate a new timed session later');
 const b=fixture();
 b.storage.set(`lpr-verified-receipts:${b.identity.token}`,JSON.stringify(['signed-old-lap']));
 b.node('#leaderboard-start-form').handlers.submit();await settle();
 assert(b.requests.some(r=>r.url.endsWith('/laps')&&JSON.parse(r.options.body).receipt==='signed-old-lap'),'Reloaded signed receipts retry after naming, without requiring a new driving session');
 assert.equal(JSON.parse(b.storage.get(`lpr-verified-receipts:${b.identity.token}`)).length,0);
 assert(b.api.preparing,'Confirming the nickname automatically prepares verification');
 assert.equal(b.starts,0,'Driving waits for server readiness');
 b.ready();for(let i=0;i<8;i++)await settle();assert(b.api.active);assert.equal(b.starts,1);
 assert(!b.api.waitingForStart,'The official start releases the car');
 const restart=b.api.start({replace:true});assert(b.api.preparing);assert(!b.clients[0].active,'Restart cancels the previous session');
 b.ready();await restart;assert(b.api.active);assert.equal(b.starts,2,'Restart automatically starts a fresh verified session');
 assert(b.countdowns.includes(1200),'Starts animate the red lights while the server prepares');
 b.api.step([0,0,0,false,false,true],{ticks:1,state:{},stage:0,lap:2},{completed:{lap:1}});
 assert(b.api.active);assert.equal(b.starts,2,'A flying lap keeps the existing session without a new start');
 b.clients[1].options.onLost();
 b.retry();b.ready();for(let i=0;i<8;i++)await settle();
 assert(b.api.active);assert.equal(b.starts,3,'The official drive resumes automatically when the service becomes available');
 assert(b.api.active,'Reconnection releases the car only after actual readiness');
 const state={x:1,y:2,angle:0,vx:0,vy:0,yawRate:0,damage:0};
 b.api.step([0,0,0,false,false,true],{ticks:1,state,stage:0,lap:1},{completed:null});
 b.clients[2].options.onUpdate({ackTick:1,result:{state:{...state,x:100},stage:0,lap:1},laps:[]});
 assert(!b.api.active);assert.match(b.node('#verification-status').textContent,/Harjoittelu/);
 const c=fixture();c.setOffline(true);await c.api.start();
 assert(!c.api.active);assert.match(c.node('#verification-status').textContent,/Harjoittelu/);
 c.setOffline(false);c.retry();c.ready();for(let i=0;i<8;i++)await settle();
 assert(c.api.active,'Starting the service ends practice automatically without pressing restart');
 assert.equal(c.prepares,1,'Background retries do not reset the practice car');
 const d=fixture(),slowStart=d.api.start();
 for(let i=0;i<8;i++)await settle();
 assert(d.api.waitingForStart,'Red lights keep holding the car when the service takes longer than the animation');
 assert.equal(d.node('#start-lights').dataset.phase,'red');
 assert.equal(d.node('#start-lights').hidden,false);
 d.ready();await slowStart;assert(d.api.active);assert(!d.api.waitingForStart);
 console.log('PASS: hidden warmup cancellation, persistent receipt retry without a session, prepared start and authoritative state mismatch fallback');
})().catch(error=>{console.error(error);process.exitCode=1;});
