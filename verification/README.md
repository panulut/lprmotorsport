# Verified guest update

See [VERIFIED-GUESTS.md](VERIFIED-GUESTS.md) for authenticated guest driving, secure account promotion, open-day championship enrollment, replay archives, migration and staging validation. This supersedes older account-only and replay-retention descriptions below.

# 3D-pelin palvelinvarmennus

## Suora ajonseuranta

Pelin aloitusnäkymän **Aktiiviset kuljettajat** näyttää käynnissä olevat ajot.
Paina kuljettajan nimeä: katselin aukeaa saman valikon sisään ja varikkochat
säilyy käytettävissä samalla kirjautumisella. **Takaisin kuljettajalistaan**
sulkee katselimen. Lista päivittyy kolmen sekunnin välein valikon ollessa auki.
Seuranta käyttää pelin omaa WebGL-piirtäjää, ajokameraa, autoa, rattia,
jousitusta ja mittaristoa samoilla piirtoasetuksilla kuin oma ajo. Näkymässä
lukee **Seurataan pelaajaa [nimi]**. Oikean sivuvalikon kuljettajista voi
vaihtaa seurattavaa suoraan; valittu kuljettaja on korostettu. Puhelimessa
lista sijoittuu ajonäkymän alle. Chat säilyy käytettävissä koko ajan.
Kierros ja kierrosaika seuraavat palvelimen kierrosrajoja; paras aika
tarkoittaa seurattavan ajosession parasta kierrosta.
Seuranta kattaa käynnissä olevat leaderboard-ajot;
harjoittelutilaa ei lähetetä. Kuljettajalle kerrotaan julkisesta seurannasta
kirjautumisen yhteydessä. Katselija ei tarvitse tiliä.

Varmennuspalvelimen `GET /spectate` palauttaa aktiivisten ajojen nimimerkit
ja julkiset sessiotunnisteet. `GET /spectate/:id` palauttaa viimeisten viiden
sekunnin palvelimella lasketut liikkeet ja ohjaussyötteet. Tunnuksia,
pelaajan profiilitunnisteita ja kierroskuitteja ei palauteta. Katselu ei varaa
fysiikkasessiota. Pelin katselin hakee ajotiedot puolen sekunnin välein ja listan
kolmen sekunnin välein; haut pysähtyvät sivun ollessa piilossa. Puskurointi
lisää noin sekunnin viiveen verkon ja varmennuksen viiveen lisäksi.
Ajon päättyminen tai yhteyskatko näytetään katselijalle.

Julkaise peli ja varmennuspalvelin yhdessä. Tarkistukset:
`npm run test:spectate` ja `npm run test:spectate-browser`.

## Tilannekatsaus yhdellä näytöllä

Päävalikon aktiiviset kuljettajat, TOP 10, päivän nopeimmat, eniten kierroksia
ajaneet ja kuukauden pistekisa näkyvät ilman näkymän vierittämistä.
Näyttökoko määrää kerralla näkyvien rivien määrän. Listojen nuolipainikkeilla
nähdään muut tulokset; sijoitukset ja kokonaismäärä säilyvät näkyvissä.
Seurannassa samat tilastot ovat kuljettajalistan yhteydessä. Kisapäivän valinta
ja pisteytyksen säännöt avautuvat **Kisapäivä ja pisteet** -painikkeesta.
Kirjautuminen ja lisäasetukset ovat erillisiä toimintoja, eivätkä kasvata
tavallisen tilannekatsauksen korkeutta.

Täysien listojen asettelu tarkistetaan työpöytä-, kannettava- ja puhelinkoossa:
`npm run test:dashboard-browser`.

## Varikkochat

Kuljettaja voi valita aloitus- ja tuloslistanäkymässä **Näytä chat ajon aikana**.
Chatin voi sulkea sen omasta sulkupainikkeesta. Suljettuna siitä jää vasempaan
reunaan **Varikkochat**-avauspainike. Avattuna erillistä avauspainiketta ei näytetä.
Valinta muistetaan selaimessa seuraaville pelikerroille; ensimmäisellä käynnillä
chat näkyy. Puhelimessa chat ja sen suljettu painike kiinnittyvät alareunaan.
Chatin näyttäminen ei kohdista kirjoituskenttää, joten viestejä voi lukea ajaessa.

Pelin 💬-painike avaa kaikille yhteisen chatin. Chat käyttää samaa Render-palvelua
kuin ajovarmennus (`verification/server.cjs`). Viestin lähettäjän nimimerkki tulee
aina kirjautuneen tilin tiedoista: peli hakee Cloudflare Workerilta
(`POST /api/verified/chat-ticket`, kirjautumistunniste `Authorization`-otsakkeessa)
kymmenen minuuttia voimassa olevan, `VERIFICATION_SECRET`illä allekirjoitetun chat-lipun.
Render hyväksyy viestin vain voimassa olevalla lipulla ja ottaa nimimerkin lipusta,
ei pyynnön sisällöstä. Uloskirjautunut tai väärennetty tunniste ei saa uutta lippua.
Render tallentaa viestit `lpr-verified`-Workerin D1-tietokantaan allekirjoitetulla
palvelinten välisellä pyynnöllä. `CHAT_STORAGE_URL` osoittaa Workerin
`/api/verified/chat-storage`-osoitteeseen; se on asetettu `render.yaml`-tiedostossa.
Worker luo chat-taulun automaattisesti.

