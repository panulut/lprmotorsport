const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const sample={format:'lpr-replay-v1',hz:120,metresPerWorldUnit:.1,startTick:120,endTick:240,track:[[0,0],[100,0],[100,100]],frames:[[120,0,0,0,10,0],[180,50,0,0,10,0],[240,100,0,0,10,0]],inputs:[[120,1,0,0,false,false,true],[180,0,1,-.5,true,true,true]]};
function fixture({admin=false,response=sample,error=0}={}){
 const nodes=new Map(),requests=[],draws=[];let animate;
 function node(id){if(!nodes.has(id))nodes.set(id,{hidden:true,value:id==='#speed'?'1':'',checked:false,textContent:'',append(){},replaceChildren(){},setAttribute(){},getContext(){return new Proxy({},{get:(_,method)=>(...args)=>{if(method==='translate')draws.push(args);},set:()=>true});}});return nodes.get(id);}
 const document={querySelector:node,createElement:()=>node(Symbol()),addEventListener(){}};
 const context={window:{LPRVerificationConfig:{leaderboard:'https://board.test'}},document,location:{search:admin?'?admin=1':'?session='+'a'.repeat(32)+'&lap=2'},URLSearchParams,Node:class {},AbortSignal,console,performance:{now:()=>0},requestAnimationFrame:f=>{animate=f;},fetch:async(url,options)=>{requests.push({url,options});return {ok:!error,status:error,json:async()=>url.includes('offset=')?{results:[],hasMore:false}:response};}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../replay.js'),'utf8'),context);
 return {node,requests,draws,advance:time=>animate(time)};
}
const settle=()=>new Promise(r=>setImmediate(r));
(async()=>{
 const f=fixture();await settle();assert.equal(f.node('#viewer').hidden,false);assert.equal(f.node('#gas').value,1);assert.match(f.node('#velocity').textContent,/36 km/);
 f.node('#seek').value='.75';f.node('#seek').oninput();assert.equal(f.node('#brake').value,1);assert.equal(f.node('#steer').textContent,'-50 %');assert.match(f.node('#clock').textContent,/0.750/);
 f.node('#play').onclick();f.advance(100);assert.match(f.node('#clock').textContent,/0.850/);
 f.node('#play').onclick();f.advance(200);assert.match(f.node('#clock').textContent,/0.850/,'Pause holds the selected frame');
 f.node('#restart').onclick();assert.match(f.node('#clock').textContent,/0.000/);
 f.node('#speed').value='4';f.node('#play').onclick();f.advance(300);assert.match(f.node('#clock').textContent,/1.000/);assert.match(f.node('#play').textContent,/Toista/,'End of lap pauses playback');
 const missing=fixture({error:404});await settle();assert.equal(missing.node('#viewer').hidden,true);assert.match(missing.node('#status').textContent,/Vanhoilla/);
 const broken=fixture({response:{...sample,frames:[[120,NaN,0,0,0,0]]}});await settle();assert.equal(broken.node('#viewer').hidden,true);assert.match(broken.node('#status').textContent,/vioittunut/);
 const a=fixture({admin:true});assert.equal(a.requests.length,0,'Private recordings are not requested before login');a.node('#token').value='test-admin-secret';a.node('#login').onsubmit({preventDefault(){}});await settle();assert.equal(a.requests[0].options.headers.Authorization,'Bearer test-admin-secret');assert.equal(a.node('#token').value,'');a.node('#lock').onclick();assert.equal(a.node('#admin-tools').hidden,true);assert.equal(a.node('#viewer').hidden,true);
 console.log('PASS: replay loading, flying-lap timeline, controls, velocity units, seek, play/pause/restart/speed/end, missing/corrupt data, private login and lock');
})().catch(e=>{console.error(e);process.exitCode=1;});
