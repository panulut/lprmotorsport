(() => {
 'use strict';
 const $=s=>document.querySelector(s),config=window.LPRVerificationConfig,params=new URLSearchParams(location.search);
 $('#view').value='driver';
 const live=params.get('live')==='1',admin=!live&&params.get('admin')==='1';let secret='',offset=0,generation=0,recording=null,elapsed=0,playing=false,lastFrame=0;
 const canvas=$('#track'),ctx=canvas.getContext('2d');
 let renderer=null,driverUnavailable=false;const replayCar={};
 const resetCamera=()=>{if(renderer){renderer.visualSteering=null;renderer.lastWheelFrame=0;}};
 const message=text=>{$('#status').textContent=text;};
 const seconds=()=>recording?(recording.endTick-recording.startTick)/recording.hz:0;
 function setPlaybackButton(isPlaying){const button=$('#play'),label=isPlaying?'Tauko':'Toista';button.replaceChildren(window.LPRIcon(isPlaying?'pause':'play'),document.createTextNode(' '+label));button.setAttribute('aria-label',isPlaying?'Pysäytä uusinta':'Toista uusinta');}
 function pause(){playing=false;setPlaybackButton(false);}
 async function api(path,options={}){
  const response=await fetch(config.leaderboard+path,{...options,headers:{...(secret?{Authorization:'Bearer '+secret}:{}),...options.headers},cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error(response.status===401?'Ylläpitoavain ei kelpaa tai pääsyä ei ole määritetty.':response.status===404?'Uusintaa ei ole saatavilla. Vanhoilla ajoilla ei ole tallennetta.':'Pyyntö epäonnistui ('+response.status+').');
  return response.json();
 }
 function valid(r){
  if(r?.format!=='lpr-replay-v1'||r.hz!==120||!Number.isSafeInteger(r.startTick)||!Number.isSafeInteger(r.endTick)||r.endTick<=r.startTick||r.endTick>72000)return false;
  if(!Array.isArray(r.track)||r.track.length<3||r.track.length>1000||!r.track.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))return false;
  if(!Array.isArray(r.frames)||r.frames.length<2||r.frames.length>12002||!Array.isArray(r.inputs)||!r.inputs.length||r.inputs.length>72000)return false;
  if(r.frames[0][0]!==r.startTick||r.frames.at(-1)[0]!==r.endTick)return false;
  return r.frames.every((f,i)=>Array.isArray(f)&&(f.length===6||f.length===7)&&f.slice(0,6).every(Number.isFinite)&&(f.length===6||window.LPRReplayPose?.valid(f[6]))&&(!i||f[0]>r.frames[i-1][0]))&&
   r.inputs.every((v,i)=>Array.isArray(v)&&v.length===7&&Number.isSafeInteger(v[0])&&v[0]>=r.startTick&&v[0]<r.endTick&&(!i||v[0]>r.inputs[i-1][0])&&v.slice(1,4).every(Number.isFinite)&&v.slice(4).every(n=>typeof n==='boolean'));
 }
 function find(values,tick){let lo=0,hi=values.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(values[mid][0]<=tick)lo=mid;else hi=mid-1;}return lo;}
 function draw(){
  if(!recording)return;
  const r=recording,tick=r.startTick+elapsed*r.hz,index=find(r.frames,tick),a=r.frames[index],b=r.frames[Math.min(index+1,r.frames.length-1)];
  const t=b[0]===a[0]?0:Math.max(0,Math.min(1,(tick-a[0])/(b[0]-a[0]))),lerp=i=>a[i]+(b[i]-a[i])*t;
  const input=r.inputs[find(r.inputs,tick)];
  if($('#view').value!=='map'&&!driverUnavailable){
   try{
    if(r.sceneRevision&&r.sceneRevision!==window.LPRDrivingRevision)throw Error('Tallenteen rataversio poikkeaa tästä peliversiosta. Käytä ratakuvaa.');
    if(typeof window.LPRRenderer3D!=='function')throw Error('3D-katselin ei latautunut.');
    renderer ||= new window.LPRRenderer3D($('#driver-track'),$('#driver-cockpit'),r.track.map(p=>({x:p[0],y:p[1]})));
    const delta=Math.atan2(Math.sin(b[3]-a[3]),Math.cos(b[3]-a[3]));
    const pose=a[6]&&b[6]?window.LPRReplayPose.mix(a[6],b[6],t):{steerAngle:input[3]*(window.LPRVehicleSpec?.maxRoadWheelAngle||.36)};
    // Retain one car identity for the same steering-wheel presentation used by the game.
    for(const key of Object.keys(replayCar))delete replayCar[key];
    Object.assign(replayCar,pose,{x:lerp(1),y:lerp(2),angle:a[3]+delta*t,vx:lerp(4),vy:lerp(5),speed:Math.hypot(lerp(4),lerp(5)),throttleInput:input[1],brakeInput:input[2],tcEnabled:input[6],lapElapsedMs:elapsed*1000,lap:r.lap||1});
    canvas.hidden=true;$('#driver-view').hidden=false;renderer.resize();renderer.updatePeople(tick*1000/r.hz);renderer.render(replayCar,tick*1000/r.hz);
    $('#view-badge').textContent=live?'SUORA SEURANTA · 3D':'KULJETTAJAN NÄKYMÄ · 3D-UUSINTA';
    $('#view-note').textContent=a[6]?'':'Vanha tallenne: auton liike näkyy kuljettajan paikalta, mutta jousituksen ja ohjauskulman tarkat tilat puuttuvat. Ratin liike on arvio ohjauskomennoista.';
   }catch(error){driverUnavailable=true;$('#view').value='map';$('#view-note').textContent=error.message+' Näytetään 2D-ratakuva.';}
  }
  const mapView=$('#view').value==='map'||driverUnavailable;
  canvas.hidden=!mapView;$('#driver-view').hidden=mapView;
  if(mapView){$('#view-badge').textContent=live?'SUORA SEURANTA · RATAKUVA':'RATAKUVA · 2D-UUSINTA';
  const points=r.track,xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const minX=Math.min(...xs)-100,maxX=Math.max(...xs)+100,minY=Math.min(...ys)-100,maxY=Math.max(...ys)+100;
  const scale=Math.min(canvas.width/(maxX-minX),canvas.height/(maxY-minY)),ox=(canvas.width-(maxX-minX)*scale)/2,oy=(canvas.height-(maxY-minY)*scale)/2;
  const x=n=>ox+(n-minX)*scale,y=n=>oy+(n-minY)*scale;
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.lineJoin='round';ctx.lineCap='round';
  const path=()=>{ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(x(p[0]),y(p[1])):ctx.moveTo(x(p[0]),y(p[1])));ctx.closePath();};
  path();ctx.strokeStyle='#9bb799';ctx.lineWidth=80*scale;ctx.stroke();path();ctx.strokeStyle='#47534f';ctx.lineWidth=66*scale;ctx.stroke();
  path();ctx.strokeStyle='#809286';ctx.lineWidth=1;ctx.setLineDash([7,8]);ctx.stroke();ctx.setLineDash([]);
  // Recorded racing line up to the chosen time.
  ctx.beginPath();for(let i=0;i<=index;i++){const f=r.frames[i];i?ctx.lineTo(x(f[1]),y(f[2])):ctx.moveTo(x(f[1]),y(f[2]));}ctx.lineTo(x(lerp(1)),y(lerp(2)));ctx.strokeStyle='#c7f779';ctx.lineWidth=2;ctx.stroke();
  const delta=Math.atan2(Math.sin(b[3]-a[3]),Math.cos(b[3]-a[3])),angle=a[3]+delta*t;
  ctx.save();ctx.translate(x(lerp(1)),y(lerp(2)));ctx.rotate(angle);ctx.fillStyle='#d3ff86';ctx.fillRect(-8,-4,16,8);ctx.fillStyle='#0c1312';ctx.fillRect(-3,-3,5,6);ctx.fillStyle='#fff';ctx.fillRect(6,-4,2,8);ctx.restore();
  }
  $('#gas').value=input[1];$('#brake').value=input[2];$('#steer').textContent=(input[3]*100).toFixed(0)+' %';
  // Physics velocities are already SI metres/second, matching the live speedometer.
  $('#velocity').textContent=(Math.hypot(lerp(4),lerp(5))*3.6).toFixed(0)+' km/h';
  $('#clock').textContent=live?'Ajo '+(tick/r.hz).toFixed(1)+' s · kierros '+r.lap:elapsed.toFixed(3)+' / '+seconds().toFixed(3)+' s';$('#seek').value=seconds()?elapsed/seconds():0;
 }
 // The game page stores the signed-in account; reports reuse that login session.
 function signedIn(){
  try{const a=JSON.parse(localStorage.getItem('lpr-account')||'null');return a&&/^[a-f0-9]{64}$/.test(a.token)&&Number.isSafeInteger(a.expiresAt)&&a.expiresAt>Date.now()?a:null;}catch{return null;}
 }
 let reportTarget=null;
 const reasons={bot:'Epäilty botti',inputs:'Epäluonnolliset ohjauskomennot',line:'Epäilyttävä ajolinja tai aika',other:'Muu syy'};
 function showReport(id,lap){
  reportTarget={sessionId:id,lap:Number(lap)};const login=!!signedIn();
  $('#report').hidden=false;$('#report-form').hidden=!login;$('#report-signin').hidden=login;$('#report-status').textContent='';$('#report-send').disabled=false;
 }
 const reportMessages={200:'Kiitos. Ilmoitus on välitetty ylläpidon tarkastettavaksi.',400:'Tarkista syy ja lisätieto (enintään 200 merkkiä).',
  401:'Kirjautuminen on vanhentunut. Kirjaudu pelissä uudelleen.',403:'Omasta kierroksesta ei voi ilmoittaa.',404:'Uusinta ei ole enää julkinen.',
  409:'Olet jo ilmoittanut tästä kierroksesta.',429:'Liian monta ilmoitusta. Yritä myöhemmin uudelleen.'};
 $('#report-form').onsubmit=async event=>{
  event.preventDefault();const login=signedIn(),target=reportTarget;if(!login||!target)return;
  $('#report-send').disabled=true;$('#report-status').textContent='Lähetetään…';
  try{
   const response=await fetch(config.leaderboard+'/api/verified/report',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+login.token},
    body:JSON.stringify({...target,reason:$('#report-reason').value,note:$('#report-note').value}),signal:AbortSignal.timeout(15000)});
   if(target!==reportTarget)return;
   $('#report-status').textContent=reportMessages[response.status]||'Ilmoitus epäonnistui ('+response.status+').';
   if(response.ok||[403,404,409].includes(response.status)){$('#report-form').hidden=true;$('#report-note').value='';}else $('#report-send').disabled=false;
  }catch{if(target===reportTarget){$('#report-status').textContent='Ilmoitus epäonnistui. Tarkista yhteys ja yritä uudelleen.';$('#report-send').disabled=false;}}
 };
 async function load(id,lap,privateReplay=false,label=''){
  const gen=++generation;pause();message('Ladataan uusintaa…');$('#report').hidden=true;reportTarget=null;
  try{
   if(!/^[a-f0-9]{32}$/.test(id)||!Number.isSafeInteger(Number(lap))||Number(lap)<1)throw Error('Virheellinen tallenteen osoite.');
   const r=await api('/api/verified/'+(privateReplay?'admin/':'')+'replays/'+id+'/'+lap);
   if(gen!==generation)return;if(!valid(r))throw Error('Tallenne on vioittunut tai sen muotoa ei tueta.');
   recording=r;elapsed=0;driverUnavailable=false;resetCamera();$('#view-note').textContent='';$('#viewer').hidden=false;draw();message(label||'Palvelimen varmentama kierros · '+seconds().toFixed(3)+' s');
   if(!privateReplay)showReport(id,lap);
  }catch(error){if(gen===generation){recording=null;$('#viewer').hidden=true;message(error.message);}}
 }
 async function list(){
  const gen=++generation;message('Ladataan suorituksia…');
  try{const data=await api('/api/verified/admin/replays?offset='+offset+($('#flagged').checked?'&flagged=1':''));if(gen!==generation)return;
   $('#login').hidden=true;$('#token').value='';$('#admin-tools').hidden=false;$('#runs').replaceChildren();
   for(const r of data.results){const tr=document.createElement('tr');
    const add=value=>{const td=document.createElement('td');if(value instanceof Node)td.append(value);else td.textContent=value;tr.append(td);};
    add(r.nickname+' · '+(r.lap_ticks/120).toFixed(3)+' s');add(new Date(r.issued_ms).toLocaleString(document.documentElement.lang==='en'?'en-GB':'fi-FI'));
    // Series belongs to the account: changing it moves every lap of that driver.
    const series=document.createElement('select');series.setAttribute('aria-label','Kuljettajan sarja');
    for(const [value,label]of [['human','Ihminen'],['bot','Botti']]){const o=document.createElement('option');o.value=value;o.textContent=label;series.append(o);}series.value=r.series||'human';
    series.onchange=async()=>{series.disabled=true;try{await api('/api/verified/admin/series',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:r.session_id,lap:r.lap,series:series.value})});message('Kuljettajan '+r.nickname+' sarja vaihdettu.');await list();message('Kuljettajan '+r.nickname+' sarja vaihdettu.');}catch(error){series.value=r.series||'human';series.disabled=false;message(error.message);}};add(series);
    if(r.replay_available){const view=document.createElement('button');view.textContent='Katso · '+Math.round(r.bytes/1024)+' kt';view.onclick=()=>void load(r.session_id,r.lap,true,r.nickname+' · '+(r.lap_ticks/120).toFixed(3)+' s');add(view);
     const select=document.createElement('select');select.setAttribute('aria-label','Suorituksen tarkastustila');
     for(const [value,label]of [['unreviewed','Ei tarkastettu'],['flagged','Tarkastettava'],['reviewed','Tarkastettu']]){const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);}select.value=r.review;
     select.onchange=async()=>{select.disabled=true;try{await api('/api/verified/admin/replays/'+r.session_id+'/'+r.lap,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({review:select.value})});r.review=select.value;message('Tarkastusmerkintä tallennettu.');}catch(error){select.value=r.review;message(error.message);}finally{select.disabled=false;}};add(select);
    }else{add('Ei tallennetta');add('—');}
    if(r.reports){const show=document.createElement('button');show.textContent=r.reports+' kpl';show.setAttribute('aria-expanded','false');
     let details=null;
     show.onclick=async()=>{
      if(details){details.remove();details=null;show.setAttribute('aria-expanded','false');return;}
      try{const data=await api('/api/verified/admin/replays/'+r.session_id+'/'+r.lap+'/reports');
       details=document.createElement('tr');const td=document.createElement('td');td.colSpan=6;const ul=document.createElement('ul');
       for(const p of data.results){const li=document.createElement('li');li.textContent=new Date(p.created_ms).toLocaleString(document.documentElement.lang==='en'?'en-GB':'fi-FI')+' · '+(p.reporter||'poistettu tili')+' · '+(reasons[p.reason]||p.reason)+(p.note?' · '+p.note:'');ul.append(li);}
       td.append(ul);details.append(td);tr.after(details);show.setAttribute('aria-expanded','true');
      }catch(error){message(error.message);}
     };add(show);
    }else add('—');$('#runs').append(tr);
   }
   $('#previous').disabled=offset===0;$('#next').disabled=!data.hasMore;message('Suoritukset '+(offset+1)+'–'+(offset+data.results.length));
  }catch(error){if(gen===generation)message(error.message);}
 }
 $('#play').onclick=()=>{if(!recording)return;if(playing)pause();else{if(elapsed>=seconds())elapsed=0;playing=true;lastFrame=performance.now();setPlaybackButton(true);}};
 $('#restart').onclick=()=>{elapsed=0;resetCamera();draw();};$('#seek').oninput=()=>{elapsed=Number($('#seek').value)*seconds();resetCamera();draw();};
 $('#view').onchange=()=>{resetCamera();draw();};
 window.addEventListener?.('resize',()=>draw());
 function animate(now){if(playing&&recording){elapsed=Math.min(seconds(),elapsed+Math.min((now-lastFrame)/1000,.25)*Number($('#speed').value));if(elapsed>=seconds()&&!live)pause();draw();}lastFrame=now;requestAnimationFrame(animate);}requestAnimationFrame(animate);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
 $('#login').onsubmit=e=>{e.preventDefault();secret=$('#token').value;offset=0;void list();};
 $('#lock').onclick=()=>{++generation;secret='';pause();recording=null;$('#viewer').hidden=true;$('#admin-tools').hidden=true;$('#login').hidden=false;$('#runs').replaceChildren();message('Ylläpito lukittu.');};
 $('#flagged').onchange=()=>{offset=0;void list();};$('#previous').onclick=()=>{offset=Math.max(0,offset-50);void list();};$('#next').onclick=()=>{offset+=50;void list();};
 let liveRequest=0,liveBusy=false,listBusy=false;
 async function liveList(){
  if(listBusy||document.hidden)return;listBusy=true;
  try{const response=await fetch(config.service+'/spectate',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();const data=await response.json();
   const select=$('#live-driver'),selected=select.value;select.replaceChildren(new Option('Valitse kuljettaja',''));
   for(const r of data.results)select.append(new Option(r.nickname,r.id));
   if(data.results.some(r=>r.id===selected))select.value=selected;
   else if(selected){++liveRequest;recording=null;playing=false;$('#viewer').hidden=true;message('Kuljettajan ajo päättyi. Valitse toinen kuljettaja.');}
   $('#live-status').textContent=data.results.length+' aktiivista kuljettajaa';
  }catch{$('#live-status').textContent='Kuljettajalistaa ei saatu. Yritetään uudelleen.';}finally{listBusy=false;}
 }
 async function livePoll(){
  const id=$('#live-driver').value;if(!id||liveBusy||document.hidden)return;
  const gen=liveRequest;liveBusy=true;
  try{const response=await fetch(config.service+'/spectate/'+id,{cache:'no-store',signal:AbortSignal.timeout(10000)});
   if(gen!==liveRequest)return;
   if(response.status===410){recording=null;playing=false;$('#viewer').hidden=true;message('Kuljettajan ajo päättyi.');return;}
   if(!response.ok)throw Error();const r=await response.json();if(gen!==liveRequest)return;
   if(r.sceneRevision!==window.LPRDrivingRevision)throw Error('Kuljettajan peliversio poikkeaa katselimesta. Päivitä sivu.');
   if(r.frames.length<2||!r.inputs.length){message('Odotetaan kuljettajan liikkeellelähtöä…');return;}
   const previousTick=recording?recording.startTick+elapsed*120:null;
   r.startTick=r.frames[0][0];r.endTick=r.frames.at(-1)[0];
   recording=r;elapsed=Math.max(0,Math.min((r.endTick-r.startTick)/120,((previousTick??r.endTick-90)-r.startTick)/120));
   playing=true;$('#viewer').hidden=false;draw();message(r.nickname+' · suora seuranta');
  }catch(error){if(gen===liveRequest){playing=false;message(error.message.includes('peliversio')?error.message:'Seurantayhteys katkesi. Yhdistetään uudelleen…');}}finally{liveBusy=false;}
 }
 if(live){
  $('#live-tools').hidden=false;document.title=window.LPRI18n?.t('LPR Motorsport · Suora seuranta')||'LPR Motorsport · Suora seuranta';
  $('h1 span').textContent='SUORA SEURANTA';
  $('#viewer').setAttribute('aria-label','Kuljettajan suora seuranta');
  $('#viewer > p.muted').textContent='Palvelimella laskettu auton liike ja ohjaus näytetään pienellä puskurointiviiveellä. Voit vaihtaa kuljettajanäkymän ja ratakuvan välillä. Harjoittelutilassa ajavat eivät näy seurannassa.';
  for(const id of ['#play','#restart','#speed','#seek'])$(id).disabled=true;
  $('#play').hidden=true;$('#restart').hidden=true;$('#speed').parentElement.hidden=true;$('#seek').parentElement.hidden=true;
  $('#live-driver').onchange=()=>{++liveRequest;recording=null;playing=false;driverUnavailable=false;resetCamera();$('#viewer').hidden=true;message('Yhdistetään kuljettajan ajoon…');void livePoll();};
  if(params.get('embedded')==='1')document.body.classList.add('embedded-viewer');
  const requested=params.get('driver');
  if(/^[a-f0-9]{32}$/.test(requested||'')){
   $('#live-driver').append(new Option('Yhdistetään kuljettajaan…',requested));
   $('#live-driver').value=requested;$('#live-driver').onchange();
  }
  void liveList();setInterval(()=>void liveList(),5000);setInterval(()=>void livePoll(),500);
 }
 else if(admin){$('#admin').hidden=false;message('Kirjaudu tarkastellaksesi kaikkia tallennettuja suorituksia.');}
 else void load(params.get('session')||'',params.get('lap'));
})();
