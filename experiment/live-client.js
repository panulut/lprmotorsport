(function(root){
 class LiveClient {
  constructor({revision,token='',ticket,armed=false,base='',fetch:request=root.fetch.bind(root),onUpdate=()=>{},onLost=()=>{},maxBufferedTicks=720}={}){
   Object.assign(this,{revision,token,ticket,armed,base,request,onUpdate,onLost,maxBufferedTicks});this.active=false;this.queue=[];this.seq=0;this.tick=0;this.generation=0;this.flushThrough=0;
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
   if(final)this.flushThrough=Math.max(this.flushThrough,this.tick+this.queue.length);
   if(this.pumping)return this.pumping;
   if(!this.active)return;
   this.pumping=this.pump();
   try{return await this.pumping;}finally{this.pumping=null;}
  }
  async pump(){
   const generation=this.generation;
   try{
    while(this.active&&generation===this.generation&&(this.queue.length>=60||(this.tick<this.flushThrough&&this.queue.length))){
     const inputs=this.queue.slice(0,120),payload={revision:this.revision,seq:this.seq,fromTick:this.tick,inputs};
     const body=JSON.stringify(payload),deadline=performance.now()+5500;
     let ack;
     for(;;){
      if(!this.active||generation!==this.generation)return;
      try{
       const response=await this.request(this.base+'/sessions/'+this.session.id+'/inputs',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.session.sessionToken},body,signal:AbortSignal.timeout(6500)});
       ack=await response.json();
       if(!response.ok){const error=Object.assign(Error(ack.error||'Input verification failed'),{retryable:response.status===429||ack.retryable,retryAfterMs:ack.retryAfterMs});throw error;}
       break;
      }catch(error){
       if(error.retryable===false||performance.now()>=deadline)throw error;
       await new Promise(r=>setTimeout(r,Math.min(750,Math.max(200,error.retryAfterMs||250))));
      }
     }
     if(!this.active||generation!==this.generation)return;
     if(ack.seq!==this.seq||ack.ackTick!==this.tick+inputs.length)throw Error('Invalid server acknowledgment');
     this.queue.splice(0,inputs.length);this.tick=ack.ackTick;this.seq++;
     this.onUpdate({...ack,bufferedTicks:this.queue.length});
     if(ack.verified){if(this.queue.length)throw Error('Inputs continue after the server finish');this.active=false;return ack;}
    }
   }catch(error){this.lose(error.message);throw error;}
  }
  lose(message){const wasActive=this.active;this.active=false;this.generation++;this.queue=[];if(wasActive){this.onLost(message);void this.cancel();}}
  async cancel(){
   this.active=false;this.generation++;this.queue=[];
   if(this.session)try{await this.request(this.base+'/sessions/'+this.session.id,{method:'DELETE',headers:{Authorization:'Bearer '+this.session.sessionToken},keepalive:true,signal:AbortSignal.timeout(5000)});}catch{}
  }
 }
 root.LPRLiveClient=LiveClient;
 if(typeof module==='object')module.exports=LiveClient;
})(typeof window==='object'?window:globalThis);