Chatin valvonta tehdään ylläpitosivulla (`/admin` analytiikka-Workerissa, osio
Chatin valvonta). Siellä voi poistaa viestin, estää viestin kirjoittajan (hänen
kaikki viestinsä poistuvat ja vanhatkin chat-liput lakkaavat toimimasta) ja sulkea
chatin vierailijoilta. Palvelin välittää kirjoittajan tunnisteen vain allekirjoitetussa
tallennuspyynnössä; julkinen chat ei näytä sitä. Vierailijat kirjoittavat vain
vierailijasessiolla, joten jokainen kirjoittaja voidaan estää. Anonyymi
`/api/verified/guest-chat-ticket` palauttaa 410. Julkaise ensin Worker, sitten palvelin:
vanha palvelin ei lähetä kirjoittajaa, joten sen viestit voi poistaa mutta kirjoittajaa
ei voi estää.

Julkaise muutokset sekä Render-palveluun
että `npm run build:verified-worker` -komennon tuottama Worker-koodi; Renderin
automaattijulkaisu on pois käytöstä, joten julkaisu käynnistetään erikseen.
Julkaise päivitetty palvelin, Worker (`npm run build:verified-worker`) sekä
`npm run build` -komennon tuottama peli yhdessä. Paikallisesti kaikki
käynnistyvät komennolla `npm run dev:verified`.

Chat päivittyy kolmen sekunnin välein vain sen ollessa näkyvissä. Kirjoittaminen
vapauttaa ajonäppäimet ja lähettää neutraalin ohjaussyötteen; kierros jatkuu normaalisti.
Viestissä saa olla enintään 280 merkkiä. Raja on kuusi viestiä minuutissa
tiliä ja 30 viestiä minuutissa yhdistävää IP-osoitetta kohti.
Käänteisen välityspalvelimen takana jälkimmäinen raja voi olla yhteinen kaikille.

Cloudflare D1 säilyttää viimeiset 100 viestiä enintään 24 tuntia. Historia säilyy
Render-palvelimen uudelleenkäynnistyksen yli. Viestit näkyvät julkisesti;
pelaajatunnisteita ja IP-osoitteita ei tallenneta chat-historiaan eikä palauteta
chatissa. Viestien sisältöä ei lähetetä analytiikkaan.

Tarkistukset: `npm run test:chat`, `npm run test:chat-browser`.

Palvelin laskee jokaisen virallisen kierroksen itse kuljettajan ohjaussyötteistä ja
allekirjoittaa tuloksen; selaimen ilmoittamaa aikaa ei käytetä mihinkään. Tuotannon osat ovat
Render-palvelu `lpr-verification`, Cloudflare Worker `lpr-verified` ja GitHub Pages -peli;
käyttöönotto on kuvattu kohdassa *Julkaisua varten*. Osoitteet ovat `config.js`:ssä.

## Kokeile

Node 24.x, ei palvelimen npm-riippuvuuksia:

```sh
npm run dev:verified
```

Avaa http://127.0.0.1:8000, kirjoita nimimerkki ja salasana (vähintään 8 merkkiä), valitse halutessasi nimimerkkiin yhdistettyjen
peli- ja käyttötietojen kerääminen ja paina **Aloita ajo**. Vapaan nimimerkin kohdalla peli pyytää
vahvistuksen (**Varaa nimimerkki**), ennen kuin nimi varataan tälle salasanalle. Kirjautuminen
muistetaan selaimessa enintään seitsemän päivää; **Kirjaudu ulos** mitätöi istunnon myös palvelimella. Varmennus valmistellaan
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

0. **Nimimerkin omistus.** `POST /api/verified/account` (`cloudflare/verified-worker.mjs`)
   kirjaa sisään nimimerkillä ja salasanalla tai varaa vapaan nimimerkin, kun selain pyytää
   sitä erikseen (`create:true`). Nimimerkit ovat yksilöllisiä kirjainkoosta riippumatta.
   Salasanasta tallennetaan vain PBKDF2-SHA-256-tiiviste ja suola `verified_accounts`-tauluun
   (oletuksena 100 000 kierrosta, Workersin yläraja; ks. `PASSWORD_ITERATIONS` alla). Palvelin
   palauttaa jokaiselle kirjautumiselle uuden satunnaisen tunnisteen ja `expiresAt`-ajan.
   `verified_login_sessions` tallentaa vain tunnisteen tiivisteen, tilin pysyvän tunnuksen sekä
   luonti- ja vanhenemisajat. Istunto vanhenee ehdottomasti seitsemässä päivässä; käyttö ei jatka määräaikaa. Vain väärät salasanat rajoitetaan: 5 / 10 min nimimerkkiä ja osoitetta kohden ja
   30 / 10 min nimimerkkiä kohden. Lisäksi kaikkia tilipyyntöjä rajoitetaan 20/min osoitetta kohden.
   Onnistunut kirjautuminen ei kuluta nimimerkin kiintiötä. Salasanaa ei voi palauttaa.
