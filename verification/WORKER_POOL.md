# Rajattu varmennuksen säiejoukko — vaihe 2

Tämän haaran `Sessions` käyttää `VerificationPool`-toteutusta. Kukin ajosessio
varataan yhdelle säikeelle koko ajon ajaksi. Sama säie käsittelee useita toisistaan
eristettyjä maailmoja yhteisen `createWorldFactory()`-ratadatan avulla.
Mainia, tuotantopalvelua tai tuotannon pelaajarajaa ei muuteta tämän työn aikana.

## Suoritus ja rajat

- Säikeet luodaan tarvittaessa ja säilytetään seuraavia ajoja varten. Oletus on yksi
  laskentasäie; uusia säikeitä syntyy enintään asetettu määrä.
- Uusi sessio osoitetaan säikeelle, jolla on vähiten varattuja sessioita. Ajon tilaa
  ei siirretä säikeiden välillä eikä suoritettua historiaa lasketa uudestaan.
- Jokaiselta ajolta on kerrallaan enintään yksi käsiteltävä syöte-erä. Muuttumaton
  uusintapyyntö käyttää samaa lupausta/kuittausta, eikä lisää laskentaa.
- Säikeen FIFO-jono käsittelee enintään 120 fysiikka-askelta yhdessä tehtävässä ja
  antaa tapahtumasilmukalle vuoron tehtävien välissä. Normaalit erät ovat 60 askelta.
- Fysiikkaerä palauttaa tuloksen ja vapauttaa oman session heti fysiikan jälkeen.
  `Recorder.step()` irrottaa valmiin kierroksen taulukot ilman `JSON.stringify()`-
  kutsua. Erillinen taustajono tekee JSON-muunnoksen enintään yhdelle tallenteelle
  tapahtumasilmukan vuorossa. Fysiikka on etusijalla, mutta vapaa pakkaaja
  saa vuoron myös täydestä jonosta viimeistään kahdeksan fysiikkatehtävän tai
  500 ms:n odotuksen jälkeen (kumpi täyttyy ensin). Raja koskee jonon vuoronantoa:
  jo käynnissä olevaa fysiikkatehtävää tai edellistä gzipiä ei keskeytetä.
  Yksi gzip level 3 -pakkaus on aktiivinen kerrallaan; fysiikka jatkuu sen aikana
  myös saman pelaajan seuraavalle kierrokselle. V8-säikeen JSON-muunnos on edelleen
  synkroninen erillinen tehtävä, joten se voi viivyttää myöhemmin saapuvaa erää
  yhden muunnoksen verran. Pakkauksen loppumista eräkuittaus ei odota.
- Kelpoisuus lukitaan alkuperäisen maaliintulotickin ja kyseisen erän
  saapumisviiveen perusteella. Valmis tallenne allekirjoitetaan taustalla ja
  toimitetaan seuraavan uuden erän `laps[]`-kentässä. Vanhan `seq`:n vastausta
  ei täydennetä jälkikäteen. Kuitin sisältö, HMAC, SHA-256 base64-payloadista,
  900 000 merkin raja sekä TOP 10:n uusintavaatimus säilyvät.
- Omistus, protokolla/revisio, syötejärjestys, aloitusten rajat ja kapasiteettiraja
  tarkistetaan edelleen pääsäikeessä. 120 Hz ja ajon kaikki ajoitussäännöt säilyvät.
- Syötepyynnön 10 sekunnin aikabudjetti sisältää jonotuksen ja vastauksen odotuksen.
  Sessioiden alustus saa enintään 20 sekuntia; siivouskuittaus viisi sekuntia.
  Vastaamaton säie lopetetaan, jotta sen tilat eivät jää kasvattamaan muistia.

## Peruutukset ja kaatumiset

