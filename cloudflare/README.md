# Tulosseurannan käyttöönotto

1. Avaa Cloudflaressa **Storage & databases → D1 → lpr-times → Console**.
2. Kopioi `schema.sql`-tiedoston sisältö konsoliin ja suorita. Jos konsoli hyväksyy vain yhden komennon kerrallaan, suorita neljä SQL-komentoa erikseen.
3. Avaa **Compute → Workers & Pages → lpr-leaderboard → Edit code**.
4. Korvaa Hello World -koodi kokonaan `worker.mjs`-tiedoston sisällöllä ja paina **Deploy**.
5. Varmista, että Workerissa on D1-binding **DB → lpr-times**.
6. Avaa https://lpr-leaderboard.panu-musakka.workers.dev/api/leaderboard . Aluksi vastauksen tulee olla `{"version":"lut-20261011-v3","results":[]}`.
7. Julkaise päivitetyt pelitiedostot GitHub Pagesiin normaalilla julkaisumenetelmällä. Vahvista pelin aloitusnäkymässä nimimerkki ja paina **Aloita ajo**. Aja kokonainen kierros; tauot, tuloslistan avaaminen ja sovelluksen vaihtaminen ovat sallittuja ja avaa tuloslista 🏆-painikkeesta. Ensimmäinenkin kelvollinen kierros lähetetään. Peli näyttää palvelimen tuloksista TOP 10:n.

Pelin alkuperäksi on asetettu Git-remoten perusteella `https://panulut.github.io`. Jos pelillä on oma verkkotunnus, lisää sen alkuperä (protokolla ja verkkotunnus ilman polkua) `worker.mjs`-tiedoston ORIGINS-listaan. localhost:8000 toimii myös. Muilla lähiverkon osoitteilla verkkotulokset eivät ole käytössä.

Nimimerkki on julkinen. Nimimerkki vahvistetaan jokaisella sivun avauksella, ja se pysyy samana pelikerran ajan. Eri nimimerkeillä on samalla selaimella erilliset yksityiset satunnaistunnisteet; sama nimi säilyttää aiemman tunnisteensa. Tunniste ei rajoita kierrosten määrää. Aiemman käyttöliittymän pelaajatunniste siirtyy muistettuun nimimerkkiin, joten aiempi ennätys säilyy. Yksityinen satunnaistunniste toimii pelaajan avaimena; palvelin tallentaa sen SHA-256-tiivisteen eikä tuloslista paljasta pelaajan avainta. Selaimen tallennustilan tyhjennys tai laitteen vaihto luo uuden pelaajan. Nimimerkit eivät ole yksilöllisiä. Uusi nimimerkki valitaan avaamalla peli uudelleen.

Tämä on epävirallinen tuloslista: palvelin tarkistaa version, nimimerkin, aikojen rakenteen ja sektorien summan, mutta ei aja kierrosta uudelleen. Selaimen tietoja voi väärentää. IP-kohtainen raja on 120 kelvollista lähetystä minuutissa; samaa verkkoyhteyttä käyttävät pelaajat jakavat tämän rajan. IP-osoitteista tallennetaan lyhytikäiset tiivisteet, jotka siivotaan seuraavien lähetysten yhteydessä. CORS ei ole väärentämisen esto.

Vanhoja paikallisia ennätyksiä ei lähetetä jälkikäteen. Jokainen uusi kelvollinen kierros tallentuu omana rivinään. TOP 10 näyttää kymmenen nopeinta kierrosta, eikä kuljettajakohtaista rajaa ole: sama kuljettaja voi ajaa kaikki kymmenen kärkiaikaa samalla pelikerralla tai eri kerroilla. Samatkin kierrosajat säilyvät erillisinä kierroksina; tasatilanteessa aiemmin tallennettu kierros on edellä. Saman lähetyksen uudelleenlähetys samalla lapId-tunnisteella ei luo kaksoiskappaletta. Tuloslistassa näytetään kyseisen kierroksen sijoitus. Jos verkko ei toimi, paikallinen ajanotto toimii edelleen; epäonnistunut lähetys jonotetaan selaimen tallennustilaan. Uusintaa yritetään yhteyden palatessa, Päivitä tuloslista -painikkeesta ja saman nimimerkin vahvistamisen jälkeen seuraavalla sivun avauksella. Uusinta käyttää samaa lapId-tunnistetta, joten jo vastaanotettu kierros ei tallennu kahdesti.