1. `cloudflare/verified-worker.mjs` myöntää aloitusluvan vain tilin omistajalle. Lupa on sidottu
   pelaajatunnukseen, tilin nimimerkkiin ja simulaatioversioon, ja se on voimassa kaksi minuuttia.
2. `verification/server.cjs` tarkistaa luvan ja aloittaa oman 120 Hz:n
   simulaation worker-threadissa. Saman luvan uusintayritys palauttaa saman
   session eikä nollaa palvelinkelloa. Oletuskapasiteetti on enintään kaksi sessiota (ks. kapasiteettiasetukset alla).
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
6. Worker tarkistaa allekirjoituksen, pelaajan ja tilin ennen erilliseen `verified_laps`-
   tauluun tallentamista. Sama session ja kierroksen pari tallentuu vain kerran.
   Vanhoja tuloksia ei siirretä varmennettujen joukkoon. TOP 10 näyttää vain tileihin
   kuuluvat kierrokset tilin nimimerkillä; ennen tilejä ajetut kierrokset jäävät tauluun
   mutta eivät näy listalla.


Kesken virallisen ajon tapahtuva varmennuksen menetys ei enää käynnistä peliä uudelleen eikä siirrä autoa lähtöruutuun. Ajo jatkuu harjoitteluna, kunnes pelaaja käynnistää itse uuden virallisen ajon. Virheluokka näkyy pelissä ja tarkemmat tiedot löytyvät selaimen konsolista. Tämä ei hyväksy keskeneräistä kierrosta tuloslistalle.

Selaimen piilottaminen, valikkoon tai sisätilaan siirtyminen, simulaatioero,
kaatuminen, palvelimen uudelleenkäynnistys ja yhteyskatkos vaihtavat ajon
harjoitteluksi. Varmennusta ei jatketa selaimen tarjoamasta auton tilasta.
Jo allekirjoitetun kierroksen tallennusta voi yrittää myöhemmin uudelleen.

Tämä varmistaa palvelimen fysiikan mukaisen ajon. Se ei tunnista ihmistä,
estä fysiikan mukaista automaattiohjausta tai takaa julkisen palvelun saatavuutta.
Pelaajatunnus kuuluu nimimerkkitilille, ei varmennetulle henkilöllisyydelle: salasanan
tietävä voi ajaa tilin nimissä.

## Jos ajo muuttuu harjoitteluksi fysiikkaeron vuoksi

Tarkista pelin ilmoitus. `state_difference` tarkoittaa, että jonkin auton
fysiikka-arvon ero ylitti hyvin pienen `1e-5` toleranssin; `lap_checkpoint_difference`
tarkoittaa, että kierros-/sektoritila ei täsmännyt; `missing_snapshot`
kertoo puuttuvasta paikallisesta tilatallenteesta.

Kopioi diagnostiikka selaimen DevTools-konsolissa:

```js
window.LPRVerificationDiagnostics.lastMismatch
```

Raportti sisältää ensimmäisen havaitun poikkeaman tarkistustickin,
poikkeavien kenttien selain- ja palvelinarvot sekä erot. Älä sisällytä
pyynnön Authorization-otsakkeita, pelaajatunnuksia tai allekirjoitettuja
kierroskuitteja raporttiin. Huomaa, että selainikkunan uudelleenlataus
tyhjentää tämän viimeisen tapahtuman.

Tilavertailun toleranssi koskee vain sitä, näytetäänkö paikallinen ajo
palvelimen kanssa yhtäpitävänä. Palvelin laskee ja allekirjoittaa tulokset
edelleen omasta simulaatiostaan; asiakkaan aika- ja sijaintiväitteisiin
ei luoteta. Toleranssin muutos ei korjaa mahdollisia varsinaisia
simulaatioiden eroja; raportoi toistuva poikkeama ennen julkaisemista.

Tunnettu syy `state_difference`-poikkeamalle on ollut JavaScript-moottorien
matematiikkaero: `Math.sin`, `cos`, `pow` ja vastaavat saavat ECMAScript-
määrittelyn mukaan poiketa viimeisessä bitissä selaimen ja Node.js:n välillä,
ja ajomalli kasvattaa eron noin `1e-5` yksikköön minuutissa. Siksi jaettu
fysiikka käyttää `shared/dmath.js`-tiedoston deterministisiä toteutuksia
(`window.LPRMath`), ja `verification/world.cjs` kääntää sen ensimmäisenä.
`npm run test:determinism` vertaa sekä funktioita että palvelinmaailman
autopilottikierrosta Chromiumissa tallennettuun tiivisteeseen; katso
README:n kohta Deterministinen fysiikka.

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
Julkaisussa uusi tuloslista aloitetaan tyhjänä ja vanha lista jää pelaajalle erilliseksi
arkistoksi. Vanhoja tuloksia ei siirretä `verified_laps`-tauluun.

