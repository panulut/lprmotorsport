const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),nodeCrypto=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../leaderboard.js'),'utf8');
const formatterSource=fs.readFileSync(path.join(__dirname,'../formatters.js'),'utf8');
// One fake account server shared by every page load, like the real Worker.
const serverAccounts=new Map(),accountCalls=[];
function accountReply(body){
  const key=body.nickname.normalize('NFC').toLowerCase(),existing=serverAccounts.get(key);
  if(existing){
    if(body.create===true)return {status:409};
    if(existing.password!==body.password)return {status:401};
    return {status:200,data:{nickname:existing.nickname,token:existing.token,expiresAt:Date.now()+7*86400000,created:false,series:existing.series}};
  }
  if(body.create!==true)return {status:404};
  const account={nickname:body.nickname,password:body.password,series:body.series,token:nodeCrypto.createHash('sha256').update('account:'+key).digest('hex')};
  serverAccounts.set(key,account);
  return {status:201,data:{nickname:account.nickname,token:account.token,expiresAt:Date.now()+7*86400000,created:true,series:account.series}};
}
function setup(storage=new Map(),options={}){
  const nodes=new Map(),calls=[],celebrations=[],handlers=new Map(),identified=[],dispatched=[];
  const network={offline:false,finishOffline:false,status:200,statuses:[],...options};
  const node=id=>{
    if(!nodes.has(id)){
      const events=new Map();let text='';
      nodes.set(id,{value:id.endsWith('-series-human')?'human':id.endsWith('-series-bot')?'bot':'',checked:id==='#leaderboard-guest-series-human',children:[],open:false,hidden:false,readOnly:false,
        get textContent(){return text;},set textContent(value){text=value;this.children=[];},
        classList:{add(){},remove(){}},addEventListener:(type,fn)=>events.set(type,fn),
        trigger(type,event={preventDefault(){}}){return events.get(type)?.(event);},
        append(item){this.children.push(item);},focus(){},setAttribute(){},setCustomValidity(message){this.validationMessage=message;},
        reportValidity(){this.reported=true;},showModal(){this.open=true;},close(){this.open=false;}});
    }
    return nodes.get(id);
  };
  const context={Event:class{constructor(type){this.type=type;}},CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},MutationObserver:class{constructor(callback){this.callback=callback;}observe(){}},window:{addEventListener:(type,fn)=>handlers.set(type,fn),LPRAnalytics:{identify:name=>identified.push(name)},
    LPRVerificationConfig:{leaderboard:'https://verified.test'},LPRRaceEffects:{celebrate:ms=>celebrations.push(ms)}},crypto:require('node:crypto').webcrypto,AbortSignal,
    setInterval(){},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    document:{querySelector:selector=>selector==='input[name="guest-series"]:checked'?
      (node('#leaderboard-guest-series-human').checked?node('#leaderboard-guest-series-human'):node('#leaderboard-guest-series-bot').checked?node('#leaderboard-guest-series-bot'):null):node(selector),dispatchEvent:event=>dispatched.push(event),createElement:()=>({textContent:'',append(...items){this.textContent+=items.map(item=>item.textContent).join('');}})},
    async fetch(url,request){
      calls.push({url,options:request});
      if(url==='https://verified.test/api/verified/guest'){
        const body=JSON.parse(request.body);
        if(network.accountOffline)throw Error('offline');
        return {ok:true,status:201,json:async()=>({nickname:body.nickname,series:body.series,token:'e'.repeat(64),expiresAt:Date.now()+86400000,guest:true})};
      }
      if(url==='https://verified.test/api/verified/account'){
        accountCalls.push(JSON.parse(request.body));
        if(network.accountOffline)throw Error('offline');
        const {status,data}=accountReply(JSON.parse(request.body));
        return {ok:status>=200&&status<300,status,json:async()=>data};
      }
      if(url==='https://verified.test/api/verified/logout'){
        if(network.logoutOffline)throw Error('offline');
        return {ok:true,status:200,json:async()=>({signedOut:true})};
      }
      const finish=url.endsWith('/api/laps'),start=url.endsWith('/api/laps/start');
      if(network.offline||(finish&&network.finishOffline))throw Error('offline');
      const status=finish?(network.statuses.shift()??network.status):start?(network.startStatus??200):200;
      const body=request?.body?JSON.parse(request.body):null;
      return {ok:status>=200&&status<300,status,json:async()=>start?
        {mode:'timed-v1',lapId:body.requestId,startedAt:1,expiresAt:86400001}:
        finish?{mode:'laps',protection:'timed-v1',moderation:'approved',saved:true,rank:2,lapMs:body.lapMs,record:false,...network.result}:
        {version:'lut-20261024-v4',results:Array.from({length:20},(_,i)=>({nickname:i?'Driver '+i:'<script>',lap_ms:12346+i*1000}))}};
    }};
  vm.createContext(context);vm.runInContext(formatterSource,context);vm.runInContext(source,context);
  const board=context.window.LPRLeaderboard;
  return {board,node,calls,storage,celebrations,network,handlers,identified,dispatched,
    // Select the explicit sign-in or account-creation flow.
    async login(name='Panu',password='salasana',series='human'){
      const creating=!storage.get('lpr-account')&&!serverAccounts.has(name.trim().normalize('NFC').toLowerCase());
      if(!storage.get('lpr-account'))node(creating?'#leaderboard-create':'#leaderboard-login').trigger('click');
      node('#leaderboard-name').value=name;node('#leaderboard-password').value=password;
      await node('#leaderboard-start-form').trigger('submit');
      if(creating&&!node('#leaderboard-series-step').hidden)await this.chooseSeries(series);
    },
    async chooseSeries(series){
      const choice=node('#leaderboard-series-'+series);choice.value=series;choice.checked=true;choice.trigger('change');
      await node('#leaderboard-start-form').trigger('submit');
    },
    account:()=>JSON.parse(storage.get('lpr-account')??'null'),
    starts:()=>calls.filter(c=>c.url.endsWith('/api/laps/start')),
    finishes:()=>calls.filter(c=>c.url.endsWith('/api/laps')),
    async lap(ms=40000,sectors=[10000,10000,ms-20000]){await board.startLap();await board.submit(ms,sectors);},
    queue(){return JSON.parse(storage.get('lpr-pending-laps:'+JSON.parse(storage.get('lpr-account')).token)??'[]');}};
}
(async()=>{
  const app=setup(),{board,node,storage}=app;
  board.beginSession();await board.refresh();
  assert(node('#settings-dialog').open);assert(board.requiresName);
  assert.equal(node('#leaderboard-account-fields').hidden,true,'Start menu hides credentials until a flow is selected');
  assert.equal(node('#leaderboard-choices').hidden,false);
  assert.equal(node('#leaderboard-list').children.length,10);
  assert.equal(node('#leaderboard-list').children[0].textContent,'<script> · 00:12.346');
  let prevented=false;node('#settings-dialog').trigger('cancel',{preventDefault(){prevented=true;}});assert(prevented);
  await app.lap();assert.equal(app.starts().length,0);assert.equal(app.finishes().length,0);
  node('#leaderboard-name').value='Panu';node('#leaderboard-start-form').trigger('submit');
  assert(board.requiresName,'Leaderboard entry still requires a password');assert.equal(board.identity,null);assert.deepEqual(app.identified,[]);
  await app.login('   ');assert(board.requiresName);assert(node('#leaderboard-name').reported);assert.deepEqual(app.identified,[]);
  node('#leaderboard-back').trigger('click');
  assert(node('#leaderboard-account-fields').hidden);
  node('#leaderboard-login').trigger('click');
  node('#leaderboard-password').value='1234567';node('#leaderboard-name').value='Panu';await node('#leaderboard-start-form').trigger('submit');
  assert(board.requiresName);assert(node('#leaderboard-password').reported,'Short passwords are rejected before contacting the server');assert.equal(accountCalls.length,0);
  node('#leaderboard-password').value='salasana';node('#leaderboard-name').value=' Panu ';await node('#leaderboard-start-form').trigger('submit');
  assert(board.requiresName,'A free nickname is never claimed without confirmation');
  assert.equal(node('#leaderboard-start-label').textContent,'Kirjaudu sisään');assert.equal(accountCalls.at(-1).create,false);
  assert.equal(accountCalls.at(-1).series,undefined,'Signing in never sends a series');assert.equal(node('#leaderboard-series-step').hidden,true,'The series step belongs only to account creation');
  await node('#leaderboard-start-form').trigger('submit');
  assert.equal(accountCalls.at(-1).create,false,'Retrying sign-in never creates an account');
  node('#leaderboard-name').trigger('input');assert.equal(node('#leaderboard-start-label').textContent,'Kirjaudu sisään');
  await app.login(' Panu ');assert(!board.requiresName);assert(node('#settings-dialog').open,'Login keeps the player in the lobby');
  assert.equal(app.dispatched.at(-1)?.type,'lpr-lobby-ready');
  assert.equal(accountCalls.at(-1).create,true);assert.equal(accountCalls.at(-1).nickname,'Panu');
  assert.equal(accountCalls.at(-1).series,'human');assert.equal(board.identity.series,'human');
  assert.deepEqual(app.identified,['Panu']);assert(node('#leaderboard-name').readOnly);assert(node('#leaderboard-start').hidden);
  assert.equal(node('#leaderboard-password').value,'','The password is not kept in the form');
  const token=app.account().token;assert.equal(token,serverAccounts.get('panu').token);
  assert(!storage.get('lpr-account').includes('salasana'),'Only the server credential is remembered, never the password');
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
  const withdrawn=setup();await withdrawn.login();assert(!withdrawn.node('#analytics-consent').checked,'Leaderboard works without analytics');
  withdrawn.node('#analytics-consent').checked=true;withdrawn.node('#analytics-consent').trigger('change');
  const withdrawalIdentity=withdrawn.board.identity.token;withdrawn.node('#analytics-consent').checked=false;withdrawn.node('#analytics-consent').trigger('change');
  assert(!withdrawn.board.requiresName);assert.equal(withdrawn.board.identity.token,withdrawalIdentity);assert(withdrawn.node('#settings-dialog').open,'Analytics withdrawal keeps the player in the lobby');
  const offlineGuest=setup(new Map(),{accountOffline:true});
   offlineGuest.board.beginSession();
   offlineGuest.node('#leaderboard-practice').trigger('click');
   offlineGuest.node('#leaderboard-guest-name').value='Offline Guest';
   await offlineGuest.node('#leaderboard-guest-start').trigger('click');
   assert(offlineGuest.board.requiresName,'Guest does not start without an authorized session');
   assert.match(offlineGuest.node('#leaderboard-guest-status').textContent,/Kirjautuminen ei onnistunut/,'Guest errors must appear inside the visible guest form');
   assert.equal(offlineGuest.node('#leaderboard-guest-start').disabled,false,'Failed guest start can be retried');
   const guest=setup();const beforeGuestCalls=accountCalls.length;
  await guest.node('#leaderboard-practice').trigger('click');
  assert(guest.board.requiresName);guest.node('#leaderboard-guest-name').value='Practice Guest';assert.equal(guest.node('#leaderboard-guest-series-human').checked,true,'Guest defaults to the visible human series option');
  await guest.node('#leaderboard-guest-start').trigger('click');
  assert(!guest.board.requiresName);assert.equal(guest.board.identity.guest,true);assert.equal(guest.board.identity.token,'e'.repeat(64));assert(guest.node('#settings-dialog').open,'Guest selection keeps the player in the lobby');
  assert.equal(guest.board.chatIdentity.nickname,'Practice Guest');assert.equal(guest.board.chatIdentity.guest,true,'Guest identity stays marked so chat can require an account');
  assert.equal(accountCalls.length,beforeGuestCalls,'Practice never creates or signs in to an account');
  await guest.lap();assert.equal(guest.starts().length,0);assert.equal(guest.finishes().length,0,'Practice laps are never submitted');
  assert.equal(guest.node('#guest-register-panel').hidden,false,'A guest can register while driving');
  const calls=accountCalls.length;
  const reopened=setup(storage);assert(reopened.board.requiresName);assert.equal(reopened.node('#leaderboard-name').value,'Panu');
  assert(reopened.node('#leaderboard-name').readOnly);assert(reopened.node('#leaderboard-password').hidden,'A remembered account does not ask for the password');
  assert.equal(reopened.node('#leaderboard-logout').hidden,false);
  reopened.node('#leaderboard-login').trigger('click');await reopened.login('Panu','');assert(!reopened.board.requiresName,'Each page load still needs an explicit start');
  assert.equal(reopened.board.identity.token,token);assert.equal(accountCalls.length,calls);
  const rememberedPractice=setup(storage);await rememberedPractice.node('#leaderboard-practice').trigger('click');
  assert.equal(rememberedPractice.board.identity,null,'A remembered account does not opt practice into leaderboard participation');
  const other=setup(storage);await other.node('#leaderboard-logout').trigger('click');
  assert.equal(other.account(),null);assert.equal(other.node('#leaderboard-name').readOnly,false);assert.equal(other.node('#leaderboard-password').hidden,false);
  await other.login('Eve');assert.notEqual(other.account().token,token);assert.equal(other.board.identity.nickname,'Eve');
  assert(other.calls.some(c=>c.url.endsWith('/api/verified/logout')&&c.options.headers.Authorization===`Bearer ${token}`),'Logout revokes the server session');
  const failedLogout=setup(new Map(storage),{logoutOffline:true});await failedLogout.login('Eve');
  await failedLogout.node('#leaderboard-logout').trigger('click');
  assert(failedLogout.account(),'Network failure must not pretend server-side logout succeeded');
  assert.match(failedLogout.node('#leaderboard-status').textContent,/Uloskirjautuminen ei onnistunut/);
  const expiredStorage=new Map([['lpr-account',JSON.stringify({nickname:'Panu',token,expiresAt:Date.now()-1})]]);
  const expired=setup(expiredStorage);assert.equal(expired.account(),null);assert(!expired.node('#leaderboard-password').hidden,'Expired remembered logins require a password');
  const wrong=setup();await wrong.login('PANU','väärä123');
  assert(wrong.board.requiresName);assert.match(wrong.node('#leaderboard-status').textContent,/Väärä salasana/);assert.equal(wrong.account(),null);
  const caseless=setup();await caseless.login('pAnU','salasana');
  assert.equal(caseless.board.identity.nickname,'Panu','The account keeps its original spelling');assert.equal(caseless.board.identity.token,token);
  const race=setup();race.node('#leaderboard-create').trigger('click');race.node('#analytics-consent').checked=true;race.node('#leaderboard-name').value='Kilpa';race.node('#leaderboard-password').value='12345678';
  accountReply({nickname:'kilpa',password:'toinen12',create:true});
  await race.node('#leaderboard-start-form').trigger('submit');await race.chooseSeries('human');
  assert(race.board.requiresName);assert.match(race.node('#leaderboard-status').textContent,/jo varattu/,'A nickname claimed meanwhile is not overwritten');
  assert.equal(race.node('#leaderboard-series-step').hidden,true,'A taken nickname returns to the credentials step');assert.equal(race.node('#leaderboard-credentials').hidden,false);
  const down=setup(new Map(),{accountOffline:true});await down.login('Kuka');
  assert(down.board.requiresName);assert.match(down.node('#leaderboard-status').textContent,/ei onnistunut/);
  const legacy=setup(new Map([['lpr-nickname','Legacy'],['lpr-player-token','a'.repeat(64)]]));
  assert.equal(legacy.node('#leaderboard-name').value,'Legacy','An old nickname is only suggested');assert.equal(legacy.node('#leaderboard-password').hidden,false);
  await legacy.login('Legacy');assert.notEqual(legacy.board.identity.token,'a'.repeat(64),'Old device tokens never become account credentials');
  const record=setup(new Map(),{result:{rank:1,record:true}});await record.login();await record.lap();
  assert.deepEqual(record.celebrations,[40000]);
  assert.equal(record.dispatched.filter(event=>event.type==='lpr-track-record').length,1,'Only a server-confirmed first-place track record emits the UI event');
  for(const moderation of ['quarantined','hidden']){
    const reviewed=setup(new Map(),{status:202,result:{moderation,rank:null,record:false}});
    await reviewed.login();await reviewed.lap();
    assert.equal(reviewed.celebrations.length,0);assert.equal(reviewed.queue().length,0);
    assert.match(reviewed.node('#leaderboard-status').textContent,/tarkistusta/);
  }
  const offline=setup(new Map(),{offline:true});await offline.login('Offline');
  await offline.lap();assert(!offline.board.requiresName);assert.equal(offline.finishes().length,0);
  assert.match(offline.node('#leaderboard-status').textContent,/vain paikallisesti/);
  offline.network.offline=false;await offline.handlers.get('online')();
  assert.equal(offline.finishes().length,0,'An offline lap is never backdated into a new ticket');
  await offline.lap();assert.equal(offline.finishes().length,1);
  const retry=setup(new Map(),{finishOffline:true});await retry.login('Retry');await retry.lap();
  assert.equal(retry.queue().length,1);const queued=retry.finishes()[0].options.body;
  assert.match(retry.node('#leaderboard-status').textContent,/odottaa lähetystä/);
  retry.network.finishOffline=false;await retry.handlers.get('online')();
  assert.equal(retry.finishes().at(-1).options.body,queued);assert.equal(retry.queue().length,0);
  const saved=setup(new Map(),{finishOffline:true});await saved.login('Reload');await saved.lap();
  const reload=setup(saved.storage);reload.node('#leaderboard-login').trigger('click');await reload.login('Reload');await reload.handlers.get('online')();
  assert.equal(reload.starts().length,0);assert.equal(reload.finishes().length,1,'Reload retries the original ticket rather than starting again');
  assert.equal(reload.queue().length,0);assert.deepEqual(reload.identified,['Reload']);
  const failure=setup(new Map(),{finishOffline:true});await failure.login();await failure.lap();await failure.lap();
  assert.equal(failure.queue().length,2);
  failure.network.finishOffline=false;failure.network.statuses=[409,200];
  await failure.handlers.get('online')();assert.equal(failure.queue().length,0,'A permanently rejected item cannot block the next queued lap');
  const throttled=setup(new Map(),{status:429});await throttled.login();await throttled.lap();assert.equal(throttled.queue().length,1);
  throttled.network.status=200;await throttled.handlers.get('online')();assert.equal(throttled.queue().length,0);
  const old=setup(new Map(),{result:{mode:'old'}});await old.login();await old.lap();
  assert.match(old.node('#leaderboard-status').textContent,/ei vielä tue/);
  // Account creation is two steps: credentials, then an explicit human/bot series choice.
  const botStorage=new Map(),bot=setup(botStorage);bot.board.beginSession();const before=accountCalls.length;
  bot.node('#leaderboard-create').trigger('click');
  assert.equal(bot.node('#leaderboard-start-label').textContent,'Jatka');assert.equal(bot.node('#leaderboard-series-step').hidden,true);
  bot.node('#leaderboard-name').value='Robotti';bot.node('#leaderboard-password').value='salasana';
  await bot.node('#leaderboard-start-form').trigger('submit');
  assert.equal(accountCalls.length,before,'Credentials alone never create the account');
  assert.equal(bot.node('#leaderboard-series-step').hidden,false);assert.equal(bot.node('#leaderboard-credentials').hidden,true);
  assert.equal(bot.node('#leaderboard-start-label').textContent,'Luo käyttäjätunnus');assert.match(bot.node('#leaderboard-series-name').textContent,/Robotti/);
  await bot.node('#leaderboard-start-form').trigger('submit');
  assert.equal(accountCalls.length,before,'No series is preselected');assert.match(bot.node('#leaderboard-status').textContent,/Valitse ihmisten tai bottien sarja/);
  bot.node('#leaderboard-back').trigger('click');
  assert.equal(bot.node('#leaderboard-series-step').hidden,true);assert.equal(bot.node('#leaderboard-name').value,'Robotti','Back keeps the credentials');
  await bot.node('#leaderboard-start-form').trigger('submit');await bot.chooseSeries('bot');
  assert.equal(accountCalls.at(-1).series,'bot');assert.equal(bot.board.identity.series,'bot');assert.equal(bot.account().series,'bot');
  const returning=setup(botStorage);returning.board.beginSession();returning.node('#leaderboard-login').trigger('click');await returning.node('#leaderboard-start-form').trigger('submit');
  assert.equal(returning.board.identity.series,'bot','A remembered login keeps its series');
  console.log('PASS: required identity, server start/finish hooks, no retrospective tickets, cancellation, moderation, safe rendering, records, password accounts with confirmed nickname claims, bot series choice, offline play, durable retries and terminal/transient queue errors');
})().catch(error=>{console.error(error);process.exitCode=1;});
