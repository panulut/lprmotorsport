# Työn tallennuspiste 24.10.2026

Tämä kuvaa aiempaa tallennuspistettä. Sen jälkeen paikallinen 3D-pelin integraatio,
allekirjoitetut kierroskuitit ja erillinen varmennettu tuloslista on toteutettu.
Nykytilanne ja testien rajaus: [verification/README.md](../verification/README.md).
Julkista käyttöönottoa ei ole tehty.

Haara: `codex/server-replay-experiment`, luonnos-PR #5. Ei yhdistetä mainiin tässä tallennuksessa.

## Gitissä tallessa

- Render Free -palvelimella toimiva ajon aikana erissä tehtävä simulaation tarkastus.
- Järjestetyt, rajatut sessiot ja asiakas, joka lähettää syötteitä ajon aikana.
- Kahden samanaikaisen Node-asiakkaan reaaliaikainen koe ja mittausraportti (`live-render-measurement.json`).
- Kokeilun testit ja aiemman version CI-tulokset; yksityiskohdat README.md:ssä.

## Keskeneräinen integraatio

Varsinaisen 3D-pelin yhdistämisestä tarkastukseen ja palvelimen allekirjoittamista kierrostuloksista on aiemman työvaiheen suunnitelma. Tämän työtilan palautuessa niiden keskeneräisiä tiedostomuutoksia ei löytynyt. Niitä ei siksi ole tässä commitissa eikä niiden valmistumista voi päätellä keskustelun tilapäivityksistä.

Jatkotyö:

1. Yhteinen deterministinen ajosimulaatio selaimelle ja tarkastuspalvelimelle, myös liikkuvat henkilöt, ohjaustavat ja luistonesto.
2. Varsinaisen pelin virallisen ajon käynnistys, palvelimen lämmitystila ja turvallinen paluu harjoitteluun katkoksen aikana.
3. Palvelimen allekirjoittamat kierroskuitit sekä erillinen varmennettujen tulosten Cloudflare Worker / D1 -lista. Vanhoja aikoja ei merkitä varmennetuiksi.
4. Lentävien kierrosten, välittömän keskeytyksen, uusintalähetysten ja allekirjoituksen väärentämisen testit.
5. Ilmaisten palveluiden asetukset ja koko ketjun käyttöönotto vasta toimivien testien jälkeen; oikean selaimen 3D-testi tarvitaan edelleen.

Tämä on työn tallennuspiste, ei ilmoitus valmiista julkisesta anti-cheat-järjestelmästä. Uutta käyttöönottoa tai maksullisia resursseja ei tehdä tässä tallennuksessa. Salaisuuksia ei tallenneta repositoryyn.
