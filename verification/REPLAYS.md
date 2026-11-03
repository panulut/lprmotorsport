# Varmennettujen kierrosten uusinnat

Uudet varmennetut kierrokset voivat sisältää kuljettajan paikalta katsottavan 3D-uusinnan. TOP 10:n rivillä on
**Katso uusinta**, kun tallenne on saatavilla. Vanhoihin tuloksiin ei synny tallennetta
jälkikäteen. Fysiikkarevisio ja tallennetut vanhat tulokset eivät muutu, mutta TOP 10 edellyttää julkista tallennetta.

## Tallennus ja luottamusketju

- `verification/replay.cjs` tallentaa **palvelimen** käsittelemät ohjauskomennot
  120 Hz:n askelindekseillä. Muuttumattomat komennot tallennetaan vain kerran.
- Palvelimen laskema sijainti, suunta ja nopeus tallennetaan 20 Hz:llä sekä
  kierroksen kummassakin päässä. Lentävä kierros saa oman alkutilan; sitä ennen
  ajettua kierrosta ei tarvita katseluun. Tallenne sisältää rataviivan ja mittakaavan.
- JSON pakataan gzipillä ja välitetään base64-muodossa. Kierroskuitti allekirjoittaa
  tallenteen SHA-256-tiivisteen (`replayHash`). Selain vain välittää aineiston;
  se ei voi korvata tallennettua ajolinjaa tai ohjauskomentoja.
- Selain pitää kuitin ja tallenteen samassa lähetysjonossa. Tulos ja tallenne
  tallennetaan samaan D1-transaktioon. Uusintalähetykset eivät monista rivejä.
- Julkinen tuloslista hyväksyy uuden kierroksen vain, jos sen allekirjoitettu
  kuitti sitoo mukana toimitetun tallenteen. Pelkkä aika tai kuitti ilman
  tallennetta hylätään. Myös selaimen tallennustilan täyttyessä jonossa pidetään
  koko tallenne, ei pelkkiä kuitteja. Pidä välilehti auki lähetyksen ajan.
- TOP 10 valitaan vain kierroksista, joilla on julkinen, kiinnitetty
  tallenne. Vanhat tallenteettomat tulokset säilyvät tietokannassa ylläpidolle,
  mutta eivät voi viedä TOP 10 -paikkoja. Jos tallennus ylittää 900 000 merkin
  rajan tai epäonnistuu, kierros ei kelpaa julkiselle listalle.

Katselin käyttää samaa `LPRRenderer3D`-kameraa ja ohjaamoa kuin peli. Sijainnin,
suunnan ja nopeuden lisäksi uusi tallenne sisältää todellisen ohjauskulman,
korin kallistuksen (pitch/roll), pystysuuntaisen liikkeen, pyörien joustoliikkeet
sekä pito- ja luistonestotilat 20 Hz:llä. Näytteiden välillä arvot interpoloidaan.
Kamera siis liikkuu tallennetun jousituksen mukana eikä pelkän tasaisen ajolinjan
perusteella. Ratin näyttö käyttää samoja esityssääntöjä kuin peli. Aikajana,
tauko, alusta aloittaminen ja ¼–4× nopeus toimivat molemmissa näkymissä.

Tämä on pelidatasta muodostettu uusinta, ei alkuperäisen pelaajan kuvakaappausvideo.
Näytön kuvasuhde riippuu katsojan laitteesta. Ympäristön kaikkia törmäysvaurioita tai
pelaajan ohjaamon näyttövalintoja ei tallenneta. Liikkuvat ihmiset esitetään session
alkuperäisellä ajalla. Rataversioltaan poikkeava tallenne näytetään vain ratakuvana.

Vanhoja kuusikenttäisiä tallenteita voi katsoa 3D:nä, mutta niistä puuttuvat
jousituksen ja todellisen ohjauskulman tiedot: ratin liike on silloin arvio
komentodatasta ja puutteesta näytetään huomautus. Uusiin tallenteisiin tiedot
tallennetaan palvelimella. WebGL:n puuttuessa katselin kertoo syyn ja käyttää
vaihtoehtoista 2D-ratakuvaa. Automaattista bottipisteytystä ei lisätty.

