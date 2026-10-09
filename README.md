# LPR Lap Challenge

Selainpohjainen Formula Student -henkinen 3D-ajopeli kuljettajan näkökulmasta. Sama peli toimii puhelimen kosketusohjaimilla, tietokoneen näppäimistöllä ja selaimen tunnistamalla ratilla sekä polkimilla. 3D-näkymä käyttää WebGL:ää ilman ulkoisia kirjastoja.

## Käynnistys

Käynnistä projektikansiossa paikallinen palvelin:

```powershell
node server.js
```

Avaa tietokoneella `http://localhost:8000`. Puhelimella voit avata `http://TIETOKONEEN-LÄHIVERKKO-OSOITE:8000`, kun molemmat laitteet ovat samassa verkossa ja palomuuri sallii yhteyden. Julkista käyttöä varten sijoita tiedostot HTTPS-palvelimelle. Pelin kierrosajat tallentuvat vain käytetyn selaimen omaan tallennustilaan.

## Ohjaus

Sale Skinnarilaan pääsee pysähtymällä kaupan ovelle kampusradan eteläpuolella ja valitsemalla **Mene Saleen** tai painamalla **E**. Sisällä näkymän klikkaaminen lukitsee hiiren: katse seuraa hiiren liikettä ilman painikkeen pitämistä. Esc vapauttaa hiiren. Kosketuksella katsellaan vetämällä. W/S tai kaasu/jarru liikuttaa eteen ja taakse; A/D, ohjauspainikkeet tai ohjausalue liikuttavat sivuille. WASD toimii myös saunassa. W+D liikuttaa viistosti samalla nopeudella. Hyllyjen läpi ei voi kävellä. **Palaa autoon** tai **E** palauttaa samaan pysäköintipaikkaan. Kierrosaika pysähtyy kaupassa käynnin ajaksi. Valkoinen paneelijulkisivu, punainen Sale-kyltti, sisäänkäynti ja luiska sekä sisätilan hyllyt, kylmäkaapit ja keltainen yläreunus on mallinnettu käyttäjän kuvien perusteella. Tilat ovat tyylitelty tulkinta. Toteutus on tiedostossa `sale.js`.

Saunapakuun pääsee saunomaan ensimmäisen mutkan ulkopuolella. Aja pakun lähelle ja pysähdy (alle 2 km/h), sitten valitse **Mene saunaan** tai paina **E**. Saunassa ämpärin tai kauhan klikkaaminen, napauttaminen tai osoittaminen hiirellä tuo näkyviin **Heitä löylyä** -painikkeen. Painike tai välilyönti käynnistää löylynheiton. Painike pysyy näkyvissä, kunnes valitset muun kohdan tai vaihdat paikkaa. **Palaa autoon** tai **E** palauttaa samaan pysäköintipaikkaan. Kierrosaika on tauolla saunomisen ajan. Saunassa voi katsella vapaasti ympärille vetämällä näkymää hiirellä tai sormella. Nuolinäppäimet tai WASD kääntävät katsetta sivuille sekä ylös ja alas. **Vaihda vastakkaiselle lauteelle** tai **F** siirtää toiselle puolelle ja suuntaa katseen kiukaaseen. Painikkeet toimivat myös puhelimella.


- Puhelin: liu’uta vasenta peukaloa ohjausalueella. Keskellä ratti on suorassa, reunoja kohti ohjaus kasvaa. Oikealla pidä kaasua tai jarrua; ohjaus ja poljin toimivat samanaikaisesti. Molemmat peukaloalueet pysyvät näkyvissä pysty- ja vaaka-asennossa. Ohjaus palautuu keskelle, kun sormen nostaa. Sovelluksen vaihtaminen keskeyttää kierrosajan ja vapauttaa ohjaimet.
- Näppäimistö: nuolinäppäimet tai A/D ohjaukseen, W/ylänuoli kaasuun ja S/alanuoli jarruun.
- Ratti ja polkimet: liitä laitteet ja avaa **Ohjain**. Tallenna keskiasento, ratin ääriasennot, vapautetut polkimet ja kummankin polkimen pohja-asento. Asetukset tallentuvat selaimeen laitteen tunnisteen mukaan.

Ratin tarkka toiminta riippuu laitteesta, ajurista ja selaimesta. Testaa tapahtumapisteen omalla laitteistolla ennen tapahtumaa. Tässä versiossa ei ole voimavastetta.

