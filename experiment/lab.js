'use strict';
const lab=window.ReplayLab,world=lab.createWorld(),canvas=document.querySelector('#track'),ctx=canvas.getContext('2d');
const status=document.querySelector('#status'),liveStatus=document.querySelector('#live-status'),report=document.querySelector('#report'),held=new Set();
let replay=null,expected=null,running=false,auto=false,acc=0,last=null,live=null,generation=0,streaming=false;
const snapshot=()=>({format:1,revision:lab.revision,hz:lab.hz,mode:'standing-start-no-people',inputs:[]});
async function start(useAuto){
 const gen=++generation;running=false;const previous=live;live=null;held.clear();
 if(previous)await previous.cancel();if(gen!==generation)return;
 auto=useAuto;streaming=document.querySelector('#streaming').checked;expected=null;report.textContent='';
 document.querySelector('#verify').disabled=true;document.querySelector('#download').disabled=true;
 status.textContent=streaming?'Palvelin valmistautuu varmennettuun ajoon…':'Harjoittelu';
 liveStatus.textContent='';
 let candidate;
 try{
  if(streaming){
   candidate=new window.LPRLiveClient({revision:lab.revision,token:document.querySelector('#token').value,
    onUpdate:ack=>{
     if(gen!==generation)return;
     liveStatus.textContent=ack.phase==='ready'?'Palvelin valmis':`Palvelin tarkastanut ${(ack.ackTick/lab.hz).toFixed(2)} s`;
     if(ack.verified){
      const matches=!!expected&&JSON.stringify(ack.result)===JSON.stringify(expected);
      liveStatus.textContent=matches?'Kierros varmennettu ajon aikana':'Vastaavuusvirhe — ajo jäi harjoitteluksi';
      report.textContent=JSON.stringify({matches,source:auto?'synthetic-browser':'manual-browser',...ack},null,2);
     }
    },onLost:message=>{if(gen===generation)liveStatus.textContent='Harjoittelu — '+message;}});
   await candidate.start();if(gen!==generation){await candidate.cancel();return;}live=candidate;
  }
  world.reset();replay=snapshot();acc=0;last=null;running=true;canvas.focus();
  status.textContent=streaming?'Varmennettu ajo alkaa lähtöruudusta':'Harjoittelu — jälkitarkastus käytettävissä';
 }catch(error){if(candidate)await candidate.cancel();if(gen===generation)status.textContent=error.message;}
}
document.querySelector('#manual').onclick=()=>void start(false);document.querySelector('#auto').onclick=()=>void start(true);
window.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;if(e.key.startsWith('Arrow')){held.add(e.key);e.preventDefault();}});
window.addEventListener('keyup',e=>held.delete(e.key));window.addEventListener('blur',()=>held.clear());
document.addEventListener('visibilitychange',()=>{last=null;acc=0;held.clear();if(document.hidden&&live?.active)live.lose('Peli piilotettiin. Aloita uusi varmennettu ajo palatessasi.');});
function tick(){
 const input=auto?world.driver():{gas:held.has('ArrowUp')?1:0,brake:held.has('ArrowDown')?1:0,steer:(held.has('ArrowRight')?1:0)-(held.has('ArrowLeft')?1:0),analog:true,wheel:true};
 const values=[input.gas,input.brake,input.steer];replay.inputs.push(values);world.step(input);live?.enqueue(values);const r=world.result();
 status.textContent=`${auto?'Automaattiajo':'Selainajo'} · ${(r.lapMs/1000).toFixed(2)} s · sektori ${r.stage+1}`;
 if(r.finished||r.crashed||replay.inputs.length>=lab.hz*240){
  running=false;expected=r;document.querySelector('#verify').disabled=streaming||!r.finished||r.crashed;document.querySelector('#download').disabled=false;
  status.textContent=r.finished?'Kierros valmis':'Ajo päättyi ilman hyväksyttyä kierrosta';
  if(streaming&&live?.active){
   if(r.finished&&!r.crashed){liveStatus.textContent='Viimeinen ajoerä tarkastetaan…';void live.flush(true).catch(()=>{});}
   else live.lose('Kierros ei valmistunut.');
  }
 }
}
function draw(){ctx.clearRect(0,0,960,700);const sx=960/5200,sy=700/4400;
 ctx.lineWidth=9;ctx.strokeStyle='#69766d';ctx.beginPath();world.track.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x*sx,p.y*sy));ctx.closePath();ctx.stroke();
 const p=world.position();ctx.save();ctx.translate(p.x*sx,p.y*sy);ctx.rotate(p.angle);ctx.fillStyle='#c5fa8c';ctx.fillRect(-7,-4,14,8);ctx.restore();}
function frame(now){requestAnimationFrame(frame);if(document.hidden){last=null;return;}if(running){acc+=last===null?0:Math.min((now-last)/1000,.1);
 while(acc>=1/lab.hz&&running){acc-=1/lab.hz;tick();}}last=now;draw();}requestAnimationFrame(frame);
document.querySelector('#verify').onclick=async()=>{const button=document.querySelector('#verify');button.disabled=true;status.textContent='Palvelin laskee ajon…';
 try{const token=document.querySelector('#token').value;const response=await fetch('/verify',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(replay)});
  const result=await response.json();if(!response.ok)throw Error(result.error);const matches=JSON.stringify(result.result)===JSON.stringify(expected);
  status.textContent=matches?'Selain ja palvelin täsmäävät':'Vastaavuusvirhe — tutki raportti';report.textContent=JSON.stringify({matches,source:auto?'synthetic-browser':'manual-browser',...result},null,2);
 }catch(error){status.textContent=error.message;}finally{button.disabled=false;}};
document.querySelector('#download').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({replay,expected,source:auto?'synthetic-browser':'manual-browser'})],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='lpr-replay.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
window.ReplayLabTest={start,step:tick,get recording(){return replay},get result(){return expected}};