Kun rata tai ajomalli muuttuu, vaihda sama versionumero sekä `leaderboard.js`- että `worker.mjs`-tiedostossa ja julkaise molemmat. Vanhan version ajat säilyvät tietokannassa erillään.

Cloudflare-koodi ja SQL eivät ole osa pelin julkista HTTP-tiedostopalvelua. Käyttöönotto ei tarvitse API-avainta pelin lähdekoodiin.

## Päivitys aiemmasta pelaajakohtaisesta listasta

Julkaise uusi `worker.mjs` samaan `lpr-leaderboard`-Workeriin, jonka D1-binding on edelleen `DB → lpr-times`. Worker luo `laps`-taulun automaattisesti ja kopioi `best_laps`-taulun olemassa olevat ajat sinne kerran. Vanhaa taulua ei poisteta. Migraation uudelleen suorittaminen ei monista tuloksia. Vanhassa järjestelmässä jo korvattuja tai tallentamatta jätettyjä kierroksia ei voi palauttaa.

Uusi GET `/api/leaderboard` palauttaa `mode: "laps"` ja kymmenen nopeinta kierrosta. POST `/api/laps` palauttaa kyseisen kierroksen `lapMs`, `rank`, `inTop10` ja `record` sekä yhteensopivuuden vuoksi pelaajan `bestMs`. Valinnainen `lapId` on 32–64 heksamerkkiä; peli luo jokaiselle kierrokselle uuden satunnaisen tunnisteen. Vanha peliversio ilman `lapId`-kenttää toimii edelleen, mutta sen pyyntöjä ei voi tunnistaa saman lähetyksen uusintayrityksiksi.

Julkaise Worker ennen päivitettyä peliä. Jos pelin julkaisu ehtii ensin, vanhan palvelimen vastaus näytetään käyttäjälle selkeästi: lista ei vielä tue saman kuljettajan useita kierroksia. Uusi palvelin on käytössä vasta, kun GET-vastauksessa näkyy `mode: "laps"`.

Kierroskello jatkuu tuloslistan ollessa auki ja sovelluksen ollessa taustalla. Palattaessa fysiikan ruutuaika nollataan, jotta auto ei hyppää eteenpäin tauon pituista askelta, mutta kierrosajasta ei vähennetä taukoa.

## Vapaaehtoinen pelianalytiikka (20.10.2026)

Peli kerää nimimerkkiin yhdistettyä historiaa vain analytiikkaruudun valinneilta
pelaajilta. Oletus on pois päältä, suostumus vanhenee 180 päivässä.
Suostumus, sen ajankohta ja analytiikkatunniste ovat erillään tuloslistan
pelaajatunnisteesta. Suostumuksen ajankohta kulkee tapahtumien mukana.
Tilastot kuvaavat suostumuksen antaneita selainprofiileja, eivät kaikkia kävijöitä
tai varmennettuja henkilöitä. Jaetun selaimen eri nimimerkit näkyvät samassa
analytiikkaprofiilissa; tuloslistan identiteetit säilyvät erillisinä.

### Käyttöönotto — palvelin ensin, peli sitten

1. Varmista `privacy.html`-sivun rekisterinpitäjä ja yhteyssähköposti sekä
   Cloudflare-tilisi tietojenkäsittelyehdot ja käyttämäsi palvelun asetukset.
2. Päivitä **nykyinen** `lpr-leaderboard`-Worker kokonaisella `worker.mjs`-tiedostolla.
   Se on edelleen yksi itsenäinen moduuli; DB-binding on edelleen `lpr-times`.
   Analytiikan taulut ja indeksit syntyvät automaattisesti. Tuloslistan tauluihin
   ei tehdä analytiikkaa varten muutoksia.
3. Luo pitkä satunnainen ylläpitoavain esimerkiksi paikallisesti:
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
   Lisää se Cloudflare Workerin **Settings → Variables and Secrets** -kohdassa
   **Secret**-tyyppisenä nimellä `ANALYTICS_ADMIN_TOKEN`. Älä tallenna avainta
   lähdekoodiin, GitHubiin, sivun URL:iin tai julkiseen peliin.
4. Lisää Workerille päivittäinen Cron Trigger `0 2 * * *`. `scheduled`-käsittelijä
   poistaa yli 90 päivän tapahtumat myös silloin, kun kukaan ei pelaa.
   Siivous tehdään lisäksi analytiikan API-kutsujen yhteydessä.