## Saunan tapahtumat
Saunojat hengittävät, kääntävät päätään ja elehtivät, hörppivät kupeistaan, juttelevat, kertovat juttuja ja osallistuvat saunalauluihin. Pelaajan vieressä istuva saunoja heittää välillä löylyä omalla kädellään ja kauhalla. Ensimmäinen saunoja lähtee vilvoittelemaan noin puolen minuutin jälkeen; tämän jälkeen porukkaa vaihtuu yksi kerrallaan. Hahmot kulkevat alalauteen ja portaiden kautta ovelle, joka avautuu heidän kulkiessaan. Uusilla saunojilla on eri nimet ja vaihtuva ulkonäkö. Pelaajan molemmat istumapaikat pysyvät vapaina. Tiheä löylynheitto kasvattaa kuumuutta: saunojat kommentoivat ensin kunnon löylyjä ja alkavat sitten valittaa kuumuutta. Kovimmissa löylyissä valittanut saunoja nousee, kulkee pihalle vilvoittelemaan ja palaa myöhemmin omalle paikalleen. Kuumuus laskee löylynheiton tauon aikana.

Puheet ja omat lyhyet saunalaulut näkyvät tekstityksinä. **Saunan äänet** ottaa käyttöön selaimen puheäänen ja synteettisen, hyräilyä muistuttavan kolmiäänisen laulumelodian. Suomenkielisen puheäänen saatavuus riippuu selaimesta ja käyttöjärjestelmästä. Ääni on aluksi pois päältä. Saunatapahtumat pysähtyvät ohjainasetuksissa ja taustalla; äänet loppuvat saunasta poistuttaessa.

Saunan toiminnalliset tarkistukset: `node tests/sauna.test.cjs`.

## Ajomalli ja sen rajat

Kaasun nostaminen hidastaa autoa nyt my?s pelillisell? moottorijarrutusavustuksella. Hidastus kasvaa kaasupolkimen vapautuessa ja pehmenee k?velyvauhdissa. Jarruvoima jaetaan akseleille renkaiden pidon mukaan, jotta takarenkaille j?? sivuttaispitoa mutkassa. Avustettu ohjaus rauhoittaa sivuluisua ja kiertymist? voimakkaammin kaasun ollessa vapautettuna; kalibroidun ratin ja analogisen peliohjaimen vakautus perustuu edelleen rengasvoimiin. Varsinainen jarrupoljin hidastaa selv?sti voimakkaammin.

Puiden runkoihin voi törmätä. Näkyvät puut ja niiden törmäysrajat käyttävät samoja sijainti- ja runkomittatietoja. Törmäys tarkistetaan auton koko liikkeen matkalta myös kovassa vauhdissa; puuosumat käyttävät samaa vauriomallia kuin rakennusosumat. Latvus ei ole törmäyseste.

Myös kampuksen ja järvenrannan pysäköidyt autot, saunapaku ja traktori ovat törmäysesteitä. Vinossa olevien ajoneuvojen törmäysrajat seuraavat niiden suuntaa. Ajoneuvo-osumat käyttävät samaa vauriomallia kuin puu- ja rakennusosumat; pysäköidyt ajoneuvot pysyvät paikallaan.

Avustetun ohjauksen täysi kääntö käyttää nyt 90 % pinnan arvioidusta sivuttaispidosta aiemman 75 % sijaan. Ohjauskulmassa huomioidaan myös etu- ja takarenkaiden jäykkyysero. Pelillinen ajonvakautus hillitsee kiertymisnopeuden karkaamista ja suurta sivuluisua näppäimistö-, kosketus- ja kallistusohjauksella; analoginen peliohjain ja kalibroitu ratti käyttävät edelleen rengasvoimiin perustuvaa mallia ilman tätä vakautusta. Liian suurella nopeudella ajettu mutka voi edelleen viedä radan ulkopuolelle.

Näppäimistöohjaus kääntyy pienessä nopeudessa ripeämmin ja suuressa nopeudessa asteittaisemmin. Näppäimen vapauttaminen palauttaa ohjauspyynnön keskelle enintään noin 0,17 sekunnissa. Vastakkaisen suunnan painaminen purkaa ensin aiemman ohjauksen ja alkaa sitten kääntää toiseen suuntaan. Auton kääntymisliike rauhoittuu rengasvoimien kautta; näppäimen vapautus ei pyydä automaattista vastakkaista ohjausta. Samat muutokset koskevat kosketusohjauksen käyttämää avustettua ohjausta. Kalibroidun ratin ohjaus säilyy ennallaan. Ajomallin tarkistukset: `node tests/vehicle.test.cjs`.

`vehicle.js` käyttää dynaamista polkupyörämallia: auton sivuttaisnopeus ja kiertymisnopeus syntyvät renkaiden voimista, ja kaasun tai jarrun käyttö vähentää samanaikaisesti käytettävissä olevaa sivuttaispitoa. Mukana on yksinkertaistettu pitkittäinen painonsiirto, ilmanvastus sekä pienempi pito radan ulkopuolella. Digitaalinen ohjaus pehmenee vauhdin kasvaessa, kun taas kalibroitu ratti antaa analogisen ohjauskulman. Kuljettajan kamera pysyy kiinteästi auton rungossa, jotta keula ja ohjaamo eivät liu’u suhteessa toisiinsa ohjattaessa.