### Käyttöönotto askel askeleelta

Kolme osaa, tässä järjestyksessä. Sama `VERIFICATION_SECRET` (vähintään 32 merkkiä) on
Renderissä ja Cloudflaressa; se ei saa koskaan päätyä pelin tiedostoihin tai Gitiin.

1. **Varmennuspalvelin Renderiin** (`render.yaml`, Free-taso). Render → *New* → *Blueprint*
   → valitse tämä repositorio ja `render.yaml` → *Apply*. Palvelun nimi on `lpr-verification`
   ja osoite `https://lpr-verification.onrender.com`; jos Render vaatii toisen nimen, vaihda sama
   osoite `verification/config.js`-tiedostoon ennen pelin julkaisua. Render luo
   `VERIFICATION_SECRET`-arvon automaattisesti: kopioi se palvelun *Environment*-välilehdeltä.
   Tarkista `https://lpr-verification.onrender.com/health` → `{"ready":true,...,"streaming":true}`.
   Free-palvelu nukahtaa käyttämättömänä; peli herättää sen itse ja ensimmäinen pelaaja
   odottaa jopa minuutin. Kapasiteetti on kaksi samanaikaista virallista ajoa.
2. **Varmennettu tuloslista Cloudflareen.** Aja `npm run build:verified-worker`; se kirjoittaa
   `cloudflare/verified-worker.bundle.mjs`-tiedoston, johon on upotettu protokolla ja nykyinen
   simulaatiorevisio. Cloudflare → *Workers & Pages* → *Create* → Worker nimellä **lpr-verified**
   → *Edit code* → liitä koko bundle → *Deploy*. Sitten *Settings*: D1-binding **DB → lpr-times**
   (sama tietokanta kuin vanhalla listalla) ja **Secret** `VERIFICATION_SECRET` = Renderin arvo.
   Suorita `cloudflare/verified-schema.sql` D1-konsolissa kerran (Worker luo myös
   `verified_accounts`-taulun itse, jos se puuttuu). Tarkista
   `https://lpr-verified.panu-musakka.workers.dev/api/verified/leaderboard` → `{"protocol":"driving-v1","revision":"...","results":[]}`.
   `GAME_ORIGINS` tarvitaan vain, jos pelillä on muu osoite kuin `https://panulut.github.io`.
   **Testaa kirjautuminen ennen pelin julkaisua**: luo testitili esimerkiksi selaimen konsolista
   `fetch('https://lpr-verified.panu-musakka.workers.dev/api/verified/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:'Testi',password:'testi1234',create:true})}).then(r=>r.status)`
   → `201`. Jos vastaus on `503` tai Cloudflare näyttää virheen 1102 (CPU-raja ylittyi), lisää
   Workerin *Settings → Variables* -kohtaan `PASSWORD_ITERATIONS` = `20000` (sallittu 10 000–100 000)
   tai siirrä Worker maksulliseen tasoon. Tilit tiivistetään uudelleen seuraavalla kirjautumisella.
   Poista testitili lopuksi (ks. alla).
   Jos `VERIFICATION_SECRET` vaihdetaan, kaikki aiemmat kirjautumiset lakkaavat toimimasta.
   Tilit ja kierrokset säilyvät, ja salasanalla kirjautuminen luo uuden istunnon.
3. **Peli.** Pushaa `main` vasta, kun Worker on päivitetty: uusi peli kirjautuu
   `/api/verified/account`-osoitteeseen, jota vanha Worker ei tunne. GitHub Pages -työnkulku
   rakentaa `dist/`-kansion, johon syntyy
   `verification/revision.js`. Avaa peli, kirjaudu nimimerkillä ja salasanalla, valitse halutessasi analytiikka, *Aloita ajo*.
   Tilarivin pitää näyttää valmistelu ja liikennevalot; kierroksen jälkeen aika ilmestyy
   varmennettuun listaan.

### Unohtunut salasana tai nimimerkin poisto

Salasanaa ei voi palauttaa. Ylläpito vapauttaa nimimerkin D1-konsolissa
(`name_key` on nimimerkki pienillä kirjaimilla):

```sql
DELETE FROM verified_accounts WHERE name_key = 'nimimerkki';
```

Tilin kierrokset katoavat silloin TOP 10 -listalta. Jos sama nimi varataan uudelleen, uusi
tili saa uuden tunnuksen, eikä vanhoja kierroksia liitetä siihen.

### Kun fysiikka muuttuu

Simulaatiorevisio on tiiviste jaetuista fysiikkatiedostoista ja ratadatasta. Jokainen muutos
niihin vaihtaa revision, ja silloin kaikki kolme osaa on päivitettävä samassa järjestyksessä:
Render julkaisee automaattisesti `main`-pushista, Workeriin liitetään uusi
`npm run build:verified-worker` -bundle, ja Pages rakentaa pelin. Väliaikaisesti eri versiot
näkyvät pelaajalle ilmoituksena ”Varmennuspalvelun versio vaihtui”, ei väärinä tuloksina.
Uusi revisio aloittaa varmennetun listan tyhjänä; vanhat rivit säilyvät taulussa.

