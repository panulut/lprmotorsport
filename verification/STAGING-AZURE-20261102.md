# UI + Azure: testijulkaisun valmistelu 2.11.2026

Työhaara `fix/staging-azure-integration` perustuu suoraan
`origin/integration/ui-refresh-review`-commitiin
`1f62e73bfa686797c3946fad6009d61facb28d4f` (PR #19 mukana).
PR #20 on avoin luonnos, kohteena integraatiohaara; sen törmäysoptimointia ei otettu mukaan.
`deploy/azure-test`-haaraa ei yhdistetty. Siitä poimittiin tutkittu Dockerfile,
Dockerin ohitukset, palvelimen käynnistyssuoja/lokitus ja eristystesti.
Muiden worktreeiden tiedostoihin ei kirjoitettu. AGENTS.md:tä ei löytynyt tämän
työpuun juuresta, sen vanhemmista eikä tarkistetuista lähdehaaroista.

## Todellinen etätila ennen julkaisua

Lukevat tarkistukset tehtiin 2.11.2026. Mitään testipalvelua ei julkaistu tai
konfiguroitu uudelleen tämän valmistelun aikana.

| Kohde | Todettu versio/asetus | Tulos |
| --- | --- | --- |
| Render-testisivu `srv-dbfhusdg1s2s73ft0dfg` | commit `8592c86841c9510f426eef0d6fe32ccab7d2fc38`, deploy `dep-dbhlsvnf3r2c73d8bscg`, `live`; palvelun haara `integration/next-update-20261026`, automaattijulkaisu pois | Vanha UI ja Render-varmennus käytössä |
| Azure `rg-lpr-test/lpr-verification-test` | image `ghcr.io/panulut/lprmotorsport/verification@sha256:165a925811cf7a6c69ae60f77cbdd302b4f6aeef88443edb84a89f2275b177a3`; aiemman julkaisutiedon lähdecommit `5ab897e510eb3e1e07cba3c4057c600f5124897f` | `/health` 200, `driving-v1`, 2 sessiota, 0 aktiivista |
| Azure-resurssit | 0,5 vCPU / 1 GiB, 0–1 replikaa; Express-revisio `lpr-verification-test--latest` | Ei muutettu |
| Azure-origin | vain `https://lpr-game-test.azurestaticapps.net` | Render-testiorigin 403; tuotanto-origin 403 |
| Cloudflare `lpr-verified-test` | versio `16b755c3-68b5-4123-a783-b0da197d219d`, deploy `8b14106c-b2a9-4694-9a63-0cc8138e97a2`; kommentti viittaa `015a1b9`:ään | `/api/verified/timing-panel` ja `/api/verified/health` 404 |
| Cloudflare `lpr-analytics-test` | versio `941ec637-657c-4902-8fbb-437e3c0a9b71` | Origin-asetus on olemassa, mutta julkaistu koodi käyttää kiinteää sallittujen listaa |
| D1 | molempien binding: `82324dc1-0ac0-4874-b9f3-dcf16a7c66c8` (`lpr-motorsport-test`); vierailija-, championship- ja chat-taulut löytyvät | Vain skeeman SELECT, 0 kirjoitettua riviä |
| Azure–Cloudflare-avain | Azuresta muistissa luettu testiavain, allekirjoitettu chat-storage GET testioriginilla | Worker 401: avaimet eivät sovi yhteen |
| Azure-mittarit | oikea tunniste 200, anonyymi 401; tyhjä worker-pooli, RSS noin 62,6 MiB auditointihetkellä | Vain joutokäyntimittaus, ei kapasiteettitesti |
| Chat-palautuminen | Azuren `CHAT_STORAGE_URL` puuttuu eikä levyä ole | Historia on nykyisellään muistissa; nollaan skaalautumisen jälkeistä säilymistä ei varmennettu |

Selaimen, nykyisen Azuren ja Worker-asetuksen simulaatiorevisio on sama:
`3c5237068fcb1c7490b265c20f496b5bd0141815d542a7274518df534ed02346`.
Revisiota ja fysiikkaa ei muutettu. Renderin varsinaisia ympäristömuuttujien
arvoja ei luettu: toimivat julkiset päätepisteet varmistettiin julkaistusta
`staging.json`:stä. Worker-salaisuuksien arvoja ei voi lukea APIsta; yhteensopivuus
tarkistettiin allekirjoituksella. Azure-kuvan lähdecommitia ei nykyinen health
palauta; yllä mainittu lähdecommit perustuu aiemman Azure-julkaisun dokumentaatioon,
kun taas kuvan digest varmennettiin nykyisestä Azure-asetuksesta.

## Rajatut korjaukset

- Azure-haaran käynnistyssuoja säilyy. HTTPS Azure -originien lisäksi sallitaan
  vain täsmälleen nykyinen Render-testisivu. `CAPACITY_REPORT_URL` on edelleen kielletty.
  Chatille sallitaan vain täsmällinen `lpr-verified-test`-Workeriin osoittava HTTPS-tallennusreitti.
  Tuotanto-, vieraat Render- ja muokatut tallennusosoitteet hylätään.
- Analytics lukee `GAME_ORIGINS`-asetuksen. Tuotannon oletus säilyy, jos asetusta ei ole.
- Workerille lisättiin tietokantaan koskematon health-reitti. Azure ja Worker
  raportoivat myös lähdecommitin. Etäkokeen esivarmistus vaatii saman protokollan,
  revision ja commitin ennen testitilien luomista sekä kahden session julkaisun.
- Yhteinen, salaisuuksia sisältämätön kohdetiedosto on `staging-targets.json`.
  `prepare:staging-azure` vaatii puhtaan, commitatun työpuun ja täsmäävän SHA:n,
  rakentaa staging-sivun sekä molemmat Worker-tiedostot ja tallentaa niiden SHA-256-tiivisteet.
- Manuaalinen `prepare-staging-azure.yml` rakentaa saman commitin Azure-kuvaksi,
  ajaa eristystestit, HIGH/CRITICAL-haavoittuvuusportin sekä kontin käynnistys-,
  origin-, mittari- ja SIGTERM-kokeen. GHCR-julkaisu vaatii erillisen
  `publish_image=true`-valinnan. Työnkulku ei muuta Azurea tai muita palveluita.
- Vierailijan selainkokeen sarjavalitsin päivitettiin vastaamaan radio-UI:ta.
  Analytics-stubbi koskee myös testin uusia välilehtiä ja PB-palautumissivu
  käyttää samaa hallittua animaatiokelloa kuin testin alkuperäinen ajosivu.

## Paikalliset testit

Läpäisseet: `test:azure-verification`, `test:analytics`, `test:chat`,
`test:staging`, `test:verified`, `test:live-sessions`, `test:determinism`,
`test:physics`, `build:verified-worker`, tavallinen `build`,
`test:dashboard-browser`, `test:staging-browser`, `test:guests-browser` ja
`test:verified-browser` (kirjautunut pelaaja).

Vierailijan 3D-selainkoe varmisti kaksi kierrosta, tilin luonnin kierrosten välissä
ajon jatkuessa, PB-jäljen palautuksen, timing-panelin delta-arvon, replay-katselun,
championshipin ja muokattujen fysiikkatietojen hylkäämisen. Ei JavaScript-virheitä.
Myös tämä koe käyttää paikallisia palveluita ja nopeutettua palvelinkelloa.

`test:staging` käy kaksi kierrosta kahdella paikallisella HTTP-asiakkaalla ja
sisältää vierailijan tiliksi muuttamisen kesken ajon, timing panelin,
championshipin, chat-luvat, allekirjoitetut kierrokset ja replayt.
Se käyttää nopeutettua paikallista kelloa ja SQLiteä, ei Azurea tai julkista D1:tä.
Yksi samanaikaisen renderöinnin aikana tehty yritys ylitti saapumisaikarajan;
erillään ajettu uusinta läpäisi. Kelpoisuusrajoja ei väljennetty.

Varsinainen staging-build testattiin Chromessa koossa 1366×768 ja 390×844:
vierailijavalinta, normaali reaaliaikainen lyhyt ajo, ei JavaScript-virheitä,
ei odottamattomia origineja, ei 5xx-vastauksia eikä vaakaylivuotoa.
Session vapautuminen: poistumispyyntö noin 147 ms; yhteyskatko noin 24,54 s.
60 ruudun näytteen keskimääräinen väli noin 33–34 ms, maksimi noin 49 ms.
Tämä on lyhyt paikallinen sujuvuustarkistus, ei kahden laitteen tai Azuren
suorituskykymittaus. Kuvia tarkastettiin myös silmämääräisesti.
Raportti ja kuvat: `artifacts/integration/staging-browser/` (Git-ohitettu).

Työasemalla ei ole Dockeria, joten uuden kontin buildia, haavoittuvuusskannausta
ja kontin SIGTERM-koetta ei väitetä tehdyiksi. Ne ovat julkaisua edeltävä
manuaalisen GitHub-työnkulun portti. Etäajoja tai kuormitustestejä ei vielä ajettu.

## Yksi hyväksyttävä testijulkaisukokonaisuus

Julkaistava lähde on tämän valmistelun työhaaran commit, jonka täysi SHA on
generoidun `artifacts/integration/staging-release/release.json`:n `commit`.
Sama SHA vaaditaan testisivulta, Azure-kuvalta ja verified-Workerilta.

1. Puske vain `fix/staging-azure-integration` ja aja sen manuaalinen valmistelutyönkulku
   `publish_image=true`. Jatka vasta testien, skannauksen ja konttikokeen läpäistyä.
   Tallenna syntynyt muuttumaton GHCR-digest; älä julkaise Azureen muuttuvalla tagilla.
2. Renderin `LPR Motorsport` -työtilassa (`tea-dbehutrrjlhs73foor2g`) vain staattinen
   testisivu `srv-dbfhusdg1s2s73ft0dfg`: lähdehaara yllä mainittuun työhaaraan,
   automaattijulkaisu edelleen pois, `npm run build:staging`, `dist`.
   Aseta `LPR_TEST_SERVICE_URL` Azure-testiosoitteeseen,
   `LPR_TEST_LEADERBOARD_URL` verified-test-Workeriin ja
   `LPR_TEST_ANALYTICS_URL` analytics-test-Workeriin (`staging-targets.json`).
3. Azure `rg-lpr-test/lpr-verification-test`: julkaise yllä syntynyt digest,
   `GAME_ORIGINS=https://lpr-motorsport-test-a1gg.onrender.com` ja
   `CHAT_STORAGE_URL=https://lpr-verified-test.panu-musakka-0bf.workers.dev/api/verified/chat-storage`.
   Säilytä nykyiset Azure-testin salaisuudet, 2 sessiota, 100 aloitusta/min,
   0,5 vCPU / 1 GiB ja 0–1 replikaa. Express-ympäristö ei tue revision-suffixeja;
   jos tallennettu ja toimiva versio eroavat, käytä vain kyseisen testisovelluksen
   hallittua stop/start-toimintoa ja varmista health sekä mittarit. Älä kierrä käynnistyssuojaa.
4. Cloudflare-tilillä `0bf0fae4f8ed1d66c2e178d662d1c96a` vain
   `lpr-verified-test` ja `lpr-analytics-test`: julkaise paketin Worker-koodi,
   säilytä testikannan DB-binding ja muut salaisuudet.
   `GAME_ORIGINS` vain Render-testisivuun; verified-Workerille
   `SIMULATION_REVISION` yllä mainittuun muuttumattomaan revisioon ja
   `RELEASE_COMMIT` lähde-SHA:han. Yhteensovita vain verified-testin
   `VERIFICATION_SECRET` Azuren nykyiseen testiallekirjoitusavaimeen muistissa,
   ilman avainta komentorivillä, lokeissa tai Gitissä. Säilytä vanha Worker-versio
   salaisuusbindingeineen palautusta varten.
5. Tarkista versiot, alkuperärajoitukset ja allekirjoitus ensin. Aja sitten
   `LPR_TEST_SITE_URL=https://lpr-motorsport-test-a1gg.onrender.com npm run test:verified-remote`
   ja kaksi oikeaa selainta samanaikaisesti. Varaa endpoint kokeelle ja odota
   muiden sessioiden loppumista. Testi luo omat tunnistettavat tilit/rivit,
   mutta ei tyhjennä tuloksia. Varmista selaimessa myös kontakti tötsään/seinäkontakti,
   katselu, chat, timing panel, championship, replay sekä vierailijan tilin luonti
   ajon jatkuessa. Kerää syöteviiveet, HTTP-virheet, katkenneet kierrokset ja
   Azure CPU/muisti. Lopuksi varmista 0 aktiivista/pending/closing sessiota.
   Chatille tarvitaan lisäksi hallittu testisovelluksen uudelleenkäynnistys/
   nollaan skaalautuminen ja saman historian palautumisen tarkistus.

Kustannusvaikutus: ei uusia palveluita tai resurssien suurentamista. Nykyisen
Azure Consumption -resurssin käyttöaika/testiliikenne kuluttaa nykyistä
opiskelijatilausta; lisäksi käytetään nykyisiä GitHub Actions/GHCR- ja
Cloudflare Worker/D1 -kiintiöitä. Tarkkaa lisähintaa ei ole mitattu eikä
maksuttomuutta luvata. Testit eivät osoita kahta suurempaa kapasiteettia.

Palautus: tallenna ennen muutoksia julkiset asetukset, nykyinen Render-deploy ja
molempien Workerien versionumerot. Palaa yllä kirjattuun Azure-digestiin ja vanhaan
GAME_ORIGINS-arvoon, poista lisätty CHAT_STORAGE_URL; varmista jälleen 2 sessiota
ja health. Palauta Workerien vanhat versiot bindingeineen ja testisivun aiempi
deploy sekä kolme julkista osoitetta. Worker-palautus tekee uuden deploymentin
vanhasta versiosta; se ei palauta D1-dataa ([Cloudflare-ohje](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)).
Älä nollaa tietokantaa tai muiden testaajien rivejä. Tämän valmistelun aikana
palautusta ei tehty eikä sen toimivuutta väitetä kokeilluksi.

Aiemmasta Azure-dokumentaatiosta löytyi lupa erilliselle aiemmalle kokeelle,
ei tämän uuden yhteisjulkaisun origin-, chat- ja avainmuutoksille.
Yllä oleva kokonaisuus odottaa käyttäjän yhtä hyväksyntää. Tuotanto ja `main`
eivät kuulu hyväksyntään. UI-julkaisu ja Azure-tuotantosiirto odottavat edelleen
uuden kuvan CI-porttia, varsinaista yhteisjulkaisua ja koko etäketjun tuloksia.
