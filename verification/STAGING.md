# Kahden pelaajan testiympäristö

> UI-uudistuksen ja Azuren yhteisjulkaisun ajantasainen valmistelu, nykytilan
> auditointi ja hyväksyttävät kohdemuutokset:
> [STAGING-AZURE-20261102.md](STAGING-AZURE-20261102.md).
> Alla oleva Render-varmennuksen kuvaus on aiemman testiympäristön historiaa.

Testi käyttää integraatiohaaraa `integration/main-updates-20261025`; mainia ei
julkaista. Renderin palvelin on erillinen tuotannosta, ja Cloudflaren
`lpr-verified-test` sekä `lpr-analytics-test` käyttävät testitietokantaa
`lpr-motorsport-test` (`82324dc1-0ac0-4874-b9f3-dcf16a7c66c8`).
Testivarmennuksen allekirjoitusavain on erillinen tuotantoavaimesta.

## Testipelin rakentaminen

Renderin staattisen testisivun build-komento on `npm run build:staging`,
julkaisukansio `dist`. Julkiset ympäristömuuttujat ovat:

```text
LPR_TEST_SERVICE_URL=https://lpr-verification-test-ziev.onrender.com
LPR_TEST_LEADERBOARD_URL=https://lpr-verified-test.panu-musakka-0bf.workers.dev
LPR_TEST_ANALYTICS_URL=https://lpr-analytics-test.panu-musakka-0bf.workers.dev
```

Rakennus korvaa vain `dist`-paketin päätepisteet. Tavallinen `npm run build`
ja tuotannon lähdeasetukset säilyvät ennallaan. Rakennus hylkää tunnetut
tuotanto-osoitteet. `staging.json` sisältää julkiset testiosoitteet,
simulaatiorevision ja Renderin lähdecommitin; se ei sisällä salaisuuksia.
Testipeli: https://lpr-motorsport-test-a1gg.onrender.com/

Renderin testipalvelin: `srv-dbfht27b9u1s73d0uoqg`, staattinen testipeli:
`srv-dbfhusdg1s2s73ft0dfg`, työtila `LPR Motorsport`.
Molemmissa on julkaistuna commit `56b14516d25f6416a7b9719bcfc82a64ead45a90`.
Varmennuspalvelimen julkaisu `dep-dbfhv3j4qb4c73aergu0` ja testipelin julkaisu
`dep-dbfhuslg1s2s73ft0eo0` valmistuivat tilaan `live`.
Testipalvelin käyttää Free-suunnitelmaa ja samaa Oregonin aluetta kuin tuotanto.
Testipalvelimelle määriteltyjä avaimia ei sisällytetä tähän ohjeeseen tai Gitiin.

## Automaattinen HTTPS-koe

Käytä samaa checkoutia kuin testipelissä. Aja ilman muita testaajia palvelimella:

```sh
LPR_TEST_SITE_URL=https://lpr-motorsport-test-a1gg.onrender.com npm run test:verified-remote
```

Koe lukee testisivun `staging.json`-tiedoston ja tarkistaa testipäätepisteet sekä
paikallisen ja etäpalvelimen simulaatiorevision. Se herättää varmennuspalvelimen,
luo kaksi satunnaista `NetTest ...` -tiliä ja alustaa kummallekin oman allekirjoitetun
ajosession. Molemmat aktivoidaan ja ajavat lähtökierroksen sekä lentävän kierroksen
samanaikaisesti oikeassa ajassa noin 194 sekunnissa. Koe käyttää samaa
`experiment/live-client.js`-yhteysasiakasta kuin peli: syöte-erien kuittaukset,
jonon purku, uusintayritykset ja maalilinjan erärajat vastaavat selainta.
Syötteet ja vertailutilat valmistellaan ennen ajoa, joten paikallinen
3D-piirto tai fysiikan laskenta ei kuormita ajon aikataulutusta.
Jos ympäristö vaatii HTTP-välityspalvelimen, Node 24.22:n `--use-env-proxy`
-valinta ottaa sen ympäristöasetukset käyttöön.

Jokaisen kuittauksen ajotilaa verrataan paikalliseen vertailuun. Kierroskuitit ja
uusinnat lähetetään Workerille taustalla seuraavan kierroksen jatkuessa. Koe vaatii,
että kaikki neljä aikaa löytyvät testin julkiselta listalta ja niiden uusinnat
voidaan ladata. Testikannan tämän revision listalla pitää olla tilaa koetuloksille;
aiemmat nopeammat koetulokset voivat täyttää TOP 10:n.

