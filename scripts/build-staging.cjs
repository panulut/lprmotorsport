const fs=require('node:fs'),path=require('node:path');
const {build,gameFiles}=require('./build.cjs');
const {protocol}=require('../verification/protocol.mjs');
const production=new Set([
 'panulut.github.io',
 'lpr-verification.onrender.com',
 'lpr-verification-prod.agreeablesky-be9aabca.swedencentral.azurecontainerapps.io',
 'lpr-verified.panu-musakka.workers.dev',
 'lpr-leaderboard.panu-musakka.workers.dev'
]);
const stagingHostPattern=/(?:^|[-.])(?:test|staging)(?:[-.]|$)/i;
const banner='<div role="note" style="padding:8px;text-align:center;background:#ffe08a;color:#17231b;font:700 14px system-ui">TESTIVERSIO · Tulokset tallentuvat erilliselle testilistalle.</div>';
function testURL(value,{allowLoopback=false}={}){
 const url=new URL(value);
 const isLoopback=allowLoopback&&url.protocol==='http:'&&(url.hostname==='127.0.0.1'||url.hostname==='localhost')&&Boolean(url.port);
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||production.has(url.hostname))throw Error('An isolated HTTPS test endpoint is required');
 if(!isLoopback&&(url.protocol!=='https:'||!stagingHostPattern.test(url.hostname)))throw Error('An isolated HTTPS test endpoint is required');
 return url.origin;
}
function buildStaging(env=process.env,destination,{allowLoopback=false}={}){
 const service=testURL(env.LPR_TEST_SERVICE_URL,{allowLoopback}),leaderboard=testURL(env.LPR_TEST_LEADERBOARD_URL,{allowLoopback}),analytics=testURL(env.LPR_TEST_ANALYTICS_URL,{allowLoopback});
 const target=build(destination);
 fs.writeFileSync(path.join(target,'verification/config.js'),`window.LPRVerificationConfig=${JSON.stringify({service,leaderboard,mode:'staging'})};\n`);
 for(const file of ['analytics.js','leaderboard.js']){
  const original=fs.readFileSync(path.join(target,file),'utf8');
  const changed=original.replaceAll('https://lpr-leaderboard.panu-musakka.workers.dev',analytics);
  if(changed===original)throw Error('Test endpoint replacement failed: '+file);
  fs.writeFileSync(path.join(target,file),changed);
 }
 for(const htmlFile of ['index.html','replay.html']){
  const filePath=path.join(target,htmlFile);
  const original=fs.readFileSync(filePath,'utf8');
  let changed=original.replace('<body>',`<body>\n${banner}`);
  if(changed===original)throw Error('Test banner injection failed: '+htmlFile);
  // The Content-Security-Policy may only allow the isolated test services.
  const policy=changed.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1];
  if(!policy)throw Error('Content-Security-Policy missing: '+htmlFile);
  let testPolicy=policy;
  for(const [productionURL,testOrigin] of [['https://lpr-verification-prod.agreeablesky-be9aabca.swedencentral.azurecontainerapps.io',service],['https://lpr-verified.panu-musakka.workers.dev',leaderboard],['https://lpr-leaderboard.panu-musakka.workers.dev',analytics]]){
   if(!testPolicy.includes(' '+productionURL+' '))throw Error('Content-Security-Policy endpoint missing: '+productionURL);
   testPolicy=testPolicy.replace(' '+productionURL+' ',' '+testOrigin+' ');
  }
  changed=changed.replace(policy,testPolicy);
  fs.writeFileSync(filePath,changed);
 }
 for(const file of gameFiles){
  const text=fs.readFileSync(path.join(target,file),'utf8');
  for(const host of production){
   if(text.includes(host))throw Error(`Production endpoint leaked into staging build (${file}: ${host})`);
  }
 }
 const revision=require('../verification/world.cjs').revision;
 const commit=env.LPR_TEST_GIT_COMMIT||env.GITHUB_SHA||env.RENDER_GIT_COMMIT||null;
 const features=['accounts','guests','guest-promotion','timing-panel','championship','chat-tickets','replays','spectate'];
 fs.writeFileSync(path.join(target,'staging.json'),JSON.stringify({environment:'staging',protocol,service,leaderboard,analytics,revision,commit,features},null,2));
 return target;
}
module.exports={buildStaging,testURL,production};
if(require.main===module)console.log('Testipelin julkaisupaketti: '+buildStaging());
