(() => {
  'use strict';
  const panel=document.querySelector('#lap-panel');
  if(!panel)return;
  const ids={trackName:'#record-holder',trackTime:'#best-time',personalName:'#personal-best-holder',personalTime:'#personal-best-time',nextName:'#next-driver',nextTime:'#next-time',status:'#lap-panel-status'};
  const el=Object.fromEntries(Object.entries(ids).map(([key,selector])=>[key,panel.querySelector(selector)]));
  const copy={
    fi:{lap:'Kierros',time:'Aika',speed:'Nopeus',track:'Rataennätys',personal:'Oma paras',next:'Seuraava sijoitus',noTime:'Ei varmennettuja kierrosaikoja',signedOut:'Kirjaudu sisään nähdäksesi sijoituksesi',unranked:'Et ole vielä sijoittunut tässä sarjassa',noSlower:'Ei hitaampaa kierrosaikaa vielä',unavailable:'Tuloslista ei ole juuri nyt saatavilla'},
    en:{lap:'Lap',time:'Time',speed:'Speed',track:'Track best',personal:'Personal best',next:'Next position',noTime:'No verified lap times yet',signedOut:'Sign in to see your position',unranked:'You are not ranked in this series yet',noSlower:'No slower lap time yet',unavailable:'Standings are unavailable right now'}
  };
  const currentCopy=()=>copy[window.LPRI18n?.language==='en'?'en':'fi'];
  const labels=()=>{const c=currentCopy();for(const node of panel.querySelectorAll('[data-lap-label]'))node.textContent=c[node.dataset.lapLabel]||node.textContent;};
  const format=ms=>Number.isFinite(ms)&&ms>0?`${Math.floor(ms/60000).toString().padStart(2,'0')}:${Math.floor(ms/1000%60).toString().padStart(2,'0')}.${Math.floor(ms%1000).toString().padStart(3,'0')}`:'--:--.---';
  const write=(name,time,row)=>{el[name].textContent=row?.nickname||'—';el[time].textContent=format(row?.lap_ms);};
  const setStatus=(message)=>{el.status.textContent=message||'';el.status.hidden=!message;};
  const revision=()=>window.LPRDrivingRevision;
  let generation=0;
  let sessionPersonalBest=null,sessionPersonalBestOwner='';
  const panelIdentity=()=>window.LPRLeaderboard?.identity||window.LPRLeaderboard?.chatIdentity||null;
  const ownerKey=identity=>identity?.token?`${identity.token}:${identity.series||''}`:identity?.nickname?`nickname:${identity.nickname}`:'local';
  function localPersonalBest(identity,c){
    let saved=null;
    try{
      const lapMs=Number(localStorage.getItem('lpr-best-time-lut-20261011-v3'));
      const record=JSON.parse(localStorage.getItem('lpr-best-sectors-lut-20261011-v3')||'null');
      if(Number.isSafeInteger(lapMs)&&lapMs>5000&&record?.lapTime===lapMs&&record.revision===revision()&&
        Array.isArray(record.sectors)&&record.sectors.length===3&&record.sectors.every(Number.isSafeInteger)&&
        Math.abs(record.sectors.reduce((sum,value)=>sum+value,0)-lapMs)<=25){
        saved={nickname:identity?.nickname||c.personal,lap_ms:lapMs};
      }
    }catch{}
    const owner=ownerKey(identity);
    const recent=sessionPersonalBestOwner===owner?sessionPersonalBest:null;
    return recent&&(!saved||recent.lap_ms<saved.lap_ms)?recent:saved;
  }
  function writePersonalBest(serverBest,identity,c){
    if(!window.LPRVerificationConfig?.demo)return;
    const localBest=localPersonalBest(identity,c);
    if(localBest&&(!serverBest?.lap_ms||localBest.lap_ms<serverBest.lap_ms))write('personalName','personalTime',localBest);
  }
  async function demoStandings(series){
    try{
      const response=await fetch(`/api/verified/leaderboard?series=${series}`,{cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!response.ok)return null;
      const data=await response.json();
      return data?.protocol==='driving-v1'&&data.revision===revision()&&data.series===series&&Array.isArray(data.results)?data.results:null;
    }catch{return null;}
  }
  let verifiedOwnerKey=null,verifiedReplayRequestKey='';
  const clearVerifiedReference=()=>document.dispatchEvent(new Event('lpr-verified-reference-clear'));
  const sectorsReady=personalBest=>Number.isFinite(personalBest?.lap_ms)&&Array.isArray(personalBest?.sectors)&&personalBest.sectors.length===3&&personalBest.sectors.every(Number.isFinite);
  function publishVerifiedReference(personalBest,identity,series,recording){
    const detail={recording:recording||null,lapMs:personalBest.lap_ms,sectors:personalBest.sectors.slice(),series,identityToken:identity.token};
    if(typeof window.LPRAcceptVerifiedReference==='function')window.LPRAcceptVerifiedReference(detail);
    else window.LPRPendingVerifiedReference=detail;
  }
  async function loadVerifiedReference(personalBest,identity,series){
    const replay=personalBest?.replay;
    const replayReady=!!identity?.token&&sectorsReady(personalBest)&&!!replay&&/^[a-f0-9]{32}$/.test(replay.sessionId||'')&&Number.isSafeInteger(replay.lap)&&replay.lap>=1;
    if(!replayReady){
      // Sector times still compare at the gates when this lap has no replay.
      if(identity?.token&&sectorsReady(personalBest))publishVerifiedReference(personalBest,identity,series,null);
      else if(verifiedReplayRequestKey){verifiedReplayRequestKey='';clearVerifiedReference();}
      return;
    }
    const requestKey=`${identity.token}:${series}:${replay.sessionId}:${replay.lap}`;
    if(requestKey===verifiedReplayRequestKey)return;
    verifiedReplayRequestKey=requestKey;
    try{
      const endpoint=window.LPRVerificationConfig?.leaderboard;
      if(typeof endpoint!=='string'||!endpoint)return;
      const response=await fetch(`${endpoint}/api/verified/replays/${replay.sessionId}/${replay.lap}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error('Reference replay unavailable');
      const recording=await response.json();
      if(verifiedReplayRequestKey!==requestKey||window.LPRLeaderboard?.identity?.token!==identity.token||
        (window.LPRLeaderboard?.identity?.series==='bot'?'bot':'human')!==series)return;
      publishVerifiedReference(personalBest,identity,series,recording);
    }catch{
      if(verifiedReplayRequestKey!==requestKey)return;
      verifiedReplayRequestKey='';
      if(window.LPRLeaderboard?.identity?.token===identity.token)publishVerifiedReference(personalBest,identity,series,null);
    }
  }
  async function refresh(){
    const id=++generation,identity=window.LPRLeaderboard?.identity||null,series=identity?.series==='bot'?'bot':'human',c=currentCopy();
    const panelOwner=panelIdentity(),personalOwner=ownerKey(panelOwner);
    if(sessionPersonalBestOwner&&sessionPersonalBestOwner!==personalOwner)sessionPersonalBest=null;
    sessionPersonalBestOwner=personalOwner;
    const verifiedKey=identity?.token?`${identity.token}:${series}`:'';
    if(verifiedKey!==verifiedOwnerKey){verifiedOwnerKey=verifiedKey;verifiedReplayRequestKey='';clearVerifiedReference();}
    write('trackName','trackTime',null);write('personalName','personalTime',null);write('nextName','nextTime',null);setStatus('');
    const headers=identity?.token?{Authorization:`Bearer ${identity.token}`}:{ };
    const endpoint=window.LPRVerificationConfig?.leaderboard||'';
    let panelData=null,boardData=null;
    try{
      if(identity?.token||window.LPRVerificationConfig?.demo){
        let response=await fetch(`${endpoint}/api/verified/timing-panel?series=${series}`,{headers,cache:'no-store',signal:AbortSignal.timeout(10000)});
        if(!response.ok&&identity?.token&&window.LPRVerificationConfig?.demo)response=await fetch(`${endpoint}/api/verified/timing-panel?series=${series}`,{cache:'no-store',signal:AbortSignal.timeout(10000)});
        if(response.ok)panelData=await response.json();
      }
      if(!panelData){const response=await fetch(`${endpoint}/api/verified/leaderboard?series=${series}`,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(response.ok)boardData=await response.json();}
    }catch{}
    if(id!==generation)return;
    const valid=(data)=>data?.protocol==='driving-v1'&&data.revision===revision()&&data.series===series;
    if(valid(panelData)){
      let trackBest=panelData.trackBest,personalBest=panelData.personalBest,next=panelData.next;
      const localBest=window.LPRVerificationConfig?.demo?localPersonalBest(panelOwner,c):null;
      if(localBest&&(!trackBest?.lap_ms||localBest.lap_ms<trackBest.lap_ms)){
        trackBest=localBest;personalBest=localBest;
        const rows=await demoStandings(series);
        if(id!==generation)return;
        if(rows){
          next=rows.filter(row=>row.nickname!==localBest.nickname&&row.lap_ms>localBest.lap_ms)
            .sort((a,b)=>a.lap_ms-b.lap_ms)[0]||null;
        }
      }
      write('trackName','trackTime',trackBest);write('personalName','personalTime',personalBest);write('nextName','nextTime',next);
      writePersonalBest(personalBest,panelOwner,c);
      void loadVerifiedReference(panelData.personalBest,identity,series);
      if(window.LPRVerificationConfig?.demo&&panelData.mode==='demo-only'&&Array.isArray(panelData.sectorBest)&&panelData.sectorBest.length===3&&panelData.sectorBest.every(Number.isSafeInteger)&&panelData.sectorBest.reduce((a,b)=>a+b,0)===panelData.personalBest?.lap_ms){
        window.LPRDemoSectorBaseline={revision:panelData.revision,series,lapMs:panelData.personalBest.lap_ms,sectors:panelData.sectorBest.slice()};
        window.LPRSetDemoSectorBaseline?.(window.LPRDemoSectorBaseline);
      }else{delete window.LPRDemoSectorBaseline;window.LPRSetDemoSectorBaseline?.(null);}
      if(!panelData.fieldSize)setStatus(c.noTime);
      else if(!panelData.personalBest)setStatus(!identity||identity.guest?c.signedOut:c.unranked);
      else if(!next)setStatus(panelData.rank===panelData.fieldSize?c.noSlower:'');
      return;
    }
    if(valid(boardData)){
      const first=boardData.results?.[0];
      if(first)write('trackName','trackTime',{nickname:first.nickname,lap_ms:first.lap_ms});
      let localBest=0;if(!window.LPRVerificationConfig?.demo)try{localBest=Number(localStorage.getItem('lpr-best-time-lut-20261011-v3'))||0;}catch{}
      if(localBest)write('personalName','personalTime',{nickname:identity?.nickname||c.personal,lap_ms:localBest});
      writePersonalBest(localBest?{nickname:identity?.nickname||c.personal,lap_ms:localBest}:null,panelOwner,c);
      // The public board loaded. Personal rank needs the newer timing-panel
      // route; its absence is not a standings outage.
      if(!first)setStatus(c.noTime);
      else if(!identity)setStatus(c.signedOut);
      return;
    }
    // A local practice best can be shown, but never used to invent a public rank.
    let localBest=0;if(!window.LPRVerificationConfig?.demo)try{localBest=Number(localStorage.getItem('lpr-best-time-lut-20261011-v3'))||0;}catch{}
    if(localBest)write('personalName','personalTime',{nickname:c.personal,lap_ms:localBest});
    writePersonalBest(localBest?{nickname:c.personal,lap_ms:localBest}:null,panelOwner,c);
    setStatus(identity?c.unavailable:c.signedOut);
  }
  labels();
  new MutationObserver(labels).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  document.addEventListener('lpr-lobby-ready',refresh);
  document.addEventListener('lpr-identity-changed',refresh);
  document.addEventListener('lpr-series-changed',refresh);
  document.addEventListener('lpr-lap-saved',refresh);
  document.addEventListener('lpr-lap-completed',event=>{
    const detail=event.detail||{},lapMs=detail.lapMs;
    if(!Number.isSafeInteger(lapMs)||lapMs<=5000)return;
    const identity=panelIdentity(),owner=ownerKey(identity),c=currentCopy();
    if(detail.personalBest===true&&!detail.verifiedPending){
      sessionPersonalBestOwner=owner;
      if(!sessionPersonalBest||lapMs<sessionPersonalBest.lap_ms){
        sessionPersonalBest={nickname:detail.nickname||identity?.nickname||c.personal,lap_ms:lapMs};
        writePersonalBest(null,identity,c);
      }
    }
    void refresh();
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  window.addEventListener('online',refresh);
  document.querySelector('#leaderboard-logout')?.addEventListener('click',()=>setTimeout(refresh,0));
  for(const button of document.querySelectorAll('#verified-series-human,#verified-series-bot'))button.addEventListener('click',()=>setTimeout(refresh,0));
  refresh();
})();
