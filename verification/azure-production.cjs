// Production has its own contract; the isolated azure-test image keeps its guards.
const productionOrigins=new Set(['https://panulut.github.io','https://lprmotorsports.me']);
const chatURL='https://lpr-verified.panu-musakka.workers.dev/api/verified/chat-storage';
const capacityURL='https://lpr-leaderboard.panu-musakka.workers.dev/api/internal/capacity';
function validateAzureProduction({secret,metricsToken,origins,chatStorageURL,capacityReportURL,sessionsOptions},env=process.env){
 if(env.VERIFICATION_ENVIRONMENT===undefined)return;
 if(env.VERIFICATION_ENVIRONMENT!=='azure-production')throw Error('Unsupported verification environment for this image');
 for(const [key,value]of Object.entries({NODE_ENV:'production',VERIFICATION_PUBLIC:'1',PORT:'8081',
  MAX_VERIFIED_SESSIONS:'5',MAX_VERIFIED_STARTS_PER_MINUTE:'8',VERIFICATION_WORKERS:'1',
  VERIFICATION_WORKER_HEAP_MB:'256',VERIFICATION_LAP_LAG_MS:'2000'}))
  if(env[key]!==value)throw Error('Azure production requires '+key+'='+value);
 if(!/^[a-f0-9]{40}$/.test(env.LPR_RELEASE_COMMIT||''))throw Error('Azure production requires an immutable source commit');
 if(typeof secret!=='string'||secret.length<32)throw Error('Azure production signing key is missing');
 if(typeof metricsToken!=='string'||metricsToken.length<32||metricsToken===secret)throw Error('Azure production requires a separate metrics key');
 if(chatStorageURL!==chatURL||capacityReportURL!==capacityURL)throw Error('Azure production requires the production chat and capacity endpoints');
 const configured=(env.GAME_ORIGINS||'').split(',');
 if(configured.some(origin=>!productionOrigins.has(origin))||!Array.isArray(origins)||
  origins.length!==configured.length||origins.some(origin=>!configured.includes(origin)))
  throw Error('Azure production requires exact production origins');
 if(sessionsOptions&&Object.keys(sessionsOptions).length)throw Error('Azure production session overrides are forbidden');
}
module.exports={validateAzureProduction};
