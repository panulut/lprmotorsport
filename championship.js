(() => {
 'use strict';
 const panel=document.querySelector('#championship');if(!panel)return;
 const $=id=>document.querySelector('#championship-'+id);
 const date=$('day'),notice=$('notice'),personal=$('personal'),clock=$('clock');
 const t=(fi,en)=>document.documentElement.lang==='en'?en:fi;
 let data=null,requestId=0,selected='',busy=false,boundaryTimer=null,series='human';
 const seriesTabs=[['human','#championship-series-human'],['bot','#championship-series-bot']];
 for(const [value,selector] of seriesTabs)document.querySelector(selector).addEventListener('click',()=>{
  series=value;for(const [option,tab]of seriesTabs)document.querySelector(tab).setAttribute('aria-pressed',String(option===value));void refresh();
 });
 const formatLapTime=ms=>window.LPRFormatLapTime(ms);
 const signedIn=()=>{const identity=window.LPRLeaderboard?.identity;return !!identity&&identity.guest!==true;};
 const hud=document.querySelector('#daily-race-hud');
 const hudNode=id=>document.querySelector('#daily-race-'+id);
 const drivingSeries=()=>window.LPRLeaderboard?.identity?.series==='bot'?'bot':'human';
 let liveData=null,liveBusy=false,liveFailed=false,liveRequest=0;
 function renderLive(){
  if(!hud)return;
  const currentSeries=drivingSeries();
  hud.setAttribute('aria-label',t('Päivän kisa','Daily race'));
  hudNode('label').textContent=t('Päivän kisa','Daily race')+' · '+(currentSeries==='bot'?t('Botit','Bots'):t('Ihmiset','Humans'));
  hudNode('leader-label').textContent=t('Johdossa','Leading');
  const current=liveData?.series===currentSeries?liveData:null;
  const remaining=current?Math.max(0,current.endsAt-(Date.now()+current.serverNow-current.receivedAt)):0;
  hud.dataset.stale=String(liveFailed);
  if(!current||!remaining){
   hudNode('countdown').textContent=liveFailed?t('Kisatiedot eivät saatavilla','Race data unavailable'):current?t('Kisapäivä vaihtuu…','New race day…'):t('Ladataan…','Loading…');
   hudNode('name').textContent='—';hudNode('time').textContent='';return;
  }
  const total=Math.ceil(remaining/1000),pad=value=>String(value).padStart(2,'0');
  hudNode('countdown').textContent=t('Aikaa jäljellä ','Time left ')+pad(Math.floor(total/3600))+':'+pad(Math.floor(total/60)%60)+':'+pad(total%60);
  const leaders=current.fastest.filter(row=>row.speedRank===1),leader=leaders[0];
  hudNode('leader-label').textContent=liveFailed?t('Viimeisin tieto · yhteyskatko','Last known · offline'):leaders.length>1?t('Jaettu johto','Joint leaders'):t('Johdossa','Leading');
  hudNode('name').textContent=leader?leaders.map(row=>row.nickname).join(', '):t('Ei vielä tuloksia','No results yet');
  hudNode('name').title=leader?leaders.map(row=>row.nickname).join(', '):'';
  hudNode('time').textContent=leader?formatLapTime(leader.bestMs):'';
 }
 async function refreshLive(){
  if(!hud||liveBusy)return;
  const endpoint=window.LPRVerificationConfig?.leaderboard;
  if(!endpoint){liveFailed=true;renderLive();return;}
  const requestedSeries=drivingSeries(),attempt=++liveRequest;liveBusy=true;
  try{
   const response=await fetch(endpoint+'/api/verified/championship?series='+requestedSeries,{signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Error();
   const result=await response.json();
   if(attempt!==liveRequest)return;
   liveData={...result,receivedAt:Date.now()};liveFailed=false;
  }catch{liveFailed=true;}
  finally{liveBusy=false;renderLive();}
 }
 function table(id,rows,kind){
  const body=$(id);
  let list=body.querySelector('ol');
  if(!rows.length){
   if(list)list.remove();
   let empty=body.querySelector('p');
   if(!empty){empty=document.createElement('p');body.append(empty);}
   empty.textContent=t('Ei vielä tuloksia.','No results yet.');
   return;
  }
  if(!list){
   body.querySelector('p')?.remove();
   list=document.createElement('ol');
   body.append(list);
  }
  const items=[...list.children];
  for(let i=0;i<rows.length;i++){
   const row=rows[i];
   let item=items[i],name,value;
   if(!item){
    item=document.createElement('li');name=document.createElement('span');value=document.createElement('span');
    name.className='standing-name';item.append(name,value);list.append(item);
   }else{
    name=item.children[0];value=item.children[1];
   }
   const rank=kind==='speed'?row.speedRank:kind==='volume'?row.volumeRank:row.rank;
   value.className=kind==='speed'?'standing-time':'';
   name.textContent=rank+'. '+row.nickname;name.title=row.nickname;
   value.textContent=kind==='speed'?formatLapTime(row.bestMs):kind==='volume'?row.laps+' '+t('kierrosta','laps'):row.points+' p';
  }
  for(let i=rows.length;i<items.length;i++)items[i].remove();
 }
 function countdown(){
  if(!data)return;
  const remaining=Math.max(0,data.endsAt-(Date.now()+data.serverNow-data.receivedAt));
  if(data.final)clock.textContent=t('Tulokset vahvistettu','Results final');
  else if(!remaining)clock.textContent=t('Tulokset vahvistetaan','Finalizing results');
  else {const minutes=Math.ceil(remaining/60000);clock.textContent=t('Aikaa jäljellä: ','Time left: ')+Math.floor(minutes/60)+' h '+minutes%60+' min';}
 }
 function render(){
  if(!data)return;
  date.max=data.today;date.value=data.day;
  table('fastest',data.fastest,'speed');table('volume',data.mostLaps,'volume');table('monthly',data.monthly,'points');
  $('month').textContent=data.month+' · '+t('Vahvistettujen päivien pisteet','Points from finalized days');
  const activeSession=!!window.LPRLeaderboard?.identity;
  personal.hidden=activeSession;
  personal.textContent=activeSession?'':t('Kirjaudu ja aja varmennettu kierros kerätäksesi pisteitä ja kasvattaaksesi ajoputkea.','Sign in and complete a verified lap to earn points and build your streak.');
  countdown();
 }
 async function refresh(){
  const endpoint=window.LPRVerificationConfig?.leaderboard;if(!endpoint)return;
  const attempt=++requestId,identity=window.LPRLeaderboard?.identity;busy=true;
  try{if(!data)notice.textContent=t('Ladataan päivän kisaa…','Loading daily race…');
   const response=await fetch(endpoint+'/api/verified/championship?series='+series+(selected?'&day='+encodeURIComponent(selected):''),{
    headers:identity?{Authorization:'Bearer '+identity.token}:{},signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Error();const result=await response.json();
   if(attempt!==requestId)return;
   data={...result,receivedAt:Date.now()};notice.textContent='';render();
   clearTimeout(boundaryTimer);
   if(!data.final)boundaryTimer=setTimeout(()=>void refresh(),Math.max(50,data.endsAt-data.serverNow+50));
  }catch{if(attempt===requestId)notice.textContent=t('Päivän kisa ei ole juuri nyt saatavilla. Yritä Päivitä-painikkeella uudelleen.','Daily race is unavailable. Press Refresh to retry.');}
  finally{if(attempt===requestId)busy=false;}
 }
 date.addEventListener('change',()=>{if(date.validity.valid&&date.value){selected=date.value;void refresh();}});
 $('refresh').addEventListener('click',()=>void refresh());
 $('today').addEventListener('click',()=>{selected='';void refresh();});
 document.addEventListener('lpr-lap-saved',()=>{void refresh();void refreshLive();});
 document.querySelector('#leaderboard-start-form').addEventListener('submit',()=>setTimeout(()=>void refresh(),0));
 // Accounts can change asynchronously without submitting the start form again.
 let identityKey='';
 setInterval(()=>{
  if(document.hidden)return;
  renderLive();
  if(!liveBusy&&liveData&&(liveData.series!==drivingSeries()||Date.now()+liveData.serverNow-liveData.receivedAt>=liveData.endsAt)&&!liveFailed)void refreshLive();
  if(!document.querySelector('#settings-dialog').open)return;
  const next=window.LPRLeaderboard?.identity?.nickname||'';
  if(next!==identityKey){identityKey=next;void refresh();}
  countdown();
 },1000);
 setInterval(()=>{if(document.hidden)return;void refreshLive();if(!busy&&document.querySelector('#settings-dialog').open)void refresh();},30000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){renderLive();void refreshLive();}});
 new MutationObserver(()=>{render();renderLive();}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 renderLive();void refreshLive();
 void refresh();
})();