Peruutus hylkää pääsäikeen odottavan fysiikkapyynnön. Jo hyväksyttyjen maaliintulojen
pakkaukset ja allekirjoitukset tyhjennetään ennen ajomaailman poistamista. Sama
koskee TTL:ää ja joutoaikarajaa. Kierrostallenteen 10 sekunnin vahtiajan ylitys
poistaa vain kyseisen kierroksen jonosta tai keskeyttää sen gzip-streamin
AbortSignalilla. Kyseinen sessio saa replay-virheen, sen siivous vapautuu ja muiden
sessioiden fysiikka jatkuu samassa säikeessä. Myöhäinen pakkausvastaus ohitetaan;
aikakatkaistu kierros ei saa kuittia. Pakkausajastin ei lopeta säiettä.
Fysiikkapyyntöjen, alustuksen ja poistokuittausten vastaamattomuuden vahtiajat sekä
säikeen varsinaisen kaatumisen käsittely ovat ennallaan.
Säie poistaa myös jonossa olevat tehtävät, ajomaailman ja tallentimen viittaukset.
Uuden ajon alustus odottaa keskeneräisten poistojen kuittaukset, jotta vapautettuja
paikkoja ei täytetä ennen todellista siivousta. Vanhentuneet sessiot käyttävät samaa
siivousta. Palvelimen sulkeminen lopettaa koko joukon ja sen odottavat pyynnöt.

Omistajan `GET /sessions/:id/laps` odottaa pyynnön saapuessa jo hyväksyttyjen
maaliintulojen tallenteet ja palauttaa `{laps:[...]}` samassa kuittimuodossa.
Haku ei kuluta kuitteja eikä siirrä session kelloa tai kelpoisuutta. Se toimii myös
peruutuksen/TTL:n jälkeen. Suljetun session kuitit säilyvät vähintään 120 sekuntia
viimeisestä hyväksytystä erästä tai viimeisimmän kuitin valmistumisesta.
Selain hakee kuitit myös pakotetun maalierän jälkeen ja sulkiessaan ajon; haku
kulkee erillään fysiikkapyynnöistä. Käyttöliittymä poistaa kaksoiskappaleet kuitin
perusteella myös ajon sukupolven vaihtumisen jälkeen saman kirjautumisen aikana.

Yhden säikeen kaatuminen mitätöi **kaikki sille osoitetut keskeneräiset ajot**.
Muiden säikeiden ajot jatkuvat. Menetettyä ajoa ei siirretä toiseen säikeeseen eikä
jatketa asiakkaan tarjoamasta tilasta. Keskeneräisten pakkausten ajastimet ja
odottajat vapautetaan; vain jo valmistuneita tallenteita voidaan allekirjoittaa.
Prosessin uudelleenkäynnistys menettää edelleen muistissa olevat sessiot/kuitit. Uusi sessio voi luoda korvaavan säikeen
määritellyn ylärajan sisällä. Tämä jaettu vikatilanne on uuden mallin olennainen
ominaisuus; se pitää huomioida lopullisessa tuotannon kuormakokeessa.

## Asetukset ja mittarit

| Palvelimen ympäristömuuttuja | Oletus | Raja / merkitys |
| --- | --- | --- |
| `VERIFICATION_WORKERS` | `1` | Säikeitä enintään 1–16 |
| `VERIFICATION_WORKER_HEAP_MB` | `256` | Kunkin säikeen V8 old-generation -raja 64–2048 MiB |
| `MAX_VERIFIED_SESSIONS` | `2` | Samanaikaisten ajosessioiden aiempi kokonaisraja |
| `MAX_VERIFIED_STARTS_PER_MINUTE` | `8` | Aiempi aloitusten minuuttiraja |

Heap-raja ei ole prosessin kokonaismuistiraja eikä koko muistin ennakkovaraus.
Useampi säie monistaa V8-ympäristön ja ratatehtaan; määrää ei pidä kasvattaa
pelkän pelaajamäärän perusteella. Kokonaismuisti, käytettävissä oleva CPU ja
varmennusviive mitataan kohdepalvelimella ennen pelaajarajan nostamista.

