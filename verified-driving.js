(() => {
 'use strict';
 const config=window.LPRVerificationConfig,revision=window.LPRDrivingRevision;
 const status=document.querySelector('#verification-status');
 const list=document.querySelector('#verified-list');
 const lights=document.querySelector('#start-lights'),lightsLabel=document.querySelector('#start-lights-label');
 let lightsTimer=null,finishLights=null,lightsReady=Promise.resolve();
 function clearLights(){
  clearTimeout(lightsTimer);lightsTimer=null;finishLights?.();finishLights=null;
  lightsReady=Promise.resolve();lights.hidden=true;lights.dataset.phase='';
 }
 function prepareLights(){
  clearLights();lights.hidden=false;lights.dataset.phase='red';lightsLabel.textContent=window.LPRI18n?.t('Valmistaudu')||'Valmistaudu';
  lightsReady=new Promise(resolve=>{finishLights=resolve;lightsTimer=setTimeout(()=>{
   lightsTimer=null;finishLights=null;resolve();
  },1200);});
 }
 function releaseLights(){
  lights.hidden=false;lights.dataset.phase='green';lightsLabel.textContent=window.LPRI18n?.t('AJA!')||'AJA!';
  lightsTimer=setTimeout(clearLights,900);
 }
 let client=null,generation=0,preparing=false,hooks=null,identity=null,connectionUnavailable=false,retryTimer=null;
 const snapshots=new Map(),pending=[];
 const key=()=>`lpr-verified-receipts:${identity?.token}`;
 const persist=()=>{try{localStorage.setItem(key(),JSON.stringify(pending));}catch{}};
 function restore(){
  const chosen=window.LPRLeaderboard.identity;if(!chosen)return;
  identity=chosen;
  try{const saved=JSON.parse(localStorage.getItem(key())||'[]');if(Array.isArray(saved))for(const receipt of saved.filter(v=>typeof v==='string'&&v.length<=4096).slice(0,20))if(!pending.includes(receipt))pending.push(receipt);}catch{}
 }
 const say=text=>{status.textContent=text;document.querySelector('#verification-state').textContent=text;};
 async function api(path,data){
  if(!config?.leaderboard)throw Error('Varmennettua tuloslistaa ei ole vielä otettu käyttöön.');
  const response=await fetch(config.leaderboard+path,{...(data?{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+identity.token},body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Object.assign(Error('Varmennettu tuloslista ei ole saatavilla ('+response.status+').'),{status:response.status});
  return response.json();
 }
 async function refresh(){
  try{const data=await api('/api/verified/leaderboard');
   if(data.protocol!=='driving-v1'||data.revision!==revision)throw Error('Versio ei täsmää.');
   list.textContent='';
   for(const row of data.results){
    const li=document.createElement('li'),name=document.createElement('span'),time=document.createElement('span');
    name.className='standing-name';name.textContent=row.nickname;name.title=row.nickname;
    time.className='standing-time';time.textContent=` · ${(row.lap_ms/1000).toFixed(3)} s`;
    li.append(name,time);list.append(li);
   }
   if(!data.results.length)list.textContent='Ei vielä kierrosaikoja.';
  }catch{list.textContent='Tuloslista ei ole juuri nyt saatavilla.';}
 }
 let sending=null;
 async function save(){
  if(sending)return sending;
  sending=(async()=>{do{while(pending.length){
   try{const reply=await api('/api/verified/laps',{receipt:pending[0]});
    if(!reply.verified||reply.protocol!=='driving-v1')throw Error('Virheellinen tallennuskuittaus.');
    pending.shift();persist();say(`Kierrosaika ${(reply.lapMs/1000).toFixed(3)} s tallennettu.`);hooks?.saved?.(reply.lapMs);
   }catch(error){if([400,401,403,409,413,415,422].includes(error.status)){pending.shift();persist();say('Kierrosaikaa ei voitu tallentaa tuloslistalle.');continue;}
    say('Kierrosaika odottaa tallennusta.');return;}
  }await refresh();}while(pending.length);})();
  try{await sending;}finally{sending=null;}
 }
 function cancel(message='Harjoittelu käynnissä. Aloita uudelleen aloittaaksesi uuden ajon.'){
  clearLights();
  clearTimeout(retryTimer);retryTimer=null;
  generation++;preparing=false;snapshots.clear();
  const old=client;client=null;if(old)void old.cancel();
  if(message)say(message);
 }
 function retrySoon(){
  const attempt=generation;
  clearTimeout(retryTimer);
  retryTimer=setTimeout(()=>{
   retryTimer=null;
   if(attempt===generation&&!document.hidden&&window.LPRLeaderboard.identity)void start({reconnect:true});
  },3000);
 }
 async function start({replace=false,reconnect=false}={}){
  if(preparing&&!replace)return;
  const chosen=window.LPRLeaderboard.identity;
  if(!chosen)return;
  cancel(null);identity=chosen;const attempt=++generation;
  preparing=true;
  if(!reconnect)hooks?.prepare?.();
  if(!connectionUnavailable)prepareLights();
  say(connectionUnavailable?'Harjoittelu käynnissä – odotetaan yhteyttä.':'Valmistellaan lähtöä…');
  let next;
  try{
   if(!config.service||!config.leaderboard)throw Error('Varmennuspalvelua ei ole vielä otettu käyttöön.');
   // Wake before minting the short-lived start ticket.
   const health=await fetch(config.service+'/health',{signal:AbortSignal.timeout(90000)});
   const ready=await health.json();if(!health.ok||ready.revision!==revision||ready.protocol!=='driving-v1')throw Error('Pelin ja tarkastuspalvelimen versiot eivät täsmää.');
   connectionUnavailable=false;
   if(attempt!==generation)return;
   if(lights.hidden)prepareLights();
   const {ticket}=await api('/api/verified/start',{nickname:identity.nickname,revision});
   if(attempt!==generation)return;
   next=new window.LPRLiveClient({revision,ticket,armed:true,base:config.service,
    onUpdate:ack=>{
     if(attempt!==generation)return;
     if(ack.phase==='ready')return;
     const expected=snapshots.get(ack.ackTick);
     if(!expected||Object.keys(expected.state).some(k=>Math.abs(expected.state[k]-ack.result.state[k])>1e-7)||expected.stage!==ack.result.stage||expected.lap!==ack.result.lap){cancel();return;}
     for(const tick of snapshots.keys())if(tick<=ack.ackTick)snapshots.delete(tick);
     for(const lap of ack.laps||[]){pending.push(lap.receipt);persist();void save();}
    },onLost:()=>{connectionUnavailable=true;cancel('Harjoittelu käynnissä – odotetaan yhteyttä.');retrySoon();}});
   await next.start();
   if(attempt!==generation){await next.cancel();return;}
   await lightsReady;
   if(attempt!==generation){await next.cancel();return;}
   await next.activate();
   if(attempt!==generation){await next.cancel();return;}
   client=next;preparing=false;
   hooks.start();releaseLights();say('');
   restore();
   void save();
  }catch(error){if(next)await next.cancel();if(attempt===generation){connectionUnavailable=true;cancel('Harjoittelu käynnissä – odotetaan yhteyttä.');retrySoon();}}
 }
 window.LPRVerifiedDriving={
  attach(value){hooks=value;},cancel,start,refresh:sync,
  get active(){return !!client?.active;},get preparing(){return preparing;},get ackTick(){return client?.tick??0;},
  get waitingForStart(){return preparing&&!connectionUnavailable;},
  step(input,result,event){
   if(!client?.active)return;
   snapshots.set(result.ticks,result);
   if(snapshots.size>960){cancel();return;}
   client.enqueue(window.LPRDriving.encode(input));
   if(event.completed){void client.flush(true).catch(()=>{});say('Tallennetaan kierrosaikaa…');}
  }
 };
 function sync(){restore();return save();}
 setInterval(()=>{if(!document.hidden&&document.querySelector('#settings-dialog').open)void sync();},15000);
 document.querySelector('#leaderboard-start-form').addEventListener('submit',()=>{restore();if(identity){void save();void start();}});
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden)cancel();
  else if(connectionUnavailable&&window.LPRLeaderboard.identity)void start({reconnect:true});
 });
 window.addEventListener('online',()=>{if(identity)void save();if(connectionUnavailable&&!preparing)void start({reconnect:true});});
 say('');
 void refresh();
})();
