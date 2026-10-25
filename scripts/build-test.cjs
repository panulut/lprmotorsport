// Test-only deployment. Never reuse production data endpoints or signing keys.
const fs=require('node:fs'),path=require('node:path');
const {build}=require('./build.cjs');
const target=build();
const config={environment:'testing',service:'https://lpr-verification-test.onrender.com',leaderboard:'https://lpr-verified-test.panu-musakka-0bf.workers.dev'};
fs.writeFileSync(path.join(target,'verification/config.js'),'window.LPRVerificationConfig='+JSON.stringify(config)+';\n');
for(const file of ['leaderboard.js','analytics.js']){
 const full=path.join(target,file),source=fs.readFileSync(full,'utf8');
 if(!source.includes('https://lpr-leaderboard.panu-musakka.workers.dev'))throw Error('Analytics endpoint changed: review test isolation');
 fs.writeFileSync(full,source.replaceAll('https://lpr-leaderboard.panu-musakka.workers.dev','https://lpr-analytics-test.panu-musakka-0bf.workers.dev'));
}
const index=path.join(target,'index.html');
fs.writeFileSync(index,fs.readFileSync(index,'utf8').replace('<body>','<body><div style="position:fixed;z-index:99999;top:0;left:0;right:0;text-align:center;background:#d1ef85;color:#132319;font:700 12px system-ui;pointer-events:none">TESTIVERSIO · OMAT TESTITULOKSET</div>'));
console.log('Built isolated testing site: '+target);
