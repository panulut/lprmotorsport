const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const sample={format:'lpr-replay-v1',hz:120,metresPerWorldUnit:.1,startTick:120,endTick:240,track:[[0,0],[100,0],[100,100]],frames:[[120,0,0,0,10,0],[180,50,0,0,10,0],[240,100,0,0,10,0]],inputs:[[120,1,0,0,false,false,true],[180,0,1,-.5,true,true,true]]};
function fixture({admin=false,response=sample,error=0,driver=false,account=null,reportStatus=200}={}){
 const nodes=new Map(),requests=[],draws=[],renders=[],times=[];let animate;
 function node(id){if(!nodes.has(id))nodes.set(id,{hidden:true,value:id==='#speed'?'1':'',checked:false,textContent:'',append(){},replaceChildren(...children){this.textContent=children.map(child=>child.textContent||'').join('');},setAttribute(){},getContext(){return new Proxy({},{get:(_,method)=>(...args)=>{if(method==='translate')draws.push(args);},set:()=>true});}});return nodes.get(id);}
 const document={querySelector:node,createElement:()=>node(Symbol()),createTextNode:text=>({textContent:text}),addEventListener(){}};
 class Renderer{resize(){}updatePeople(time){times.push(time);}render(car,time){renders.push({car,snapshot:JSON.parse(JSON.stringify(car)),time});}}
 const context={window:{LPRIcon:()=>({textContent:''}),LPRVerificationConfig:{leaderboard:'https://board.test'},LPRDrivingRevision:'revision',LPRReplayPose:require('../replay-pose.js'),LPRRenderer3D:driver?Renderer:undefined},document,location:{search:admin?'?admin=1':'?session='+'a'.repeat(32)+'&lap=2'},URLSearchParams,Node:class {},AbortSignal,console,performance:{now:()=>0},requestAnimationFrame:f=>{animate=f;},localStorage:{getItem:key=>key==='lpr-account'&&account?JSON.stringify(account):null},fetch:async(url,options)=>{requests.push({url,options});if(url.endsWith('/api/verified/report'))return {ok:reportStatus===200,status:reportStatus,json:async()=>({})};return {ok:!error,status:error,json:async()=>url.includes('offset=')?{results:[],hasMore:false}:response};}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../replay.js'),'utf8'),context);
 return {node,requests,draws,renders,times,advance:time=>animate(time)};
}
const settle=()=>new Promise(r=>setImmediate(r));
(async()=>{
 const f=fixture();await settle();assert.equal(f.node('#viewer').hidden,false);assert.equal(f.node('#gas').value,1);assert.match(f.node('#velocity').textContent,/36 km/);
 f.node('#seek').value='.75';f.node('#seek').oninput();assert.equal(f.node('#brake').value,1);assert.equal(f.node('#steer').textContent,'-50 %');assert.match(f.node('#clock').textContent,/0.750/);
 f.node('#play').onclick();f.advance(100);assert.match(f.node('#clock').textContent,/0.850/);
 f.node('#play').onclick();f.advance(200);assert.match(f.node('#clock').textContent,/0.850/,'Pause holds the selected frame');
 f.node('#restart').onclick();assert.match(f.node('#clock').textContent,/0.000/);
 f.node('#speed').value='4';f.node('#play').onclick();f.advance(300);assert.match(f.node('#clock').textContent,/1.000/);assert.match(f.node('#play').textContent,/Toista/,'End of lap pauses playback');
 const pose=require('../replay-pose.js');
 const first=pose.capture({steerAngle:.1,suspension:{pitch:.02,roll:.04,heave:.03,centreHeight:.3,motionRatio:.7,wheels:Array.from({length:4},()=>({z:.01,travel:.02,load:100}))}});
 const second=pose.capture({steerAngle:.3,suspension:{pitch:.06,roll:.08,heave:.05,centreHeight:.3,motionRatio:.7,wheels:Array.from({length:4},()=>({z:.03,travel:.04,load:200}))}});
 const visual={...sample,sceneRevision:'revision',visualState:true,frames:sample.frames.map((f,i)=>[...f,i?second:first])};
 const cockpit=fixture({response:visual,driver:true});await settle();assert.equal(cockpit.node('#driver-view').hidden,false);assert.equal(cockpit.node('#track').hidden,true);
 cockpit.node('#seek').value='.25';cockpit.node('#seek').oninput();const car=cockpit.renders.at(-1).snapshot;
 assert(Math.abs(car.steerAngle-.2)<1e-8);assert(Math.abs(car.suspension.pitch-.04)<1e-8);assert(Math.abs(car.suspension.roll-.06)<1e-8);assert.equal(car.suspension.wheels[0].load,150);
 assert.equal(cockpit.renders[0].car,cockpit.renders.at(-1).car,'Renderer retains the car identity used by its visual steering state');
 assert.equal(cockpit.times.at(-1),1250,'Pedestrians use the recorded absolute session time, including flying laps');
 cockpit.node('#view').value='map';cockpit.node('#view').onchange();assert.equal(cockpit.node('#driver-view').hidden,true);assert.equal(cockpit.node('#track').hidden,false);
 const mismatch=fixture({response:{...visual,sceneRevision:'other'},driver:true});await settle();assert.equal(mismatch.renders.length,0);assert.match(mismatch.node('#view-note').textContent,/rataversio/);
 assert.match(f.node('#view-note').textContent,/2D/,'WebGL failure falls back with a visible explanation');
 const missing=fixture({error:404});await settle();assert.equal(missing.node('#viewer').hidden,true);assert.match(missing.node('#status').textContent,/Vanhoilla/);
 assert.equal(missing.node('#report').hidden,true,'Unavailable recordings offer no report form');
 // Reports: signed-out viewers are told to sign in; signed-in viewers send one report with their game login.
 assert.equal(f.node('#report').hidden,false);assert.equal(f.node('#report-form').hidden,true);assert.equal(f.node('#report-signin').hidden,false);
 const login={nickname:'Katsoja',token:'b'.repeat(64),expiresAt:Date.now()+60000};
 const reporter=fixture({account:login});await settle();assert.equal(reporter.node('#report-form').hidden,false);assert.equal(reporter.node('#report-signin').hidden,true);
 reporter.node('#report-reason').value='inputs';reporter.node('#report-note').value='Ohjaus vaihtuu täsmälleen samoin';
 await reporter.node('#report-form').onsubmit({preventDefault(){}});
 const sent=reporter.requests.at(-1);assert.equal(sent.url,'https://board.test/api/verified/report');assert.equal(sent.options.headers.Authorization,'Bearer '+login.token);
 assert.deepEqual(JSON.parse(sent.options.body),{sessionId:'a'.repeat(32),lap:2,reason:'inputs',note:'Ohjaus vaihtuu täsmälleen samoin'});
 assert.match(reporter.node('#report-status').textContent,/välitetty/);assert.equal(reporter.node('#report-form').hidden,true);
 const repeat=fixture({account:login,reportStatus:409});await settle();await repeat.node('#report-form').onsubmit({preventDefault(){}});assert.match(repeat.node('#report-status').textContent,/jo ilmoittanut/);
 const busy=fixture({account:login,reportStatus:429});await settle();await busy.node('#report-form').onsubmit({preventDefault(){}});assert.equal(busy.node('#report-form').hidden,false);assert.equal(busy.node('#report-send').disabled,false,'Rate-limited reports can be retried');
 const expired=fixture({account:{...login,expiresAt:Date.now()-1}});await settle();assert.equal(expired.node('#report-form').hidden,true,'An expired game login cannot report');
 const broken=fixture({response:{...sample,frames:[[120,NaN,0,0,0,0]]}});await settle();assert.equal(broken.node('#viewer').hidden,true);assert.match(broken.node('#status').textContent,/vioittunut/);
 const a=fixture({admin:true});assert.equal(a.requests.length,0,'Private recordings are not requested before login');a.node('#token').value='test-admin-secret';a.node('#login').onsubmit({preventDefault(){}});await settle();assert.equal(a.requests[0].options.headers.Authorization,'Bearer test-admin-secret');assert.equal(a.node('#token').value,'');a.node('#lock').onclick();assert.equal(a.node('#admin-tools').hidden,true);assert.equal(a.node('#viewer').hidden,true);
 console.log('PASS: replay loading, flying-lap timeline, controls, velocity units, seek, play/pause/restart/speed/end, missing/corrupt data, viewer reports, private login and lock');
})().catch(e=>{console.error(e);process.exitCode=1;});
