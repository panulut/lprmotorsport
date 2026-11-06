# Kolme 10 pelaajan kapasiteettikoetta Azuressa

## Tila 6.11.2026

**Ei ajettu Azuressa. Ei kapasiteettihyväksyntää.** Tämän työn ympäristössä ei ole
Azure CLI:tä, Dockeria, Azure-kirjautumista tai Container Apps -yhteyttä. Testikonttia ei ole
luotu eikä tuotantoa muutettu. Alla olevat komennot ja ajoskriptit ovat valmiina
Panun ajettaviksi. Paikalliset smoketestit eivät ole Azure-kuormatuloksia.

Nykyisestä Cloudflare-testiversiosta tarkistettiin lukemalla:

- Worker: `lpr-verified-test.panu-musakka-0bf.workers.dev`.
- `driving-v1`, revisio `3c5237068fcb1c7490b265c20f496b5bd0141815d542a7274518df534ed02346`.
- D1-sidonta `DB`: testikanta `82324dc1-0ac0-4874-b9f3-dcf16a7c66c8`.
- Allekirjoitusavaimen arvoa ei luettu, tallennettu tai vaihdettu.

## Lähde ja eristys

Ajonvarmennus rakennetaan **täsmälleen commitin
`e70218a6298aecaacd748c62a77f6e67bfcae731` tiedostoista**. Build-skripti käyttää
`git archive` -komentoa, ei tämänhetkisen työpuun varmennuskoodia.
Sen päälle lisätään vain `Dockerfile.azure-test` ja
`verification/azure-test-bootstrap.cjs`. Testikäynnistin:

- tarkistaa testiasetukset ennen alkuperäisen palvelinfactoryn käyttöä;
- lisää suojattuun `/metrics`-vastaukseen workerin olemassa olevat stats-tiedot,
  prosessin RSS high-water -arvon sekä pysyvän mitätöintisyylaskurin;
- käyttää alkuperäistä syöte-, kelpoisuus-, allekirjoitus- ja tallennekoodia;
- estää etä-chat- ja kapasiteettivarastot kokonaan (`CHAT_STORAGE_URL` ja
  `CAPACITY_REPORT_URL` eivät saa olla asetettuina);
- sallii vain testipelin originin ja tunnetun TEST Workerin osoitteen.

Imageen tulee OCI-lähdelabel `e70218a...` sekä erillinen testikäynnistimen SHA-256.
Runtime tarkistaa molemmat. Image julkaistaan GHCR:ään omalla testitagilla ja
Azurelle annetaan **digest**, ei muuttuvaa tagia. Tuotantoimagea tai sen suojausta
ei muuteta. Testitilit ja aloitusliput käyttävät vain testityöntekijän D1-kantaa;
koe ei lähetä kierrostuloksia tai kapasiteettihistoriaa tuotannon eikä testin listalle.
Satunnaiset `AzCap...`-testitilit jäävät testikantaan; kirjautumiset perutaan.
Raportin nimimerkit mahdollistavat täsmällisen myöhemmän siivouksen.

## 1. Run workflow GitHubissa ja kopioi digest

Ensisijainen rakennus tapahtuu GitHubin runnerilla. Et tarvitse Dockeria omalle
koneelle tätä reittiä varten. Työnkulussa ei ole Azure-tunnuksia eikä se luo tai
muuta Container Apps -resursseja.