Suojattu `/metrics` sisältää nyt `pool`-koosteen: säikeiden yläraja, luodut ja
valmiit säikeet, varatut maailmat, odottavat pyynnöt ja siivoutuvat sessiot.
`queueMs` mittaa odotusta säikeen vastaanottamasta viestistä fysiikkatehtävän alkuun.
Se ei sisällä pääsäikeen postituksen/IPC:n viivettä; `batchResponseMs` kattaa
fysiikkapyynnön koko käsittelyajan. `replayMs` sisältää tallennusaskelten ajan;
`replayPackMs` mittaa erikseen JSON-muunnoksen, gzipin ja base64/hash-käsittelyn.
`replayQueueMs` mittaa tallenteen odotuksen ennen pakkausta; workerin tarkistustiedot
näyttävät lisäksi nälkiintymissuojan vuorot (`forcedRecordings`) ja pisimmän
pakkausjonon odotuksen (`maxReplayQueueMs`). `pool.pendingRecordings` näyttää jonossa/työn alla olevien pakkausten määrän. Asiakkaan saapumisviiveen tulkintaa ei muuteta tässä työssä.

## Tarkistukset ja mittaus

```sh
npm run test:worker-pool
npm run measure:background-replay
npm run measure:worker-pool -- 5 2,4,8,16 both
npm run measure:worker-pool -- 120 16 pooled
```

Unit/integration-testi tarkistaa neljän eri tavalla ajavan asiakkaan kaksi kierrosta,
tarkat fysiikkatilat erillisiin vertailumaailmoihin nähden, oikean session kuitit,
uusintatallenteet, samanaikaiset uusintapyynnöt, peruutukset, TTL:n, säikeiden
uudelleenkäytön, käynnistyksen peruutuksen ja kaatumisen vaikutusalueen.
Lisätesti pitää gzipin tarkoituksella pysäytettynä: saman session kaksi valmista
kierrosta, muiden pelaajien eteneminen, muuttumaton uusintakuittaus, myöhemmän
viiveen vaikutus vain oikeaan kierrokseen, viimeisen kuitin toistettava omistajahaku,
peruutus, TTL, kaatuminen ja pakkausvirhe tarkistetaan erikseen. Selainkoodin testit
varmistavat myöhemmän `ack.laps`-kuitin ja sulkemisen jälkeisen haun käsittelyn.
Aiemmat HTTP-varmennus-, ajoituspolitiikka-, kapasiteetti-, jaetun tilan, chat- ja
staging-testit suoritetaan lisäksi.

Mittaus luo kullekin vaihtoehdolle tuoreen Node-prosessin. Dedicated-vertailu käyttää
aiempaa `session-worker.cjs`-toteutusta, yhtä säiettä pelaajaa kohden, testiapurin
kautta. Tuotannon ajonvarmennuksessa ei käytetä tätä testiapuria. Molemmat mallit
käyttävät samoja syötteitä, normaalia monotonista kelloa, IPC:tä ja tallenninta.
Mittaus varmistaa, että kaikki ajot säilyvät kelpoisina, odotetut kierrokset kuitataan
ja yhteisen mallin maailmat poistuvat lopuksi. Selainta, HTTP-välitystä tai Renderin
laitteistoa ei ole mukana; mittaus ei osoita tuotannon pelaajakapasiteettia.

Raakatulokset: [worker-pool-measurement.json](worker-pool-measurement.json).

## Paikalliset tulokset 26.10.2026

Tuoreissa prosesseissa tehdyn viiden sekunnin vertailun muistihuippu ja
syöte-erän vastauksen p95:

| Pelaajia | Vanha malli, RSS MiB | Yksi yhteinen säie, RSS MiB | Vanha / uusi p95, ms |
| --- | ---: | ---: | ---: |
| 2 | 127,3 | 124,8 | 23,5 / 24,8 |
| 4 | 198,8 | 144,2 | 33,5 / 35,6 |
| 8 | 365,4 | 167,6 | 56,0 / 73,0 |
| 16 | 678,0 | 237,9 | 81,3 / 112,3 |