Raportti kirjoitetaan `artifacts/verification/remote-two-players.json`-tiedostoon
myös ajonaikaisen epäonnistumisen jälkeen. Se ei sisällä salasanoja, kirjautumis-
tunnisteita, ajosession salaisia tunnisteita eikä allekirjoitusavainta. Testin lopuksi
ajosessiot suljetaan ja kirjautumiset perutaan. Testitilit ja kierrokset jäävät
testikantaan, ja raportin `runId`/`testAccounts` yksilöivät ne mahdollista siivousta
varten. Älä tyhjennä muiden testaajien rivejä.

Tämä mittaa HTTPS-liikennettä, Renderin ajosäikeitä, allekirjoitettua protokollaa,
Cloudflare Workeria ja D1-tallennusta. Se ei todista kahden oikean laitteen
piirtonopeutta tai ihmisen ohjauksen käytettävyyttä.

## Kahdella oikealla laitteella

1. Avaa sama testipelin linkki tietokoneella ja toisella laitteella. Tarkista
   TESTIVERSIO-merkintä ja luo eri nimimerkit kumpaankin.
2. Valitse ihmissarja, aloita molemmat ajot ja aja kummallakin vähintään kaksi
   kierrosta niin, että ajot ovat samanaikaisesti käynnissä.
3. Tarkista, että molemmat pysyvät virallisina, ajat tallentuvat ja uusinnat aukeavat.
   Jos ajo vaihtuu harjoitteluksi, kirjaa laite, kellonaika ja näkyvä syy.
4. Älä aja tätä samanaikaisesti automaattikokeen kanssa: kapasiteettiraja on kaksi.

Testipalvelimessa on sama kahden session oletusraja kuin tuotannossa. Automaattinen
julkaisu on pois käytöstä, jotta käynnissä olevan kokeen versio ei vaihdu uuden
pushin takia. Uuden testiversion julkaisu tehdään erikseen. Testipalvelu voi nukkua
käyttämättömänä; odota ensimmäisellä avauksella palvelimen heräämistä.

## Suoritettu valmistelukoe 26.10.2026

Testisivun 390 px:n selainkoe läpäisi: TESTIVERSIO-merkintä, harjoittelun aloitus,
CORS-yhteys testipalvelimeen, ei JavaScript-virheitä eikä pyyntöjä tuotantopalveluihin.
Ensimmäisellä selainlatauksella yhden skriptin verkkolataus epäonnistui; uusintakokeen
kaikki pyynnöt ja sivun toiminnot läpäisivät. Tämä ei ollut kahden laitteen ajokoe.

Kahden samanaikaisen Node-asiakkaan HTTPS-koe pelin omalla verkkoyhteysasiakkaalla
**ei läpäissyt**. `NetTest 3f54d6c5 1` sai lähtö- ja lentävän kierroksen varmennettua,
tallennettua ja julkiset uusinnat ladattua. Aikaa kului noin 202,4 s, kuittausviiveen
p95 oli 634,9 ms ja suurin kuittausviive 2 021,3 ms. Toinen asiakas menetti
kelpoisuuden vastaanottoajoituksen vuoksi eikä tallentanut virallista kierrosta.
Palvelin ei hylännyt aloituksia kapasiteetin tai aloitustaajuuden vuoksi.

Raakamuotoinen raportti ja selainvarmistus: [staging-check-20261026.json](staging-check-20261026.json).
Mittareiden kokonaislaskurit sisältävät myös ensimmäisen, yksinkertaisempaa
verkkotestiasiakasta käyttäneen valmisteluyrityksen. Molempien yritysten sessiot
suljettiin ja testikirjautumiset peruttiin. Lopuksi aktiivisia sessioita oli nolla.

Tulos ei yksin erottele verkkoreitin viivettä, välityspalvelinta ja Renderin
laskentakuormaa. Aikarajoja ei muutettu eikä kahden pelaajan toimivuutta merkitty
hyväksytyksi. Testiympäristö on valmis kahden oikean laitteen kokeeseen ja jatkodiagnostiikkaan.
Mainia tai tuotantopalveluita ei julkaistu.
