# LPR Lap Challenge – Windows-sovellus

Electron-ikkuna, joka avaa live-pelin osoitteesta https://lprmotorsports.me.
Pelitiedostot pysyvät verkossa, koska varmennuspalvelu ja Workerit hyväksyvät
vain pelin oman originin. Leaderboard, tilit ja chat toimivat siksi ilman
palvelinmuutoksia, ja sovellus päivittyy aina kun sivusto päivittyy.

Rakenna asennusohjelma:

    cd desktop
    npm install
    npm run dist

Tulos: `desktop/release/LPR-Lap-Challenge-Setup.exe`.

- F11 vaihtaa koko näytön tilan, F5 / Ctrl+R lataa pelin uudelleen.
- Pelin ulkopuoliset linkit avautuvat oletusselaimeen.
- Ilman verkkoyhteyttä näytetään `offline.html` ja Yritä uudelleen -painike.
- Asennusohjelmaa ei ole allekirjoitettu, joten Windows SmartScreen varoittaa
  ("Lisätietoja" → "Suorita silti").
- Jos `npm start` tai exe käynnistyy VS Coden terminaalista Node-tilassa,
  poista ensin ympäristömuuttuja `ELECTRON_RUN_AS_NODE`.
