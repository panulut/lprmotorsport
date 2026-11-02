const fs=require('node:fs');
const readline=require('node:readline');
const path=require('node:path');

const allowedKeys=new Set(['DEMO_DRIVER_NAME','DEMO_LAP_TIME']);
const fallback={DEMO_DRIVER_NAME:'Mika Laine',DEMO_LAP_TIME:'01:24.508'};

function safeName(value){
  const clean=String(value||'').replace(/[^\p{L}\p{N} ._'’-]/gu,'').trim().slice(0,24);
  const aliases={'Mika Demo':'Mika Laine','Aino Example':'Aino Korhonen','Leo Sample':'Leo Nieminen'};
  return !clean?fallback.DEMO_DRIVER_NAME:aliases[clean]||clean;
}
function safeLapTime(value){
  const clean=String(value||'');
  return /^\d{1,2}:\d{2}\.\d{3}$/.test(clean)?clean:fallback.DEMO_LAP_TIME;
}
async function readDemoEnv(envPath){
  const values={};
  if(fs.existsSync(envPath)){
    const lines=readline.createInterface({input:fs.createReadStream(envPath,{encoding:'utf8'}),crlfDelay:Infinity});
    for await(const line of lines){
      const match=line.match(/^\s*(DEMO_DRIVER_NAME|DEMO_LAP_TIME)\s*=\s*(.*?)\s*$/);
      if(!match)continue;
      let value=match[2];
      if(value.length>=2&&((value[0]==='"'&&value.at(-1)==='"')||(value[0]==="'"&&value.at(-1)==="'")))value=value.slice(1,-1);
      values[match[1]]=value;
    }
  }
  for(const key of allowedKeys)if(typeof process.env[key]==='string')values[key]=process.env[key];
  return values;
}

async function createDesignDemoData(envPath=path.resolve(__dirname,'../.env')){
  const env=await readDemoEnv(envPath);
  const driverName=safeName(env.DEMO_DRIVER_NAME);
  const lapTime=safeLapTime(env.DEMO_LAP_TIME);
  return {
    mode:'demo-only',
    driverName,
    lapTime,
    drivers:[
      {position:1,name:driverName,time:lapTime,status:'verified'},
      {position:2,name:'Aino Korhonen',time:'01:25.104',status:'verified'},
      {position:3,name:'Leo Nieminen',time:'01:26.772',status:'practice'}
    ],
    sessions:[
      {label:'Fastest lap',value:lapTime},
      {label:'Drivers online',value:'12'},
      {label:'Track status',value:'Open'}
    ]
  };
}

function isLoopbackAddress(address){
  return address==='127.0.0.1'||address==='::1'||address==='::ffff:127.0.0.1';
}
function isLocalPreviewRequest(request){
  if(!isLoopbackAddress(request.socket.remoteAddress))return false;
  const host=String(request.headers.host||'').toLowerCase();
  if(!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host))return false;
  for(const header of ['origin','referer']){
    if(!request.headers[header])continue;
    try{
      const url=new URL(request.headers[header]);
      if(url.protocol!=='http:'||url.host.toLowerCase()!==host||!['localhost','127.0.0.1','[::1]'].includes(url.hostname))return false;
    }catch{return false;}
  }
  return true;
}

module.exports={createDesignDemoData,isLocalPreviewRequest};