1. Avaa [LPR Motorsportin Actions](https://github.com/panulut/lprmotorsport/actions).
2. Valitse **Build isolated Azure test image** (`azure-test-image.yml`).
3. Paina **Run workflow**, valitse tämän testiohjeen ja testikäynnistimen sisältävä
   hyväksytty haara (tässä PR:ssä `test/azure-ten-player-capacity`) ja käynnistä ajo.
4. Odota vihreää lopputulosta. Työnkulku testaa käynnistimen, rakentaa kuvan
   `git archive e70218a...` -lähteistä, ajaa tuotantoimagen kanssa saman Trivy
   HIGH/CRITICAL -portin ja julkaisee vain hyväksytyn kuvan GHCR:ään.
5. Avaa ajon **Summary**. Kopioi **Azure test image** -kohdasta koko rivi:
   `ghcr.io/panulut/lprmotorsport/verification@sha256:...`.

Työnkulun oikeudet ovat vain `contents: read` ja `packages: write`. GHCR-kirjautuminen
käyttää ajon omaa `GITHUB_TOKEN`-tunnistetta. Tagissa on testietuliite,
lähdecommit, käynnistimen hash sekä GitHub-ajon tunniste ja yritysnumero.
Yhteenveto näyttää myös lähdecommitin ja testikäynnistimen SHA-256:n.

**Uuden työnkulun käyttöönotto:** GitHub edellyttää `workflow_dispatch`-tiedostoa
repositorion oletushaaraan ennen ensimmäistä käsin käynnistystä. Pelkkä PR-haaraan
lisääminen ei vielä tuo Run workflow -painiketta näkyviin. Työnkulun rekisteröinti
tehdään normaalin katselmoinnin kautta; tätä PR:ää ei yhdistetä automaattisesti.
Rekisteröinnin jälkeen Branch-valikosta voi valita testiohjeen kanssa saman haaran.
[GitHubin virallinen ohje](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

### Windows: WSL2, Ubuntu, Azure CLI ja Node

Aja järjestelmänvalvojan **PowerShellissä**:

```powershell
wsl --install -d Ubuntu
```

Käynnistä Windows uudelleen, jos asennus pyytää sitä. Avaa Ubuntu ja luo Linux-
käyttäjätunnus. Tarkista PowerShellissä, että Ubuntu käyttää WSL-versiota 2:

```powershell
wsl --list --verbose
# Vain jos Ubuntun VERSION on 1:
wsl --set-version Ubuntu 2
```

Seuraavat komennot ajetaan **Ubuntun Bashissä WSL:n sisällä**, eivät PowerShellissä.
Windowsiin jo asennettu Node tai Azure CLI ei korvaa näitä Linux-asennuksia:

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
curl -fsSL https://aka.ms/InstallAzureCLIDeb -o /tmp/lpr-install-azure-cli.sh
sudo bash /tmp/lpr-install-azure-cli.sh
rm /tmp/lpr-install-azure-cli.sh

curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.7/install.sh -o /tmp/lpr-install-nvm.sh
bash /tmp/lpr-install-nvm.sh
rm /tmp/lpr-install-nvm.sh
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm install 24
nvm alias default 24
nvm use 24

az version
node --version
node -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major!==24||minor<22)throw Error("Use Node 24.22+ from the Node 24 line inside WSL")'
```

Avaa sama repository ja haara WSL:n sisällä. Uudelle kloonille:

```sh
mkdir -p ~/projects
cd ~/projects
git clone --branch test/azure-ten-player-capacity https://github.com/panulut/lprmotorsport.git
cd lprmotorsport
az login
```

Kun muutokset ovat oletushaarassa, voit käyttää kloonissa ja workflow-valinnassa
`main`-haaraa PR-haaran sijaan. Käynnistimen tiedoston pitää vastata imagen
yhteenvedon SHA-256:ta.

Jos selainkirjautuminen ei avaudu WSL:stä, käytä `az login --use-device-code`.
Aseta **Summary-kohdasta kopioitu todellinen digest** WSL:n Bashissä:

```sh
export LPR_AZURE_TEST_IMAGE='ghcr.io/panulut/lprmotorsport/verification@sha256:KORVAA_TODELLISELLA_DIGESTILLA'
```

Nodea käytetään asiakkaiden ja mittausraporttien ajamiseen. Varsinainen imagen
rakentaminen ja Trivy-skannaus tapahtuvat edellä GitHubissa, joten Docker-asennus
on tarpeen vain seuraavaa vaihtoehtoa varten.

### Vaihtoehto: rakenna omalla Dockerilla

Tarvitset Dockerin (esimerkiksi Docker Desktop + Ubuntu/WSL-integraatio), Gitin ja
saman checkoutin kuin testikäynnistimessä. Dockerin tulee olla käynnissä. Aja
repositorion juuressa WSL:n Bashissä:

```sh
git fetch origin e70218a6298aecaacd748c62a77f6e67bfcae731
docker login ghcr.io -u panulut
bash scripts/build-azure-test-image.sh
```

Paikallinen komento rakentaa ja julkaisee testitagin sekä tulostaa lopuksi digestin.
`--build-only` rakentaa ilman kirjautumista tai pushia; GitHub-työnkulku käyttää tätä
vaihtoehtoa ja sijoittaa Trivy-skannauksen buildin ja julkaisun väliin.
Aseta paikallisen pushin tulostama digest `LPR_AZURE_TEST_IMAGE`-muuttujaan kuten yllä.

Asennuslähteet: [WSL2/Ubuntu](https://learn.microsoft.com/en-us/windows/wsl/install),
[Azure CLI Ubuntuun](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli-linux?pivots=apt),
[nvm](https://github.com/nvm-sh/nvm), [Node 24](https://nodejs.org/en/download).

Jos GHCR-paketti on yksityinen, anna lisäksi vain pakettien lukemiseen oikeuttava
tunniste. Se tallentuu vain uuden testikontin registry-secretiin:

```sh
read -rs -p 'GHCR read:packages token: ' LPR_GHCR_READ_TOKEN
printf '\n'
export LPR_GHCR_READ_TOKEN
```

Julkiselle paketille tätä ei tarvita. Käynnistys kysyy erikseen nykyisen
**lpr-verified-test**-Workerin `VERIFICATION_SECRET`-arvon (sama kuin erillisen
Render-testipalvelun asetuksissa). Älä anna tuotantoavainta. Avainta ei sisällytetä
buildiin, Gitiin, raporttiin tai komentojen tulosteisiin. Testin oma metrics-avain
luodaan satunnaisesti ja pidetään erillisenä allekirjoitusavaimesta.

## 2. Luo, aja kolme kertaa ja pysäytä automaattisesti

```sh
bash scripts/run-azure-capacity.sh
```

Skripti kieltäytyy ylikirjoittamasta jo olemassa olevaa samannimistä testikonttia.
Sen Azure-operaatiot kohdistuvat vain tähän uuteen sovellukseen:

| Asetus | Arvo |
| --- | --- |
| Subscription | `41128d20-bcb4-4799-80ce-ac23952b4bdd` |
| Resurssiryhmä / ympäristö | `rg-lpr-prod` / `aca-lpr-prod` |
| Container App | `lpr-verification-capacity-test` |
| Workload profile | `Consumption` |
| CPU / muisti | **0,5 vCPU / 1 GiB** |
| Replikat kokeen aikana | min 1 / max 1, single revision |
| Sessioita / aloituksia minuutissa | 10 / 32 |
| Fysiikkasäikeitä / heap | 1 / 256 MiB |
| `VERIFICATION_LAP_LAG_MS` | 2000 |

Yksi lämmin replika poistaa cold startin kierroksen aikabudjetista ja estää
usean replikan kuormanjaon. Tuotannon Container Appia `lpr-verification-prod` ei
lueta eikä muuteta. Ympäristöstä luetaan vain sen tunniste uuden sovelluksen luontiin.

Skriptin varsinainen luontikomento on seuraava (muuttujat, salainen syöte ja
EXIT-trap asetetaan skriptissä ennen komentoa):

```sh
az containerapp create --subscription "$subscription" --resource-group "$resource_group" --name "$test_app" \
 --environment "$environment_id" --workload-profile-name Consumption --image "$LPR_AZURE_TEST_IMAGE" \
 --cpu 0.5 --memory 1Gi --min-replicas 1 --max-replicas 1 --revisions-mode single \
 --ingress external --target-port 8081 --transport auto \
 --secrets "test-signing-key=$LPR_AZURE_TEST_SIGNING_KEY" "test-metrics-key=$LPR_AZURE_TEST_METRICS_TOKEN" "${registry_secret[@]}" "${registry_args[@]}" \
 --env-vars VERIFICATION_SECRET=secretref:test-signing-key VERIFICATION_METRICS_TOKEN=secretref:test-metrics-key \
 MAX_VERIFIED_SESSIONS=10 MAX_VERIFIED_STARTS_PER_MINUTE=32 VERIFICATION_WORKERS=1 VERIFICATION_WORKER_HEAP_MB=256 VERIFICATION_LAP_LAG_MS=2000 \
 NODE_ENV=production VERIFICATION_ENVIRONMENT=azure-test VERIFICATION_PUBLIC=1 PORT=8081 \
 "LPR_RELEASE_COMMIT=$source_commit" "LPR_TEST_WRAPPER_SHA=$wrapper_sha" \
 LPR_TEST_WORKER_URL=https://lpr-verified-test.panu-musakka-0bf.workers.dev GAME_ORIGINS=https://lpr-motorsport-test-a1gg.onrender.com \
 --only-show-errors --output none
```

Azure-asetukset luetaan takaisin ja tallennetaan salaisuuksista suodatettuina
`artifacts/verification/azure-test-proof.json`:iin. Etäkoeskripti tarkistaa CPU:n,
muistin, replika- ja workerirajat, lähdecommitin, testikäynnistimen hashin ja imagen
digestin. Se hyväksyy vain uuden testisovelluksen Azure-FQDN:n ja tunnetun TEST
Workerin. Tuotanto-osoitteita ei hyväksytä.

## 3. Mittaus ja hyväksyntä

Käynnistysskripti suorittaa:

```sh
node --use-env-proxy scripts/measure-azure-capacity.cjs
```

Se ajaa **kolme erillistä koetta**. Kukin asiakas etenee omalla HTTP-jonollaan,
joten yhden asiakkaan verkkoviive ei pysäytä muita. Kaikilla on sama ennalta
laskettu kahden kokonaisen kierroksen syötehistoria ja maaliintulotickit (14 208 ja
25 854). Aloitusliput tulevat TEST Workerilta; myös niiden HMAC tarkistetaan ennen
sessioiden luontia. Tallenteiden raskas JSON/gunzip-tarkistus tehdään vasta ajon päätyttyä, jotta
asiakasohjelma ei itse viivästytä seuraavia syöte-eriä. Kaikki 20 kierroskuittia
tarkistetaan allekirjoituksen,
pelaaja/session, rajatickien ja base64-payloadin SHA-256:n osalta.

`/metrics` kerätään ennen ajoa, 15 sekunnin välein ja sessioiden sulkemisen jälkeen.
Näytteet sisältävät **vain palvelinprosessin** muistiluvut: asiakasohjelman RSS:ää
ei käytetä hyväksymisessä. `serverMaxRssBytes` on Linuxin prosessin high-water
(säikeet mukaan lukien), joten 15 sekunnin väliin osuva huippukin tulee mukaan.
Se on palvelinprosessin elinkaaren maksimi; toistoissa vanha huippu säilyy mukana,
mikä tekee alle 800 MiB:n tarkistuksesta konservatiivisen.

Kaikkien seuraavien on täytyttävä **jokaisella kolmella kerralla**:

- 20/20 tarkistettua kierroskuittia ja 20 uutta palvelimen `verifiedLaps`-merkintää;
- laskurideltat `practiceLaps = lagTerminations = processingTimeouts = 0`;
- pysyvän `invalidations.replay`-laskurin delta on nolla;
- suurin `ackLagMs` on aidosti **alle 1000 ms** sekä vastauksista että
  palvelimen omasta high-water-mittarista tarkistettuna;
- palvelimen RSS high-water on aidosti **alle 800 MiB**;
- ei puuttuvia metriikkanäytteitä, prosessin vaihtumista tai asiakas-/protokollavirheitä;
- sulkemisen jälkeen ei ajomaailmoja, fysiikkatöitä tai pakkauksia.

Raporteissa ovat lisäksi `forcedRecordings`-delta ja `replayPackMs`-histogrammin
count/sum/mean/bucket-deltat. `replayPackMs.maxMsSinceServiceStart` ja
`maxReplayQueueMs` ovat palvelimen/workerin elinkaaren high-water-arvoja, koska
pinnatun koodin laskureita ei nollata kesken ajon. Näytteet ja lähtöarvot säilytetään.
Epäonnistunutta koetta ei korvata onnistuneella uusinnalla: kaikki kolme tallennetaan.
`summary.json` hyväksytään vain, jos `allThreePassed = true`. Keskeytynyt tai
puuttuva ajo ei täytä ehtoa.

Tulokset tallennetaan jokaisella käynnistyksellä uuteen UTC-aika + satunnaistunniste
-alihakemistoon (`RUN_GROUP` alla), jotta aiemmat yritykset eivät ylikirjoitu:

- `artifacts/verification/azure-ten-player/RUN_GROUP/run-1.json`, `run-2.json`, `run-3.json`;
- `artifacts/verification/azure-ten-player/RUN_GROUP/summary.json`;
- `artifacts/verification/azure-ten-player/RUN_GROUP/stop-proof.json`.

Raakadata ei sisällä salasanoja, kirjautumis-/sessioavaimia, aloituslippuja,
metrics-avainta tai allekirjoitusavainta. Testitilit yksilöidään satunnaisilla nimillä.

## 4. Pysäytys ja hätäkomento

Skriptin EXIT/INT/TERM-trap pysäyttää testisovelluksen myös epäonnistuneen kokeen
jälkeen. Shellin tai koneen pakotettua sammutusta trap ei voi käsitellä; siksi tässä
ovat suoraan ajettavat varakomennot (vain testikontti):

```sh
az containerapp update --subscription 41128d20-bcb4-4799-80ce-ac23952b4bdd \
 --resource-group rg-lpr-prod --name lpr-verification-capacity-test \
 --min-replicas 0 --max-replicas 1 --only-show-errors --output none
az rest --method post --url 'https://management.azure.com/subscriptions/41128d20-bcb4-4799-80ce-ac23952b4bdd/resourceGroups/rg-lpr-prod/providers/Microsoft.App/containerApps/lpr-verification-capacity-test/stop?api-version=2025-07-01' \
 --only-show-errors --output none
az containerapp show --subscription 41128d20-bcb4-4799-80ce-ac23952b4bdd \
 --resource-group rg-lpr-prod --name lpr-verification-capacity-test \
 --query '{runningStatus:properties.runningStatus,minReplicas:properties.template.scale.minReplicas,maxReplicas:properties.template.scale.maxReplicas}' --output json
```

Microsoft dokumentoi `maxReplicas`-asetuksen alarajaksi 1; min/max 0/0 ei ole
käytettäväksi luvattu skaalauskonfiguraatio. Pelkkä min=0/max=1 sallisi uuden
heräämisen HTTP-liikenteestä. Siksi lisäksi kutsutaan virallista **Stop**-operaatiota
ja vaaditaan takaisinluettu `runningStatus = Stopped`, joka pysäyttää sovelluksen
replikat. `stop-proof.json` tallentaa oikean lopputilan. Jos pysähtymistä ei saada
vahvistettua, skripti ilmoittaa siitä ja palauttaa virhekoodin.

### Poista vain testikontti ennen uusintaa

Ajoskripti jättää pysäytetyn testikontin talteen ja kieltäytyy ylikirjoittamasta sitä.
Kun raakadata ja pysäytyksen todiste on säilytetty, poista **vain tämä testisovellus**
WSL:n Bashissä ja aja vaihe 2 uudelleen:

```sh
az containerapp delete --subscription 41128d20-bcb4-4799-80ce-ac23952b4bdd \
 --resource-group rg-lpr-prod --name lpr-verification-capacity-test --yes
```

Komento poistaa testisovelluksen revisiot ja sen testisalaisuudet. Se ei poista
resurssiryhmää, yhteistä ympäristöä, GHCR-imagea tai tuotannon Container Appia.
Paikalliset `RUN_GROUP`-raakadatakansiot säilyvät; seuraava ajo käyttää uutta kansiota.

Viralliset lähteet: [skaalausrajat](https://learn.microsoft.com/en-us/azure/container-apps/scale-app),
[Container Apps Stop API](https://learn.microsoft.com/en-us/rest/api/resource-manager/containerapps/container-apps/stop?view=rest-resource-manager-containerapps-2025-07-01),
[Azure CLI create/update](https://learn.microsoft.com/en-us/cli/azure/containerapp?view=azure-cli-latest).

Tuotannon `MAX_VERIFIED_SESSIONS=5` säilyy. Skripti kirjaa toteutuneet luvut automaattisesti
AZURE-PRODUCTION.md:hen ja päivittää `status.json`:in vasta kolmen Azure-ajon sekä
pysäytyksen todisteiden jälkeen; paikallista
smokea tai ajamattomia kokeita ei merkitä läpäistyiksi.

## Uusinta kevennetyllä fysiikalla, 6.11.2026

Testikuvan lähde on vaihdettu committiin `7788a00a04dc3abd47918f27a93dd4d0a469b45c`.
Se on `8714a53` ja bittitarkka fysiikan kevennys (sama muutos kuin `main`in `c067b81`).
Simulaatiorevisio pysyy arvossa `3c5237068fcb…`, joten TEST Workeria ei tarvitse päivittää.
`Dockerfile.azure-test` kopioi lisäksi tiedoston `verification/equivalent-revisions.json`.

Paikallinen vertailu, 10 pelaajaa × 2 kierrosta, 0,5 CPU:n cgroup-kiintiö
(palvelin ja asiakkaat samassa kiintiössä, ei Azure-tulos):
ilman kevennystä ackLag p95/max 730/1421 ms, kevennyksen kanssa 230/694 ms; 20/20 kuittia molemmissa.
