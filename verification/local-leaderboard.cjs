// Local adapter for the same Worker and SQL used in production. No external writes.
const {DatabaseSync}=require('node:sqlite');
const http=require('node:http');
async function createLocalLeaderboard({secret,revision,database=':memory:',origins='http://localhost:8000,http://127.0.0.1:8000'}={}){
 const {default:worker,schema}=await import('../cloudflare/verified-worker.mjs');
 const db=new DatabaseSync(database);for(const sql of schema)db.exec(sql);
 const binding={prepare(sql){let values=[];return {
  bind(...args){values=args;return this;},async first(){return db.prepare(sql).get(...values)||null;},
  async all(){return {results:db.prepare(sql).all(...values)};},
  async run(){return {meta:{changes:Number(db.prepare(sql).run(...values).changes)}};}
 };}};
 const env={DB:binding,VERIFICATION_SECRET:secret,SIMULATION_REVISION:revision,GAME_ORIGINS:origins};
 const server=http.createServer(async(req,res)=>{
  try{
   const chunks=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>8192){res.writeHead(413);res.end();return;}chunks.push(chunk);}
   const request=new Request('http://localhost'+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
   const response=await worker.fetch(request,env);
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end('Local worker failed');}
 });
 server.on('close',()=>db.close());server.db=db;
 return server;
}
module.exports={createLocalLeaderboard};
