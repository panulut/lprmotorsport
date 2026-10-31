const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {build,root}=require('../scripts/build.cjs');
const {createServer}=require('../server.js');
const vm=require('node:vm');
const gameHtml=fs.readFileSync(path.join(root,'index.html'),'utf8');
const entry=gameHtml.match(/<script id="local-game-entry">([\s\S]*?)<\/script>/)[1];
for(const protocol of ['file:','http:','https:']){
  let destination;
  vm.runInNewContext(entry,{window:{location:{protocol,replace(url){destination=url;}}}});
  assert.equal(destination,protocol==='file:'?'http://localhost:8000/':undefined,
    'A directly opened game must use the same server data as the local editor');
}
{
  let destination;
  vm.runInNewContext(entry,{window:{location:{protocol:'file:',search:'?test-scene=sauna',replace(url){destination=url;}}}});
  assert.equal(destination,'http://localhost:8000/?test-scene=sauna');
}
const game=fs.readFileSync(path.join(root,'game.js'),'utf8');
const editorHtml=fs.readFileSync(path.join(root,'tools/track-editor/editor.html'),'utf8');
function gameFunction(name){
  const start=game.indexOf(`  function ${name}(`);
  assert.ok(start>=0,name);
  const next=game.indexOf('\n  function ',start+1);
  return game.slice(start,next<0?game.lastIndexOf('\n})();'):next);
}
for(const scene of ['sale','sauna','pool',null,'unknown']){
  const saunaStop={x:100,y:200},poolStop={x:150,y:250},entrance={x:300,y:400};
  const car={x:0,y:0,speed:0};
  const node=()=>({textContent:'',classList:{add(){}}});
  let saunaEntered=false;
  const context={URLSearchParams,car,window:{LPRSale:{entrance}},renderer:{saunaStop,poolStop},
    ui:{dialog:{open:false},speed:node(),lateralG:node(),grip:node(),tc:node(),notice:node()},
    dynamics:{reset(car){car.speed=0;}},saunaLife:{enter(){saunaEntered=true;},leave(){}},
    t:text=>text,clearInput(){},stopLooking(){},updateSaunaUI(){},updateDriveHud(){},
    nearSale:()=>Math.hypot(car.x-entrance.x,car.y-entrance.y)<40,
    nearSauna:()=>Math.hypot(car.x-saunaStop.x,car.y-saunaStop.y)<40,
    nearPool:()=>Math.hypot(car.x-poolStop.x,car.y-poolStop.y)<42};
  vm.createContext(context);
  for(const name of ['toggleSale','toggleSauna','togglePool','openTestScene'])vm.runInContext(gameFunction(name),context);
  context.openTestScene(scene===null?'':`?test-scene=${scene}`);
  const valid=['sale','sauna','pool'].includes(scene);
  assert.equal(saunaEntered,scene==='sauna');
  if(valid){
    assert.equal(car[scene],true,`Enter ${scene} directly`);
    const stop=scene==='sale'?entrance:scene==='sauna'?saunaStop:poolStop;
    assert.equal(car.x,stop.x);assert.equal(car.y,stop.y);
    assert.ok(editorHtml.includes(`href="../../index.html?test-scene=${scene}" target="_blank"`));
    assert.equal(car.speed,0);
  }else{
    assert.equal(car.x,0);assert.equal(car.y,0);
  }
}
const editor=fs.readFileSync(path.join(root,'tools/track-editor/editor.js'),'utf8');
assert.match(editor,/fetch\('\/api\/dev\/track-objects'/);
assert.match(editor,/JSON\.stringify\(\{version:1,objects:JSON\.parse\(snapshot\)\}\)/);
assert.match(editor,/rotate-left/);
assert.match(editor,/rotate-right/);
assert.match(editor,/drawRotationHandle/);
assert.match(editor,/mode:'rotate'/);
assert.match(editor,/o\.angle=drag\.originAngle/);
assert.doesNotMatch(editor,/trackCones/);
async function check(production){
  const server=createServer({production});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base+'/')).status,200);
    assert.equal((await fetch(base+'/tools/track-editor/editor.html')).status,production?404:200);
    assert.equal((await fetch(base+'/tools/track-editor/editor.js')).status,production?404:200);
    assert.equal((await fetch(base+'/tools/track-editor/editor.css')).status,production?404:200);
    assert.equal((await fetch(base+'/editor.html')).status,404);
    assert.equal((await fetch(base+'/server.js')).status,404);
    assert.equal((await fetch(base+'/.env')).status,404);
    assert.equal((await fetch(base+'/design-system.html')).status,production?404:200);
    if(production){
      for(const route of ['/api/dev/design-preview','/api/verified/leaderboard','/api/chat','/health','/spectate'])
        assert.equal((await fetch(base+route,{headers:{referer:base+'/?demo=1'}})).status,404,route);
      const config=await(await fetch(base+'/verification/config.js')).text();
      assert.doesNotMatch(config,/local-demo|Aino Korhonen|demo:true/);
      assert.match(config,/lpr-verification\.onrender\.com/);
    }else{
      const preview=await(await fetch(base+'/api/dev/design-preview')).json();
      assert.equal(preview.mode,'demo-only');
      assert.equal(Object.hasOwn(preview,'accountPassword'),false);
    }
    assert.equal((await fetch(base+'/data/track-data.js')).status,200);
    assert.equal((await fetch(base+'/spectate-menu.js')).status,200,'the local API prefix must not swallow the static spectate menu module');
    if(!production){
      assert.equal((await fetch(base+'/spectate',{headers:{referer:base+'/'}})).status,404,'demo API requires an explicit opt-in');
      assert.equal((await fetch(base+'/spectate',{headers:{referer:base+'/?demo=1'}})).status,200,'the local spectate API route remains available');
    }
    const html=await(await fetch(base+'/')).text();
    assert.ok(!html.includes('editor'));
    for(const match of html.matchAll(/(?:src|href)="([^"?#]+)(?:[^" ]*)"/g)) {
      if(match[1].startsWith('assets/')||match[1].endsWith('.js')||match[1].endsWith('.css'))assert.equal((await fetch(base+'/'+match[1])).status,200,match[1]);
    }
    const api=base+'/api/dev/track-objects';
    assert.equal((await fetch(api,{method:'PUT',headers:{'Content-Type':'application/json',Origin:'https://example.com'},body:'{}'})).status,production?404:403);
    if(!production){const port=new URL(base).port;assert.equal((await fetch(api,{method:'PUT',headers:{'Content-Type':'application/json',Host:`attacker.example:${port}`,Origin:`http://attacker.example:${port}`},body:'{}'})).status,403);}
    if(!production){
      assert.equal((await fetch(api,{method:'PUT',headers:{'Content-Type':'application/json',Origin:base},body:'{"version":2,"objects":[]}'})).status,400);
      const file=path.join(root,'data/track-objects.json'),original=fs.readFileSync(file);
      try{
        const doc={version:1,objects:[{type:'cone',x:100,y:100,angle:0,scale:1},
          {type:'hill',x:500,y:600,angle:0,scale:.5,height:7},
          {type:'barrier',x:600,y:700,angle:.3,scale:1,length:23},
          {type:'asphalt',x:800,y:900,angle:0,scale:1,square:true,roundness:.2},
          {type:'person',x:200,y:300,angle:0,scale:1,personId:0}]};
        assert.equal((await fetch(api,{method:'PUT',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(doc)})).status,200);
        assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),doc);
        assert.deepEqual(await(await fetch(base+'/data/track-objects.json',{cache:'no-store'})).json(),doc,
          'Editor read-back must preserve hills, barrier lengths, asphalt shapes and person identities');
        assert(!fs.readdirSync(path.dirname(file)).some(name=>name.startsWith('.track-objects-')),
          'Atomic saving must not leave temporary files');
        assert.ok((await(await fetch(base+'/data/track-data.js')).text()).includes('"cone"'));
        if(process.platform==='win32'){
          const updated={version:1,objects:[{type:'cone',x:200,y:300,angle:0,scale:1}]};
          const rename=fs.renameSync;
          fs.renameSync=()=>{const error=Error('Simulated Windows replacement lock');error.code='EPERM';throw error;};
          try{
            const response=await fetch(api,{method:'PUT',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(updated)});
            assert.equal(response.status,200,await response.text());
            assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),updated,
              'Windows EPERM fallback must save and truncate the existing file');
          }finally{fs.renameSync=rename;}
          assert(!fs.readdirSync(path.dirname(file)).some(name=>name.startsWith('.track-objects-')),
            'Windows fallback must clean up its temporary file');
        }
      }finally{fs.writeFileSync(file,original);}
    }
  }finally{await new Promise(resolve=>server.close(resolve));}
}
(async()=>{
  const output=build();
  for(const match of gameHtml.matchAll(/(?:src|href)="([^"?#]+)(?:\?[^"#]*)?"/g)){
    const file=match[1];
    if(/\.(?:js|css)$/.test(file)&&!file.includes('://'))assert(fs.existsSync(path.join(output,file)),`Build includes ${file}`);
  }
  assert.ok(!fs.existsSync(path.join(output,'tools')));
  assert.ok(!fs.existsSync(path.join(output,'server.js')));
  assert.ok(!fs.existsSync(path.join(output,'tests')));
  assert.ok(!fs.existsSync(path.join(output,'design-system.html')));
  assert.ok(!fs.existsSync(path.join(output,'.env')));
  assert.ok(fs.existsSync(path.join(output,'assets/fonts/OFL.txt')));
  assert.ok(fs.existsSync(path.join(output,'assets/fonts/STACK-SANS-OFL.txt')));
  assert.ok(fs.existsSync(path.join(output,'assets/fonts/inter-400.woff2')));
  const releaseFiles=[];
  (function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else releaseFiles.push(file);}})(output);
  assert.ok(!releaseFiles.some(file=>file.endsWith('.ttf')),'Desktop font files stay out of the player package');
  const releaseText=releaseFiles.filter(file=>/\.(?:js|css|html|json|txt|md|svg)$/i.test(file)).map(file=>fs.readFileSync(file,'utf8')).join('\n');
  assert.doesNotMatch(releaseText,/demo1234|local-demo|DEMO_ACCOUNT_PASSWORD|DEMO_DRIVER_NAME|Aino Korhonen/);
  const releaseConfig=fs.readFileSync(path.join(output,'verification/config.js'),'utf8');
  assert.equal(releaseConfig.includes('127.0.0.1'),false);
  assert.equal(releaseConfig.includes('localhost'),false);
  assert.match(releaseConfig,/"mode":"production"/);
  await check(false);await check(true);
  console.log('PASS: game build, separate editor, local write protection and project data save');
})().catch(e=>{console.error(e);process.exitCode=1;});
