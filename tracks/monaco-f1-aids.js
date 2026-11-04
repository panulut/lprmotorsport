/* One aid configuration per page/attempt. Changing it reloads into a fresh
   attempt and separate records; a mixed-aid lap can never become a record. */
(function(root){
 'use strict';
 const key='lpr-monaco-f1-v2-aids';let stored;
 try{stored=JSON.parse(localStorage.getItem(key));}catch{}
 const value=Object.freeze(Object.fromEntries(['tc','abs','steering'].map(k=>[k,typeof stored?.[k]==='boolean'?stored[k]:true])));
 const code=['tc','abs','steering'].map(k=>value[k]?'1':'0').join('');
 const label=`TC ${value.tc?'on':'off'} · ABS ${value.abs?'on':'off'} · SA ${value.steering?'on':'off'}`;
 root.LPRF1Aids={value,label,code,set(name,enabled){
  if(!Object.hasOwn(value,name)||typeof enabled!=='boolean')return;
  try{localStorage.setItem(key,JSON.stringify({...value,[name]:enabled}));}catch{return;}
  root.location.reload();
 }};
 Object.assign(root.LPRTrackConfig,{id:'monaco-f1-v2',
  bestTimeKey:'lpr-best-time-monaco-f1-v2-'+code,bestSectorsKey:'lpr-best-sectors-monaco-f1-v2-'+code,
  tcPreferenceKey:'lpr-monaco-f1-v2-tc-unused',
  lapMetadata:()=>({vehicle:root.LPRVehicleSpec.id,aids:{...value}})});
})(window);