### Mitä tämä ei vielä ole

Nykyinen käyttöönotto on yksi varmennusinstanssi: sessiot ovat sen muistissa, ja Renderin
uudelleenkäynnistys muuttaa käynnissä olevat ajot harjoitteluksi. Horisontaalinen skaalaus
edellyttää erikseen sessioreititysta ja aloituslupien kertakäytön jakamista; älä käynnistä
useita instansseja sellaisenaan. Render Free -tason todellinen viive ja kapasiteetti kahdella
yhtäaikaisella pelaajalla sekä mobiiliselainten käyttäytyminen on todennettava tuotannossa
ennen kuin listaa mainostetaan.

### Pelaaminen ja valinnat

Pelaa ilman leaderboardia ei vaadi tiliä eikä analytiikkasuostumusta. Aja leaderboardiin kirjautuu nimimerkkitilille ja käynnistää ajon varmennuksen. Kehitysanalytiikka on vapaaehtoinen kummassakin tilassa; sen peruminen ei keskeytä ajoa tai tulosten tallennusta.

### Kirjautumisistunnot ja päivitysjärjestys

Päivitä ensin Worker ja sitten selainpeli. Worker luo `verified_login_sessions`-taulun ja indeksin tarvittaessa; taulut löytyvät myös `cloudflare/verified-schema.sql`-tiedostosta. Vanhan version pysyvät kirjautumistunnisteet eivät enää kelpaa: pelaajien on kirjauduttava uudelleen. Tilit, salasanat ja aiemmat tilien kierrosajat säilyvät.

`POST /api/verified/logout` vaatii Authorization Bearer -tunnisteen ja poistaa vain kyseisen istunnon. Toistaminen on turvallista. Selain ilmoittaa verkkovirheestä eikä väitä palvelinistunnon peruuntuneen, jos pyyntö epäonnistui. Jokainen aloitus ja kierrosajan tallennus tarkistaa voimassaolon palvelimelta. Tallennus tarkistaa istunnon myös atomisesti SQL-kirjoituksen yhteydessä, jotta samanaikainen uloskirjautuminen estää uuden tallennuksen. Jo hyväksytyt kierrokset säilyvät.

Vanhentuminen tai uloskirjautuminen estää myös aiemmin allekirjoitettujen kierrosten lähetyksen kyseisellä tunnisteella. Uudelleen kirjautunut sama tili voi lähettää jonoon jääneet kierrokset uudella istunnollaan. Jonot ovat selainkohtaisia. Aiemmin myönnetty ajon varmennussessio voi elää palvelimella aikarajaansa asti, mutta peruttu kirjautuminen ei voi tallentaa sillä tuloksia.

Ylläpito voi tarvittaessa perua tilin kaikki istunnot muuttamatta kierroksia:

```sql
DELETE FROM verified_login_sessions WHERE player_hash IN
 (SELECT player_hash FROM verified_accounts WHERE name_key = 'nimimerkki');
```

Tunniste on edelleen selaimen localStoragessa. Tämä muutos ei toteuta HttpOnly-evästeitä eikä muuta salasanatiivisteen työmäärää.
## Kierrosten uusinnat

Tallennus, TOP 10 -uusinnat, ylläpidon tarkastusjono ja käyttöönotto:
[REPLAYS.md](REPLAYS.md).

## Kapasiteetin mittaus ja kevennys

Jaettu 120 Hz:n fysiikka hakee lähimmän ratasegmentin staattisesta BVH-hakurakenteesta.
Lopullinen etäisyys lasketaan vanhalla kaavalla, ja tasatuloksessa voittaa alkuperäisen
ratajärjestyksen ensimmäinen segmentti. `createWorld({trackIndexed:false})` käyttää
vertailutoteutusta mittauksia varten; verkkoasiakas ei voi valita hakutapaa.
Uusintatallennin lukee askelnumeron ilman koko tilan kopiointia. Valmiin uusinnan
gzip-pakkaus on asynkroninen, mutta kierroskuittaus odottaa edelleen valmista,
allekirjoitettuun tiivisteeseen sidottua uusintaa. Katselun 20 Hz ja tallenteen tiedot säilyvät.

Palvelimen ympäristömuuttujat:

| Muuttuja | Oletus | Merkitys |
| --- | --- | --- |
| `MAX_VERIFIED_SESSIONS` | `2` | Yhtä aikaa varattujen ajosessioiden raja, myös valmistelussa olevat |
| `MAX_VERIFIED_STARTS_PER_MINUTE` | `8` | Koko palvelimen uusien aloitusten minuuttiraja |
| `VERIFICATION_METRICS_TOKEN` | ei asetettu | Erillinen vähintään 32 merkin ylläpitotunniste mittareille |

Kapasiteettirajojen on oltava kokonaislukuja väliltä 1–256. Tämä on asetuksen
validointiraja, ei lupaus tuetusta pelaajamäärästä. Oletusrajoja ei ole nostettu.
Älä käytä mittaritunnisteena allekirjoitusavainta äläkä lisää tunnistetta pelin tiedostoihin.

