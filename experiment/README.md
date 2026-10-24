# LPR — palvelintoiston kokeilu

Tämä on erillinen toteutettavuuskoe. Se **ei varmista julkaistun 3D-pelin ajoja**,
myönnä kilpailusessioita tai kirjoita tuloslistaan. Mukana on 120 Hz:n ajofysiikka,
kampuksen rata, maasto ja törmäysesteet. Animoidut henkilöt ja sisätilat puuttuvat.
Yhteinen kokeilusimulaatio toimitetaan selaimelle samasta luotetusta lähdekoodista
kuin Node-toistolle. Käyttäjän lähettämää tallennetta ei suoriteta koodina.

## Kokeile omassa selaimessa

Node 24.22.1 tai uudempi 24.x; ei palvelimen npm-riippuvuuksia.

```sh
npm run dev:replay
```

Avaa http://localhost:8080. Valitse **Aja itse**, käytä nuolinäppäimiä ja aja koko
kierros. Valitse **Tarkasta palvelimella**. Vertailu tarkistaa myös auton lopputilan
ja sektorit. **Lataa tallenne** tallentaa ohjauksen ja selaimen vertailutuloksen.
**Automaattiajo** on erillinen synteettinen koetapaus, ei ihmisen ajosuoritus.

Näkymä on yksinkertainen ylhäältä kuvattu testirata, ei tuotantopelin 3D-renderer.
Kokeilun manuaaliohjaus käyttää suoraa analogista ohjauskomentoa; tuotantopelin
näppäimistön ohjaussuodatus, muut ohjaimet ja kaikki ajotilaan vaikuttavat tapahtumat
on vielä integroitava ja testattava ennen virallisen pelin varmennusta.

## Tarkistukset ja mittaus

```sh
npm run test:replay-service
node tests/collision-index.test.cjs
npm run test:replay
node scripts/measure-replay-experiment.cjs
```

Mittaus tuottaa `artifacts/replay-probe/experiment-report.json` ja tallenteen.
Se vertaa samaa ohjausta alkuperäisellä ja indeksoidulla törmäyshaulla, testaa
selaimelle toimitettavan koodin Nodessa sekä tekee yhden ja kaksi samanaikaista
HTTP-tarkastusta. Node-testi **ei ole oikea selain**, eikä sen vastaavuus osoita
Chromiumin tai mobiiliselaimen vastaavuutta. CPU-mittari on tarkastusthreadin CPU,
ei koko Node-prosessin kaikkien tarkastusten yhteissumma.

