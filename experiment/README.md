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

Täällä julkaisua ei ole tehty eikä Render-tiliä tai suorituskykyä ole todennettu.
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

Jatkuva ajonaikainen varmennus vaatii vielä session, järjestetyt syöte-erät,
palvelinkellon rajat, katkojen käsittelyn ja luotetun lähtötilan.

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