`GET /metrics`, otsake `Authorization: Bearer <mittaritunniste>`, palauttaa
käynnistykset, kapasiteetti- ja aloitusrajahylkäykset, lasketut askeleet, hyväksytyt ja
harjoittelukierrokset, prosessin CPU- ja muistitiedot sekä aikajakaumat.
Ilman määriteltyä tunnistetta reitti palauttaa 404; väärällä tunnisteella 401.
Mittareissa ei ole nimimerkkejä, pelaajatunnuksia, sessioavaimia tai ohjaussyötteitä.
Laskurit nollautuvat prosessin käynnistyksessä. CPU-mikrosekunnit ovat kumulatiivisia:
vertaa kahden näytteen erotusta kuluneeseen seinäkelloaikaan. Aikajakaumissa on
16 lokeroa: <=1, <=2, <=4, ... <=16384 ja >16384 ms; viimeinen lokero sisältää
myös kaikki tätä suuremmat arvot. `sumMs`, `count` ja `maxMs` mahdollistavat keskiarvon
ja huippujen seurannan. `physicsMs` mittaa laskentaa ja `replayMs` tallennusta sekä
pakkauksen odotusta; ne ovat seinäkelloaikoja, eivät erillisiä CPU-mittauksia.
`arrivalLagMs` ja `ackLagMs` erottavat vastaanotto- ja käsittelyviiveen.

```sh
npm run test:verification-capacity
npm run measure:verification-capacity
npm run load:verification -- 90 2,4,8,16
```

Vertailumittaus ajaa vuorotellen vanhan lineaarisen haun ja uuden hakurakenteen
neljä kertaa samoilla 24 000 syötteellä sekä täydellä uusintatallennuksella. Se
varmistaa jokaisen tilan ja valmiiden tallenteiden yhteisen tiivisteen yhtäsuuruuden.
CPU-säästö koskee hakurakenteen vaikutusta koko tähän testiin, ei pelkkää hakua.
Aja mittaus ilman muita paikallisia testejä. Raportit kirjoitetaan
`artifacts/verification/capacity-benchmark.json` ja `capacity-load.json`.

Kuormitustesti käyttää oikeaa monotonista palvelinkelloa, 60 askeleen syöte-eriä,
erillisiä ajosäikeitä, uusintatallennusta ja sessioiden normaaleja tarkistuksia.
Se ei käytä selainta, HTTP-välitystä tai Render-palvelinta. Nosta tuotannon
pelaajarajaa vasta kohdepalvelimella tehdyn mittauksen perusteella; säilytä
varaa yhtäaikaisille aloituksille ja kierrosten valmistumiselle. Mittaa myös
kylmäkäynnistys ja pidempi muistinkäyttö. Ajot, joissa varmennus myöhästyy, eivät
muutu virallisiksi optimoinnin takia.

Jaetun lähdekoodin muutos vaihtaa nykyisellä versionmuodostuksella simulaatiorevision,
vaikka fysiikan tulokset ovat samat. Julkaise palvelin, Worker-bundle ja peli yhdessä
aiemman julkaisuohjeen mukaan. Uusi revisio suodattaa aiemman revision ajat pois
nykyiseltä tuloslistalta; tämä päivitys ei siirrä niitä uuteen revisioon eikä poista
niitä tietokannasta. Version migraatiota ei pidä tehdä pelkän suorituskykytestin perusteella.

### Paikallinen mittaus 26.10.2026

[capacity-measurement.json](capacity-measurement.json) sisältää raakamuotoiset tulokset.
Neljän vuorottelevan vertailuparin CPU-kulutus pieneni keskimäärin 11,6 %.
Molemmat versiot tuottivat samat tilat ja tallenteet. Vertailu eristää radan
hakurakenteen vaikutuksen; uusittu tallennin on käytössä kummassakin versiossa.

120 sekunnin reaaliaikaisessa paikallistestissä 16 sessiota laskivat yhteensä
230 400 askelta ja tuottivat 16 varmennettua kierrosta ilman harjoittelukierroksia.
Syöte-erän käsittelyviiveen p95 oli 74,2 ms ja suurin kuittausviive 306,9 ms.
Prosessin RSS oli lopussa noin 1 523 MiB. RSS sisältää myös testiajurin,
vertailumaailman ja valmistellut ohjaussyötteet, eikä se ole Renderin muistimittaus.
Tulos ei tue pelaajarajan nostamista 16:een nykyisessä 512 MiB:n palvelussa.
Tämä mittaus tehtiin ennen jaetun ratadatan ja säiejoukon toteutusta.
Uudempi työ ja vertailu on kuvattu kohdassa [Rajattu säiejoukko](WORKER_POOL.md).

### Seuraava ominaisuus: aula ja ajon seuraaminen

Aktiivisten kuljettajien lista ja reaaliaikainen katselu voidaan rakentaa nykyisen
varmennussimulaation päälle. Tätä käyttöliittymää ja tiedonjakelua ei ole vielä toteutettu.

