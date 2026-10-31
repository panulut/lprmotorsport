(() => {
 'use strict';
 const $=s=>document.querySelector(s),dialog=$('#settings-dialog'),list=$('#active-drivers-list');
 const status=$('#active-drivers-status'),view=$('#spectate-view'),back=$('#spectate-back');
 const panel=$('.active-drivers'),app=$('.app'),sidebar=$('#spectate-sidebar');
 const standings=$('.verified-standings'),championship=$('#championship');
 const label=$('#spectate-label'),connectionLabel=$('#spectate-connection');
 const labelHome=document.createComment('spectator status'),connectionHome=document.createComment('spectator connection');
 label.before(labelHome);connectionLabel.before(connectionHome);
 const standingsHome=document.createComment('standings'),championshipHome=document.createComment('championship');
 standings.before(standingsHome);championship.before(championshipHome);
 const panelHome=document.createComment('active drivers'),appHome=document.createComment('game');
 panel.before(panelHome);app.before(appHome);
 const t=(text,values)=>window.LPRI18n?.t(text,values)??(text==='watchingDriver'?'Seurataan pelaajaa '+values.name:text);
 let busy=false,timer=null,signature=null,selected='',watchIdentity='',watching=false,hooks=null;
 let requested=new URLSearchParams(location.search).get('spectate');
 let generation=0,pollTimer=null,controller=null,recording=null,anchorTick=0,anchorAt=0;
 const car={};
 function connection(text){$('#spectate-connection').textContent=t(text);$('#spectate-connection').hidden=!text;}
 function markSelected(){for(const a of list.querySelectorAll('a')){if(watching&&a.dataset.session===selected)a.setAttribute('aria-current','true');else a.removeAttribute('aria-current');}}
 function stopWatching(){
  ++generation;clearTimeout(pollTimer);controller?.abort();controller=null;recording=null;watchIdentity='';watching=false;
  appHome.after(app);panelHome.after(panel);standingsHome.after(standings);championshipHome.after(championship);labelHome.after(label);connectionHome.after(connectionLabel);view.hidden=true;
  dialog.classList.remove('spectating');document.body.classList.remove('spectating');
  $('#spectate-label').hidden=true;connection('');hooks?.end();markSelected();
  [...list.querySelectorAll('a')].find(a=>a.dataset.session===selected)?.focus();
 }
 back.addEventListener('click',stopWatching);
 dialog.addEventListener('cancel',event=>{if(watching){event.preventDefault();stopWatching();}});
 function watch(event,driver){
  if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  event.preventDefault();
  if(watching&&selected===driver.id)return;
  ++generation;clearTimeout(pollTimer);controller?.abort();controller=null;recording=null;selected=driver.id;watchIdentity=driver.watchId||driver.id;
  if(!watching){
   watching=true;$('#spectate-game').append(app);sidebar.append(label,connectionLabel,panel,standings,championship);
   view.hidden=false;dialog.classList.add('spectating');document.body.classList.add('spectating');
   hooks?.begin();back.focus();
  }else hooks?.switchDriver();
  $('#spectate-label').textContent=t('watchingDriver',{name:driver.nickname});$('#spectate-label').hidden=false;
  connection('Yhdistetään kuljettajan ajoon…');markSelected();void poll();
 }
 function valid(r){
  return r?.format==='lpr-live-v1'&&r.sceneRevision===window.LPRDrivingRevision&&r.hz===120&&
   Array.isArray(r.frames)&&r.frames.length>=2&&r.frames.length<=102&&
   r.frames.every((f,i)=>Array.isArray(f)&&f.length===7&&f.slice(0,6).every(Number.isFinite)&&window.LPRReplayPose.valid(f[6])&&(!i||f[0]>r.frames[i-1][0]))&&
   Array.isArray(r.inputs)&&r.inputs.length>0&&r.inputs.length<=601&&
   r.inputs.every(f=>Array.isArray(f)&&f.length===7&&f.slice(0,4).every(Number.isFinite)&&f.slice(4).every(v=>typeof v==='boolean'));
 }
 function tickAt(now){return recording?Math.max(recording.frames[0][0],Math.min(recording.frames.at(-1)[0],anchorTick+(now-anchorAt)*.12)):0;}
 async function reconnect(gen,expiredId){
  // A crash or restart creates a fresh verified session. Follow the player,
  // not the expired verification session, until the viewer chooses to leave.
  const response=await fetch(window.LPRVerificationConfig.service+'/spectate',{cache:'no-store',signal:controller?.signal});
  if(!response.ok)throw Error('Directory unavailable');
  const directory=await response.json();
  if(gen!==generation||selected!==expiredId)return;
  const replacement=directory.results?.find(d=>d.watchId===watchIdentity&&d.id!==expiredId);
  if(replacement){selected=replacement.id;markSelected();connection('Yhdistetään kuljettajan uuteen ajoon…');}
  else connection('Kuljettajan seuraavaa ajoa odotetaan…');
 }
 async function poll(){
  clearTimeout(pollTimer);if(!watching||document.hidden||controller)return;
  const gen=generation,id=selected,requestController=new AbortController();controller=requestController;
  const timeout=setTimeout(()=>requestController.abort(),10000);
  try{
   const response=await fetch(window.LPRVerificationConfig.service+'/spectate/'+id,{cache:'no-store',signal:requestController.signal});
   if(gen!==generation)return;
   if(response.status===410){recording=null;await reconnect(gen,id);return;}
   if(!response.ok)throw Error();const data=await response.json();if(gen!==generation)return;
   if(data.sceneRevision!==window.LPRDrivingRevision){recording=null;connection('Kuljettajan peliversio poikkeaa katselimesta. Päivitä sivu.');return;}
   if(data.frames?.length<2||!data.inputs?.length){connection('Odotetaan kuljettajan liikkeellelähtöä…');return;}
   if(!valid(data))throw Error();
   const now=performance.now(),end=data.frames.at(-1)[0],previous=recording?tickAt(now):end-90;
   anchorTick=end-previous>180?end-90:previous;anchorAt=now;recording=data;connection('');
   $('#spectate-label').textContent=t('watchingDriver',{name:data.nickname});
  }catch(error){if(gen===generation&&!document.hidden)connection('Seurantayhteys katkesi. Yhdistetään uudelleen…');}
  finally{clearTimeout(timeout);if(gen===generation){controller=null;if(watching&&!document.hidden)pollTimer=setTimeout(poll,500);}}
 }
 function find(values,tick){let lo=0,hi=values.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(values[mid][0]<=tick)lo=mid;else hi=mid-1;}return lo;}
 function presentation(now){
  if(!recording)return null;
  const r=recording,tick=tickAt(now),i=find(r.frames,tick),a=r.frames[i],b=r.frames[Math.min(i+1,r.frames.length-1)];
  const mix=b[0]===a[0]?0:Math.max(0,Math.min(1,(tick-a[0])/(b[0]-a[0]))),lerp=n=>a[n]+(b[n]-a[n])*mix;
  const input=r.inputs[find(r.inputs,tick)],delta=Math.atan2(Math.sin(b[3]-a[3]),Math.cos(b[3]-a[3]));
  const lap=r.lapStates?.filter(l=>l.startTick<=tick).at(-1)||{lap:r.lap||1,startTick:r.lapStartTick||0};
  for(const key of Object.keys(car))delete car[key];
  Object.assign(car,window.LPRReplayPose.mix(a[6],b[6],mix),{x:lerp(1),y:lerp(2),angle:a[3]+delta*mix,vx:lerp(4),vy:lerp(5),
   speed:Math.hypot(lerp(4),lerp(5)),throttleInput:input[1],brakeInput:input[2],tcEnabled:input[6],
   lap:lap.lap,lapElapsedMs:Math.max(0,tick-lap.startTick)*1000/120,wheelPage:0,wheelDim:false});
  return {car,time:tick*1000/120,bestLapMs:lap.bestLapMs??r.bestLapMs??0};
 }
 window.LPRSpectator={get active(){return watching;},attach(value){hooks=value;},presentation,stop:stopWatching};
 async function refresh(){
  clearTimeout(timer);document.body.classList.toggle('spectate-menu-open',dialog.open);
  if(busy||document.hidden||!dialog.open)return;busy=true;
  try{
   const response=await fetch(window.LPRVerificationConfig.service+'/spectate',{cache:'no-store',signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Error();const data=await response.json();
   if(!Array.isArray(data.results)||data.results.some(r=>!/^[a-f0-9]{32}$/.test(r.id)||typeof r.nickname!=='string'))throw Error();
   const next=JSON.stringify(data.results.map(r=>[r.id,r.nickname,r.watchId]));
   if(next!==signature){
    const focused=document.activeElement?.dataset.session,fragment=document.createDocumentFragment();
    for(const driver of data.results){
     const row=document.createElement('li'),link=document.createElement('a'),badge=document.createElement('span');
     link.href='index.html?spectate='+encodeURIComponent(driver.id);link.dataset.session=driver.id;
     const watchLabel=t('watchDriverLive',{name:driver.nickname});
     link.setAttribute('aria-label',watchLabel);link.title=watchLabel;
     const name=document.createElement('strong');name.textContent=driver.nickname;name.title=driver.nickname;badge.append(window.LPRIcon('eye'));badge.className='active-driver-badge';badge.setAttribute('aria-hidden','true');
     link.append(name,badge);link.addEventListener('click',event=>watch(event,driver));row.append(link);fragment.append(row);
    }
    list.replaceChildren(fragment);signature=next;markSelected();
    if(focused)[...list.querySelectorAll('a')].find(a=>a.dataset.session===focused)?.focus();
   }
   status.textContent=data.results.length?t('Katso kuljettajaa suorana'):t('Ei aktiivisia kuljettajia juuri nyt.');
   if(requested&&hooks){
    const driver=data.results.find(r=>r.id===requested);requested=null;
    if(driver)watch({button:0,preventDefault(){}},driver);
   }
  }catch{status.textContent=t('Kuljettajalistaa ei saatu. Yritetään uudelleen…');}
  finally{busy=false;if(dialog.open&&!document.hidden)timer=setTimeout(refresh,3000);}
 }
 new MutationObserver(()=>{
  clearTimeout(timer);document.body.classList.toggle('spectate-menu-open',dialog.open);
  if(dialog.open)void refresh();else if(watching)stopWatching();
 }).observe(dialog,{attributes:true,attributeFilter:['open']});
 document.addEventListener('visibilitychange',()=>{
  clearTimeout(timer);clearTimeout(pollTimer);
  if(document.hidden)controller?.abort();else{void refresh();if(watching)void poll();}
 });
 window.addEventListener('online',()=>{void refresh();if(watching&&!controller)void poll();});
 void refresh();
})();
