# Testipeli

Testipeli: https://lpr-motorsport-test.onrender.com/

Tämä ympäristö käyttää vain GitHubin `testing`-haaraa. Julkisen pelin `main`-haaraa
ja sen palveluita ei muutettu. Uusintapäivitys on mukana testipelissä.

## Palvelut

| Osa | Testiympäristö |
| --- | --- |
| Render Static Site | `lpr-motorsport-test`, build `npm run build:test`, publish `dist` |
| Render varmennus | `lpr-verification-test`, Node 24, Frankfurt, Free, `node verification/server.cjs` |
| Varmennetut tulokset ja uusinnat | `lpr-verified-test.panu-musakka-0bf.workers.dev` |
| Analytiikka | `lpr-analytics-test.panu-musakka-0bf.workers.dev` |
| D1 | `lpr-motorsport-test`, `82324dc1-0ac0-4874-b9f3-dcf16a7c66c8`, EU |
| Hyväksytty pelin origin | `https://lpr-motorsport-test.onrender.com` |

Testipalvelut käyttävät omia allekirjoitus- ja ylläpitoavaimia. Tuotannon avaimia
ja tietoja ei kopioitu. Avaimia ei tallenneta Gitiin. Testin ylläpitoavain löytyy
Renderin **lpr-verification-test → Environment → ANALYTICS_ADMIN_TOKEN** -asetuksesta;
sama avain on asetettu testin kahteen Cloudflare Workeriin.

## Testaaminen

1. Avaa pelilinkki WebGL:ää tukevassa selaimessa. Yläreunassa näkyy **TESTIVERSIO**.
2. Anna testinimimerkki, hyväksy tietojen kerääminen ja aloita ajo.
3. Odota varmennuksen valmistumista. Render Free voi herätä viiveellä.
4. Aja kierros. Sen tulee ilmestyä tämän ympäristön TOP 10:een.
5. Avaa **Katso uusinta** ja kokeile aikajanaa, taukoa ja toistonopeutta.
6. Uusintanäkymän **Ylläpito**-linkistä voi tarkastella kaikkia testitallenteita
   ja merkitä suorituksia tarkastettaviksi testin omalla ylläpitoavaimella.

Listalla voi näkyä käyttöönoton automaattinen **Palvelintesti**-suoritus. Se on
tekninen koesuoritus, ei ihmisen ennätys. Testipeli on linkin tunteville julkinen;
se ei ole salasanasuojattu yksityinen ympäristö.

## Päivitykset

Pushaa pelimuutokset `testing`-haaraan. Renderin testisivu ja varmennuspalvelin
on asetettu automaattijulkaisuun. Tarkista aina kummankin deployn valmistuminen.
Main-haaraan yhdistäminen on erillinen julkaisu; testiympäristön asetuksia ei
pidä ottaa tuotannon palvelinasetuksiksi.

Worker-koodin muuttuessa aja `node scripts/bundle-test-workers.cjs` ja julkaise
`artifacts/verification/testing/`-bundlet vain testin kahteen Workeriin. Säilytä
niiden DB-binding ja testisalaisuudet. Molemmille on asetettu päivittäinen
`0 3 * * *` -siivous. Muista myös testin D1-skeeman muutos, jos tietomalli muuttuu.
Fysiikan muuttuessa varmennuspalvelin, verified Worker ja pelin revisio on
päivitettävä yhteen sopiviksi kuten tuotannossa.

`build:test` tekee tavallisen buildin ja vaihtaa vain tulostetun julkaisupaketin
palvelinosoitteet testiosoitteisiin. Myös vanhan leaderboard-asiakkaan ja
analytiikan osoitteet vaihdetaan, jotta testit eivät lähetä tuotantoon mitään.
Lähdetiedostojen tuotantoasetuksia ei korvata.

Cloudflare Pagesin Git-julkaisu palautti tilin GitHub-asennuksen virheen, joten
staattinen testijulkaisu tehtiin Renderiin. Cloudflaren olemassa olevia
Pages-projekteja ei muutettu eikä testiympäristö vaadi Pages-kytkennän korjausta.

Renderin ilmainen varmennuspalvelin jakaa työtilan ilmaisen käytön kiintiöitä
muiden ilmaispalveluiden kanssa ja voi nukahtaa käyttämättömänä. Maksullisia
compute-tasoja ei otettu käyttöön.