- Julkinen aulatieto sisältäisi nimimerkin, ajon vaiheen, kierroksen ja sektorin.
  Julkista katselutunnistetta käytetään erillään ajosession salaisista tunnisteista.
- Varmennussäie voi kerätä 5–10 sijainti-/asentonäytettä sekunnissa jo laskemistaan
  tiloista. Nykyinen palvelin saa 60 askeleen eriä noin 500 ms välein: näytteet
  saapuisivat siksi erissä. Selaimen pieni toistopuskuri mahdollistaa tasaisen katselun
  noin 0,5–1 sekunnin viiveellä ilman syötepyyntöjen tihentämistä.
- Yksi julkaisija välittää hyväksytyn näyte-erän kaikille katsojille. Tila välitetään
  rajatun puskurin kautta; hidas katsoja saa tuoreimman tilan eikä kasvavaa jonoa.
  Katsojille ei luoda uusia fysiikkamaailmoja tai varmennussessioita.
- Näytteissä tarvitaan myös auton visuaalinen tila sekä yhteinen revisio, jotta
  kameran, ohjauksen ja jousituksen katselu vastaa ajoa. Selain interpoloi näytteet.
- Ajon päättyminen, yhteyskatkos ja varmennuksen menetys poistavat tai merkitsevät
  ajon aulassa. Lista ja tilavirta eivät saa paljastaa sessioavaimia tai ohjausvaltuuksia.
- Katselijoiden määrä, tiedonsiirto ja julkaisun kustannus mitataan erikseen. Tietojen
  jakelu keskitetään ennen suuria katsojamääriä; jokainen katsoja ei pollaa ajosäiettä.

### Adminin kapasiteettinäkymä ja pysyvä historia

`/admin` näyttää valitun aikavälin tietokantaan tallennetun kapasiteettihistorian
sekä erillisen nykyisen palvelinprosessin tilannekuvan. Historia säilyy 90 päivää
myös varmennuspalvelimen uudelleenkäynnistyksissä ja on luettavissa sen ollessa
pois käytöstä. Adminin ei tarvitse olla auki tiedon keräämiseksi.

Käyttöönotto:

1. Julkaise tämän haaran varmennuspalvelin ja analytiikan Worker
   (`cloudflare/worker.mjs`, ei erillinen verified-worker).
2. Aseta varmennuspalvelimelle `VERIFICATION_METRICS_TOKEN` (vähintään 32 merkkiä)
   ja `CAPACITY_REPORT_URL=https://<analytiikan-worker>/api/internal/capacity`.
3. Aseta analytiikan Workerille sama `VERIFICATION_METRICS_TOKEN` salaisuutena
   sekä `VERIFICATION_METRICS_URL=https://<varmennuspalvelin>/metrics` nykytilaa varten.
   Nykyinen D1-sidos `DB` riittää; historiataulu luodaan automaattisesti.
4. Avaa `/admin` nykyisellä ylläpitoavaimella. Päivitä hakee historian ja nykytilan.

Palvelin lähettää nimettömät tuntikohtaiset laskurit suojattuun vastaanottoon.
Kukin käynnistyskerta käyttää eri satunnaista lähdetunnusta. Samojen tai vanhempien
laskurien uusinnat eivät lisää eivätkä vähennä jo tallennettuja lukuja.
Tietokantaan ei tallenneta nimiä, pelaajatunnuksia, IP-osoitteita tai salasanoja.
Mittausavain ei ole adminin kirjautumisavain eikä sitä lähetetä selaimeen.

`capacityRejected` laskee täyden palvelimen estämät aloitukset; saman
aloituslipukkeen uusinnat eivät kasvata laskuria, mutta uusi aloitusyritys voi.
`startRateRejected` on erillinen aloitusnopeusraja. `practiceLaps` laskee
palvelimen simuloimat mutta ajoitusehdon vuoksi ilman kuittia jääneet kierrokset.
`processingTimeouts` laskee palvelimen käsittelyaikarajan ylitykset ja
`lagTerminations` liialliseen saapumisviiveeseen päättyneet ajot. Viiveestä ei
voi päätellä, johtuiko se palvelimesta, verkosta vai pelaajan laitteesta.

Lähetys käynnistyy heti laskurin muuttuessa; peli ei odota tietokantaverkkoa.
Epäonnistunut lähetys uusitaan viiden sekunnin välein. SIGTERM/SIGINT yrittää
lähettää viimeiset tiedot ennen sulkemista. **Tietokantaan jo hyväksytyt tiedot
säilyvät.** Äkillinen prosessin kaatuminen tai pakotettu sammutus ennen lähetyksen
onnistumista voi menettää lähettämättömän osuuden, etenkin verkkokatkon aikana.
Lähettämättömät tuntitiedot pidetään rajatussa muistijonossa (2161 tuntia);
lähetysvirheistä kirjataan lokiin. Tämä ei ole levylle tallentuva tapahtumajono.

