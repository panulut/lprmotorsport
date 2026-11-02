// Builds reviewable artifacts only; never writes to a cloud service.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {buildStaging,testURL}=require('./build-staging.cjs');
const {revision}=require('../verification/world.cjs');
const {protocol}=require('../verification/protocol.mjs');
const targets=require('../verification/staging-targets.json');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/integration/staging-release');
const commit=process.env.LPR_TEST_GIT_COMMIT||process.env.GITHUB_SHA;
if(!/^[a-f0-9]{40}$/.test(commit||''))throw Error('Set LPR_TEST_GIT_COMMIT to the full source commit');
const {execFileSync}=require('node:child_process');
if(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()!==commit)
 throw Error('Release commit must be the checked-out source commit');
if(execFileSync('git',['status','--porcelain','--untracked-files=all'],{cwd:root,encoding:'utf8'}).trim())
 throw Error('Commit the reviewed changes before preparing release artifacts');
for(const key of ['site','service','leaderboard','analytics'])testURL(targets[key]);
const worker=fs.readFileSync(path.join(root,'cloudflare/verified-worker.bundle.mjs'),'utf8');
if(!worker.includes('const BUILD_REVISION='+JSON.stringify(revision)+';'))throw Error('Rebuild verified Worker for this revision');
buildStaging({LPR_TEST_SERVICE_URL:targets.service,LPR_TEST_LEADERBOARD_URL:targets.leaderboard,
 LPR_TEST_ANALYTICS_URL:targets.analytics,LPR_TEST_GIT_COMMIT:commit},path.join(out,'site'));
fs.mkdirSync(path.join(out,'workers'),{recursive:true});
for(const file of ['verified-worker.bundle.mjs','worker.mjs'])fs.copyFileSync(path.join(root,'cloudflare',file),path.join(out,'workers',file));
const files={};
function hashes(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
 const full=path.join(dir,entry.name);if(entry.isDirectory())hashes(full);
 else if(full!==path.join(out,'release.json'))files[path.relative(out,full).split(path.sep).join('/')]=createHash('sha256').update(fs.readFileSync(full)).digest('hex');
}}
hashes(out);
fs.writeFileSync(path.join(out,'release.json'),JSON.stringify({commit,revision,protocol,targets,files,
 azureEnvironment:{GAME_ORIGINS:targets.site,CHAT_STORAGE_URL:targets.leaderboard+'/api/verified/chat-storage',
  VERIFICATION_ENVIRONMENT:'azure-test',VERIFICATION_PUBLIC:'1',PORT:'8081',MAX_VERIFIED_SESSIONS:'2',MAX_VERIFIED_STARTS_PER_MINUTE:'100'},
 renderEnvironment:{LPR_TEST_SERVICE_URL:targets.service,LPR_TEST_LEADERBOARD_URL:targets.leaderboard,LPR_TEST_ANALYTICS_URL:targets.analytics},
 workerEnvironment:{GAME_ORIGINS:targets.site,SIMULATION_REVISION:revision,RELEASE_COMMIT:commit},
 secretPolicy:'Use the Azure test signing key for lpr-verified-test only. Preserve unrelated secrets. Never use production credentials.'},null,2)+'\n');
console.log(JSON.stringify({output:out,commit,revision,protocol,files:Object.keys(files).length}));
