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
- TOP 10 valitaan vain kierroksista, joilla on julkinen, pysyvästi kiinnitetty
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

## Säilytys ja ylläpito

`verified_replays` on erillinen taulu: tulokset säilyvät `verified_laps`-taulussa.

- Tavalliset uusinnat ovat ylläpidon katsottavissa 30 päivää kierroksen myöntämisestä.
- Minkä tahansa revision TOP 10:een tallennushetkellä päässeet uusinnat saavat
  pysyvän `pinned=1`-merkinnän. Ne säilyvät julkisina myös sijoituksen pudottua.
- Ylläpito voi merkitä tallenteen `flagged` (tarkastettava), `reviewed`
  (tarkastettu) tai `unreviewed` (ei tarkastettu). `flagged` säilyttää tallenteen
  myös 30 päivän jälkeen. Merkintä ei poista tulosta tai väitä pelaajaa botiksi.
- Vanhentunutta yksityistä tallennetta ei palauteta katselurajapinnasta, vaikka
  päivittäinen fyysinen siivous olisi vielä tekemättä.
- Siivous tapahtuu kierrosten tallennuksen yhteydessä ja Worker Cron Triggerillä.
  TOP 10 -arkiston ja tarkastusjonon kasvu ei ole rajattu; seuraa D1:n tilankäyttöä.

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
   Handler poistaa vain vanhentuneet, kiinnittämättömät ja liputtamattomat tallenteet.
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
- `npm run test:recordings`: käyttöoikeudet, määräaika, päivittäinen siivous,
  top-ten-arkisto, tarkastusjono, vanhat ajat sekä katselimen lataus, aikajana,
  toisto/tauko/nopeus/alkuun, mittayksiköt, puuttuva/viallinen tallenne ja lukitus.
- `npm run test:analytics`, `npm run test:leaderboard`, `npm run build`,
  `npm run build:verified-worker`.

Paikallisessa automaattiohjauskokeessa noin 96 sekunnin tallenne oli noin
546–550 kB base64-gzip-muodossa D1:ssä (raakagzip noin 409–413 kB). Tuhat
vastaavaa kierrosta olisi noin 546–550 MB tallennekenttien sisältöä ennen
SQLite-taulujen ja indeksien lisätilaa. Ohjaustapa ja ajon pituus vaikuttavat kokoon.
Tallenteen katselu siirtää raakagzipin; katsoja ei lataa koko arkistoa.
