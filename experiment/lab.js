'use strict';
const lab=window.ReplayLab,world=lab.createWorld(),canvas=document.querySelector('#track'),ctx=canvas.getContext('2d');
const status=document.querySelector('#status'),report=document.querySelector('#report'),held=new Set();
let replay=null,expected=null,running=false,auto=false,acc=0,last=null;
const snapshot=()=>({format:1,revision:lab.revision,hz:lab.hz,mode:'standing-start-no-people',inputs:[]});
function start(useAuto){world.reset();replay=snapshot();expected=null;running=true;auto=useAuto;acc=0;last=null;held.clear();report.textContent='';
  document.querySelector('#verify').disabled=true;document.querySelector('#download').disabled=true;canvas.focus();}
document.querySelector('#manual').onclick=()=>start(false);document.querySelector('#auto').onclick=()=>start(true);
window.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;if(e.key.startsWith('Arrow')){held.add(e.key);e.preventDefault();}});
window.addEventListener('keyup',e=>held.delete(e.key));window.addEventListener('blur',()=>held.clear());
document.addEventListener('visibilitychange',()=>{last=null;acc=0;held.clear();});
function tick(){const input=auto?world.driver():{gas:held.has('ArrowUp')?1:0,brake:held.has('ArrowDown')?1:0,steer:(held.has('ArrowRight')?1:0)-(held.has('ArrowLeft')?1:0),analog:true,wheel:true};
  replay.inputs.push([input.gas,input.brake,input.steer]);world.step(input);const r=world.result();
  status.textContent=`${auto?'Automaattiajo':'Selainajo'} · ${(r.lapMs/1000).toFixed(2)} s · sektori ${r.stage+1}`;
  if(r.finished||r.crashed||replay.inputs.length>=lab.hz*240){running=false;expected=r;
    document.querySelector('#verify').disabled=!r.finished||r.crashed;document.querySelector('#download').disabled=false;
    status.textContent=r.finished?'Kierros valmis — tarkasta palvelimella': 'Ajo päättyi ilman hyväksyttyä kierrosta';}}
function draw(){ctx.clearRect(0,0,960,700);const sx=960/5200,sy=700/4400;
  ctx.lineWidth=9;ctx.strokeStyle='#69766d';ctx.beginPath();world.track.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x*sx,p.y*sy));ctx.closePath();ctx.stroke();
  const p=world.position();ctx.save();ctx.translate(p.x*sx,p.y*sy);ctx.rotate(p.angle);ctx.fillStyle='#c5fa8c';ctx.fillRect(-7,-4,14,8);ctx.restore();}
function frame(now){requestAnimationFrame(frame);if(document.hidden){last=null;return;}if(running){acc+=last===null?0:Math.min((now-last)/1000,.1);
  while(acc>=1/lab.hz&&running){acc-=1/lab.hz;tick();}}last=now;draw();}requestAnimationFrame(frame);
document.querySelector('#verify').onclick=async()=>{const button=document.querySelector('#verify');button.disabled=true;status.textContent='Palvelin laskee ajon…';
  try{const token=document.querySelector('#token').value;const response=await fetch('/verify',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(replay)});
    const result=await response.json();if(!response.ok)throw Error(result.error);
    const matches=JSON.stringify(result.result)===JSON.stringify(expected);
    status.textContent=matches?'Selain ja palvelin täsmäävät':'Vastaavuusvirhe — tutki raportti';report.textContent=JSON.stringify({matches,source:auto?'synthetic-browser':'manual-browser',...result},null,2);
  }catch(error){status.textContent=error.message;}finally{button.disabled=false;}};
document.querySelector('#download').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({replay,expected,source:auto?'synthetic-browser':'manual-browser'})],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='lpr-replay.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
// Read-only snapshots for a browser parity test; never used as server authority.
window.ReplayLabTest={start,step:tick,get recording(){return replay},get result(){return expected}};
