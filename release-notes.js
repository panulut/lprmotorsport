(() => {
  'use strict';
  const releases = [
    {
      id: '2026-11-02-new-server',
      date: '2.11.2026',
      fi: {
        title: 'Uutta LPR Motorsissa',
        items: [
          ['Oma osoite', 'Peli löytyy nyt osoitteesta lprmotorsports.me. Vanha osoite ohjaa automaattisesti uuteen.'],
          ['Uusia kehittäjiä', 'Pelin kehitystiimi on kasvanut, joten päivityksiä ja korjauksia tulee jatkossa entistä nopeammin.'],
          ['Uudistettu käyttöliittymä', 'Valikot, tili ja ajoasetukset ovat nyt yhdessä paikassa. Ajonäyttö näyttää kierroksen, sektorit ja auton vauriot selkeämmin.'],
          ['Uusi tarkastuspalvelin', 'Kierrosajat tarkastetaan nyt tehokkaammalla palvelimella, joka pysyy vakaana myös useamman kuljettajan ajaessa yhtä aikaa.'],
          ['Viisi kuljettajaa kerrallaan', 'Virallisia, tuloslistalle kelpaavia ajoja voi ajaa yhtä aikaa viisi kuljettajaa aiemman kahden sijaan.'],
          ['Tasaisempi ajo', 'Hetkelliset nykäykset eivät enää hidasta autoa tai muuta kierrosta harjoituskierrokseksi heikommillakaan laitteilla.'],
          ['Sulavampi liveseuranta', 'Toisen kuljettajan ajo näkyy tasaisena ilman pysähdyksiä ja hyppäyksiä.'],
          ['Parempi tietoturva', 'Selain estää peliä lähettämästä tietoja muualle kuin pelin omille palvelimille, mikä suojaa tiliäsi mahdollisilta hyökkäyksiltä.']
        ]
      },
      en: {
        title: 'What’s new in LPR Motors',
        items: [
          ['Our own address', 'The game now lives at lprmotorsports.me. The old address redirects there automatically.'],
          ['New developers', 'The development team has grown, so updates and fixes will arrive faster from now on.'],
          ['Refreshed interface', 'Menus, your account and driving settings now live in one place. The driving display shows your lap, sectors and car damage more clearly.'],
          ['New verification server', 'Lap times are now checked on a more powerful server that stays stable when several drivers are on track.'],
          ['Five drivers at once', 'Up to five drivers can now take official, leaderboard-eligible runs at the same time, up from two.'],
          ['Smoother driving', 'Brief stutters no longer slow your car down or turn your lap into a practice lap, even on less powerful devices.'],
          ['Smoother live spectating', 'Other drivers’ runs play back evenly, without freezes or jumps.'],
          ['Better security', 'Your browser now blocks the game from sending data anywhere except the game’s own servers, protecting your account against potential attacks.']
        ]
      }
    },
    {
      id: '2026-10-27-major-update',
      date: '27.10.2026',
      fi: {
        title: 'Uutta LPR Motorsissa',
        items: [
          ['Vauhtilähtö', 'Kiihdytä 200 metriä ennen maalilinjaa. Kierrosaika alkaa vasta maalilinjan ylityksestä.'],
          ['Pelaajatilit', 'Kirjaudu sisään tai pelaa vierailijana. Tuloslistoille osallistuminen edellyttää kirjautumista.'],
          ['Liveseuranta', 'Näe radalla ajavat kuljettajat ja seuraa ajoa suorana.'],
          ['Päivän kilpailu', 'Kilpaile nopeimmista kierroksista ja kierrosmääristä sekä kuukauden pisteistä.'],
          ['Chat ja kilpailuluokat', 'Keskustele myös vierailijana. Viimeiset 100 viestiä säilyvät enintään vuorokauden. Ihmisillä ja boteilla on omat sarjansa.']
        ]
      },
      en: {
        title: 'What’s new in LPR Motors',
        items: [
          ['Rolling start', 'Accelerate from 200 metres before the finish line. Lap timing starts when you cross the line.'],
          ['Player accounts', 'Sign in or continue as a guest. You must sign in to enter the leaderboards.'],
          ['Live spectating', 'See who is driving and watch their runs live.'],
          ['Daily competitions', 'Race for fastest laps, most laps and monthly championship points.'],
          ['Chat and racing classes', 'Talk to other drivers, including as a guest. The latest 100 messages stay for up to 24 hours. Humans and bots have separate standings.']
        ]
      }
    }
  ];
  const storageKey = 'lpr-release-notes-seen';
  const menu = document.querySelector('#settings-dialog');
  const openButton = document.querySelector('#release-notes-open');
  const panel = document.querySelector('#release-notes-panel');
  const closeButton = document.querySelector('#release-notes-close');
  const title = document.querySelector('#release-notes-title');
  const meta = document.querySelector('#release-notes-meta');
  const list = document.querySelector('#release-notes-list');
  if (!menu || !openButton || !panel || !closeButton || !title || !meta || !list) return;

  const latest = releases[0];
  let shownInSession = false;
  let previousFocus = null;
  function language() {
    return document.documentElement.lang?.toLowerCase().startsWith('en') ? 'en' : 'fi';
  }
  function readSeen() {
    try { return localStorage.getItem(storageKey); } catch { return null; }
  }
  function markSeen() {
    try { localStorage.setItem(storageKey, latest.id); } catch {}
    openButton.classList.remove('release-notes-unread');
  }
  function render() {
    const lang = language();
    const release = latest[lang];
    title.textContent = release.title;
    meta.textContent = latest.date;
    openButton.textContent = lang === 'en' ? 'What’s new' : 'Mitä uutta?';
    closeButton.textContent = lang === 'en' ? 'Close' : 'Sulje';
    list.replaceChildren();
    for (const [heading, description] of release.items) {
      const item = document.createElement('li');
      const strong = document.createElement('strong');
      const body = document.createElement('p');
      strong.textContent = heading;
      body.textContent = description;
      item.append(strong, body);
      list.append(item);
    }
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
    panel.hidden = false;
    markSeen();
    closeButton.focus();
  }
  function eligibleForAutomaticDisplay() {
    // Show only on the initial menu, never during an active drive.
    return menu.open && menu.classList.contains('session-start') &&
      !window.LPRSpectator?.active && readSeen() !== latest.id && !shownInSession;
  }
  function sync() {
    render();
    openButton.classList.toggle('release-notes-unread', readSeen() !== latest.id);
    if (!menu.open) { hide(); return; }
    if (eligibleForAutomaticDisplay()) { shownInSession = true; show(); }
  }
  openButton.addEventListener('click', show);
  closeButton.addEventListener('click', hide);
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); hide(); }
    if (event.key !== 'Tab') return;
    const focusable = [...panel.querySelectorAll('button:not([disabled]), a[href]')];
    if (!focusable.length) return;
    if (event.shiftKey && document.activeElement === focusable[0]) {
      event.preventDefault(); focusable.at(-1).focus();
    } else if (!event.shiftKey && document.activeElement === focusable.at(-1)) {
      event.preventDefault(); focusable[0].focus();
    }
  });
  menu.addEventListener('click', event => {
    if (event.target === menu && !panel.hidden) hide();
  });
  new MutationObserver(sync).observe(menu, {attributes:true,attributeFilter:['open','class']});
  new MutationObserver(render).observe(document.documentElement, {attributes:true,attributeFilter:['lang']});
  sync();
})();
