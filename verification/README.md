# 3D-pelin palvelinvarmennus

Toteutus on paikallisesti testattava kokonaisuus. Julkista Render-palvelua,
Cloudflare Workeria, D1-asetuksia tai GitHub Pages -peliä ei ole tässä muutoksessa julkaistu.
Tuotannon osoitteet ovat tarkoituksella tyhjinä `config.js`:ssä.

## Kokeile

Node 24.x, ei palvelimen npm-riippuvuuksia:

```sh
npm run dev:verified
```

Avaa http://127.0.0.1:8000, kirjoita nimimerkki, hyväksy nimimerkkiin yhdistettyjen
peli- ja käyttötietojen kerääminen ja paina **Aloita ajo**. Varmennus valmistellaan
automaattisesti. Toimivalla yhteydellä ajo alkaa ilman harjoittelua tai
lähtölaskentaa. Jos yhteyttä ei saada, voi ajaa harjoitteluna. Peli yrittää yhteyttä
automaattisesti uudelleen kolmen sekunnin välein. Yhteyden palattua ja session
valmistuttua virallinen ajo alkaa automaattisesti lähtöruudusta ilman lähtölaskentaa.
Myös **Aloita uudelleen** aloittaa valmistelun automaattisesti; lentävät
jatkokierrokset säilyvät samassa varmennetussa sessiossa.
Pelissä näkyy jatkuvasti varmennuksen tila. Jokainen varmennettu ajo alkaa
palvelimen määräämästä lähtöruudusta, mutta sen jatkokierrokset ovat lentäviä.
Kierros hyväksytään vasta palvelimen kuittauksen ja allekirjoituksen jälkeen.

Käynnistin avaa vain paikalliset portit 8000 (peli), 8081 (ajovarmennus) ja
8788 (tuloslista). Tulokset tallentuvat `artifacts/verification/local.sqlite`-tiedostoon.
Paikallinen allekirjoitusavain luodaan muistiin käynnistyksessä; jos haluat vanhojen
jonossa olevien kuittien toimivan uudelleenkäynnistyksen jälkeen, anna oma
`VERIFICATION_SECRET` ympäristömuuttujana. Avainta ei saa laittaa selaimen asetuksiin.

Palvelinta odottaessa tai varmennuksen katkettua ajo on harjoittelua. Aiempi tuloslista näytetään erikseen, eikä uusi
pelikäyttöliittymä enää lähetä harjoitteluaikoja vanhaan tuloslistaan.

## Luottamusketju

1. `cloudflare/verified-worker.mjs` myöntää pelaajatunnukseen, nimimerkkiin ja
   simulaatioversioon sidotun, kaksi minuuttia voimassa olevan aloitusluvan.
2. `verification/server.cjs` tarkistaa luvan ja aloittaa oman 120 Hz:n
   simulaation worker-threadissa. Saman luvan uusintayritys palauttaa saman
   session eikä nollaa palvelinkelloa. Kapasiteetti on enintään kaksi sessiota.
   Pelin sessio valmistellaan ensin odottamaan lähtöä. Valmistelun jälkeen
   erillinen, uusintayritykset salliva aktivointi
   käynnistää palvelinkellon. Harjoittelun odotusaikaa ei lasketa ajoon.
3. Selain lähettää kaasun, jarrun, ohjauksen, ohjaustavan ja luistoneston tilan.
   Palvelin hyväksyy vain peräkkäiset erät. Jälkikäteen ei voi vaihtaa kuitattuja
   syötteitä. 250 ms:n etumatka, kahdeksan sekunnin viiveraja, 15 sekunnin
   toimettomuusraja, kymmenen minuutin ajokatto sekä erä- ja laskentarajat
   katkaisevat hallitsemattoman lähetyksen.
4. `shared/driving.js` ja `shared/people.js` laskevat sekä 3D-pelin että palvelimen
   ajofysiikan, ratakosketukset, esteet, liikkuvat ihmiset, luistoneston, portit ja
   sektorit. Renderöinti ei määrää törmäystiloja. Aika tulee fysiikka-askeleista.
5. Palvelin allekirjoittaa valmistuneen kierroksen HMAC-SHA-256:lla. Kuitti sisältää
   pelaajan, version, session, kierrosnumeron sekä palvelimen laskemat kierros- ja
   sektoriajat. Selaimen ilmoittamia kierrosaikoja ei käytetä.
6. Worker tarkistaa allekirjoituksen ja pelaajan ennen erilliseen `verified_laps`-
   tauluun tallentamista. Sama session ja kierroksen pari tallentuu vain kerran.
   Vanhoja tuloksia ei siirretä varmennettujen joukkoon.

Selaimen piilottaminen, valikkoon tai sisätilaan siirtyminen, simulaatioero,
kaatuminen, palvelimen uudelleenkäynnistys ja yhteyskatkos vaihtavat ajon
harjoitteluksi. Varmennusta ei jatketa selaimen tarjoamasta auton tilasta.
Jo allekirjoitetun kierroksen tallennusta voi yrittää myöhemmin uudelleen.

