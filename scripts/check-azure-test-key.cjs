// Checks that LPR_AZURE_TEST_SIGNING_KEY matches the TEST Worker, without Azure.
// Creates one AzKey… test account in the TEST database, then signs out.
// Never prints the key itself.
const {randomBytes}=require('node:crypto');
const {TEST_WORKER,ORIGIN}=require('../verification/azure-test-bootstrap.cjs');
const {revision}=require('../verification/world.cjs');
const key=process.env.LPR_AZURE_TEST_SIGNING_KEY||'';
async function post(route,body,token){
 const r=await fetch(TEST_WORKER+route,{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 const text=await r.text();if(!r.ok)throw Error(route+' HTTP '+r.status+' '+text.slice(0,200));return JSON.parse(text);
}
(async()=>{
 console.log('Key length:',key.length,'(needs at least 32)');
 const odd=[...key].filter(c=>c<'!'||c>'~').length;
 console.log('Spaces, line breaks or control characters in key:',odd,odd?'<- PROBLEM: pasted extra characters':'(ok)');
 if(key.length<32){console.log('RESULT: key missing or too short.');process.exitCode=1;return;}
 const {verify}=await import('../verification/protocol.mjs');
 const nickname='AzKey'+randomBytes(4).toString('hex'),password=randomBytes(24).toString('hex');
 const {token}=await post('/api/verified/account',{nickname,password,create:true,series:'human'});
 try{
  const {ticket}=await post('/api/verified/start',{revision},token);
  try{const c=await verify(ticket,key);console.log('RESULT: OK. Key matches the TEST Worker (ticket kind '+c.kind+').');}
  catch{console.log('RESULT: WRONG KEY. TEST Worker signs with a different VERIFICATION_SECRET.');process.exitCode=1;}
 }finally{await post('/api/verified/logout',{},token).catch(()=>{});}
})().catch(e=>{console.log('RESULT: check could not run:',e.message);process.exitCode=1;});
