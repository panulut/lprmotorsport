/* A local practice menu: no accounts, receipts, analytics or online rankings. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s),dialog=$('#settings-dialog');
  window.LPRDrivingRevision='monaco-v1:'+window.LPRDrivingRevision;
  const menuButton=document.createElement('button');menuButton.className='monaco-menu-button';menuButton.textContent='Monaco · valikko';menuButton.onclick=()=>dialog.showModal();document.body.append(menuButton);
  const brand=document.querySelector('#lap-panel .lap-panel-branding');
  brand?.setAttribute('aria-label','LPR Motorsport Monaco');
  const brandTitle=brand?.querySelector('strong');
  if(brandTitle)brandTitle.textContent='Monaco';
  window.LPRLeaderboard={requiresName:false,refresh(){},cancelLap(){},startLap(){},submit(){}};
  $('#leaderboard-title').textContent='Monaco';
  $('.race-eyebrow').textContent='LPR MOTORSPORT · CIRCUIT DE MONACO';
  const menu=document.createElement('section');menu.className='monaco-menu';
  menu.innerHTML=`<p class="monaco-kicker">RIVIERA / HARJOITTELU</p><h3>Senttien peli.</h3>
    <p>Monacon katurata Formula Student -autolla. Kapeat kaiteet, Fairmontin neulansilmä, tunneli ja sataman mutkat.</p>
    <div class="monaco-stats"><span><b>3,337</b> km ratapohja</span><span><b>8</b> m ajorata</span><span><b>FS</b> Formula Student</span></div>
    <p class="monaco-note">Tyylitelty, tasainen harjoittelurata. Kierrosajat tallentuvat tähän selaimeen. Harjoittelussa ei ole verkkotuloslistaa.</p>
    <button id="monaco-start" type="button">Aja Monacossa</button><a class="monaco-back" href="index.html">Takaisin Skinnarilaan</a>
    <p class="monaco-controls">W / ↑ kaasu · S / ↓ jarru · A D / ← → ohjaus · R uusi yritys. Myös kosketus ja peliohjain.</p>`;
  dialog.append(menu);
  const close=$('#close-settings');close.hidden=false;
  $('#monaco-start').addEventListener('click',()=>{dialog.close();$('#track').focus();});
  $('#leaderboard-button').setAttribute('aria-label','Monaco · ratavalikko');
  $('#leaderboard-button').title='Monaco · ratavalikko';
  $('#track').tabIndex=0;
  function update(){
    const en=window.LPRI18n?.language==='en';
    $('#monaco-start').textContent=en?'Drive Monaco':'Aja Monacossa';
    $('.monaco-back').textContent=en?'Back to Skinnarila':'Takaisin Skinnarilaan';
    let saved=0;
    try{
      const record=JSON.parse(localStorage.getItem(window.LPRTrackConfig.bestSectorsKey)||'null');
      if(record?.revision===window.LPRDrivingRevision)saved=Number(localStorage.getItem(window.LPRTrackConfig.bestTimeKey))||0;
    }catch{}
    const text=saved?window.LPRFormatLapTime(saved):'--:--.---';
    $('#personal-best-time').textContent=text;$('#personal-best-holder').textContent=en?'Monaco · personal best':'Monaco · oma paras';
    $('#best-time').textContent=text;$('#record-holder').textContent=en?'Local practice':'Oma harjoittelu';
    $('#lap-panel-status').textContent=en?'Monaco · local practice':'Monaco · harjoittelu';
  }
  document.addEventListener('lpr-lap-completed',update);
  document.addEventListener('lpr-language-changed',update);
  update();dialog.showModal();
})();
