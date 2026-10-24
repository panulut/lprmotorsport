const fs=require('node:fs'),path=require('node:path'),{randomBytes}=require('node:crypto');
(async()=>{
 const secret=process.env.VERIFICATION_SECRET||randomBytes(32).toString('hex');
 const {revision}=require('../verification/world.cjs');
 const directory=path.resolve(__dirname,'../artifacts/verification');fs.mkdirSync(directory,{recursive:true});
 const game=require('../server.js').createServer();
 const service=await require('../verification/server.cjs').createServer({secret,origins:['http://localhost:8000','http://127.0.0.1:8000']});
 const leaderboard=await require('../verification/local-leaderboard.cjs').createLocalLeaderboard({secret,revision,database:path.join(directory,'local.sqlite')});
 const servers=[game,service,leaderboard];
 try{for(const [i,server]of servers.entries())await new Promise((resolve,reject)=>{server.once('error',reject);server.listen([8000,8081,8788][i],'127.0.0.1',resolve);});}
 catch(error){for(const server of servers)server.close();throw error;}
 console.log('Peli ja paikallinen ajovarmennus: http://127.0.0.1:8000\nVahvista nimimerkki ja tietojen kerääminen. Aloita ajo käynnistää varmennuksen automaattisesti.');
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{for(const server of servers){server.close();server.closeAllConnections();}void service.sessions.close();});
})().catch(error=>{console.error(error.message);process.exitCode=1;});