16 pelaajan lyhyessä kokeessa RSS pieneni noin 65 %. Jaettu suoritus kasvatti jonotus-
ja vastausviivettä, mutta kaikki ajot säilyivät kelpoisina. Viiden sekunnin testi
sisältää JIT-lämmittelyä eikä vielä kierroksen valmistumista; sen muistilukuja ei
pidä tulkita pitkän ajon huipuiksi.

Erillisessä **120 sekunnin** kokeessa 16 pelaajaa yhdellä säikeellä laski yhteensä
230 400 fysiikka-askelta ja tuotti 16 varmennettua kierrosta uusintoineen.
Yksikään ajo ei menettänyt kelpoisuutta. Vastauksen p95 oli 192,8 ms, suurin säikeen
jonotusviive 400,2 ms ja suurin kuittausviive 549,6 ms. RSS-huippu oli **463,4 MiB**.
CPU-aikaa kului noin 46,8 sekuntia 120 sekunnin ajanjaksolla; testikoneen
laskentateho ei vastaa automaattisesti nykyistä Render Free -instanssia.
Siivouksen jälkeen workerin ajomaailmojen ja jonotettujen tehtävien määrät olivat nolla.

Pitkälle kokeelle ei ajettu saman ajon dedicated-vertailua, joten lyhyen kokeen
65 %:n säästöä ei luvata pitkälle ajolle. 463 MiB on lähellä 512 MiB:n palvelimen
kokonaisrajaa eikä jätä riittävää perustetta 16 pelaajan tuotantorajalle. Nykyinen
kahden ajon raja säilyy. Ennen julkaisua tarvitaan kohdepalvelimen ja oikeiden
selainasiakkaiden koe sekä muistivara pidempiin ajoihin ja yhteysheilahteluihin.

## Käyttöönotto

Tämä vaihe ottaa vaiheen 1 yhteisen tehdasrajapinnan käyttöön ajovarmennuksessa.
`createWorld()` säilyy erillisen maailman apurajapintana työkaluille ja vertailuille.
Poolin oma worker käyttää `createWorldFactory()`-rajapintaa suoraan. Selainpeliin
ja verkkoprotokollaan ei tarvita muutosta. Pelin, Workerin ja varmennuspalvelimen on
edelleen käytettävä samaa simulaatiorevisiota; taustalla oleva jaetun ratadatan muutos
on julkaistava tämän normaalin säännön mukaan. Oletuspelaajarajaa ei nosteta.

## Kahden kierroksen taustapakkauskoe 5.11.2026

Alkuperäinen vertailumittaus commitista `2502acb`, gzip-tasolla 1. Alla olevat
luvut ja vanha raakatulos säilytetään vertailuna; jatkokorjauksen gzip-taso on 3.

`npm run measure:background-replay` käynnistää tuoreen Node-prosessin ja kymmenen
HTTP-asiakasta loopback-osoitteessa. Jokainen ajaa samat kaksi täyttä kierrosta
samalla 120 Hz:n syötehistorialla, 60 tickin erissä ja todellisella monotonisella
kellolla. Molemmat maaliintulot osuvat kaikilla samaan tickiin. Allekirjoitukset ja
base64-payloadin SHA-256 tarkistetaan kaikille 20 tallenteelle; viimeiset kuitit
haetaan ilman lisäajoa. Tuotantoon ei lähetetä liikennettä eikä sen viiden pelaajan
rajaa muuteta. Testiprosessi sallii nimenomaisesti kymmenen sessiota.

| Mittari | Tulos |
| --- | ---: |
| Asiakkaat × täydet kierrokset | 10 × 2 |
| Kuitit / odotetut | 20 / 20 |
| `practiceLaps` / `lagTerminations` | 0 / 0 |
| Maaliintulotickit | 14 208 ja 25 854 |
| Aika | 215,94 s |
| `ackLagMs` p95 / max | 160,04 / 358,48 ms |
| HTTP-erävastaus p95 / max | 158,05 / 356,65 ms |
| Maalierän HTTP-vastaus p95 / max | 78,18 / 79,13 ms |
| RSS-huippu, koko prosessi säikeineen | 587,70 MiB |
| Poiston jälkeen maailmat / fysiikkatehtävät / tallenteet | 0 / 0 / 0 |