Luistonesto on oletuksena päällä: se leikkaa vetovoimaa, kun takarenkaalle arvioitu sivuttais- ja vetovoiman yhteistarve lähestyy pidon rajaa. Näytön `TC RAJOITTAA TEHOA` kertoo, milloin se puuttuu ajoon. Koska mallissa ei ole pyöränopeusantureita eikä tarkkaa rengasdataa, tämä on arvioitu momentinrajoitin, ei oikean auton luistosuhteeseen perustuvan säätimen kopio. Luistonesto ei voi korjata mutkaan liian suurella nopeudella ajamista.

Rata kiert?? LUT:n kampusta k?ytt?j?n toimittaman karttakuvan reitti? mukaillen. Asfaltti, reunakivet ja rakennukset piirret??n 3D-muotoina. Mukana ovat kampuksen rakennussiivet ja sis?pihat, toimitetun Street View -kuvan perusteella tarkennettu punatiilinen p??sis??nk?ynti ja lasijulkisivu, LUT University -teksti, pys?k?intialue autoineen, lipputangot, valaisimet, pys?kkikatos, kattopaneelit sek? j?rvi ja laiturit. Rakennusten julkisivut ja korkeudet ovat tyyliteltyj? arvioita, eiv?t tarkka digitaalinen kopio. P??sis??nk?ynti? on tarkennettu k?ytt?j?n toimittamasta Street View -kuvasta ja sen kuvauspaikan kartasta. Muiden julkisivujen kuvat auttaisivat tarkentamaan niit?. Kartan mittakaavaa ei ole varmennettu; pelin reitti ei ole todellisen ajoradan tai tapahtuman suunnitelma. Vanhan ovaalin enn?tys s?ilyy selaimessa eri avaimella ja kampusradan enn?tys alkaa erikseen.

Kampus ja reitti ovat tiedostossa `campus.js`. Kaikki paikat k?ytt?v?t samaa karttakoordinaattien muunnosta. Ajomalli k?ytt?? edelleen 10 maailmanyksikk?? metri? kohti, ja rata on 5,4 metri? leve?.

Parametrit (massa, akseliväli, teho, rengaspito, vetotapa) ovat alustavia. Käytettävissä on auton valokuva mutta ei mittaus- tai testidataa, joten peli ei kuvaa juuri LPR Motorsportin auton mitattua suorituskykyä. Kuvan perusteella ohjaamon ulkoasu on muutettu avoimeksi; nykyinen muotoilukonsepti on musta-vihreä. Eturenkaat, vanteet ja ripustuksen osat piirretään nyt 3D-muotoina, ja renkaat kääntyvät sekä pyörivät ajossa. Yksityiskohdat ovat edelleen tulkintaa. Todellinen autokohtainen malli edellyttää vähintään massa- ja akselivälitietoja sekä kiihdytys-, jarrutus- ja mutkatestien dataa.

# Kielen vaihtaminen

Yläpalkin FI/EN-valinnalla voi vaihtaa suomen ja englannin välillä myös kesken kierroksen. Vaihto säilyttää pelitilanteen ja tallentuu selaimeen seuraavaa pelikertaa varten. Käyttöliittymä, ohjeet, kalibrointi ja saunan keskustelut seuraavat valittua kieltä. Saunan puhe käyttää valitun kielen ääntä, jos selain tarjoaa sen.

Käännökset ja muotoiltavat tilaviestit ovat tiedostossa `i18n.js`. Kielenvaihdon testit voi ajaa komennolla `node tests/i18n.test.cjs`.


## Auton muotoilukonsepti

Ajettavan auton ilme yhdistää muotoillun mustan keulan, vihreät tehosteraidat,
tummat hiilikuitua muistuttavat sivukatteet ja ohjaamopinnat sekä LUT / LPR Motorsport
-tekstin. Putkirunko ja turvakaari ovat vihreät. Keula ja ohjaamon sivuseinät liittyvät samaan 3D-korirakenteeseen.
Keulan muodot, sivukatteet ja raidat ovat 3D-geometriaa; ohjaamon pintakuvio ja tunnukset
piirretään paikallisesti ilman ulkoisia kuvatiedostoja. Tämä on opiskelijatiimin
mahdollista viimeisteltyä autoa kuvaava pelikonsepti, ei tiimin hyväksytty väritys.