Aikavälin alku pyöristetään alaspäin tunnin alkuun ja näytetään adminissa.
Päivät ovat UTC-ajassa. Puuttuva historia näytetään puuttuvana tietona, ei nollana.
Historiaa ennen tämän ominaisuuden käyttöönottoa ei voi palauttaa jälkikäteen.
Nykytilan prosessikohtaiset laskurit nollautuvat yhä uudelleenkäynnistyksessä,
mutta erillisen historian luvut eivät. Useat palvelininstanssit raportoivat
samaan tietokantaan erillisillä lähdetunnuksilla, jolloin historia summaa ne.

Tarkistukset: `node tests/capacity-history.test.cjs` testaa palvelimen/Workerin
uudelleenkäynnistykset, kadonneen kuittauksen, uusinnat, verkkokatkosta palautumisen,
aikavälit, todennuksen sekä todellisen kapasiteettihylkäyksen tallennuskytkennän.
### Auton törmäysmuodon välimuisti

Seuraavan optimointivaiheen toiminta, vertailutestit ja paikallinen CPU-/muistimittaus:
[COLLISION_CACHE.md](COLLISION_CACHE.md). Muutos ei nosta pelaajarajaa.

## Daily championship

The daily championship is integrated into `integration/next-update-20261026` with
accounts, public replays, chat, performance and persistent capacity metrics. Deploy the
matching Worker and frontend together; use [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md).
`npm run build:verified-worker` includes `cloudflare/championship.mjs` in the pasteable bundle.
The Worker creates the new competition table and indexes idempotently on first use;
`cloudflare/verified-schema.sql` also contains the explicit migration.
The championship alone adds no simulation changes; the combined candidate also contains
physics-source optimizations and needs a matching Render release. Existing all-time lap rows are not
backfilled: points and streaks start with laps accepted after deploying this feature.

- `/api/verified/championship?day=YYYY-MM-DD` is public. Optional Bearer authentication
  includes only that account's personal streak and selected day's point breakdown.
  Stable account IDs and credentials are never returned in standings.
- One Helsinki calendar day per race, switching immediately at local midnight. DST
  days can be 23 or 25 hours. Use `Europe/Helsinki`, never a fixed UTC offset.
- The authoritative signed receipt's completion timestamp determines the race day.
  Entry must reach the database before that day's midnight. A database-side time
  check prevents requests queued before midnight from changing a finalized day.
  Late uploads still enter the all-time leaderboard, but receive no daily entry.
- Original lap and daily entry are saved in one D1 batch transaction, with one daily
  entry per `(session_id, lap)`. Retrying receipts cannot increase lap counts.
- Speed places 1–10: 25/18/15/12/10/8/6/4/2/1. Lap-count places 1–8:
  10/8/6/5/4/3/2/1. Ties share place and points (competition ranking).
- First verified lap earns 5 participation points. Milestones at 5/15/30 laps each
  add 2 points. The day's consecutive-day streak adds 1–7 points (capped at 7).
  No unlimited points per lap. Missing a day resets the streak; an active streak
  remains visible on the following day until the player has a chance to extend it.
- Monthly totals include finalized days only, reset by calendar month and preserve
  prior months through the day picker. Streaks continue across month/year boundaries.
  Selected live day scores remain provisional as other drivers join and improve.
- Human and bot daily/monthly standings are separate (`?series=human|bot`), using the account's current series, as with the all-time leaderboard. Operator series changes move the account's daily/monthly results too. Streaks remain account-wide.
- Rules are versioned in source. Changing point rules recalculates historical totals;
  freeze or version scoring rules before changing them in a later release.
- Competition history is tied to the account. To erase an account, also remove its
  `championship_laps` rows along with `verified_laps` and account/session records.
  This initial version has no separate moderation UI; if a lap is removed manually,
  a database trigger deletes its competition row automatically. A second trigger
  removes daily entries when the account is deleted. Daily/monthly standings then recompute.

Validation: `npm run test:championship`, `npm run test:verified`,
`npm run test:leaderboard`, `npm run test:championship-browser`,
`npm run build:verified-worker`, `npm run build`.
The browser check uses the common browser helper and `LPR_BROWSER_EXECUTABLE_PATH`.

### Yhteinen ratadata ja erilliset ajotilat

Ensimmäisen muistiuudistusvaiheen rajapinta, eristystestit, mittaustulokset ja
käyttöönoton raja: [SHARED_TRACK_STATE.md](SHARED_TRACK_STATE.md).
Yhteinen tehdas on otettu tässä haarassa [rajatun säiejoukon](WORKER_POOL.md) käyttöön.

### Rajattu säiejoukko

Ajonvarmennuksen säikeiden reititys, vuorottelu, siivous, asetukset ja paikalliset kuormakokeet:
[WORKER_POOL.md](WORKER_POOL.md). Oletus on yksi laskentasäie ja enintään kaksi ajosessiota.

### Separate administrator keys

The analytics dashboard forwards its authenticated verified-lap controls to the verified Worker. If their administrator keys differ, set `VERIFIED_ADMIN_TOKEN` on the analytics Worker to the verified Worker administrator key. The analytics login continues to use its existing `ANALYTICS_ADMIN_TOKEN`; neither existing key needs to be changed.