`ackLagMs` on palvelimen alkuperäisestä session aloituskellosta mitattu ero
kuittauksen ja kuitatun tickin simulaatioajan välillä, kaikista 4 310 erästä.
P95 lasketaan tarkasta vastauksissa palautetusta `serverElapsedMs`-arvosta;
max on palvelimen varsinaisen `ackLagMs`-mittarin 358,482 ms (vastauksista
358,476 ms). RSS sisältää myös paikalliset HTTP-asiakkaat ja niiden vastaanottamat
uusinnat. Yksi fysiikkasäie käyttää 256 MiB:n old-generation-rajaa.

Tämä on **paikallinen koe, ei Azure 0,5 vCPU / 1 GiB -kapasiteettitodiste**.
Koneella on 8 käytettävissä olevaa CPU:ta eikä testiprosessia rajattu puoleen CPU:hun.
Azure-koe tarvitaan erikseen ennen kapasiteettipäätöksiä; tuotantorajaksi jää viisi.
JSON-muunnos kestää tässä koneessa noin 9–13 ms/tallenne ja voi yhä viivyttää
myöhemmin saapuvaa fysiikkatyötä yhden taustatehtävän verran.

Samoille kahdelle oikealle kierrostallenteelle tehtiin viisi peräkkäistä gzip-koetta
kullakin tasolla. Taulukon aika on gzipin ja base64-muunnoksen mediaani; JSON-aika
on mitattu erikseen, eikä sitä sisällytetä gzip-aikaan.

| Kierros | Gzip-taso | Base64-merkkejä | Gzip + base64, ms |
| --- | ---: | ---: | ---: |
| 1 | 6 | 619 848 | 52.02 |
| 1 | 3 | 671 420 | 24.74 |
| 1 | 1 | 697 040 | 16.92 |
| 2 | 6 | 550 280 | 40.77 |
| 2 | 3 | 599 508 | 20.55 |
| 2 | 1 | 623 552 | 17.62 |

Alkuperäiseen versioon valittiin taso 1 noin 2,3–3,1-kertaisen nopeuden vuoksi. Koko kasvaa tasoon 6
nähden noin 12–13 %, mutta molemmat payloadit alittavat 900 000 merkin rajan.
Raakatulokset ja mittauksen rajaus:
[background-replay-load.json](../artifacts/verification/background-replay-load.json).

Myös tämän tiedoston aiemmat mittauskomennot suoritettiin uudelleen: 5 sekunnin
`2,4,8,16 both` -vertailu ja 120 sekunnin `16 pooled` -koe läpäisivät kaikki
väitteensä. Jälkimmäinen tuotti 16/16 odotettua kierroskuittia, practiceLaps = 0,
lagTerminations = 0; erävastauksen p95 oli 258,77 ms ja RSS-huippu 549,06 MiB.
Nämäkin ovat paikallisia tarkistuksia. Lyhyt vertailu ei sisällä maaliintuloa;
vanhan erillissäiemallin vertailutallennin käyttää tässä ajossa samaa gzip-tasoa 1.

## PR #30:n jatkokorjaus: CPU-rajattu koe 5.11.2026

Nykyinen versio käyttää gzip-tasoa 3, kierroskohtaista keskeytystä ja yllä kuvattua
kahdeksan fysiikkatehtävän / 500 ms:n nälkiintymissuojaa. Seuraava komento rajaa
sekä palvelimen, fysiikkaworkerin, zlibin että paikalliset HTTP-asiakkaat samalle
CPU-ytimelle. Lapsiprosessi tarkistaa affiniteetin periytymisen.

```sh
taskset -c 0 node scripts/measure-background-replay.cjs --output=artifacts/verification/background-replay-load-cpu1-gzip3.json
```