5. Julkaise peli normaalisti GitHub Pagesiin. Uusi `analytics.js` ja `privacy.html`
   sisältyvät `npm run build` -pakettiin.
6. Avaa **https://lpr-leaderboard.panu-musakka.workers.dev/admin**, syötä ylläpitoavain
   ja tarkista tilastot. Avain säilyy vain avoimen ylläpitosivun muistissa.
   Lukitse-painike tyhjentää sivun. Älä käytä ylläpitoavainta jaetulla laitteella.

Ilman asetettua ylläpitoavainta raportointirajapinta palauttaa 503 eikä luovuta
pelaajatietoja. Julkinen `/admin`-osoite sisältää vain kirjautumiskuoren.
Kaikki raporttien luku- ja poistopyynnöt vaativat avaimen. Raportteja ei anneta
julkisesta tuloslistarajapinnasta. Tarvittaessa Cloudflare Accessin voi lisätä
suojaksi ylläpitopolkujen eteen, mutta pelkkä Access-otsake ei korvaa tämän
version palvelinpuolista avaintarkistusta.

Ylläpitonäkymän lähde on `cloudflare/admin.html`. Muokkaamisen jälkeen aja
`npm run build:worker`, joka upottaa sen itsenäiseen `worker.mjs`-moduuliin.

### Keräys ja rajat

- `POST /api/analytics/events`: enintään 40 tapahtumaa / 32 KiB. Sallittujen
  kenttien validointi, tapahtumatunnisteisiin perustuva kaksoiskappaleiden esto,
  pelaaja- ja IP-kohtaiset lyhytikäiset lähetysrajat. IP-tiivisteet eivät näy raporteissa.
- Noin 30 sekunnin lähetysväli, muistinvarainen enintään 300 tapahtuman jono.
  Verkkovirheet eivät pysäytä peliä. Pitkän verkkokatkon aikana osa tapahtumista
  voi kadota. Sulkemishetken beacon on parhaaseen yritykseen perustuva lähetys.
- Aika erotellaan ajamiseen, valikkoon, saunaan, kauppaan, paljuun, hajonneeseen
  autoon ja toimettomuuteen. Taustalla tai ilman kohdistusta aikaa ei lasketa.
  Kahden minuutin toimettomuus siirtää ajan idle-luokkaan. Aktiivinen peliohjaimen
  syöte lasketaan toiminnaksi. Hiljainen oleskelu ilman syötteitä voi päätyä idleksi.
- Kierroksen valmistuminen ei ole automaattisesti radan lopettamista: seuraava
  kierros alkaa heti. Aloitetut/valmiit kierrokset eivät siten yksin mittaa poistumista.
- Laitteen, selaimen ja käyttöjärjestelmän luokitus on karkea arvio. Lähteestä
  tallennetaan vain verkkotunnus, ei polkua tai kyselyparametreja. Ei raakaa
  user-agentia, tarkkaa sijaintia, painettujen näppäinten sisältöä tai hiiren reittiä.
- Raportit ovat viimeisten 1/7/30/90 vuorokauden liukuvia ikkunoita. Päiväryhmät
  käyttävät UTC:tä; tapahtuma-ajat näytetään Suomen aikavyöhykkeellä.
- Pelaajalista sivutetaan 100 profiilin ja tapahtumat 200 tapahtuman erissä.
  Yhteenvetoluvut lasketaan koko valitusta aikavälistä, eivät vain nykyiseltä sivulta.
- `DELETE /api/analytics/me` poistaa profiilin sen oman yksityisen tunnisteen
  perusteella. Käyttäjä voi myös vain perua suostumuksen poistamatta historiaa.
  Tuloslistan kierroksia ei poisteta analytiikan poistolla.
- Ylläpito voi poistaa profiilin raportista. Poistosta jää 90 päivän tekninen
  estotunniste, jotta keskeneräinen lähetys ei luo historiaa uudelleen.
- Selainlähetyksiä voidaan väärentää: tämä ei ole vahvistettu henkilöllisyys-
  tai kilpailutulosten varmennusjärjestelmä. Säilytys koskee tämän tietokannan
  tapahtumia; palveluntarjoajan varmuuskopio- ja lokikäytännöt tarkistetaan erikseen.

Testit: `npm run test:analytics`, `npm run test:leaderboard`, `npm run build`.
