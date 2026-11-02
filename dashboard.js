(() => {
 'use strict';
 const $=s=>document.querySelector(s),dialog=$('#settings-dialog');
 const t=text=>window.LPRI18n?.t(text)??text;
 const details=$('#dashboard-details'),content=$('#dashboard-details-content');
 for(const node of document.querySelectorAll('#championship > .championship-controls,#championship > details'))content.append(node);
 $('#dashboard-details-open').onclick=()=>{details.hidden=false;$('#dashboard-details-close').focus();};
 function closeDetails(){details.hidden=true;$('#dashboard-details-open').focus();}
 $('#dashboard-details-close').onclick=closeDetails;
 details.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeDetails();}});
 let queued=false;
 const pagers=[];
 function update(){
  queued=false;
  const account=window.LPRLeaderboard?.accountIdentity;
  dialog.classList.toggle('dashboard-remembered',!!account);
  dialog.classList.toggle('dashboard-account-editing',!$('#leaderboard-guest-fields').hidden||(!account&&!$('#leaderboard-account-fields').hidden));
  const rail=$('#left-rail');
  rail.classList.toggle('dashboard-remembered',!!account);
  rail.classList.toggle('dashboard-account-editing',!$('#leaderboard-guest-fields').hidden||(!account&&!$('#leaderboard-account-fields').hidden));
  $('#dashboard-account-name').textContent=account?.nickname||'';
  $('#leaderboard-account-fields').dataset.nickname=account?.nickname||'';
  for(const p of pagers){
   const list=p.root.matches('ol,ul')?p.root:p.root.querySelector('ol');
   const rows=list?[...list.children].filter(r=>r.tagName==='LI'):[];
   const size=Math.max(1,parseInt(getComputedStyle(p.root).getPropertyValue('--page-size'))||3);
   if(p.size!==size){p.page=0;p.size=size;}
   const count=Math.ceil(rows.length/size);
   p.page=Math.min(p.page,Math.max(0,count-1));
   rows.forEach((row,i)=>{row.hidden=i<p.page*size||i>=(p.page+1)*size;});
   p.previous.disabled=p.page===0;p.next.disabled=p.page>=count-1;
   p.label.textContent=rows.length?`${p.page*size+1}–${Math.min(rows.length,(p.page+1)*size)} / ${rows.length}`:'';
   p.nav.hidden=count<=1;
   p.previous.setAttribute('aria-label',t('Edelliset tulokset'));p.next.setAttribute('aria-label',t('Seuraavat tulokset'));
   if(list?.tagName==='OL')list.start=p.page*size+1;
   if(p.root.id==='verified-list')p.root.style.counterReset='standing '+p.page*size;
  }
 }
 function schedule(){if(!queued){queued=true;queueMicrotask(update);}}
 for(const selector of ['#active-drivers-list','#verified-list','#championship-fastest','#championship-volume','#championship-monthly']){
  const root=$(selector),nav=document.createElement('nav'),previous=document.createElement('button'),next=document.createElement('button'),label=document.createElement('span');
  nav.className='dashboard-pager';previous.type=next.type='button';previous.append(window.LPRIcon('arrow-left'));next.append(window.LPRIcon('arrow-right'));
  label.setAttribute('aria-live','polite');nav.append(previous,label,next);root.after(nav);
  const p={root,nav,previous,next,label,page:0};pagers.push(p);
  previous.onclick=()=>{p.page--;update();};next.onclick=()=>{p.page++;update();};
  new MutationObserver(()=>{p.page=0;schedule();}).observe(root,{childList:true,subtree:true});
 }
 new MutationObserver(schedule).observe($('#leaderboard-account-fields'),{attributes:true,attributeFilter:['hidden']});
 new MutationObserver(schedule).observe($('#leaderboard-guest-fields'),{attributes:true,attributeFilter:['hidden']});
 new MutationObserver(schedule).observe(dialog,{attributes:true,attributeFilter:['class','open']});
 new MutationObserver(schedule).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 window.addEventListener('resize',schedule);
 window.addEventListener('storage',schedule);
 document.addEventListener('lpr-lap-saved',schedule);
 schedule();
})();