Sekä vanhempi- että mittausprosessissa `availableParallelism = 1` ja Linuxin
`Cpus_allowed_list = 0`. Cgroupin `cpu.max` oli `800000 100000`: rajoitus tehtiin
siis **yhden ytimen affiniteetilla**, ei Dockerin 0,5 CPU:n kiintiöllä. Koe ei ole
Azure-tuotantokapasiteetin hyväksyntä eikä muuta viiden pelaajan tuotantorajaa.

| Mittari | Tulos |
| --- | ---: |
| Asiakkaat × täydet kierrokset | 10 × 2 |
| Allekirjoitetut tallenteet / odotetut | 20 / 20 |
| `practiceLaps` / `lagTerminations` | 0 / 0 |
| `ackLagMs` p95 / max | 236,95 / 470,82 ms |
| HTTP-erävastaus p95 / max | 223,78 / 468,26 ms |
| Maalierän HTTP-vastaus p95 / max | 133,42 / 163,65 ms |
| RSS-huippu, koko prosessi säikeineen | 639,04 MiB |
| Aika | 216,48 s |
| Poiston jälkeen maailmat / fysiikkatehtävät / tallenteet | 0 / 0 / 0 |

Maaliintulot olivat edelleen kaikilla tickeillä 14 208 ja 25 854. Kaikkien 20
kuitin allekirjoitus ja base64-payloadin SHA-256 tarkistettiin, myös ilman seuraavaa
ajoerää haetuille viimeisille kierroksille. RSS sisältää paikalliset HTTP-asiakkaat
ja niiden vastaanottamat tallenteet. Kuittausviive lasketaan aiemman kokeen tavoin
kaikista 4 310 erästä, palvelimen alkuperäistä kelloa vasten.

Nälkiintymissuoja antoi kaksi pakkausvuoroa fysiikkajonon ollessa täynnä. Pisimmän
tallenteen odotus ennen gzipin alkua oli 1 062,88 ms: jonon muiden tallenteiden
pakkaukset sisältyvät tähän. 500 ms:n vuoronantoraja ei keskeytä edellistä gzipiä.
Fysiikka jatkui odotuksen aikana; kyse ei ole eräkuittauksen viiveestä.

Tason 3 payloadit olivat 671 420 ja 599 508 merkkiä. Ne ovat tasoa 1 noin 3,7 %
ja 3,9 % pienempiä, ja 900 000 merkin raja säilyy. Viiden pakkauksen mediaanit
samalla CPU-rajauksella (gzip + base64, ilman JSON-muunnosta):

| Kierros | Taso 6, ms | Taso 3, ms | Taso 1, ms |
| --- | ---: | ---: | ---: |
| 1 | 51,81 | 26,94 | 28,16 |
| 2 | 46,82 | 18,42 | 13,10 |

Pienessä viiden toiston näytteessä on vaihtelua (ensimmäisen kierroksen tason 1
aika oli jopa tasoa 3 hitaampi); koko työkuorman kuittausviive ja kaikki 20
kuittia ovat varsinainen hyväksymismittari. Raakatulos:
[background-replay-load-cpu1-gzip3.json](../artifacts/verification/background-replay-load-cpu1-gzip3.json).

Uusi regressiotesti pitää 16 fysiikkatyötä jatkuvasti jonossa täydentämällä
jonon jokaisesta vastauksesta. Tallenne valmistuu jonon ollessa yhä täynnä ja
sama worker jatkaa. Erillinen 100 ms:n testiaikakatkaisu pysäyttää vain kohteensa:
toinen pelaaja kuittaa fysiikan ja uuden kierrostallenteen samalla säikeellä.
AbortSignal-testissä keskeytetään myös oikea zlib-stream, ei pelkkää testilupausta.
Aiemmat kahden kierroksen, kelpoisuuden, kuittivälimuistin, peruutuksen, TTL:n ja
kaatumisen testit säilyvät mukana.

Tällä jatkokorjauksella suoritettiin paikallisesti koko CI:n 25 testikokonaisuuden
matriisi sekä erillinen `test:azure-production`: kaikki 26 ajoa läpäisivät.