## Replay retention and administration

The retention policy is documented in [VERIFIED-GUESTS.md](VERIFIED-GUESTS.md#replay-policy-and-diagnostics).
Each series retains its current fastest twenty recordings, plus flagged/excluded
recordings. Recordings that have ever reached the public top ten are archived
permanently, including across revisions and series changes. Their public pin may
be cleared, but automatic cleanup never deletes their evidence. Administrators
can retrieve archives from old revisions. Original lap rows and newly accepted
signed receipts remain even when a non-public replay is not retained. Monitor
archive growth; the previous fixed-size storage estimate no longer applies.

The leaderboard displays only each driver's fastest eligible replay, identified
by the stable account/guest principal across sessions. Deduplication happens
before the ten-driver limit; equal times keep their original arrival order.
In addition to the existing twenty-lap pool, each series retains the best replay
of its twenty fastest distinct drivers. Both the ten fastest laps and the ten
fastest drivers' best laps become public. This preserves multiple watchable laps
without allowing one driver to block others' recordings. The replay viewer's
**Kuljettajan muut uusinnat** selector lists that driver's other public recordings
via `GET /api/verified/replays/:session/:lap/related`. Private, excluded and old
revision recordings are not exposed through this list. Admin lap diagnostics use
driver ranks and mark slower personal laps as `not_personal_best`.

## Sarjat: ihmiset ja botit

- Tilin luonti etenee kahdessa vaiheessa: ensin nimimerkki ja salasana, sitten pakollinen
  **Kummassa sarjassa ajat?** -valinta kuvakorteilla (ihminen / robotti), joista kumpaakaan ei ole
  valittu valmiiksi. Tili luodaan vasta toisessa vaiheessa. Valinta tallennetaan
  `verified_account_series`-tauluun; rivin puuttuminen tarkoittaa ihmissarjaa.
- Tuloslistalla on välilehdet **Ihmiset** ja **Botit** (`/api/verified/leaderboard?series=human|bot`).
  Kirjautuneelle näytetään oman sarjan lista. Botit eivät koskaan vie ihmissarjan paikkoja.
- Ylläpito voi siirtää tilin sarjasta toiseen ylläpitonäkymän **Sarja**-valinnalla.
  Siirto koskee tilin kaikkia kierroksia, ja kiinnitykset ja säilytys lasketaan heti uudelleen.

## Katsojien ilmoitukset

- Kirjautunut katsoja voi ilmoittaa julkisesta (TOP 10) uusinnasta: syy (epäilty botti,
  epäluonnolliset ohjauskomennot, epäilyttävä ajolinja tai aika, muu) ja valinnainen enintään
  200 merkin lisätieto. Ilmoitus käyttää pelin kirjautumista (`POST /api/verified/report`).
- Yksi ilmoitus katsojaa ja kierrosta kohden, enintään 30 vuorokaudessa. Omasta kierroksesta
  ei voi ilmoittaa. Ilmoitus merkitsee tallenteen `flagged`-tilaan, mutta ei piilota tulosta.
- Ilmoitukset (`verified_reports`: ilmoittajan tili, syy, lisätieto, aika) näkyvät vain ylläpidolle
  ja poistuvat tallenteen mukana.

Ylläpito: pelin `replay.html?admin=1` tai katselimen **Ylläpito**-linkki.
Kirjaudu Workerille asetetulla `ANALYTICS_ADMIN_TOKEN`-avaimella. Avain jää vain
sivun muistiin; sitä ei aseteta URL:iin tai selaintallennukseen. **Lukitse** tyhjentää
näkymän ja avaimen. Ylläpidon listassa ovat myös vanhat ja tallenteettomat kierrokset;
se on sivutettu 50 rivin eriin ja sen voi rajata tarkastettaviin.

## Käyttöönotto

Ei uutta Render-palvelua, tallennusbuckettia tai maksullisen tason asetusta.
Olemassa olevan D1-tietokannan kiintiöt pätevät edelleen.

1. Suorita olemassa olevassa D1-tietokannassa `cloudflare/verified-schema.sql`.
   `CREATE TABLE IF NOT EXISTS` säilyttää nykyiset tulokset. Tietokannan binding
   on edelleen **DB** samassa **lpr-verified**-Workerissa.
2. `npm run build:verified-worker`: julkaise syntyvä
   `cloudflare/verified-worker.bundle.mjs` lpr-verified-Workeriin säilyttäen
   nykyiset bindingit, `VERIFICATION_SECRET` ja muut asetukset.
3. Aseta **lpr-verified**-Workerille salainen `ANALYTICS_ADMIN_TOKEN`
   (vähintään 32 merkkiä). Voit käyttää omaa nykyistä ylläpitoavaintasi, mutta
   eri Workerissa oleva samanniminen secret ei siirry automaattisesti.
   Älä käytä `VERIFICATION_SECRET`-avainta ylläpitokirjautumiseen.
4. Lisää Workerille päivittäinen Cron Trigger **`0 3 * * *`** (UTC).
   Handler poistaa tallenteet, jotka eivät kuulu kummankaan sarjan nykyisen revision 20 nopeimpaan eivätkä odota tarkastusta.
5. Julkaise varmennuspalvelin ja pelin Pages-julkaisu. Worker julkaistaan ensin,
   koska uudet selainpyynnöt sisältävät suuremman tallenteen. Fysiikkarevisio
   pysyy samana: tämän muutoksen vuoksi tuloslistaa ei nollata.
6. Aja uusi virallinen kierros ja tarkista **Katso uusinta**, aikajana sekä
   ylläpidon tarkastusmerkinnän pysyvyys. Vanhoilla ajoilla linkkiä ei ole.

Paikallisesti `npm run dev:verified`. Ylläpitoa varten voit asettaa
`ANALYTICS_ADMIN_TOKEN`-ympäristömuuttujan ennen käynnistystä; tietokantaskeema
luodaan automaattisesti. Uusinnat tallentuvat samaan paikalliseen SQLite-tietokantaan.

## Validointi

- `npm run test:verified`: oikea HTTP-ketju, lähtö- ja lentävät kierrokset,
  tallenteen hash, jokaisen 20 Hz:n sijaintinäytteen vertailu tallennetuista
  ohjauskomennoista uudelleen laskettuun fysiikkaan, väärennösten torjunta,
  SQLite-tallennus, julkinen katselu ja ylläpidon oikeudet. Myös selaimen
  uusintalähetysjono testataan sekä vanhalla että tallenteellisella kuitilla.
- `npm run test:recordings`: käyttöoikeudet, sarjakohtainen 20 parhaan säilytys, hitaan kierroksen
  ohitettu kirjoitus, vanhan revision tallenteet, päivittäinen siivous, tarkastusjono, bottisarja,
  katsojien ilmoitukset ja ylläpidon sarjasiirrot, vanhat ajat sekä katselimen lataus, ilmoituslomake, aikajana,
  toisto/tauko/nopeus/alkuun, mittayksiköt, puuttuva/viallinen tallenne ja lukitus.
- `npm run test:analytics`, `npm run test:leaderboard`, `npm run build`,
  `npm run build:verified-worker`.

Paikallisessa automaattiohjauskokeessa noin 96 sekunnin tallenne oli noin
546–550 kB base64-gzip-muodossa D1:ssä (raakagzip noin 409–413 kB). Tuhat
vastaavaa kierrosta olisi noin 546–550 MB tallennekenttien sisältöä ennen
SQLite-taulujen ja indeksien lisätilaa. Ohjaustapa ja ajon pituus vaikuttavat kokoon.
Tallenteen katselu siirtää raakagzipin; katsoja ei lataa koko arkistoa.
