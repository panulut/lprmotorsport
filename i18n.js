/* Shared translations. Language changes update UI without touching game state. */
(() => {
  'use strict';
  const english = {
  "Mene Saleen (R)": "Enter Sale (R)",
  "Palaa autoon (R)": "Return to car (R)",
  "KAUPPATAUKO": "SHOP BREAK",
  "Sale Skinnarilan sis?tila": "Sale Skinnarila interior",
  "Salessa: katsele vet?m?ll?. W/S tai kaasu/jarru liikuttaa, A/D k??nt??. Palaa autoon: R.": "Inside Sale: drag to look. W/S or gas/brake to walk, A/D to turn. Return to car: R.",
  "Pys?hdy Salen ovelle ja mene sis??n painikkeella tai R-n?pp?imell?.": "Stop at Sale's entrance and enter using the button or R.",
  "Aloita uudelleen": "Restart",
  "Avaa ohjainasetukset": "Open controller settings",
  "Ohjain": "Controller",
  "Ajopeli": "Driving game",
  "KIERROS": "LAP",
  "AIKA": "TIME",
  "PARAS": "BEST",
  "NOPEUS": "SPEED",
  "3D-n\u00e4kym\u00e4 kuljettajan paikalta": "3D view from the driver's seat",
  "Saunapaku ja palju ovat Tervahaudanpuistossa.": "The sauna van and hot tub are in Tervahaudanpuisto.",
  "Saunapaku on ensimm\u00e4isen mutkan ulkopuolella.": "The sauna van is outside the first corner.",
  "Mene saunaan (E)": "Enter sauna (E)",
  "Vaihda vastakkaiselle lauteelle (F)": "Switch to the opposite bench (F)",
  "Heit\u00e4 l\u00f6yly\u00e4 (v\u00e4lily\u00f6nti)": "Throw water on the stones (Space)",
  "Saunan \u00e4\u00e4net: pois": "Sauna sound: off",
  "Saunan \u00e4\u00e4net: p\u00e4\u00e4ll\u00e4": "Sauna sound: on",
  "PITO OK": "GRIP OK",
  "TC P\u00c4\u00c4LL\u00c4": "TC ON",
  "Paina kaasua ja l\u00e4hde ajamaan!": "Press the accelerator and start driving!",
  "KOSKETUS / N\u00c4PP\u00c4IMIST\u00d6": "TOUCH / KEYBOARD",
  "LUT KAMPUSRATA": "LUT CAMPUS CIRCUIT",
  "LPR HARJOITUSRATA \u00b7 220 M": "LPR PRACTICE TRACK \u00b7 220 M",
  "Kosketusohjaimet": "Touch controls",
  "Kallistusohjaus": "Tilt steering",
  "Keskit\u00e4": "Recenter",
  "Ohjaus: liu\u2019uta vasemmalle tai oikealle": "Steering: slide left or right",
  "\u2190 OHJAA \u2192": "\u2190 STEER \u2192",
  "Ohjaa vasemmalle": "Steer left",
  "Ohjaa oikealle": "Steer right",
  "JARRU": "BRAKE",
  "KAASU": "ACCELERATOR",
  "Puhelimella: liu\u2019uta vasenta peukaloa ohjausalueella, pid\u00e4 oikealla kaasua tai jarrua. Voit ajaa my\u00f6s vaakasuunnassa. Tietokoneella: \u2190 \u2192 tai A D, kaasu \u2191 / W, jarru \u2193 / S. Ratti ja polkimet: avaa Ohjain.": "Phone: slide your left thumb across the steering area and hold the accelerator or brake with your right thumb. You can also play in landscape. Computer: steer with \u2190 \u2192 or A D, accelerate with \u2191 / W, brake with \u2193 / S. Wheel and pedals: open Controller.",
  "TAPAHTUMAPISTE": "EVENT STATION",
  "Ratti ja polkimet": "Wheel and pedals",
  "Sulje asetukset": "Close settings",
  "Liit\u00e4 USB-ratti ja polkimet tietokoneeseen. K\u00e4\u00e4nn\u00e4 rattia tai paina poljinta, jotta selain tunnistaa ohjaimen. Kalibroi sen j\u00e4lkeen jokainen asento.": "Connect a USB wheel and pedals to your computer. Turn the wheel or press a pedal so the browser detects the controller. Then calibrate each position.",
  "Odotetaan ohjainta\u2026": "Waiting for controller\u2026",
  "Ratti keskelle": "Center the wheel",
  "Pid\u00e4 ratti suorassa ja tallenna.": "Keep the wheel centered and save.",
  "Tallenna": "Save",
  "Ratti vasemmalle": "Wheel fully left",
  "K\u00e4\u00e4nn\u00e4 \u00e4\u00e4riasentoon.": "Turn all the way.",
  "Ratti oikealle": "Wheel fully right",
  "Polkimet ylh\u00e4\u00e4ll\u00e4": "Pedals released",
  "Vapauta molemmat polkimet.": "Release both pedals.",
  "Kaasu pohjaan": "Accelerator fully down",
  "Paina vain kaasua.": "Press only the accelerator.",
  "Jarru pohjaan": "Brake fully down",
  "Paina vain jarrua.": "Press only the brake.",
  "Kalibrointi odottaa ohjainta.": "Calibration is waiting for a controller.",
  "Ohjainyhteensopivuus riippuu ratin ajurista ja selaimesta. N\u00e4pp\u00e4imist\u00f6 toimii aina varalla. Ratista ei tule voimavastetta t\u00e4ss\u00e4 versiossa.": "Controller compatibility depends on the wheel driver and browser. The keyboard is always available as a fallback. This version does not support force feedback.",
  "Heit\u00e4 l\u00f6yly\u00e4 kauhalla: valitse painike tai paina v\u00e4lily\u00f6nti\u00e4.": "Use the ladle: select the button or press Space.",
  "Palaa autoon (E)": "Return to car (E)",
  "Katsele vet\u00e4m\u00e4ll\u00e4. Valitse \u00e4mp\u00e4ri tai kauha heitt\u00e4\u00e4ksesi l\u00f6yly\u00e4.": "Drag to look around. Select the bucket or ladle to throw water on the stones.",
  "Pys\u00e4hdy saunapakun viereen ja tule l\u00f6ylyihin.": "Stop beside the sauna van and join us in the sauna.",
  "Saunapakun lauteet ja kiuas": "Sauna van benches and stove",
  "SAUNATAUKO": "SAUNA BREAK",
  "AUTO PARKISSA": "CAR PARKED",
  "Siirryit vastakkaiselle lauteelle.": "You moved to the opposite bench.",
  "Tsssss\u2026 Hyv\u00e4t l\u00f6ylyt!": "Hissss\u2026 Lovely steam!",
  "Liike ei erottunut. Tarkista laite ja tallenna asennot uudelleen.": "No distinct movement detected. Check the device and save the positions again.",
  "Kalibrointi valmis. Voit sulkea ikkunan ja ajaa.": "Calibration complete. Close this window and drive.",
  "RATTI JA POLKIMET": "WHEEL AND PEDALS",
  "Odotetaan ohjainta\u2026 K\u00e4\u00e4nn\u00e4 rattia tai paina sen painiketta.": "Waiting for controller\u2026 Turn the wheel or press a button on it.",
  "PELIOHJAIN": "GAMEPAD",
  "OHJAIN \u00b7 KALIBROI": "CONTROLLER \u00b7 CALIBRATE",
  "KALLISTUSOHJAUS": "TILT STEERING",
  "RADAN ULKOPUOLELLA": "OFF TRACK",
  "PITO RAJALLA": "GRIP LIMIT",
  "TC RAJOITTAA TEHOA": "TC LIMITING POWER",
  "Kosketusohjaus k\u00e4yt\u00f6ss\u00e4.": "Touch steering enabled.",
  "Pid\u00e4 puhelin ajoasennossa ja salli liikeanturit.": "Hold your phone in driving position and allow motion sensors.",
  "Pid\u00e4 puhelin haluamassasi keskiasennossa.": "Hold your phone in the desired neutral position.",
  "Pid\u00e4 puhelin ajoasennossa. Ohjaus keskitet\u00e4\u00e4n.": "Hold your phone in driving position. Centering steering.",
  "Ohjainta ei n\u00e4y. Paina ratin painiketta ja yrit\u00e4 uudelleen.": "Controller not detected. Press a wheel button and try again.",
  "Tallennettu \u2713": "Saved \u2713",
  "Kallistusohjaus tarvitsee HTTPS-yhteyden.": "Tilt steering requires HTTPS.",
  "Laite ei tue kallistusohjausta.": "This device does not support tilt steering.",
  "Liikeanturien lupaa ei my\u00f6nnetty. Voit k\u00e4ytt\u00e4\u00e4 kosketusohjausta.": "Motion sensor permission was denied. You can use touch steering.",
  "Liikeanturista ei tullut tietoa. Kosketusohjaus on k\u00e4yt\u00f6ss\u00e4.": "No motion sensor data received. Touch steering is enabled.",
  "Kallistusohjaus k\u00e4yt\u00f6ss\u00e4. Kallista vasemmalle tai oikealle.": "Tilt steering enabled. Tilt left or right.",
  "WebGL ei ole k\u00e4ytett\u00e4viss\u00e4 t\u00e4ss\u00e4 selaimessa.": "WebGL is unavailable in this browser.",
  "Onpa hyv\u00e4t l\u00f6ylyt. Miten teid\u00e4n ajokierros meni?": "Lovely steam. How did your lap go?",
  "Ensimm\u00e4inen mutka yll\u00e4tti, mutta seuraava kierros meni jo paremmin!": "The first corner caught me out, but the next lap was better!",
  "Kerran rakennettiin saunaa koko y\u00f6. Aamulla huomattiin, ett\u00e4 ovi puuttui.": "We once spent all night building a sauna. In the morning we noticed the door was missing.",
  "Siin\u00e4 taisi olla v\u00e4h\u00e4n turhankin hyv\u00e4 ilmanvaihto!": "That might have been a bit too much ventilation!",
  "\u266a Lauteilla l\u00e4mmin, ilta on nuori, l\u00f6ylyss\u00e4 lep\u00e4\u00e4 teekkarin huoli! \u266a": "\u266a The benches are warm, the evening is young, in the steam our worries are gone! \u266a",
  "Vett\u00e4 v\u00e4liin, niin jaksaa viel\u00e4 yhden l\u00f6ylyn.": "Drink some water and you'll be ready for another round of steam.",
  "Meid\u00e4n tiimi korjasi auton yhdell\u00e4 nippusiteell\u00e4. Se oli koko p\u00e4iv\u00e4n t\u00e4rkein osa.": "Our team fixed the car with one cable tie. It was the most important part all day.",
  "Nippuside on kyll\u00e4 insin\u00f6\u00f6rin paras kaveri!": "A cable tie really is an engineer's best friend!",
  "\u266a Kiukaan kivet, l\u00e4mmin puu, kaverin kanssa nauru kuuluu! \u266a": "\u266a Hot sauna stones and warm wooden seats, with friends the laughter never ceases! \u266a",
  "K\u00e4yd\u00e4\u00e4n kohta pihalla vilvoittelemassa.": "Let's go outside to cool down soon.",
  "Ovi kiinni!": "Close the door!",
  "Kenell\u00e4 j\u00e4i h\u00e4nt\u00e4 oven v\u00e4liin?": "Were you born in a barn?",
  "Turkasen tulimmainen, nyt se ovi kiinni!": "For goodness' sake, close that door!",
  "Heit\u00e4n v\u00e4h\u00e4n lis\u00e4\u00e4 l\u00f6yly\u00e4!": "I'll throw a little more water on the stones!",
  "Jo helpotti! Nyt voisi ottaa v\u00e4h\u00e4n rauhallisemmat l\u00f6ylyt.": "That's better! Let's take it a little easier with the steam now.",
  "K\u00e4yn v\u00e4h\u00e4n pihalla vilvoittelemassa. N\u00e4hd\u00e4\u00e4n kohta!": "I'm going outside to cool down. See you soon!",
  "Moi! Viel\u00e4k\u00f6 lauteilla on tilaa?": "Hi! Is there still room on the benches?",
  "Ei hitto, ei t\u00e4llaisia l\u00f6ylyj\u00e4 kest\u00e4": "Blimey, I can't take this much steam!",
  "Ai saakeli, kun on kuuma": "Damn, it's hot!",
  "Huh huh, nyt on kyll\u00e4 kunnon l\u00f6ylyt": "Phew, that's some serious steam!",
  "LPR Motorsport Lap Challenge \u2013 aja kierros Formula Student -radalla.": "LPR Motorsport Lap Challenge \u2013 drive a lap on a Formula Student track."
};
  const templates = {
    deviceDetails: ['Yhdistetty: {device} \u00b7 {axes} akselia, {buttons} painiketta', 'Connected: {device} \u00b7 {axes} axes, {buttons} buttons'],
    connected: ['Yhdistetty: {device}', 'Connected: {device}'],
    record: ['UUSI ENN\u00c4TYS \u00b7 {time}', 'NEW RECORD \u00b7 {time}'],
    lapResult: ['KIERROS \u00b7 {time}', 'LAP \u00b7 {time}'],
    savedPosition: ['Tallennettu: {position}.', 'Saved: {position}.']
  };
  const reverse = Object.fromEntries(Object.entries(english).map(([fi, en]) => [en, fi]));
  for (const [fi, en] of Object.entries(english)) {
    english[fi.toLowerCase()] ??= en.toLowerCase();
    reverse[en.toLowerCase()] ??= fi.toLowerCase();
  }
  let language = 'fi';
  try { if (localStorage.getItem('lpr-language') === 'en') language = 'en'; } catch {}
  function t(text, values) {
    if (templates[text]) {
      return templates[text][language === 'en' ? 1 : 0].replace(/\{(\w+)\}/g, (_, key) => values[key]);
    }
    const trimmed = text.trim();
    let canonical = reverse[trimmed] ?? trimmed;
    let translated = language === 'en' ? (english[canonical] ?? canonical) : canonical;
    if (translated === trimmed) {
      // Guest names and controller identifiers remain unchanged.
      const colon = trimmed.indexOf(': ');
      if (colon >= 0) {
        const tail = trimmed.slice(colon + 2);
        const original = reverse[tail] ?? tail;
        translated = trimmed.slice(0, colon + 2) + (language === 'en' ? english[original] ?? original : original);
      }
      for (const forms of Object.values(templates)) {
        for (const form of forms) {
          const keys = [];
          const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const pattern = escaped.replace(/\\\{(\w+)\\\}/g, (_, key) => { keys.push(key); return '(.+?)'; });
          const match = trimmed.match(new RegExp('^' + pattern + '$'));
          if (match) {
            const values = Object.fromEntries(keys.map((key, i) => [key, key === 'position' ? t(match[i + 1]) : match[i + 1]]));
            translated = forms[language === 'en' ? 1 : 0].replace(/\{(\w+)\}/g, (_, key) => values[key]);
            return text.replace(trimmed, translated);
          }
        }
      }
    }
    return text.replace(trimmed, translated);
  }
  function refresh() {
    document.documentElement.lang = language;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement.closest('script, style, #language-select')) continue;
      const translated = t(node.nodeValue);
      if (translated !== node.nodeValue) node.nodeValue = translated;
    }
    for (const element of document.querySelectorAll('[aria-label], meta[name="description"]')) {
      const attribute = element.hasAttribute('aria-label') ? 'aria-label' : 'content';
      element.setAttribute(attribute, t(element.getAttribute(attribute)));
    }
    document.querySelector('#language-select').value = language;
  }
  window.LPRI18n = {
    t,
    get language() { return language; },
    setLanguage(next) {
      if (!['fi', 'en'].includes(next)) return;
      language = next;
      try { localStorage.setItem('lpr-language', language); } catch {}
      window.speechSynthesis?.cancel();
      refresh();
    }
  };
  document.querySelector('#language-select').addEventListener('change', event => window.LPRI18n.setLanguage(event.target.value));
  refresh();
})();
