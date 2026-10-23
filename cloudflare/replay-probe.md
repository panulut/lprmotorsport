# Kierroksen palvelintarkistuksen kokeilu

Tämä on paikallinen toteutettavuusmittaus. Se ei muuta peliä, julkaise Workeria
eikä hyväksy tai poista verkkotuloslistan tuloksia.

Suorita projektin juuressa:

```powershell
npm run probe:replay
npm run test:replay
```

Mittaus luo tiedostot `artifacts/replay-probe/report.json` ja `replay.json`.
Niitä ei sisällytetä pelin julkaisuun eikä versionhallintaan.

## Mitä kokeilu tekee

- Lataa nykyisen ajofysiikan, ajoneuvon tiedot, kampuksen törmäyskohteet,
  editorin rataobjektit ja maaston suoraan projektin lähdekoodista.
- Käyttää `game.js`-tiedoston nykyisiä `nearestTrack`- ja `grassContact`-funktioita.
  Mittaus ei korvaa niitä yksinkertaistetulla ajoradalla.
- Ajaa ohjelmallisen testikuljettajan paikaltaan lähtevän kierroksen 90 Hz:n
  kiinteällä aika-askeleella ja tallentaa kaasun, jarrun ja ohjauksen.
- Toistaa tallenteen ilman testikuljettajan päätöksentekoa. Laskee ajan ja
  sektorit itse simulaatioaskelista; selaimen ilmoittamaa aikaa ei käytetä.
- Tarkistaa pelin nykyiset sektorialueet, kaatumisen ja simulaation äärellisyyden.
- Mittaa maailman alustuksen, kylmän toiston sekä seitsemän lämmenneen toiston
  seinäkelloajan ja Node-prosessin kuluttaman CPU-ajan. Ennen mittaussarjaa on
  kaksi lämmittelytoistoa. Samat toistot vaaditaan täsmälleen samoiksi.
- Sitoo tallenteen lähdekoodista ja ratadatasta laskettuun SHA-256-tiivisteeseen
  ja rajaa tallenteen pituuden ja ohjausarvot ennen simulointia.

Testiajurin tallenne on synteettinen, ei ihmisen selaimessa ajama kierros.
Kaikki tiedostot ja ajettava koodi tulevat paikallisesta projektista;
tallenteen sisältöä ei koskaan suoriteta ohjelmakoodina.

## Mittauksen tulkinta

`wallMs` tarkoittaa todellista kulunutta aikaa. `cpuMs` tarkoittaa koko
Node-prosessin CPU-aikaa; mukana voi olla roskienkeruuta ja JIT-käännöstä.
Kumpikaan ei ole Cloudflaren laskuttama CPU-mittari. Paikallisesta tuloksesta
ei voi luvata Cloudflaren suorituskykyä tai ilmaisuutta. Suorita mittaus ilman
muita raskaita Node-töitä. Tarkastele myös kylmää toistoa ja tallenteen kokoa.

Cloudflaren Workers Free -raja on dokumentaation mukaan 10 ms CPU-aikaa
pyyntöä kohden. Jos paikallinen laskenta ylittää sen selvästi, pieni
pelaajamäärä ei yksin tee yhdestä kokonaisen kierroksen tarkistuspyynnöstä
mahdollista. Varsinainen päätös edellyttää kohdeympäristön mittausta.

Lähteet (tarkistettu 23.10.2026):

- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/

### Ensimmäinen paikallinen tulos 23.10.2026

Windows, Node v24.19.0, AMD Ryzen 7 4800H. Ohjelmallinen kuljettaja ajoi
paikaltaan 96,167 sekunnin kierroksen (8 655 simulaatioaskelta). Maailmassa oli
2 026 törmäyskohdetta. Tallenne oli 382 492 tavua. Tämä hitaasti ajettu kierros
on suorituskyvyn koetapaus, ei tuloslistaan lähetettävä kilpailuaika.

| Mittaus | Tulos |
| --- | ---: |
| Maailman alustus, seinäkello | 50 ms |
| Kylmä toisto alustuksineen, CPU | 26 359 ms |
| Lämmin toisto, CPU-mediaani | 23 703 ms |
| Lämmin toisto, CPU min–max | 22 828–25 141 ms |
| Lämmin toisto, seinäkellomediaani | 23 940 ms |
| Samansisältöiset mitatut toistot | 7 / 7 |

Alkuperäinen raportti ja tallenne syntyvät yllä mainittuun artifacts-kansioon.
Lähdekoodin ja ratadatan tiiviste oli
`3a4718c29b7eb592963b05798610c61cd4a50b66ef93d7c572b69073ceaab900`.

Tulos on niin kaukana 10 ms:n CPU-budjetista, ettei nykyisen toteutuksen
siirtäminen sellaisenaan ilmaisen Workerin yhteen pyyntöön ole realistinen
suunnitelma. Tämä ei osoita, ettei optimoitu tai toisin rakennettu tarkistus
voisi toimia. Seuraava perusteltu vaihe olisi paikallinen profilointi ja
hakujen optimointi ennen pilvijulkaisua.

## Mitä tämä ei vielä todenna

Nykyinen selainpeli käyttää ruutuajasta johdettuja fysiikan osavaiheita,
tämä kokeilu kiinteää aika-askelta. Niiden välistä vastaavuutta ei ole vielä
toteutettu tai mitattu. Pelin ajanotto käyttää lisäksi seinäkelloa ja sisältää
tauot; kokeilu laskee vain simulaatioaikaa. Tallenteeseen pitäisi lisätä
turvallinen taukojen käsittely ennen käyttöönottoa.

Animoidut henkilöt, sisätilat, rataympäristön aiempien kierrosten muutokset,
lentävän kierroksen luotettu lähtötila, kaikki ohjaustavat ja luistoneston
vaihtaminen eivät vielä kuulu kokeiluun. Testikuljettaja käyttää suoraa
analogista rattiohjausta ja oletusarvoista luistonestoa. Porttitarkistukset
ovat nykyisen pelin tarkistukset, eivät uusi kattava oikaisunestomalli.

Ennen tuotantokäyttöä tarvitaan myös selaimen tallennus, yhteinen kiinteän
aika-askeleen simulaatio, palvelimen vahvistamat aloitukset, uusintojen esto,
tallenteiden koko- ja laskentabudjetit, lähetysrajat, aikaversioiden hallinta
sekä Cloudflare-ympäristössä tehty mittaus. Yksi onnistuva paikallinen
testikierros ei osoita, että kaikki oikeat ajot hyväksyttäisiin.

## Seuraavan vaiheen valinta

Jos täysi toisto ylittää budjetin selvästi, ensin kannattaa profiloida
törmäyskohteiden ja radan lähimmän pisteen haut sekä rakentaa niihin
tilallinen indeksi, jota sekä peli että tarkistus käyttävät. Seuraava
mittaus näyttää, riittääkö optimointi. Tarkistuksen jakaminen useaan pyyntöön
on erillinen vaihtoehto, mutta vaatii palvelimen hallitseman välitilan,
järjestyksen, tallennuskiintiöiden ja väärinkäytön hallinnan.