Muotoilun lähteenä on käyttäjän toimittama **FS_Rules_2027_v1.0.pdf**,
Formula Student Rules 2027 v1.0 (115 sivua). Tarkistetut kohdat: T2.1–T2.2
(s. 20–21), T4.1–T4.3 (s. 35–36), T8.2 (s. 44–45) ja T12 (s. 52).
Uudet katteet ovat eturenkaiden sisäpuolella, niiden alin pinta on 80 mm
korkeudella pelin mittakaavassa, ja keula ulottuu noin 200 mm eturenkaan etureunan
etupuolelle. Keula on alle 350 mm korkea. Sen sivuille jää tilaa T2.1.4:n
kahdelle 75 × 250 mm tarkastusalueelle esimerkiksi vaakasuorassa asennossa,
sivuttaisväleillä −650…−400 mm ja 400…650 mm, korkeudella 0…75 mm.
Ohjaamon aukkoa ei kateta. Muutos ei lisää siipiä tai muuta ajomallin aerodynamiikkaa.

Sivuilla on vaalea LUT UNIVERSITY -teksti mustalla pohjalla pääkaaren edessä.
Kirjainten korkeus on 56 mm; yläreuna on enintään 5 mm sivukatteen yläreunan
alapuolella (T12.3). Kilpailunumeroa ei ole annettu: T12.1:n mukaiset etu- ja
sivunumerot pitää sovittaa tapahtuman antaman numeron mukaan.

Graafinen malli ei varmista todellisen auton sääntökelpoisuutta: muun muassa
kuljettajan ulospääsy, ohjaamomitat, turvakaarien suoja, reunasäteet, rakenteiden
lujuus, takarenkaiden uudet vapaat alueet ja kilpailukohtaiset tunnukset vaativat
erillisen teknisen tarkastuksen. Uusien katteiden mitat koskevat ehjää autoa;
pelin vauriotila ei edusta kilpailuun hyväksyttävää rakennetta.

## Formula Student -ratti

Ratissa on suljettu soikea ulkokehä, ommellut kahvapinnat, hiilikuitua muistuttava
keskilevy, pikairrotuskauluksen havainne ja integroitu näyttö. Näyttö ja säätimet
kääntyvät ratin mukana. Ulkokehän muoto perustuu vuoden 2027 sääntökirjan kohtaan
T2.8.7 (s. 23): kehän pitää olla yhtenäinen ja lähes pyöreä tai soikea ilman
koveria osuuksia. Säätimet pysyvät kehän sisällä.

- **DISP / P** vaihtaa nopeus- ja pitonäkymää. Nopeus on km/h; pitonäkymässä
  näkyvät sivuttaiskiihtyvyys G-yksiköissä ja mallinnettu renkaiden pidon käyttö.
- **DIM / B** vaihtaa näytön normaalin ja himmeän kirkkauden välillä.
- **TC / T** kytkee ajomallin luistoneston päälle tai pois. Uudelleenaloitus palauttaa
  luistoneston päälle. Näytön TC ACTIVE kertoo momentinrajoittimen toiminnasta.

Säätimiä voi klikata tai napauttaa ratista; vastaavat saavutettavat painikkeet ovat
ajonäkymän alla. Kierrosnumero, kierrosaika ja kaasun sekä jarrun ohjauspyynnöt
näkyvät molemmilla näyttösivuilla. LED-palkki kertoo pidon käytöstä, ei kierrosluvusta.
Vaurio, radan ulkopuolelle ajaminen ja auton hajoaminen näkyvät näytön tilarivillä.
Kierrosaika pysähtyy tauoilla ja auton hajotessa. Mallissa ei ole vaihteistoa,
moottorin kierroslukua, akkuvarausta tai lämpötila-antureita; niitä ei esitetä
mitattuina arvoina. Ratin takana näkyvät lavat ovat vain ulkoasun yksityiskohta.

Todellisen ratin toteutuksessa pitää lisäksi tarkistaa T2.8.2:n mekaaninen yhteys,
T2.8.5:n käsineillä käytettävä pikairrotus, T2.8.6:n enintään 250 mm etäisyys
etukaaresta ja T2.8.8:n korkeus suhteessa etukaareen kaikissa ohjausasennoissa.
T4.9 edellyttää säätimien käyttöä ohjaamon sisältä, T4.10 riittävää näkyvyyttä ja
T4.11 alle viiden sekunnin ulospääsyä. Pelin kaksiulotteinen ratti ei todenna
näitä fyysisiä asennus- ja kuljettajavaatimuksia.

Ratin mittarien ja säätimien tarkistukset: `node tests/wheel.test.cjs`.

Keulan kiinnityksen ja ohjauksen regressiotarkistus: `node tests/bodywork.test.cjs`.
Testi varmistaa, että ohjaus muuttaa eturenkaiden geometriaa mutta ei koria, että
keula ja ohjaamon sivut jakavat kiinnitysreunan ja että korin projektio pysyy
kuljettajan näkymässä paikallaan auton suunnan ja G-voimien muuttuessa.
