(() => {
 'use strict';
 const $=s=>document.querySelector(s),config=window.LPRVerificationConfig,params=new URLSearchParams(location.search);
 $('#view').value='driver';
 const admin=params.get('admin')==='1';let secret='',offset=0,generation=0,recording=null,elapsed=0,playing=false,lastFrame=0;
 const canvas=$('#track'),ctx=canvas.getContext('2d');
 let renderer=null,driverUnavailable=false;const replayCar={};
 const resetCamera=()=>{if(renderer){renderer.visualSteering=null;renderer.lastWheelFrame=0;}};
 const message=text=>{$('#status').textContent=text;};
 const seconds=()=>recording?(recording.endTick-recording.startTick)/recording.hz:0;
 function pause(){playing=false;$('#play').textContent='▶ Toista';$('#play').setAttribute('aria-label','Toista uusinta');}
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
    $('#view-badge').textContent='KULJETTAJAN NÄKYMÄ · 3D-UUSINTA';
    $('#view-note').textContent=a[6]?'':'Vanha tallenne: auton liike näkyy kuljettajan paikalta, mutta jousituksen ja ohjauskulman tarkat tilat puuttuvat. Ratin liike on arvio ohjauskomennoista.';
   }catch(error){driverUnavailable=true;$('#view').value='map';$('#view-note').textContent=error.message+' Näytetään 2D-ratakuva.';}
  }
  const mapView=$('#view').value==='map'||driverUnavailable;
  canvas.hidden=!mapView;$('#driver-view').hidden=mapView;
  if(mapView){$('#view-badge').textContent='RATAKUVA · 2D-UUSINTA';
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
  $('#clock').textContent=elapsed.toFixed(3)+' / '+seconds().toFixed(3)+' s';$('#seek').value=seconds()?elapsed/seconds():0;
 }
 async function load(id,lap,privateReplay=false,label=''){
  const gen=++generation;pause();message('Ladataan uusintaa…');
  try{
   if(!/^[a-f0-9]{32}$/.test(id)||!Number.isSafeInteger(Number(lap))||Number(lap)<1)throw Error('Virheellinen tallenteen osoite.');
   const r=await api('/api/verified/'+(privateReplay?'admin/':'')+'replays/'+id+'/'+lap);
   if(gen!==generation)return;if(!valid(r))throw Error('Tallenne on vioittunut tai sen muotoa ei tueta.');
   recording=r;elapsed=0;driverUnavailable=false;resetCamera();$('#view-note').textContent='';$('#viewer').hidden=false;draw();message(label||'Palvelimen varmentama kierros · '+seconds().toFixed(3)+' s');
  }catch(error){if(gen===generation){recording=null;$('#viewer').hidden=true;message(error.message);}}
 }
 async function list(){
  const gen=++generation;message('Ladataan suorituksia…');
  try{const data=await api('/api/verified/admin/replays?offset='+offset+($('#flagged').checked?'&flagged=1':''));if(gen!==generation)return;
   $('#login').hidden=true;$('#token').value='';$('#admin-tools').hidden=false;$('#runs').replaceChildren();
   for(const r of data.results){const tr=document.createElement('tr');
    const add=value=>{const td=document.createElement('td');if(value instanceof Node)td.append(value);else td.textContent=value;tr.append(td);};
    add(r.nickname+' · '+(r.lap_ticks/120).toFixed(3)+' s');add(new Date(r.issued_ms).toLocaleString('fi-FI'));
    if(r.replay_available){const view=document.createElement('button');view.textContent='Katso · '+Math.round(r.bytes/1024)+' kt';view.onclick=()=>void load(r.session_id,r.lap,true,r.nickname+' · '+(r.lap_ticks/120).toFixed(3)+' s');add(view);
     const select=document.createElement('select');select.setAttribute('aria-label','Suorituksen tarkastustila');
     for(const [value,label]of [['unreviewed','Ei tarkastettu'],['flagged','Tarkastettava'],['reviewed','Tarkastettu']]){const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);}select.value=r.review;
     select.onchange=async()=>{select.disabled=true;try{await api('/api/verified/admin/replays/'+r.session_id+'/'+r.lap,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({review:select.value})});r.review=select.value;message('Tarkastusmerkintä tallennettu.');}catch(error){select.value=r.review;message(error.message);}finally{select.disabled=false;}};add(select);
    }else{add('Ei tallennetta');add('—');}$('#runs').append(tr);
   }
   $('#previous').disabled=offset===0;$('#next').disabled=!data.hasMore;message('Suoritukset '+(offset+1)+'–'+(offset+data.results.length));
  }catch(error){if(gen===generation)message(error.message);}
 }
 $('#play').onclick=()=>{if(!recording)return;if(playing)pause();else{if(elapsed>=seconds())elapsed=0;playing=true;lastFrame=performance.now();$('#play').textContent='Ⅱ Tauko';$('#play').setAttribute('aria-label','Pysäytä uusinta');}};
 $('#restart').onclick=()=>{elapsed=0;resetCamera();draw();};$('#seek').oninput=()=>{elapsed=Number($('#seek').value)*seconds();resetCamera();draw();};
 $('#view').onchange=()=>{resetCamera();draw();};
 window.addEventListener?.('resize',()=>draw());
 function animate(now){if(playing&&recording){elapsed=Math.min(seconds(),elapsed+Math.min((now-lastFrame)/1000,.25)*Number($('#speed').value));if(elapsed>=seconds())pause();draw();}lastFrame=now;requestAnimationFrame(animate);}requestAnimationFrame(animate);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
 $('#login').onsubmit=e=>{e.preventDefault();secret=$('#token').value;offset=0;void list();};
 $('#lock').onclick=()=>{++generation;secret='';pause();recording=null;$('#viewer').hidden=true;$('#admin-tools').hidden=true;$('#login').hidden=false;$('#runs').replaceChildren();message('Ylläpito lukittu.');};
 $('#flagged').onchange=()=>{offset=0;void list();};$('#previous').onclick=()=>{offset=Math.max(0,offset-50);void list();};$('#next').onclick=()=>{offset+=50;void list();};
 if(admin){$('#admin').hidden=false;message('Kirjaudu tarkastellaksesi kaikkia tallennettuja suorituksia.');}
 else void load(params.get('session')||'',params.get('lap'));
})();
