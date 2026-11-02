// The game pages forbid inline scripts and only talk to the game's own services.
// This also catches a service move (e.g. a new verification host) that forgets the policy.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const policyOf=html=>{
 const value=html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1];
 assert(value,'Content-Security-Policy meta tag is present');
 return Object.fromEntries(value.split(';').map(part=>part.trim().split(/\s+/)).filter(([name])=>name).map(([name,...sources])=>[name,sources]));
};
const pages=['index.html','replay.html'];
const policies=pages.map(page=>policyOf(read(page)));
assert.deepEqual(policies[1],policies[0],'Game and replay pages share one policy');
const [policy]=policies;
assert.deepEqual(policy['script-src'],["'self'"],'No inline or evaluated scripts');
assert.deepEqual(policy['object-src'],["'none'"]);assert.deepEqual(policy['base-uri'],["'none'"]);
for(const page of pages){
 const html=read(page);
 assert.equal([...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>/g)].length,0,`${page} has no inline scripts`);
 assert(!/\son[a-z]+\s*=\s*["']/i.test(html),`${page} has no inline event handlers`);
 // Content before the policy is not covered by it; only the file:// redirect may come first.
 const before=html.slice(0,html.indexOf('Content-Security-Policy'));
 assert.deepEqual([...before.matchAll(/<script\b[^>]*>/g)].map(m=>m[0]),page==='index.html'?['<script id="local-game-entry" src="local-entry.js">']:[]);
}
// Every production endpoint the browser calls must be allowed, and nothing else remote.
const config=read('verification/config.js'),production=config.match(/\{service:'(https:[^']+)',leaderboard:'(https:[^']+)',mode:'production'\}/);
assert(production,'Production endpoints are found in verification/config.js');
const analytics=read('analytics.js').match(/const endpoint = '(https:[^']+)'/)[1];
assert.equal(read('leaderboard.js').match(/const endpoint = '(https:[^']+)'/)[1],analytics);
const remote=policy['connect-src'].filter(source=>source.startsWith('https:'));
assert.deepEqual(remote.sort(),[production[1],production[2],analytics].sort(),'connect-src lists exactly the production services');
assert.deepEqual(policy['connect-src'].filter(source=>!source.startsWith('https:')),["'self'",'http://localhost:*','http://127.0.0.1:*'],
 'Only the page itself and local development servers are otherwise allowed');

// The staging build swaps the policy to the isolated test services.
const {buildStaging}=require('../scripts/build-staging.cjs');
// Builds must stay inside the project; dist/ is ignored by Git.
const destination=path.join(root,'dist','csp-staging-test-'+process.pid);
try{
 const target=buildStaging({LPR_TEST_SERVICE_URL:'https://verification-test.example',LPR_TEST_LEADERBOARD_URL:'https://verified-test.example',
  LPR_TEST_ANALYTICS_URL:'https://analytics-test.example'},destination);
 for(const page of pages){
  const staged=policyOf(fs.readFileSync(path.join(target,page),'utf8'));
  assert.deepEqual(staged['connect-src'].filter(source=>source.startsWith('https:')).sort(),
   ['https://analytics-test.example','https://verification-test.example','https://verified-test.example'],`${page}: staging policy allows only test services`);
  assert.deepEqual(staged['script-src'],["'self'"]);
 }
}finally{fs.rmSync(destination,{recursive:true,force:true});}
console.log('PASS: game pages forbid inline scripts, allow exactly the production services, and staging swaps in test services');
