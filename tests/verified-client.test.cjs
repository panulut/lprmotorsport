const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function fixture(){
 const nodes=new Map(),storage=new Map(),requests=[],clients=[];let hidden=false,healthResolve,offline=false;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',dataset:{},disabled:false,handlers:{},append(){},addEventListener(name,fn){this.handlers[name]=fn;}});return nodes.get(id);};
 const identity={nickname:'Driver',token:'a'.repeat(64)};let startStatus=200,lapStatus=200;const signOuts=[];
 const fetch=async(url,options)=>{
  requests.push({url,options});
  if(url.endsWith('/health')){if(offline)throw Error('offline');return new Promise(resolve=>{healthResolve=()=>resolve({ok:true,json:async()=>({revision:'rev',protocol:'driving-v1'})});});}
  if(url.endsWith('/start'))return startStatus===200?{ok:true,json:async()=>({ticket:'signed-start'})}:{ok:false,status:startStatus,json:async()=>({})};
  if(url.endsWith('/laps')&&lapStatus!==200)return {ok:false,status:lapStatus};
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
 const document={get hidden(){return hidden;},querySelector:node,addEventListener(name,fn){this[name]=fn;},dispatchEvent(){}};
 const window={LPRVerificationConfig:{service:'service',leaderboard:'board'},LPRDrivingRevision:'rev',LPRLeaderboard:{get identity(){return {...identity};},signOut:message=>signOuts.push(message)},
  LPRLiveClient:Client,LPRDriving:{encode:i=>i},addEventListener(){}};
 const countdowns=[];let retry;
 const context={window,document,fetch,AbortSignal,console,Event:class{constructor(type){this.type=type;}},setInterval(){},setTimeout(fn,ms){if(ms===3000){retry=fn;return null;}countdowns.push(ms);return setImmediate(fn);},clearTimeout(handle){if(handle)clearImmediate(handle);},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../verified-driving.js'),'utf8'),context);
 let starts=0,prepares=0;window.LPRVerifiedDriving.attach({prepare(){prepares++;},start(){starts++;}});
 return {api:window.LPRVerifiedDriving,nodes,node,storage,requests,clients,identity,document,countdowns,signOuts,setLapStatus(value){lapStatus=value;},setStartStatus(value){startStatus=value;},
  ready:()=>healthResolve(),retry:()=>retry(),setOffline(value){offline=value;},hide(){hidden=true;document.visibilitychange();},get starts(){return starts;},get prepares(){return prepares;}};
}
const settle=()=>new Promise(r=>setImmediate(r));
(async()=>{
 const guest=fixture();guest.identity.guest=true;
 const guestKey='lpr-verified-guest-receipts:'+guest.identity.token;
 guest.storage.set(guestKey,JSON.stringify([{receipt:'guest-receipt',replay:'guest-replay'}]));
 guest.setLapStatus(503);const guestStart=guest.api.start();guest.ready();await guestStart;await settle();
 const formerGuest={...guest.identity};
 guest.identity.guest=false;guest.identity.nickname='Claimed Driver';
 guest.api.identityPromoted(formerGuest);await settle();
 assert.equal(guest.starts,1,'Promotion never starts a new physics session');assert(guest.api.active);
 assert.equal(guest.storage.has(guestKey),false,'Guest outbox moves only after the account outbox is durable');
 assert.equal(JSON.parse(guest.storage.get('lpr-verified-account-receipts:claimed driver'))[0].receipt,'guest-receipt');
 guest.setLapStatus(200);await guest.api.refresh();await settle();
 assert.equal(JSON.parse(guest.storage.get('lpr-verified-account-receipts:claimed driver')).length,0,'Claimed pending uploads retry with original evidence');
 const recoveredGuest=fixture();const oldGuest={nickname:'Guest',token:recoveredGuest.identity.token,guest:true};
 recoveredGuest.storage.set('lpr-verified-guest-receipts:'+oldGuest.token,JSON.stringify([{receipt:'lost-response-receipt',replay:'lost-response-replay'}]));
 recoveredGuest.api.identityPromoted(oldGuest);await settle();
 assert(recoveredGuest.requests.some(r=>r.url.endsWith('/laps')&&JSON.parse(r.options.body).receipt==='lost-response-receipt'),'Reload after a lost claim response recovers the guest outbox');
 assert.equal(recoveredGuest.starts,0,'Recovering a claim response does not allocate a driving session');
 const expired=fixture(),receiptKey='lpr-verified-account-receipts:driver';
 expired.storage.set(receiptKey,JSON.stringify(['expiry-pending-receipt']));
 expired.setLapStatus(401);expired.api.identityReady();for(let i=0;i<8;i++)await settle();
 assert.equal(expired.signOuts.length,1,'Expired upload asks the player to sign in again');
 assert.deepEqual(JSON.parse(expired.storage.get(receiptKey)),['expiry-pending-receipt'],'Expiry never discards a verified queued lap');
 expired.api.identityCleared();expired.identity.token='b'.repeat(64);expired.setLapStatus(200);
 expired.api.identityReady();for(let i=0;i<8;i++)await settle();
 assert.equal(JSON.parse(expired.storage.get(receiptKey)).length,0,'The same account retries its receipt using a new login session');
 assert(expired.requests.some(r=>r.url.endsWith('/laps')&&r.options.headers.Authorization==='Bearer '+'b'.repeat(64)));
 expired.api.identityCleared();
 const a=fixture(),starting=a.api.start();assert(a.api.preparing);
 assert(a.api.waitingForStart,'Initial preparation holds the car until the official start');
 a.hide();a.ready();await starting;
 assert.equal(a.starts,0);assert.equal(a.clients.length,0,'Hiding while waking cannot allocate a new timed session later');
 const recorded=fixture();
 recorded.storage.set('lpr-verified-account-receipts:driver',JSON.stringify([{receipt:'signed-recorded-lap',replay:'compressed-replay'}]));
 await recorded.api.refresh();await settle();
 assert(recorded.requests.some(r=>r.url.endsWith('/laps')&&JSON.parse(r.options.body).replay==='compressed-replay'),'Recording outbox survives reload and forwards the artifact with its signed receipt');
 const b=fixture();
 b.storage.set(`lpr-verified-account-receipts:${b.identity.nickname.normalize('NFC').toLowerCase()}`,JSON.stringify(['signed-old-lap']));
 b.api.identityReady();await settle();
 assert(b.requests.some(r=>r.url.endsWith('/laps')&&JSON.parse(r.options.body).receipt==='signed-old-lap'),'Reloaded signed receipts retry after signing in, without requiring a new driving session');
 assert.equal(JSON.parse(b.storage.get(`lpr-verified-account-receipts:${b.identity.nickname.normalize('NFC').toLowerCase()}`)).length,0);
 assert(b.api.preparing,'Signing in automatically prepares verification');
 assert.equal(b.starts,0,'Driving waits for server readiness');
 b.ready();for(let i=0;i<8;i++)await settle();assert(b.api.active);assert.equal(b.starts,1);
 assert(!b.api.waitingForStart,'The official start releases the car');
 const restart=b.api.start({replace:true});assert(b.api.preparing);assert(!b.clients[0].active,'Restart cancels the previous session');
 b.ready();await restart;assert(b.api.active);assert.equal(b.starts,2,'Restart automatically starts a fresh verified session');
 assert(b.countdowns.includes(1200),'Starts animate the red lights while the server prepares');
 b.api.step([0,0,0,false,false,true],{ticks:1,state:{},stage:0,lap:2},{completed:{lap:1}});
 assert(b.api.active);assert.equal(b.starts,2,'A flying lap keeps the existing session without a new start');
 b.clients[1].options.onLost('Verification fell too far behind',{code:'lag'});
 assert(!b.api.active,'Verification loss invalidates the official run');
 assert.match(b.node('#verification-status').textContent,/lag/,'Show the actual server failure category');
 await settle();
 assert.equal(b.starts,2,'No automatic restart/teleport after an official run is interrupted');
 const newStart=b.api.start({replace:true});
 b.ready();await newStart;
 assert(b.api.active);assert.equal(b.starts,3,'Only an explicit new start resets the car after verification loss');
 const state={x:1,y:2,angle:0,vx:0,vy:0,yawRate:0,damage:0};
 b.api.step([0,0,0,false,false,true],{ticks:1,state,stage:0,lap:1},{completed:null});
 b.clients[2].options.onUpdate({ackTick:1,result:{state:{...state,x:100},stage:0,lap:1},laps:[]});
 assert(!b.api.active);assert.match(b.node('#verification-status').textContent,/Harjoittelu/);
 assert.equal(b.starts,3,'A physics mismatch cannot automatically reset the car');
 const small=fixture(),smallStart=small.api.start();small.ready();await smallStart;
 const tinyState={x:1234.5678,y:456.7,angle:.12,vx:10,vy:0,yawRate:0,damage:0};
 small.api.step([0,0,0,false,false,true],{ticks:1,state:tinyState,stage:0,lap:1},{completed:null});
 small.clients[0].options.onUpdate({ackTick:1,result:{state:{...tinyState,x:tinyState.x+0.000001},stage:0,lap:1},laps:[]});
 assert(small.api.active,'Tiny cross-runtime numeric rounding must not invalidate the lap');
 small.api.step([0,0,0,false,false,true],{ticks:2,state:tinyState,stage:0,lap:1},{completed:null});
 small.clients[0].options.onUpdate({ackTick:2,result:{state:{...tinyState,x:tinyState.x+0.02},stage:0,lap:1},laps:[]});
 assert(!small.api.active,'Significant position mismatch still rejects official driving');
 assert.equal(small.nodes.get('#verification-status').textContent.includes('state_difference'),true,'UI identifies failure category');
 assert.equal(small.nodes.get('#verification-status').textContent.includes('tick 2'),true,'UI identifies failing tick');
 assert.equal(small.clients.length,1,'Mismatch must not start another server session');
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
 const revoked=fixture();revoked.setStartStatus(401);const revokedStart=revoked.api.start();revoked.ready();await revokedStart;
 assert(!revoked.api.active);assert.equal(revoked.signOuts.length,1,'A rejected account signs the player out instead of retrying');
 assert(!revoked.requests.some(r=>r.url==='service/sessions'),'No verification session is opened without an accepted account');
 const busy=fixture();busy.setStartStatus(503);const busyStart=busy.api.start();busy.ready();await busyStart;
 assert.equal(busy.signOuts.length,0,'Temporary leaderboard errors keep the player signed in');
 const gameSource=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
 const drivingUpdate=gameSource.split('function updateDriving(now) {')[1]?.split('window.LPRVerifiedDriving?.attach(')[0];
 assert(drivingUpdate,'Game exposes an authenticated driving update path');
 assert(!/if\s*\(!window\.LPRVerifiedDriving\.active\)\s*\{?\s*void window\.LPRVerifiedDriving\.start\(/.test(drivingUpdate),
  'A completed lap must not auto-restart a player whose verification dropped');
 // Series tabs: humans by default, a bot login opens the bot table, and tabs switch the request.
 const tabs=fixture();await settle();
 assert(tabs.requests.some(r=>r.url==='board/api/verified/leaderboard?series=human'));
 tabs.identity.series='bot';tabs.api.identityReady();await settle();
 assert.equal(tabs.requests.filter(r=>r.url.includes('/leaderboard?')).at(-1).url,'board/api/verified/leaderboard?series=bot');
 tabs.node('#verified-series-human').handlers.click();await settle();
 assert.equal(tabs.requests.filter(r=>r.url.includes('/leaderboard?')).at(-1).url,'board/api/verified/leaderboard?series=human');
 console.log('PASS: no automatic reset after verification loss, manual restart, receipt retry, prepared start, mismatch fallback and series tabs');
})().catch(error=>{console.error(error);process.exitCode=1;});
