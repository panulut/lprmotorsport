(function(root){
 class LiveClient {
  constructor({revision,token='',ticket,armed=false,base='',fetch:request=root.fetch.bind(root),onUpdate=()=>{},onLost=()=>{},onLaps=null,maxBufferedTicks=2400,recoveryWindowMs=15000,requestTimeoutMs=5000}={}){
   Object.assign(this,{revision,token,ticket,armed,base,request,onUpdate,onLost,onLaps,maxBufferedTicks,recoveryWindowMs,requestTimeoutMs});this.active=false;this.queue=[];this.seq=0;this.tick=0;this.generation=0;this.flushThrough=0;this.boundaries=[];
  }
  async start(){
   // Wake a sleeping free service before allocating the timed driving session.
   const healthResponse=await this.request(this.base+'/health',{signal:AbortSignal.timeout(90000)});
   if(!healthResponse.ok)throw Error('Verification service is not ready');
   const health=await healthResponse.json();
   if(!health.streaming||health.revision!==this.revision)throw Error('Verification service version changed; reload the page');
   const response=await this.request(this.base+'/sessions',{method:'POST',headers:{'Content-Type':'application/json',...(this.token?{Authorization:'Bearer '+this.token}:{})},body:JSON.stringify({revision:this.revision,...(this.ticket?{ticket:this.ticket}:{}),...(this.armed?{armed:true}:{})}),signal:AbortSignal.timeout(25000)});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Session start failed');
   this.session=data;this.active=true;this.started=performance.now();this.onUpdate({phase:'ready',ackTick:0,result:data.initial});return data;
  }
  async activate(){
   if(!this.armed)return;
   const response=await this.request(this.base+'/sessions/'+this.session.id+'/start',{method:'POST',headers:{Authorization:'Bearer '+this.session.sessionToken},signal:AbortSignal.timeout(6500)});
   if(!response.ok)throw Error('Verified start could not be activated');
   const result=await response.json();if(result.phase!=='running'||result.ackTick!==0)throw Error('Invalid verified start');
  }
  enqueue(input){
   if(!this.active)return;
   this.queue.push([...input]);
   if(this.queue.length>this.maxBufferedTicks){this.lose('Yhteys ei pysy ajon mukana. Jatka harjoittelua.');return;}
   if(this.queue.length>=60)void this.flush().catch(()=>{});
  }
  async flush(final=false){
   // Force only the inputs queued at this call, not future flying-lap inputs.
   if(final){
    this.flushThrough=Math.max(this.flushThrough,this.tick+this.queue.length);
    if(this.flushThrough>this.tick&&!this.boundaries.includes(this.flushThrough))this.boundaries.push(this.flushThrough);
   }
   if(this.pumping)return this.pumping;
   if(!this.active)return;
   this.pumping=this.pump();
   try{return await this.pumping;}finally{this.pumping=null;}
  }
  async pump(){
   const generation=this.generation;
   try{
    while(this.active&&generation===this.generation&&(this.queue.length>=60||(this.tick<this.flushThrough&&this.queue.length))){
     const boundary=this.boundaries[0]??Infinity;
     const inputs=this.queue.slice(0,Math.min(120,boundary-this.tick)),payload={revision:this.revision,seq:this.seq,fromTick:this.tick,inputs};
     const body=JSON.stringify(payload),deadline=performance.now()+this.recoveryWindowMs;
     let ack,retries=0;
     for(;;){
      if(!this.active||generation!==this.generation)return;
      try{
       const remaining=deadline-performance.now();
       if(remaining<=0)throw Object.assign(Error('Verification connection could not recover in time'),{retryable:false,code:'recovery_timeout'});
       const response=await this.request(this.base+'/sessions/'+this.session.id+'/inputs',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.session.sessionToken},body,signal:AbortSignal.timeout(Math.max(1,Math.min(this.requestTimeoutMs,Math.ceil(remaining))))});
       ack=await response.json();
       if(!response.ok){const error=Object.assign(Error(ack.error||'Input verification failed'),{retryable:[425,429,502,503,504].includes(response.status)||ack.retryable===true,retryAfterMs:ack.retryAfterMs,code:ack.code||'http_'+response.status});throw error;}
       break;
      }catch(error){
       if(error.retryable===false||performance.now()>=deadline)throw error;
       retries++;
       this.onUpdate({phase:'recovering',ackTick:this.tick,bufferedTicks:this.queue.length,attempt:retries,code:error.code||error.name||'network'});
       await new Promise(r=>setTimeout(r,Math.min(750,Math.max(200,error.retryAfterMs||250))));
      }
     }
     if(!this.active||generation!==this.generation)return;
     if(ack.seq!==this.seq||ack.ackTick!==this.tick+inputs.length)throw Error('Invalid server acknowledgment');
     this.queue.splice(0,inputs.length);this.tick=ack.ackTick;this.seq++;
     let crossedBoundary=false;
     while(this.boundaries.length&&this.boundaries[0]<=this.tick){this.boundaries.shift();crossedBoundary=true;}
     this.onUpdate({...ack,bufferedTicks:this.queue.length,recovered:retries>0});
     if(this.onLaps&&crossedBoundary)void this.collectLaps().catch(()=>{});
     if(ack.verified){if(this.queue.length)throw Error('Inputs continue after the server finish');this.active=false;return ack;}
    }
   }catch(error){this.lose(error.message,{code:error.code||error.name||'request_failed',seq:this.seq,ackTick:this.tick,bufferedTicks:this.queue.length});throw error;}
  }
  lose(message,details={}){const wasActive=this.active;this.active=false;this.generation++;this.queue=[];if(wasActive){this.onLost(message,details);void this.cancel();}}
  async collectLaps(){
   if(!this.session||!this.onLaps)return;
   this.collectAgain=true;
   if(this.collecting)return this.collecting;
   const session=this.session;
   this.collecting=(async()=>{
    while(this.collectAgain){
     this.collectAgain=false;
     let error;
     for(let attempt=0;attempt<3;attempt++){
      try{
       const response=await this.request(this.base+'/sessions/'+session.id+'/laps',{headers:{Authorization:'Bearer '+session.sessionToken},keepalive:true,signal:AbortSignal.timeout(12000)});
       if(!response.ok)throw Error('Finished laps could not be retrieved');
       const data=await response.json();this.onLaps(data.laps||[]);error=null;break;
      }catch(e){error=e;if(attempt<2)await new Promise(r=>setTimeout(r,250));}
     }
     if(error)throw error;
    }
   })();
   try{return await this.collecting;}finally{this.collecting=null;}
  }
  async cancel(){
   this.active=false;this.generation++;this.queue=[];
   // Let an already submitted finish settle before closing its server world.
   if(this.onLaps)await this.pumping?.catch(()=>{});
   if(this.session)try{await this.request(this.base+'/sessions/'+this.session.id,{method:'DELETE',headers:{Authorization:'Bearer '+this.session.sessionToken},keepalive:true,signal:AbortSignal.timeout(5000)});}catch{}
   if(this.onLaps)try{await this.collectLaps();}catch{}
  }
 }
 root.LPRLiveClient=LiveClient;
 if(typeof module==='object')module.exports=LiveClient;
})(typeof window==='object'?window:globalThis);
