const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../leaderboard.js'),'utf8');
function setup(storage=new Map(),options={}){
  const nodes=new Map(),calls=[],celebrations=[],handlers=new Map(),identified=[];
  const network={offline:false,finishOffline:false,status:200,statuses:[],...options};
  const node=id=>{
    if(!nodes.has(id)){
      const events=new Map();let text='';
      nodes.set(id,{value:'',children:[],open:false,hidden:false,readOnly:false,
        get textContent(){return text;},set textContent(value){text=value;this.children=[];},
        classList:{add(){},remove(){}},addEventListener:(type,fn)=>events.set(type,fn),
        trigger(type,event={preventDefault(){}}){return events.get(type)?.(event);},
        append(item){this.children.push(item);},setAttribute(){},setCustomValidity(message){this.validationMessage=message;},
        reportValidity(){this.reported=true;},showModal(){this.open=true;},close(){this.open=false;}});
    }
    return nodes.get(id);
  };
  const context={window:{addEventListener:(type,fn)=>handlers.set(type,fn),LPRAnalytics:{identify:name=>identified.push(name)},
    LPRRaceEffects:{celebrate:ms=>celebrations.push(ms)}},crypto:require('node:crypto').webcrypto,AbortSignal,
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
    document:{querySelector:node,createElement:()=>({textContent:''})},
    async fetch(url,request){
      calls.push({url,options:request});
      const finish=url.endsWith('/api/laps'),start=url.endsWith('/api/laps/start');
      if(network.offline||(finish&&network.finishOffline))throw Error('offline');
      const status=finish?(network.statuses.shift()??network.status):start?(network.startStatus??200):200;
      const body=request?.body?JSON.parse(request.body):null;
      return {ok:status>=200&&status<300,status,json:async()=>start?
        {mode:'timed-v1',lapId:body.requestId,startedAt:1,expiresAt:86400001}:
        finish?{mode:'laps',protection:'timed-v1',moderation:'approved',saved:true,rank:2,lapMs:body.lapMs,record:false,...network.result}:
        {version:'lut-20261011-v3',results:Array.from({length:20},(_,i)=>({nickname:i?'Driver '+i:'<script>',lap_ms:12346+i*1000}))}};
    }};
  vm.createContext(context);vm.runInContext(source,context);
  const board=context.window.LPRLeaderboard;
  return {board,node,calls,storage,celebrations,network,handlers,identified,
    login(name='Panu'){node('#leaderboard-name').value=name;node('#leaderboard-start-form').trigger('submit');},
    starts:()=>calls.filter(c=>c.url.endsWith('/api/laps/start')),
    finishes:()=>calls.filter(c=>c.url.endsWith('/api/laps')),
    async lap(ms=40000,sectors=[10000,10000,ms-20000]){await board.startLap();await board.submit(ms,sectors);},
    queue(){return JSON.parse(storage.get('lpr-pending-laps:'+storage.get('lpr-player-token'))??'[]');}};
}
(async()=>{
  const app=setup(),{board,node,storage}=app;
  board.beginSession();await board.refresh();
  assert(node('#settings-dialog').open);assert(board.requiresName);
  assert.equal(node('#leaderboard-list').children.length,10);
  assert.equal(node('#podium-name-1').textContent,'<script>');
  assert.equal(node('#podium-time-1').textContent,'0:12.346');
  assert.equal(node('#leaderboard-list').children[0].textContent,'<script> · 0:12.346');
  let prevented=false;node('#settings-dialog').trigger('cancel',{preventDefault(){prevented=true;}});assert(prevented);
  await app.lap();assert.equal(app.starts().length,0);assert.equal(app.finishes().length,0);
  app.login('   ');assert(board.requiresName);assert(node('#leaderboard-name').reported);assert.deepEqual(app.identified,[]);
  app.login(' Panu ');assert(!board.requiresName);assert(!node('#settings-dialog').open);
  assert.deepEqual(app.identified,['Panu']);assert(node('#leaderboard-name').readOnly);assert(node('#leaderboard-start').hidden);
  const token=storage.get('lpr-player-token');assert.match(token,/^[a-f0-9]{64}$/);
  await app.lap(40000.6,[10000.4,10000.4,19999.8]);
  const post=app.finishes()[0],sent=JSON.parse(post.options.body);
  assert.equal(sent.nickname,'Panu');assert.equal(sent.protocol,'timed-v1');
  assert.equal(sent.lapId,JSON.parse(app.starts()[0].options.body).requestId,'Submission uses the returned server ticket');
  assert.equal(sent.sectors.reduce((a,b)=>a+b,0),sent.lapMs);
  assert.equal(post.options.headers.Authorization,`Bearer ${token}`);
  node('#leaderboard-name').value='Other';await app.lap();
  assert.equal(JSON.parse(app.finishes().at(-1).options.body).nickname,'Panu');
  assert.notEqual(sent.lapId,JSON.parse(app.finishes().at(-1).options.body).lapId);
  const count=app.finishes().length;
  await board.submit(40000,[10000,10000,20000]);assert.equal(app.finishes().length,count,'No retroactive start can be minted at finish');
  await board.startLap();board.cancelLap();await board.submit(40000,[10000,10000,20000]);
  assert.equal(app.finishes().length,count,'Restart discards the active start');
  const reopened=setup(storage);assert(reopened.board.requiresName);assert.equal(reopened.node('#leaderboard-name').value,'Panu');
  reopened.login();assert.equal(storage.get('lpr-player-token'),token);
  const other=setup(storage);other.login('Eve');assert.notEqual(storage.get('lpr-player-token'),token);
  const legacy=setup(new Map([['lpr-nickname','Legacy'],['lpr-player-token','a'.repeat(64)]]));
  legacy.login('Legacy');assert.equal(legacy.storage.get('lpr-player-token:legacy'),'a'.repeat(64));
  const record=setup(new Map(),{result:{rank:1,record:true}});record.login();await record.lap();
  assert.deepEqual(record.celebrations,[40000]);
  for(const moderation of ['quarantined','hidden']){
    const reviewed=setup(new Map(),{status:202,result:{moderation,rank:null,record:false}});
    reviewed.login();await reviewed.lap();
    assert.equal(reviewed.celebrations.length,0);assert.equal(reviewed.queue().length,0);
    assert.match(reviewed.node('#leaderboard-status').textContent,/tarkistusta/);
  }
  const offline=setup(new Map(),{offline:true});offline.login('Offline');
  await offline.lap();assert(!offline.board.requiresName);assert.equal(offline.finishes().length,0);
  assert.match(offline.node('#leaderboard-status').textContent,/vain paikallisesti/);
  offline.network.offline=false;await offline.handlers.get('online')();
  assert.equal(offline.finishes().length,0,'An offline lap is never backdated into a new ticket');
  await offline.lap();assert.equal(offline.finishes().length,1);
  const retry=setup(new Map(),{finishOffline:true});retry.login('Retry');await retry.lap();
  assert.equal(retry.queue().length,1);const queued=retry.finishes()[0].options.body;
  assert.match(retry.node('#leaderboard-status').textContent,/odottaa lähetystä/);
  retry.network.finishOffline=false;await retry.handlers.get('online')();
  assert.equal(retry.finishes().at(-1).options.body,queued);assert.equal(retry.queue().length,0);
  const saved=setup(new Map(),{finishOffline:true});saved.login('Reload');await saved.lap();
  const reload=setup(saved.storage);reload.login('Reload');await reload.handlers.get('online')();
  assert.equal(reload.starts().length,0);assert.equal(reload.finishes().length,1,'Reload retries the original ticket rather than starting again');
  assert.equal(reload.queue().length,0);assert.deepEqual(reload.identified,['Reload']);
  const failure=setup(new Map(),{finishOffline:true});failure.login();await failure.lap();await failure.lap();
  assert.equal(failure.queue().length,2);
  failure.network.finishOffline=false;failure.network.statuses=[409,200];
  await failure.handlers.get('online')();assert.equal(failure.queue().length,0,'A permanently rejected item cannot block the next queued lap');
  const throttled=setup(new Map(),{status:429});throttled.login();await throttled.lap();assert.equal(throttled.queue().length,1);
  throttled.network.status=200;await throttled.handlers.get('online')();assert.equal(throttled.queue().length,0);
  const old=setup(new Map(),{result:{mode:'old'}});old.login();await old.lap();
  assert.match(old.node('#leaderboard-status').textContent,/ei vielä tue/);
  console.log('PASS: required identity, server start/finish hooks, no retrospective tickets, cancellation, moderation, safe rendering, records, per-name identities, offline play, durable retries and terminal/transient queue errors');
})().catch(error=>{console.error(error);process.exitCode=1;});
