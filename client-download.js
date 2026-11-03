(() => {
  'use strict';
  // First visit on a Windows desktop browser: choose between installing the PC
  // client and continuing in the browser. Never shown inside the client itself.
  const DOWNLOAD_URL = 'https://github.com/panulut/lprmotorsport/releases/latest/download/LPR-Lap-Challenge-Setup.exe';
  const storageKey = 'lpr-client-choice';
  const text = {
    fi: {
      title: 'Miten haluat pelata?',
      intro: 'Skinnarila GP:tä voi pelata selaimessa tai omana Windows-sovelluksenaan.',
      download: 'Lataa PC-sovellus',
      downloadNote: 'Windows 10/11 · noin 120 Mt · oma ikkuna ja koko näytön tila (F11). Tili ja tulokset ovat samat kuin selaimessa.',
      browser: 'Jatka selaimessa',
      browserNote: 'Ei asennusta. Voit ladata sovelluksen myöhemmin valikon PC-sovellus-painikkeesta.',
      started: 'Lataus alkoi. Avaa ladattu tiedosto asentaaksesi pelin. Jos Windows varoittaa tuntemattomasta julkaisijasta, valitse "Lisätietoja" → "Suorita silti".',
      continue: 'Jatka selaimessa',
      open: 'PC-sovellus'
    },
    en: {
      title: 'How do you want to play?',
      intro: 'You can play Skinnarila GP in your browser or as a Windows app.',
      download: 'Download the PC app',
      downloadNote: 'Windows 10/11 · about 120 MB · its own window and full screen (F11). Same account and results as in the browser.',
      browser: 'Continue in browser',
      browserNote: 'Nothing to install. You can download the app later from the PC app button in the menu.',
      started: 'Download started. Open the downloaded file to install the game. If Windows warns about an unknown publisher, choose "More info" → "Run anyway".',
      continue: 'Continue in browser',
      open: 'PC app'
    }
  };

  const menu = document.querySelector('#settings-dialog');
  const panel = document.querySelector('#client-download-panel');
  const openButton = document.querySelector('#client-download-open');
  if (!menu || !panel || !openButton) return;
  const $ = selector => panel.querySelector(selector);
  const downloadLink = $('#client-download-link');
  const browserButton = $('#client-download-browser');
  const continueButton = $('#client-download-continue');
  const choices = $('.client-download-choices');
  const started = $('#client-download-started');

  const ua = navigator.userAgent;
  const insideClient = /LPRDesktop\/|Electron\//.test(ua);
  const windowsDesktop = /Windows NT/.test(ua) && !/Mobile|Tablet/.test(ua);
  // Automated browsers (tests, crawlers) are not offered an installer.
  if (insideClient || !windowsDesktop || navigator.webdriver) return;

  openButton.hidden = false;
  downloadLink.href = DOWNLOAD_URL;
  let shownInSession = false;
  let previousFocus = null;

  const language = () => document.documentElement.lang?.toLowerCase().startsWith('en') ? 'en' : 'fi';
  function readChoice() { try { return localStorage.getItem(storageKey); } catch { return null; } }
  function saveChoice(value) { try { localStorage.setItem(storageKey, value); } catch {} }

  function render() {
    const strings = text[language()];
    for (const element of panel.querySelectorAll('[data-client-text]')) {
      element.textContent = strings[element.dataset.clientText];
    }
    openButton.textContent = strings.open;
  }
  function hide() {
    if (panel.hidden) return;
    panel.hidden = true;
    if (previousFocus?.isConnected) previousFocus.focus();
    previousFocus = null;
  }
  function show() {
    if (!menu.open || !panel.hidden) return;
    previousFocus = document.activeElement;
    render();
    choices.hidden = false;
    started.hidden = true;
    panel.hidden = false;
    downloadLink.focus();
  }
  function sync() {
    if (!menu.open) { hide(); return; }
    // Only on the initial menu, never during a drive or while spectating.
    if (menu.classList.contains('session-start') && !window.LPRSpectator?.active &&
        !readChoice() && !shownInSession) {
      shownInSession = true;
      show();
    }
  }

  downloadLink.addEventListener('click', () => {
    saveChoice('download');
    choices.hidden = true;
    started.hidden = false;
    continueButton.focus();
  });
  browserButton.addEventListener('click', () => { saveChoice('browser'); hide(); });
  continueButton.addEventListener('click', hide);
  openButton.addEventListener('click', show);
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (!readChoice()) saveChoice('browser');
      hide();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...panel.querySelectorAll('button:not([disabled]), a[href]')].filter(el => el.offsetParent);
    if (!focusable.length) return;
    if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
  });

  new MutationObserver(sync).observe(menu, {attributes: true, attributeFilter: ['open', 'class']});
  new MutationObserver(render).observe(document.documentElement, {attributes: true, attributeFilter: ['lang']});
  render();
  sync();
})();