Tämä varmistaa palvelimen fysiikan mukaisen ajon. Se ei tunnista ihmistä,
estä fysiikan mukaista automaattiohjausta tai takaa julkisen palvelun saatavuutta.
Pelaajatunnus on selainkohtainen satunnaisavain, ei varmennettu henkilöllisyys.

## Tarkistukset

```sh
npm run test:verified
npm run build
```

`test:verified` ajaa aidon paikallisen HTTP-ketjun, saman Worker-koodin SQLitea
vasten, kaksi peräkkäistä kierrosta, allekirjoitusten väärentämisen, väärän
pelaajan, aikaväitteen väärentämisen, uusintalähetykset, järjestysvirheet,
palvelinkellon rajat sekä yhteyskatkon. Testikello on nopeutettu.

Oikean Chrome-selaimen testi (valinnainen Playwright; Chrome asennettuna):

```sh
npm install --no-save --package-lock=false playwright
npm run test:verified-browser
```

Testi lataa oikean 3D-pelin, käyttää synteettisiä ohjauksia ja nopeutettua
palvelinkelloa, vertaa näppäimistön, analogiohjauksen ja luistoneston tiloja,
tallentaa lähtö- ja lentävän kierroksen sekä muuttaa auton sijaintia ja
moottoritehoa selaimessa. Raportti ja kuvakaappaus tulevat
`artifacts/verification/`-hakemistoon. Se ei ole ihmisen ajotesti,
reaaliaikainen kuormamittaus tai mobiiliselainten yhteensopivuuslupaus.

Kahden samanaikaisen oikeassa ajassa ajavan Chrome-asiakkaan paikallinen koe:

```sh
npm run test:verified-realtime
```

Se käyttää normaalia 3D-renderöintiä, synteettistä ohjausta ja palvelimen oikeaa
monotonista kelloa. Tuloksena on `artifacts/verification/realtime-report.json`.
Testi kestää noin kaksi minuuttia. Sekään ei mittaa Renderin kapasiteettia.

24.10.2026 paikalliset tarkistukset läpäisivät Chrome 155:llä. Nopeutettu
3D-koe varmisti kaksi peräkkäistä kierrosta ja torjui sekä auton siirtämisen
että moottoritehon muuttamisen: [browser-measurement.json](browser-measurement.json).
Kaksi samanaikaista reaaliaikaista Chrome-asiakasta ajoivat kumpikin 11 539
fysiikka-askeleen eli 96,158 sekunnin kierroksen, ja molemmat tulokset
tallentuivat ilman selainvirheitä. Kokeen kokonaiskesto session aloituksista
tulosten havaitsemiseen oli 97,87 sekuntia:
[local-realtime-measurement.json](local-realtime-measurement.json).

## Julkaisua varten

Seuraavan julkaisun pelaajatiedote on [RELEASE_NOTES.md](../RELEASE_NOTES.md).
Se on luonnos, kunnes koko ketju on julkisesti käytössä. Julkaisussa uusi
tuloslista aloitetaan tyhjänä ja vanha lista poistetaan pelaajan normaalista
tulosnäkymästä. Vanhoja tuloksia ei tarvitse poistaa tietokannasta: ne säilyvät
arkistona, eikä niitä siirretä `verified_laps`-tauluun. Nollausta ja tiedotetta
ei tehdä ennen uuden peliversion, ajovarmennuksen ja tuloslistan yhteistä käyttöönottoa.

- Palvelimen käynnistyskomento on `node verification/server.cjs`.
  Aseta `VERIFICATION_PUBLIC=1`, `PORT`, `GAME_ORIGINS` ja vähintään 32-merkkinen
  satunnainen `VERIFICATION_SECRET`. Salaisuus on eri kuin kokeilun LAB_TOKEN.
- Julkaise `cloudflare/verified-worker.mjs` omana bundlattuna Workerina.
  Se tuo yhteisen protokollan `verification/protocol.mjs`:stä.
  Sido `DB` D1-tietokantaan ja suorita `cloudflare/verified-schema.sql`.
  Aseta sama `VERIFICATION_SECRET`, `GAME_ORIGINS` ja `SIMULATION_REVISION`.
- Revision saa komennolla `node -p "require('./verification/world.cjs').revision"`.
  Rakennus luo saman version selaimen `verification/revision.js`:ään.
  Rivinvaihdot normalisoidaan, joten Windows- ja Linux-checkoutit täsmäävät.
- Aseta julkiset HTTPS-palveluosoitteet `verification/config.js`:ään ja rakenna
  peli `npm run build` -komennolla. Allekirjoitusavainta ei koskaan julkaista.
- Ennen julkista käyttöönottoa tarvitaan tällä uudella simulaatiolla todellinen
  reaaliaikainen yhden ja kahden pelaajan kohdepalvelintesti, ihmisen 3D-ajo,
  mobiiliohjainten tarkistus sekä kylmäkäynnistyksen ja hitaiden laitteiden koe.
  Vanhan erilliskokeilun Render-mittaukset eivät todista tämän version kapasiteettia.

Nykyinen käyttöönotto on yksi varmennusinstanssi: sessiot ovat sen muistissa.
Horisontaalinen skaalaus edellyttää erikseen sessioreititystä ja yhteistä
aloituslupien kertakäytön hallintaa. Älä käynnistä useita instansseja sellaisenaan.
