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

Puhelimella voit valita **Kallistusohjaus**-painikkeen. Pidä puhelin mukavassa ajoasennossa ja hyväksy iPhonen liikeanturilupa. Ensimmäinen anturilukema tallentaa keskiasennon; **Keskitä** tallentaa sen uudelleen. Kallista vasemmalle tai oikealle ja käytä kosketuspainikkeita kaasuun ja jarruun. Ohjaus toimii pysty- ja vaaka-asennossa. Näytön käännön tai taustalta palaamisen jälkeen keskiasento tallennetaan uudelleen. Samasta painikkeesta voi palata kosketusohjaukseen. Anturit tarvitsevat HTTPS-yhteyden: tavallinen puhelimella avattu lähiverkon HTTP-osoite ei riitä.

- Puhelin: liu’uta vasenta peukaloa ohjausalueella. Keskellä ratti on suorassa, reunoja kohti ohjaus kasvaa. Oikealla pidä kaasua tai jarrua; ohjaus ja poljin toimivat samanaikaisesti. Molemmat peukaloalueet pysyvät näkyvissä pysty- ja vaaka-asennossa. Ohjaus palautuu keskelle, kun sormen nostaa. Sovelluksen vaihtaminen keskeyttää kierrosajan ja vapauttaa ohjaimet.
- Näppäimistö: nuolinäppäimet tai A/D ohjaukseen, W/ylänuoli kaasuun ja S/alanuoli jarruun.
- Ratti ja polkimet: liitä laitteet ja avaa **Ohjain**. Tallenna keskiasento, ratin ääriasennot, vapautetut polkimet ja kummankin polkimen pohja-asento. Asetukset tallentuvat selaimeen laitteen tunnisteen mukaan.

Ratin tarkka toiminta riippuu laitteesta, ajurista ja selaimesta. Testaa tapahtumapisteen omalla laitteistolla ennen tapahtumaa. Tässä versiossa ei ole voimavastetta.

## Saunan tapahtumat
Saunojat hengittävät, kääntävät päätään ja elehtivät, hörppivät kupeistaan, juttelevat, kertovat juttuja ja osallistuvat saunalauluihin. Pelaajan vieressä istuva saunoja heittää välillä löylyä omalla kädellään ja kauhalla. Ensimmäinen saunoja lähtee vilvoittelemaan noin puolen minuutin jälkeen; tämän jälkeen porukkaa vaihtuu yksi kerrallaan. Hahmot kulkevat alalauteen ja portaiden kautta ovelle, joka avautuu heidän kulkiessaan. Uusilla saunojilla on eri nimet ja vaihtuva ulkonäkö. Pelaajan molemmat istumapaikat pysyvät vapaina. Tiheä löylynheitto kasvattaa kuumuutta: saunojat kommentoivat ensin kunnon löylyjä ja alkavat sitten valittaa kuumuutta. Kovimmissa löylyissä valittanut saunoja nousee, kulkee pihalle vilvoittelemaan ja palaa myöhemmin omalle paikalleen. Kuumuus laskee löylynheiton tauon aikana.

Puheet ja omat lyhyet saunalaulut näkyvät tekstityksinä. **Saunan äänet** ottaa käyttöön selaimen puheäänen ja synteettisen, hyräilyä muistuttavan kolmiäänisen laulumelodian. Suomenkielisen puheäänen saatavuus riippuu selaimesta ja käyttöjärjestelmästä. Ääni on aluksi pois päältä. Saunatapahtumat pysähtyvät ohjainasetuksissa ja taustalla; äänet loppuvat saunasta poistuttaessa.

Saunan toiminnalliset tarkistukset: `node tests/sauna.test.cjs`.

## Ajomalli ja sen rajat