Valinnainen oikea Chromium-testi:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run test:replay-browser
```

Sekin ajaa synteettisen kuljettajan oikeassa selaimessa. Manuaalinen ihmisen ajama
kierros pitää kokeilla erikseen. Valinnainen Playwright ei ole tuotantoriippuvuus.

Törmäysindeksi on käytössä vain kokeilussa. Staattisten esteiden indeksi rakennetaan
maailman nollauksessa, liikkuvat kappaleet tarkistetaan aina, ja kohteiden alkuperäinen
järjestys säilytetään. Jos staattisia esteitä siirretään kesken kokeilun, maailma on
nollattava tai indeksi rakennettava uudelleen. Tuotantopelin törmäyshaku ei muutu.

## Render-koe

`render-replay.yaml` on erillisen ilmaisen verkkopalvelun Blueprint. Valitse oikea
kehityshaara ja tämä Blueprint-polku Renderissä. Palvelin kuuntelee Renderin PORTia.
LAB_PUBLIC=1 vaatii vähintään 32-merkkisen LAB_TOKEN-avaimen. Render luo avaimen;
kopioi se vain testaajan käyttöliittymän avainkenttään. Avain ei tallennu selaimen
localStorageen eikä versionhallintaan. Älä julkaise tätä avainta avoimille pelaajille.

Palvelu on julkaistu 24.10.2026 Render Free -tasolle Frankfurtissa: https://lpr-replay-experiment.onrender.com. Se on luotu suoraan Render-liitännällä, ei Blueprint-synkkauksella. Automaattiset julkaisut ovat pois käytöstä; YAML on vaihtoehtoinen käyttöönottomalli, ei nykyisen palvelun aktiivinen hallintalähde.
Ilmainen 512 Mt:n instanssi voi tarvita pienemmän rinnakkaisuusrajan kuin paikallinen
koe: enintään kaksi tarkastusta on koodin katto, ei kapasiteettilupaus. Palvelin
rajoittaa tallenteen 2 MiB:iin ja 240 sekuntiin simulaatiota sekä laskennan 60 sekuntiin.
Pitkä tarkastus toimii worker-threadissa, joten health-pyyntöä ei lasketa samassa
estettynä olevassa pääsäikeessä. Palvelu on tarkoitettu pienen testaajaryhmän kokeeseen.

Toista paikallisen mittauksen pyynnöt Renderissä ja mittaa kylmäkäynnistys sekä
1 ja 2 samanaikaista tarkastusta. Älä päättele paikallisista ajoista Renderin kapasiteettia.
Kun paikallinen mittaus on luonut tallenteen, aseta `REPLAY_BASE_URL` oman
Render-testipalvelun HTTPS-osoitteeksi ja `LAB_TOKEN` sen avaimeksi, ja aja:

```sh
npm run measure:replay-remote
```

Vaihtoehtoisesti anna tallennetun selainajon JSON-tiedoston polku komennolle:
`node scripts/check-replay-remote.cjs tallenne.json`. Mittaus tarkistaa revision,
mittaa health-vastauksen ja tekee yhden sekä kaksi yhtäaikaista tarkastusta.
Aloitusviive kuvaa kylmäkäynnistystä vain, jos palvelin todella oli nukkumassa.
Raportti syntyy `artifacts/replay-probe/remote-report.json`-tiedostoon.

Jatkuva kokeiluprotokolla, järjestetyt syöte-erät, palvelinkellon rajat ja
katkojen käsittely on toteutettu tämän ohjeen lopussa kuvattuun testisivuun.
Varsinaisen 3D-pelin integrointi ja sen vastaavuuden todennus ovat erillinen vaihe.

## Mainiin yhdistämisen ehdot

Tämä haara perustuu PR #4:ään ja tuo anticheat-haarasta kiinteän fysiikka-askeleen
sekä ihmisten piirtoajan yhdenmukaistuksen. Se ei tuo analytiikkasuostumuksesta
riippuvaa tulosten hyväksymistä tai toista ylläpitorajapintaa.

120 Hz:n fysiikka-askel on tuotu peliin, mutta PR #4:n timed-v1-ajanotto säilyy
seinäkellossa yhteensopivuuden vuoksi. Kokeilun erillinen simulaatio laskee
kierrosajan tickeistä. Tuotantopelin ja kokeilun ajanotto eivät siis vielä ole
sama protokolla. Ihmisten liike seuraa simulaatioaikaa, ajanotto ja sisätilojen
kellot seinäkelloa. Mainiin yhdistäminen edellyttää lisäksi oikean 3D-selainajon
ja hitaiden laitteiden tarkistusta. Nykyisten testien läpäisy ei kata näitä.

Seuraavaksi tarvitaan oikean selaimen tallenne, tuotantopelin ja kokeilun yhteinen
simulaatiomoduuli, dynaamisten ihmisten vastaavuus ja kohdepalvelimen kuormamittaus.
Tämä kokeilu ei yksin estä fysiikan mukaista ajoa tekevää bottia.

## Paikallinen tulos 24.10.2026

Node 24.22.1, AMD EPYC 9V74, synteettinen 96,175 sekunnin kierros / 11 541 tickiä:

| Tarkastus | Seinäkello | CPU |
| --- | ---: | ---: |
| Indeksoitu, suora toisto | 26,04 s | 26,04 s |
| Alkuperäinen haku, sama tallenne | 27,49 s | 27,49 s |
| Yksi HTTP-tarkastus, oma thread | 27,13 s | 27,10 s |
| Kaksi HTTP-tarkastusta yhtä aikaa | yhteensä 28,12 s | noin 27,9 + 28,0 s |

Haut ja selaimelle toimitettavan koodin Node-ajo antoivat täsmälleen saman
tuloksen. Yhden tapauksen indeksihyöty on noin 5 %, ei vielä suuri optimointi.
Rinnakkaiskoe hyötyi tämän koneen useista ytimistä; tulos ei takaa ilmaisen
Render-instanssin kapasiteettia tai ajonaikaista viivettä. Tarkat luvut:
[local-measurement.json](local-measurement.json).

## Asfalttihaun optimointi 24.10.2026

Ensimmäinen Render Free -koe ylitti 60 sekunnin laskentarajan sekä yhdellä että
kahdella tarkastuksella. Sen jälkeen asfalttipalojen haku indeksoitiin
`shared/track-objects.js`-tiedostossa. Indeksi rajaa ehdokkaat, mutta pyöristettyjen
ja käännettyjen palojen tarkka kuulumistesti säilyy ennallaan. 19 316 pistettä
verrattiin alkuperäiseen täyteen hakuun, ja vanhan tallenteen koko lopputila sekä
sektorit säilyivät täsmälleen samoina.

Uusi paikallinen 96,175 sekunnin tallenne: indeksoitu toisto 1,54 s ja yksi
HTTP-tarkastus 1,63 s. Kaksi HTTP-tarkastusta valmistui yhdessä 1,95 sekunnissa.
Tarkat luvut: [local-measurement-after-asphalt.json](local-measurement-after-asphalt.json).
Kaikki kymmenen testikokonaisuutta sekä build ja build:worker läpäisivät.
Uuden version Render-mittaus on kuvattu alla.

## Render Free -tulos 24.10.2026

Palvelu: `srv-dbebsrlg1s2s73f3ob60`, Frankfurt, `free`, yksi instanssi.
Mitattu julkaisu: `6d6e217f554ff3e9b396633a9f07e701e99040d3`,
deploy `dep-dbebvi3rjlhs73f6usd0` (live). Käytössä Node 24.22.1 ja 120 Hz:n
kokeilusimulaatio. Sama 96,175 sekunnin synteettinen tallenne kuin paikallisessa
vertailussa; kierrosaika, sektorit ja auton lopputila täsmäsivät kaikissa kolmessa
Render-toistossa paikalliseen vertailuun.

| Mittaus | Tulos |
| --- | ---: |
| Yksi tarkastus, HTTP-pyynnön kokonaisaika | 24,52 s |
| Yksi tarkastus, palvelimen laskenta-aika | 23,49 s |
| Yksi tarkastus, threadin CPU-aika | 2,98 s |
| Kaksi tarkastusta yhtä aikaa, molemmat valmistuneet | 49,49 s |
| Rinnakkaisten laskentojen seinäkelloajat | 43,80 / 41,01 s |
| Rinnakkaisten threadien CPU-ajat | 3,15 / 3,00 s |

Tarkat luvut: [render-measurement.json](render-measurement.json).
Ennen asfalttioptimointia yhden ja kahden tarkastuksen kokeet ylittivät
60 sekunnin laskentabudjetin. Rinnakkaiskokeen virhevastausten raportti:
[render-baseline-measurement.json](render-baseline-measurement.json).

Tämä yksi kuormakoe osoittaa, että kaksi kokonaista tallennetta voitiin käsitellä
kierroksen kestoa lyhyemmässä ajassa. Se ei mittaa jatkuvaa ajonaikaista protokollaa,
pitkän kuormituksen vakautta tai kaikkien ratojen ja ajotapojen laskentabudjettia.
Kokonaisen kierroksen lähetys maalissa aiheuttaa edelleen yllä näkyvän odotuksen.
Jatkuva syötevirta on nyt toteutettu alla kuvattuun kokeiluun; sen ajonaikainen mittaus tehdään erikseen.

Health-pyyntö vei mittauksessa 5,28 sekuntia, mutta palvelin oli jo käynnissä.
Ilmaispalvelimen 15 minuutin käyttämättömyyden jälkeistä kylmäkäynnistystä ei
mitattu. Tästä luvusta ei voi päätellä ensimmäisen pelaajan lämmittelyn pituutta.

Julkinen testisivu palautti 200; avaimeton /verify palautti 401. Avainta ei
kirjoiteta raportteihin tai versionhallintaan. Testin LAB_TOKEN löytyy ylläpitäjän
Render-ympäristöasetuksista. Julkaistu 3D-peli ja sen leaderboard ovat ennallaan.

## Jatkuva tarkastus

Testisivulla jatkuva tarkastus on oletuksena käytössä. Palvelimen herätys ja
session valmistelu tehdään ennen kuin selain aloittaa uuden ajon luotetusta
lähtöruudusta. Selain lähettää normaalisti 60 tickin (0,5 s) erän. Jonon kasvaessa
se voi yhdistää enintään 120 tickiä yhteen erään. Erät käsitellään järjestyksessä;
palvelin säilyttää auton ja rataympäristön tilan omassa worker-threadissa.

- `POST /sessions`: testipalvelimen LAB_TOKEN, simulation revision. Palauttaa
  satunnaisen session ID:n, erillisen session salaisuuden ja lähtötilan.
- `POST /sessions/:id/inputs`: session oma Bearer-tunnus, revision, seq, fromTick
  ja ohjausarvot. Sama erä palauttaa saman kuittauksen myös verkkokatkon jälkeen.
  Jo kuitattua sisältöä ei voi vaihtaa eikä järjestysaukkoja ohittaa.
- `GET /sessions/:id`: session omistajalle tila ja viimeinen kuitattu tick.
- `DELETE /sessions/:id`: sulkee session ja vapauttaa laskentatyöntekijän.

Palvelimen monotoninen kello sallii enintään 250 ms:n etenemisen etuajassa.
Yli 8 sekunnin viive tai 15 sekunnin toimettomuus katkaisee varmennuksen.
Palvelin säilyttää korkeintaan kaksi aktiivista sessiota; vanha /verify jakaa
saman kahden työn budjetin. Session kesto, eräkoko, aloitustaajuus, muistijälki,
kuitit ja yhden erän laskenta-aika on rajattu. Selaimen kelloa ja aikaväitteitä ei
käytetä virallisen koetuloksen laskemiseen. Valmis kierros vapauttaa threadin,
mutta loppukuittausta voi yrittää uudelleen rajatun ajan.

Verkkovirheessä selain yrittää samaa erää uudelleen. Jonon ylittyminen, piilotettu
sivu, palvelimen uudelleenkäynnistys ja session päättyminen vaihtavat ajon
harjoitteluksi. Varmennettua ajoa ei palauteta selaimen tarjoamasta auton tilasta.
Maaliin tullessa lähetetään myös viimeinen vajaa erä; käyttöliittymä ilmoittaa
varmennuksesta vasta palvelimen lopullisen kuittauksen jälkeen.

Uudet tarkistukset:

```sh
npm run test:live-sessions
npm run test:live-client
npm run test:live-lab
```

Koko kierroksen protokollatesti käyttää testin omaa nopeutettua palvelinkelloa;
se ei ole suorituskykymittaus. Todellinen kahden asiakkaan ajonaikainen koe:
aseta `REPLAY_BASE_URL` ja `LAB_TOKEN`, ja aja `npm run measure:live-remote`.
Se lähettää synteettisen 96,175 sekunnin tallenteen oikeassa ajassa kahdesta
Node-asiakkaasta ja mittaa maaliintulon jälkeisen odotuksen. Se ei korvaa oikean
selaimen tai varsinaisen 3D-pelin integraatiotestiä.

Kokeilu ei edelleenkään kirjoita julkiseen leaderboardiin. Luotetut sessiot
ovat tässä muistissa: palvelimen uudelleenkäynnistys keskeyttää keskeneräiset
ajot turvallisesti. Julkiseen pelaajakäyttöön tarvitaan vielä käyttäjäkohtainen
pääsy ja tulosten pysyvä, vain palvelimelle sallittu tallennus.

## Jatkuvan tarkastuksen Render-koe 24.10.2026

Sovelluscommit `8cf36f27dbc2a02ea48589bb757354b82c678c7b`, Render Free,
Frankfurt, deploy `dep-dbecaojncjis73dpqd40` (live).
Kaksi Node-asiakasta lähetti saman 96,175 sekunnin synteettisen ajon oikeassa
ajassa, erillisissä palvelinsessioissa. Molemmat tulokset täsmäsivät paikalliseen
koko kierroksen vertailuun, mukaan lukien sektorit ja auton lopputila.

| Mittaus | Pelaaja 1 | Pelaaja 2 |
| --- | ---: | ---: |
| Lähetetyt fysiikka-askeleet | 11 541 | 11 541 |
| Käsitellyt erät | 184 | 187 |
| Kierrosaika | 96,175 s | 96,175 s |
| Lopullinen kuittaus maaliintulon jälkeen | 0,160 s | 0,148 s |
| Suurin havaittu kuittauksen viive ajon aikana | 1,117 s | 1,111 s |
| Worker-threadin yhteenlaskettu CPU-aika | 3,55 s | 3,13 s |

Tarkat luvut: [live-render-measurement.json](live-render-measurement.json).
Kaikki 13 GitHub Actions -testikokonaisuutta läpäisivät sovelluscommitin.
Myös paikalliset uudet sessio-, asiakas- ja käyttöliittymätestit sekä
replay-, tuloslista-, suorituskyky-, palvelin- ja build-tarkistukset läpäisivät.

Tämä on yksi onnistunut kahden reaaliajassa tahdistetun Node-asiakkaan koe,
ei lupaus kaikkien yhteyksien viiveestä tai pidemmän kuormituksen kapasiteetista.
Oikean selaimen, ihmisen ohjauksen ja varsinaisen 3D-pelin integraatiota ei ole
vielä todennettu. Julkinen leaderboard ei käytä kokeilua eikä sitä ole muutettu.
Ilmainen palvelin ja sen enintään kahden laskentatyön raja säilyvät ennallaan.