`vehicle.js` käyttää dynaamista polkupyörämallia: auton sivuttaisnopeus ja kiertymisnopeus syntyvät renkaiden voimista, ja kaasun tai jarrun käyttö vähentää samanaikaisesti käytettävissä olevaa sivuttaispitoa. Mukana on yksinkertaistettu pitkittäinen painonsiirto, ilmanvastus sekä pienempi pito radan ulkopuolella. Digitaalinen ohjaus pehmenee vauhdin kasvaessa, kun taas kalibroitu ratti antaa analogisen ohjauskulman. Ohjaamossa näkyvä liike reagoi hidastuvuuteen, sivuttaiskiihtyvyyteen ja radan ulkopuolella ajamiseen.

Luistonesto on oletuksena päällä: se leikkaa vetovoimaa, kun takarenkaalle arvioitu sivuttais- ja vetovoiman yhteistarve lähestyy pidon rajaa. Näytön `TC RAJOITTAA TEHOA` kertoo, milloin se puuttuu ajoon. Koska mallissa ei ole pyöränopeusantureita eikä tarkkaa rengasdataa, tämä on arvioitu momentinrajoitin, ei oikean auton luistosuhteeseen perustuvan säätimen kopio. Luistonesto ei voi korjata mutkaan liian suurella nopeudella ajamista.

Rata kiert?? LUT:n kampusta k?ytt?j?n toimittaman karttakuvan reitti? mukaillen. Asfaltti, reunakivet ja rakennukset piirret??n 3D-muotoina. Mukana ovat kampuksen rakennussiivet ja sis?pihat, toimitetun Street View -kuvan perusteella tarkennettu punatiilinen p??sis??nk?ynti ja lasijulkisivu, LUT University -teksti, pys?k?intialue autoineen, lipputangot, valaisimet, pys?kkikatos, kattopaneelit sek? j?rvi ja laiturit. Rakennusten julkisivut ja korkeudet ovat tyyliteltyj? arvioita, eiv?t tarkka digitaalinen kopio. P??sis??nk?ynti? on tarkennettu k?ytt?j?n toimittamasta Street View -kuvasta ja sen kuvauspaikan kartasta. Muiden julkisivujen kuvat auttaisivat tarkentamaan niit?. Kartan mittakaavaa ei ole varmennettu; pelin reitti ei ole todellisen ajoradan tai tapahtuman suunnitelma. Vanhan ovaalin enn?tys s?ilyy selaimessa eri avaimella ja kampusradan enn?tys alkaa erikseen.

Kampus ja reitti ovat tiedostossa `campus.js`. Kaikki paikat k?ytt?v?t samaa karttakoordinaattien muunnosta. Ajomalli k?ytt?? edelleen 10 maailmanyksikk?? metri? kohti, ja rata on 5,4 metri? leve?.

Parametrit (massa, akseliväli, teho, rengaspito, vetotapa) ovat alustavia. Käytettävissä on auton valokuva mutta ei mittaus- tai testidataa, joten peli ei kuvaa juuri LPR Motorsportin auton mitattua suorituskykyä. Kuvan perusteella ohjaamon ulkoasu on muutettu avoimeksi ja siniputkiseksi. Eturenkaat, vanteet ja ripustuksen osat piirretään nyt 3D-muotoina, ja renkaat kääntyvät sekä pyörivät ajossa. Yksityiskohdat ovat edelleen tulkintaa. Todellinen autokohtainen malli edellyttää vähintään massa- ja akselivälitietoja sekä kiihdytys-, jarrutus- ja mutkatestien dataa.

# Kielen vaihtaminen

Yläpalkin FI/EN-valinnalla voi vaihtaa suomen ja englannin välillä myös kesken kierroksen. Vaihto säilyttää pelitilanteen ja tallentuu selaimeen seuraavaa pelikertaa varten. Käyttöliittymä, ohjeet, kalibrointi ja saunan keskustelut seuraavat valittua kieltä. Saunan puhe käyttää valitun kielen ääntä, jos selain tarjoaa sen.

Käännökset ja muotoiltavat tilaviestit ovat tiedostossa `i18n.js`. Kielenvaihdon testit voi ajaa komennolla `node tests/i18n.test.cjs`.
