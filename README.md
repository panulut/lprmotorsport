# LPR Lap Challenge

Tässä kehityshaarassa 3D-peli on yhdistetty palvelimen ajovarmennukseen.
Käynnistä koko paikallinen ketju komennolla `npm run dev:verified` ja avaa
http://127.0.0.1:8000. Kirjoita nimimerkki, hyväksy peli- ja käyttötietojen
kerääminen ja paina **Aloita ajo**. Varmennus valmistellaan automaattisesti.
Kun yhteys toimii, ajo alkaa ilman harjoitteluvaihetta. Jos yhteyttä joudutaan
odottamaan, voi ajaa harjoitteluna. Peli yrittää yhteyttä automaattisesti uudelleen
ja käynnistää virallisen ajon lähtöruudusta heti, kun yhteys on valmis.
Erillistä lähtölaskentaa ei ole. Palvelin laskee ajan ohjaussyötteistä;
erillinen varmennettu tuloslista hyväksyy vain palvelimen allekirjoittamat ajat.
Lentävät jatkokierrokset käyttävät samaa palvelinsessiota.

Myös **Aloita uudelleen** valmistelee varmennuksen automaattisesti. Lentävät
jatkokierrokset säilyvät samassa varmennetussa ajossa.
Harjoittelusta ei lähetetä uusia aikoja vanhalle listalle.
Vanha lista säilyy näkyvissä erikseen ilman varmennusmerkintää. Katkos, pelin
piilottaminen tai ajotilan poikkeama muuttaa varmennetun ajon harjoitteluksi.
Jo allekirjoitettu kierroskuitti jää tarvittaessa lähetysjonoon; saman nimimerkin
vahvistaminen ja tuloslistan automaattinen päivitys yrittävät tallennusta uudelleen.

Ohjeet, luottamusketju, tarkistukset ja vielä tekemätön julkinen käyttöönotto:
[verification/README.md](verification/README.md).

Auton kori, etusiipi ja renkaiden kiinteät sekä pyörivät osat säilytetään
näytönohjaimen muistissa. Ajon aikana päivitetään niiden asennot; jousituksen
muuttuva geometria lasketaan edelleen joka ruudulle. Yksityiskohtia tai
piirtoresoluutiota ei vähennetä. Vauriot ja uudelleenkäynnistys päivittävät
valmiit osat tarvittaessa. Välimuistin, ohjauksen, pyörimisen ja maastokosketuksen
tarkistukset: `npm run test:performance`.

Ajonäkymän ympäristö, rakennusmateriaalit, kanttikivet, tiemerkinnät ja
varjot jaetaan alueisiin. Vain kameran näkymään osuvat alueet lähetetään
piirrettäviksi; näkyvien kohteiden kolmiot ja tekstuurit säilyvät ennallaan.
Liikkuvien ja vaurioituvien esteiden alueet laajenevat niiden mukana.
Sisänäkymät ja vanhat näytönohjaimet käyttävät tarvittaessa koko mallin piirtoa.

Törmäykset vaikuttavat myös osuman kohteeseen. Pysäköidyt autot, traktori,
saunapaku ja täysi palju liikkuvat ja kiertyvät massan sekä osumakohdan mukaan.
Puut taipuvat, seinät halkeilevat ja lohkeilevat, ja ulkona olevat ihmiset
siirtyvät ja kaatuvat osuman voimakkuuden mukaan. Vauriot ja painaumat säilyvät
kierroksen aikana; uudelleenkäynnistys palauttaa kohteet. Malli on pelikäyttöön
tehty yksinkertaistettu impulssi- ja vauriomalli. Fysiikkatestit: `npm run test:physics`.

Pelin äänet käynnistyvät ensimmäisestä näppäimen painalluksesta tai
kosketuksesta. Moottorin ääni seuraa nopeutta ja kaasua; renkaiden luisto,
nurmikko, kanttikivet, törmäykset, kierroksen valmistuminen ja löylynheitto
kuuluvat omina ääninään. Yläpalkin nuottipainike mykistää myös saunan
puheen ja laulun. Ääniasetus säilyy selaimessa. Äänet hiljenevät
tuloslistan ajaksi ja pelin menettäessä kohdistuksen. Äänet tuotetaan
selaimen Web Audio API:lla ilman ladattavia äänitiedostoja.
Äänten toimintatestit: `npm run test:audio`.

## Rataeditori

Avaa erillinen rataeditori osoitteessa `http://localhost:8000/tools/track-editor/editor.html`.
Käynnistä paikallinen palvelin ensin komennolla `npm run dev` tai Windowsissa
kaksoisnapsauttamalla `Kaynnista-peli.cmd`. HTML-tiedostojen avaaminen suoraan
`file://`-osoitteina ei tue projektin tallennusta eikä pelin ratadatan latausta.
Suoraan tiedostona avattu `index.html` ohjaa peliin osoitteeseen
`http://localhost:8000/`, jotta tallennetut rataelementit tulevat mukaan.
Valitse kartio, suojakaide, puu tai laatikko, paina **Lisää kartalle** ja napauta
sijoituspaikkaa. Valitse elementti kartalta tai luettelosta ja siirrä vetämällä.
Sivupaneelissa voit muuttaa metrisijaintia, kiertoa ja kokoa sekä monistaa tai
poistaa elementin. Ruudukkoon kohdistus, zoomaus sekä kumoa ja tee uudelleen
ovat käytettävissä. Tyhjän kartan vetäminen siirtää näkymää.
Rataelementteihin kuuluvat kartiot, suojakaiteet, rengasvallit, rakennukset,
asfalttialueet, puut ja laatikot.
**Rengasvalli** ja **Suojakaide** piirretään vetämällä hiirellä tai sormella.
Veto seuraa mutkia ja sen päät tarttuvat samanlaisen elementin päihin.
Kumoa peruu koko vedon; Esc peruu keskeneräisen vedon.
Sauna, nuotiopaikka, palju ja 22 ulkona olevaa ihmistä näkyvät editorissa
valmiina elementteinä. Valitse kartalta tai luettelosta ja siirrä vetämällä
tai X/Y-kentillä. Sauna ja palju siirtyvät omien sisällä istuvien vieraidensa
kanssa; ulkona olevia numeroituja ihmisiä voi siirtää yksitellen.
Näiden valmiiden kohteiden koko ja suunta ovat kiinteitä.
Valitse **Mäki**, säädä siveltimen leveyttä ja mäen korkeutta ja maalaa
vetämällä. Mäen reuna laskee pehmeästi ympäröivään maastoon. Päällekkäiset
alueet yhdistyvät korkeimman pinnan mukaan. Valitun mäen korkeutta voi
muuttaa myös **Korkeus (m)** -kentästä. Mäet nostavat myös tietä, kanttikiviä
ja tiemerkintöjä; auton renkaat, jousitus ja kamera seuraavat pintaa, ja
painovoima vaikuttaa nousuissa ja laskuissa. Kumoa, Delete ja tallennus
toimivat kuten muillekin lisätyille elementeille.
Valittua elementtiä voi kiertää tarttumalla sen kulmassa olevaan
kiertokuvakkeeseen ja vetämällä, tai kirjoittamalla tarkan
kulman asteina. Rengasvallit ja rakennukset
ovat pelissä törmääviä esteitä; asfalttialue on tasainen ajopinta, joka poistaa
nurmikon pito- ja ajotuntumavaikutuksen alueella.
Valitse **Järvi**, säädä siveltimen leveyttä ja maalaa hiirellä tai sormella
vetämällä. Voit jatkaa nykyistä järveä aloittamalla vedon sen päältä ja
vetämällä reunan yli. Piirtotila pysyy päällä useiden vetojen ajan.
**Kumoa** peruu koko viimeisen vedon; Esc peruu keskeneräisen vedon tai
lopettaa piirtämisen. Hiiren keskipainikkeella voit siirtää karttaa myös
piirtotilassa.
**Asfaltti** toimii samalla tavalla neliösiveltimellä.
**Salli maalaus radan päälle** on oletuksena pois: rata ja kanttikivet
leikataan maalattavan alueen ulkopuolelle. Valinnalla voi sallia asfaltin
myös radalle. Jo valitun asfalttialueen asetusta voi muuttaa sen ominaisuuksista.
Säädä siveltimen leveyttä ja **Kulmien pyöristys** -liukusäädintä: 0 % tekee terävät kulmat,
100 % täysin pyöristetyt. Pyöristys tallentuu alueen mukana ja vaikuttaa
myös pelissä näkyvään asfalttiin sekä ajopinnan pitoon. Vanhat suorakulmaiset
asfalttielementit säilyttävät muotonsa.
Editorissa lisättävät kartiot tallentuvat rataelementteinä ja toimivat
törmäävinä esteinä.
**Tallenna projektiin** tallentaa elementit projektin `data/track-objects.json`-tiedostoon, joka kulkee Gitissä mukana. Peli lukee saman ratadatan 3D-näkymään ja törmäysrajoihin.
Tallennuksen tila näkyy tallennuspainikkeen vieressä. **Rata tallennettu ja
tarkistettu** tarkoittaa, että editori on lukenut kirjoitetun tiedoston
takaisin ja varmistanut sen sisällön. Virheen jälkeen muokkaukset säilyvät
editorissa, ja **Vie JSON** tekee niistä varmuuskopion.
Paikallinen peli tarkistaa tallennetun ratadatan, kun palaat pelin välilehdelle.
Jos rata on muuttunut, sivu latautuu uudelleen ja ajo alkaa alusta uusilla
elementeillä. Julkaistulle sivulle muutokset tulevat uuden julkaisun mukana.
**Vie JSON** ja **Tuo JSON** siirtävät elementit selainten välillä. Tuonti korvaa
editorin nykyiset elementit, ja sen voi kumota. Muokatun radan kierroksia ei
lähetetä verkkotuloslistaan. Editorilla muokataan lisättyjä elementtejä;
kampuksen valmiit rakennukset ja radan reitti toimivat kartan taustana.
Tarkistus: `node tests/track-objects.test.cjs`.

## Jousituksen visualisointi

Korin pystyliike, nyökkäys ja kallistus ratkaistaan jousi- ja vaimennusvoimista ajofysiikan aika-askelissa, ei piirtotaajuudesta tai ennalta määrätystä kallistuskulmasta. Mallissa on neljä 8 kg pyörämassaa, 28 kN/m pyöräjouset, erillinen sisään- ja ulosjouston vaimennus, kallistuksenvakaajat ja joustomatkan rajoittimet. Parametrit ovat arvioita. Korin ja kameran kiertokeskus on painopiste; pyörännavat eivät liiku korin mukana. Iskunvaimentimen varsi ja jousi seuraavat pyöräkohtaisen jouston välityssuhdetta.

Kori kallistuu sivuttaiskiihtyvyyden mukaan ja keula painuu jarrutuksessa sekä nousee kiihdytyksessä. Vaimennettu liike ohjaa kameraa ja koria samalla muunnoksella, joten ohjaamo pysyy yhtenäisenä. Eturenkaat pysyvät tien pinnassa, tukivarret seuraavat pyörän ja korin kiinnityspisteitä ja jousien sekä iskunvaimentimien pituus muuttuu jouston mukana. Uudelleenkäynnistys nollaa liikkeen.

Ajomallissa on pyöräkohtaiset jouset, vaimentimet ja renkaiden pystyjousto alustavilla arvoilla. Kanttikivien noin 6,5 cm korkea pinta ja 45 cm välein toistuvat kohoumat syötetään jokaisen renkaan jousitukseen erikseen. Ajonopeus määrää tärinän taajuuden; kori, kamera ja renkaat seuraavat fyysistä joustoa, ja rengaskuormien vaihtelu vaikuttaa pitoon. Paikallaan oleva auto rauhoittuu myös kanttikivellä. Tarkistukset: `node tests/suspension.test.cjs` ja `node tests/kerb.test.cjs`.

Selainpohjainen Formula Student -henkinen 3D-ajopeli kuljettajan näkökulmasta. Sama peli toimii puhelimen kosketusohjaimilla, tietokoneen näppäimistöllä ja selaimen tunnistamalla ratilla sekä polkimilla. 3D-näkymä käyttää WebGL:ää ilman ulkoisia kirjastoja.

## Käynnistys

Käynnistä projektikansiossa paikallinen kehityspalvelin. Se kuuntelee vain
omaa tietokonetta; editoria ei voi avata lähiverkon toiselta laitteelta:

```powershell
node server.js
```

Avaa peli osoitteessa `http://localhost:8000` ja editori osoitteessa
`http://localhost:8000/tools/track-editor/editor.html`.

## Pelin julkaisu

GitHub Pages julkaisee pelin automaattisesti GitHub Actionsilla. Työnkulku
rakentaa `dist/`-kansion ja julkaisee ainoastaan sen sisällön, joten
editointityökalu, kehityspalvelin ja testit eivät mene pelaajille. Ota tämä
käyttöön kerran repositorion asetuksista: **Settings → Pages → Build and
deployment → Source → GitHub Actions**. Sen jälkeen `main`-haaraan pushaaminen
julkaisee pelin.

Paikallisesti saman pelaajille tarkoitetun paketin voi rakentaa komennolla:

```powershell
npm run build
```

Julkaise aina vain `dist/`-kansion sisältö, älä repositorion juurta. `dist/`
on generoitu ja ohitettu Gitissä. Editorin lähdekoodi ja tallennettu ratadata
säilyvät repositoriossa kehitystä varten. Pelin kierrosajat tallentuvat
käytetyn selaimen omaan tallennustilaan.

## Ohjaus

Kaupan hyllyjen sivut ja päädyt ovat umpinäisiä tuotteiden takaa. Kassapöytä kulkee pitkittäin paluukäytävän suuntaan: liukuhihna on tulopäässä, sen jälkeen lukija ja maksupääte sekä poistumispäässä pakkausalue. Kassalle kuljetaan paluukäytävältä pöydän oikealle puolelle ja siitä uloskäynnille.

Salen sisätilassa on vaalea akustiikkakatto, loistevalaisimet, laattalattian pintavaihtelu ja kalusteiden pehmeät kontaktivarjot. Kassalla näkyvät liukuhihna, viivakoodinlukija, maksupääte ja pakkausalue; sisäänkäynnillä lasiovien heijastukset, kuramatto ja punaiset ostoskorit. Hyllyjen tuotekohtaiset hintalaput ovat pelin kuvitusta, eivät kaupan ajantasaisia hintoja. Sisätila on edelleen tyylitelty tulkinta Skinnarilan Salesta.

Sale Skinnarilaan pääsee pysähtymällä kaupan ovelle kampusradan eteläpuolella ja valitsemalla **Mene Saleen** tai painamalla **E**. Sisällä näkymän klikkaaminen lukitsee hiiren: katse seuraa hiiren liikettä ilman painikkeen pitämistä. Esc vapauttaa hiiren. Kosketuksella katsellaan vetämällä. W/S tai kaasu/jarru liikuttaa eteen ja taakse; A/D, ohjauspainikkeet tai ohjausalue liikuttavat sivuille. WASD toimii myös saunassa. W+D liikuttaa viistosti samalla nopeudella. Hyllyjen läpi ei voi kävellä. **Palaa autoon** tai **E** palauttaa samaan pysäköintipaikkaan. Kierrosaika pysähtyy kaupassa käynnin ajaksi. Valkoinen paneelijulkisivu, punainen Sale-kyltti, sisäänkäynti ja luiska sekä sisätilan hyllyt, kylmäkaapit ja keltainen yläreunus on mallinnettu käyttäjän kuvien perusteella. Tilat ovat tyylitelty tulkinta. Toteutus on tiedostossa `sale.js`.

Saunapakuun pääsee saunomaan ensimmäisen mutkan ulkopuolella. Aja pakun lähelle ja pysähdy (alle 2 km/h), sitten valitse **Mene saunaan** tai paina **E**. Saunassa ämpärin tai kauhan klikkaaminen, napauttaminen tai osoittaminen hiirellä tuo näkyviin **Heitä löylyä** -painikkeen. Painike tai välilyönti käynnistää löylynheiton. Painike pysyy näkyvissä, kunnes valitset muun kohdan tai vaihdat paikkaa. **Palaa autoon** tai **E** palauttaa samaan pysäköintipaikkaan. Kierrosaika on tauolla saunomisen ajan. Saunassa voi katsella vapaasti ympärille vetämällä näkymää hiirellä tai sormella. Nuolinäppäimet tai WASD kääntävät katsetta sivuille sekä ylös ja alas. **Vaihda vastakkaiselle lauteelle** tai **F** siirtää toiselle puolelle ja suuntaa katseen kiukaaseen. Painikkeet toimivat myös puhelimella.


- Puhelin: liu’uta vasenta peukaloa ohjausalueella. Keskellä ratti on suorassa, reunoja kohti ohjaus kasvaa. Oikealla pidä kaasua tai jarrua; ohjaus ja poljin toimivat samanaikaisesti. Molemmat peukaloalueet pysyvät näkyvissä pysty- ja vaaka-asennossa. Ohjaus palautuu keskelle, kun sormen nostaa. Sovelluksen vaihtaminen keskeyttää kierrosajan ja vapauttaa ohjaimet.
- Näppäimistö: nuolinäppäimet tai A/D ohjaukseen, W/ylänuoli kaasuun ja S/alanuoli jarruun.


## Saunan tapahtumat
Saunojat hengittävät, kääntävät päätään ja elehtivät, hörppivät kupeistaan, juttelevat, kertovat juttuja ja osallistuvat saunalauluihin. Pelaajan vieressä istuva saunoja heittää välillä löylyä omalla kädellään ja kauhalla. Ensimmäinen saunoja lähtee vilvoittelemaan noin puolen minuutin jälkeen; tämän jälkeen porukkaa vaihtuu yksi kerrallaan. Hahmot kulkevat alalauteen ja portaiden kautta ovelle, joka avautuu heidän kulkiessaan. Uusilla saunojilla on eri nimet ja vaihtuva ulkonäkö. Pelaajan molemmat istumapaikat pysyvät vapaina. Tiheä löylynheitto kasvattaa kuumuutta: saunojat kommentoivat ensin kunnon löylyjä ja alkavat sitten valittaa kuumuutta. Kovimmissa löylyissä valittanut saunoja nousee, kulkee pihalle vilvoittelemaan ja palaa myöhemmin omalle paikalleen. Kuumuus laskee löylynheiton tauon aikana.

Puheet ja omat lyhyet saunalaulut näkyvät tekstityksinä. **Saunan äänet** ottaa käyttöön selaimen puheäänen ja synteettisen, hyräilyä muistuttavan kolmiäänisen laulumelodian. Suomenkielisen puheäänen saatavuus riippuu selaimesta ja käyttöjärjestelmästä. Ääni on aluksi pois päältä. Saunatapahtumat pysähtyvät ohjainasetuksissa ja taustalla; äänet loppuvat saunasta poistuttaessa.

Saunan toiminnalliset tarkistukset: `node tests/sauna.test.cjs`.

## Ajomalli ja sen rajat

Neulansilmäohjaus: ohjaamon ratti seuraa toteutunutta ohjauskulmaa kiinteällä välityksellä ja kääntyy enintään ±120°. Polkupyörämallin enimmäiskulma on 27°, jolloin geometrinen takakselin keskipisteen kääntösäde on noin 3 m. Näkyvät etupyörät käyttävät akselivälistä ja raideleveydestä laskettuja Ackermann-kulmia: sisäpyörä kääntyy enemmän kuin ulkopyörä. Ajofysiikka käyttää edelleen yhdistettyä etuakselin rengasmallia. Ohjauskulmat ja välitys ovat alustavia pelin säätöarvoja, eivät mitattua ohjausgeometriaa. Kädet kiertyvät otteen ympärillä suuremmilla rattikulmilla. Tarkistukset: `node tests/wheel.test.cjs`, `node tests/vehicle.test.cjs`, `node tests/bodywork.test.cjs` ja `node tests/vehicle-mesh-cache.test.cjs`.

Ohjaus ei enää aktivoi automaattista mutkajarrutusta. Kaasu pohjassa ilman jarrupolkimen painamista jarruvoima on nolla myös täydellä ohjauksella. Kaarteen nopeus ja säde määräytyvät rengasvoimista, käytettävissä olevasta vedosta ja ajovastuksista; liian suuri nopeus kasvattaa kääntösädettä. Ohjausavustus ja luistonesto ovat edelleen käytössä. Tarkistus: `node tests/vehicle.test.cjs`.

Jarrutuksen ja kaarreajon yhteispito käyttää nyt molemmilla akseleilla samaa voimaympyrää: rengasmallin sivuttaisvoima ja pitkittäisvoima skaalataan yhdessä, jos niiden yhteistarve ylittää akselin pidon. Aiemmin jarruvoima sai etusijan ja saattoi poistaa eturenkaiden sivuttaisvoiman kokonaan. Ohjaaminen jarrutuksessa vähentää nyt saatavaa jarruvoimaa, eikä auton kiertymistä pakoteta. Etupyörien voimat muunnetaan ohjauskulman mukaan auton koordinaatistoon, myös jarruvoiman sivuttaiskomponentti. Tämä on yksinkertaistettu yhdistetyn luiston malli, ei mitattuun rengasdataan tai pyörien luistosuhteeseen perustuva ABS. Takarenkaiden sivuttaispitoa säästävä jarruvoiman jako on edelleen avustus.

Jarru–ohjaus-vertailu: `node tests/brake-steering-comparison.cjs`. Testi aloittaa 72 km/h nopeudesta, muodostaa maltillisen kaarteen ja jarruttaa siinä puoli sekuntia paineilla 0, 25, 50, 75 ja 100 %. Nopeutta ei pakoteta jarrutuksen aikana. Avustetun ohjauksen pyyntö on 0,5 ja suoran ratin 0,07; ohjaustapoja arvioidaan erikseen. Tulokset ovat `tests/brake-steering-before.json` ja `tests/brake-steering-after.json`; aiempi rengaslaskenta voidaan toistaa valitsimella `--legacy-tires`. Tarkistukset: `node tests/brake-steering.test.cjs`, `node tests/braking.test.cjs` ja `node tests/yaw-forces.test.cjs`.

Ajovauhdissa kiertymisen muutos syntyy akselien rengasvoimien momentista. Hitaassa ajossa (alle 1,5 m/s) k?ytet??n kinemaattista mallia. N?pp?imist?n, kosketuksen ja peliohjaimen sivuttaisnopeuden vakautus sek? moottorijarrutusapu ovat edelleen k?yt?ss?, joten ajomalli on avustettu ja yksinkertaistettu.

Toistettava vertailu: `node tests/corner-comparison.cjs`. Lähtönopeus on 15 m/s, analoginen ohjauspyyntö 0,5 kahden sekunnin ajan ja sen jälkeen keskitys sekunniksi. Nopeus kehittyy vapaasti; kaasupyynnöt ovat 0, 0,4 ja 1 sekä avustetulla että suoralla rattiohjauksella. Ohjauspyyntö on sama, mutta ohjauskulma eroaa ohjaustapojen välillä. Näytteet sisältävät ajolinjan, nopeuden, kiertymisnopeuden, sivuluisukulman ja akselien sivuttaisvoimat. Ennen–jälkeen-tulokset ovat tiedostoissa `tests/corner-before.json` ja `tests/corner-after.json`. Momenttiin perustuva kiertyminen tarkistetaan komennolla `node tests/yaw-forces.test.cjs`.

Kaasun nostaminen hidastaa autoa nyt my?s pelillisell? moottorijarrutusavustuksella. Hidastus kasvaa kaasupolkimen vapautuessa ja pehmenee k?velyvauhdissa. Jarruvoima jaetaan akseleille renkaiden pidon mukaan, jotta takarenkaille j?? sivuttaispitoa mutkassa. Avustettu ohjaus rauhoittaa sivuluisua ja kiertymist? voimakkaammin kaasun ollessa vapautettuna; analogisen peliohjaimen vakautus perustuu edelleen rengasvoimiin. Varsinainen jarrupoljin hidastaa selv?sti voimakkaammin.

Puiden runkoihin voi törmätä. Näkyvät puut ja niiden törmäysrajat käyttävät samoja sijainti- ja runkomittatietoja. Törmäys tarkistetaan auton koko liikkeen matkalta myös kovassa vauhdissa; puuosumat käyttävät samaa vauriomallia kuin rakennusosumat. Latvus ei ole törmäyseste.

Myös kampuksen ja järvenrannan pysäköidyt autot, saunapaku ja traktori ovat törmäysesteitä. Vinossa olevien ajoneuvojen törmäysrajat seuraavat niiden suuntaa. Ajoneuvo-osumat käyttävät samaa vauriomallia kuin puu- ja rakennusosumat; pysäköidyt ajoneuvot pysyvät paikallaan.

Näppäimistö, kosketus ja peliohjaimen tatti pyytävät ohjauskulmaa. Vauhdissa pienet pyynnöt pehmenevät progressiivisella vastekäyrällä, mutta täysi pyyntö saavuttaa aina koko 27° ohjausliikkeen ja ohjaamon ±120° rattikulman. Nopeus tai pintapito ei enää pienennä enimmäiskulmaa. Liiallinen kääntö ylittää renkaiden hyödyllisen luistokulman: sivuttaisvoima pienenee asteittain kohti 55 %:n liukupitoarviota samalla käyrällä molemmilla akseleilla. Tämä on alustava pelisäätö, ei mitattu rengaskäyrä. Kalibroitu ratti käyttää lineaarista ohjausvastetta. Tarkistus: `node tests/steering-lock.test.cjs`.

Ohjaus reagoi aiempaa nopeammin ja palautuu keskelle noin 0,13 sekunnissa. Pitkä, voimakas ohjauspyyntö lisää jarrutusapua: täysi ohjaus tavoittelee noin 50 km/h mutkanopeutta. Pienet korjaukset eivät rajoita suoranopeutta. Apu perustuu kuljettajan ohjaukseen, ei radan seuraamiseen. Rattiin nopeusapu ei vaikuta. Ajomallin tarkistukset: `node tests/vehicle.test.cjs`.

`vehicle.js` käyttää dynaamista polkupyörämallia: auton sivuttaisnopeus ja kiertymisnopeus syntyvät renkaiden voimista, ja kaasun tai jarrun käyttö vähentää samanaikaisesti käytettävissä olevaa sivuttaispitoa. Mukana on yksinkertaistettu pitkittäinen painonsiirto, ilmanvastus sekä pienempi pito radan ulkopuolella. Digitaalinen ohjaus pehmenee vauhdin kasvaessa, ja peliohjaimen tatti käyttää samaa nopeuden mukaan säätyvää ohjausmallia. Kuljettajan kamera pysyy kiinteästi auton rungossa, jotta keula ja ohjaamo eivät liu’u suhteessa toisiinsa ohjattaessa.

Luistonesto on oletuksena päällä: se leikkaa vetovoimaa, kun takarenkaalle arvioitu sivuttais- ja vetovoiman yhteistarve lähestyy pidon rajaa. Näytön `TC RAJOITTAA TEHOA` kertoo, milloin se puuttuu ajoon. Koska mallissa ei ole pyöränopeusantureita eikä tarkkaa rengasdataa, tämä on arvioitu momentinrajoitin, ei oikean auton luistosuhteeseen perustuvan säätimen kopio. Luistonesto ei voi korjata mutkaan liian suurella nopeudella ajamista.

Rata kiert?? LUT:n kampusta k?ytt?j?n toimittaman karttakuvan reitti? mukaillen. Asfaltti, reunakivet ja rakennukset piirret??n 3D-muotoina. Mukana ovat kampuksen rakennussiivet ja sis?pihat, toimitetun Street View -kuvan perusteella tarkennettu punatiilinen p??sis??nk?ynti ja lasijulkisivu, LUT University -teksti, pys?k?intialue autoineen, lipputangot, valaisimet, pys?kkikatos, kattopaneelit sek? j?rvi ja laiturit. Rakennusten julkisivut ja korkeudet ovat tyyliteltyj? arvioita, eiv?t tarkka digitaalinen kopio. P??sis??nk?ynti? on tarkennettu k?ytt?j?n toimittamasta Street View -kuvasta ja sen kuvauspaikan kartasta. Muiden julkisivujen kuvat auttaisivat tarkentamaan niit?. Kartan mittakaavaa ei ole varmennettu; pelin reitti ei ole todellisen ajoradan tai tapahtuman suunnitelma. Vanhan ovaalin enn?tys s?ilyy selaimessa eri avaimella ja kampusradan enn?tys alkaa erikseen.

Kampus ja reitti ovat tiedostossa `campus.js`. Kaikki paikat k?ytt?v?t samaa karttakoordinaattien muunnosta. Ajomalli k?ytt?? edelleen 10 maailmanyksikk?? metri? kohti, ja rata on 6,6 metri? leve?.

Parametrit (massa, akseliväli, teho, rengaspito, vetotapa) ovat alustavia. Käytettävissä on auton valokuva mutta ei mittaus- tai testidataa, joten peli ei kuvaa juuri LPR Motorsportin auton mitattua suorituskykyä. Kuvan perusteella ohjaamon ulkoasu on muutettu avoimeksi; nykyinen muotoilukonsepti on musta-vihreä. Eturenkaat, vanteet ja ripustuksen osat piirretään nyt 3D-muotoina, ja renkaat kääntyvät sekä pyörivät ajossa. Yksityiskohdat ovat edelleen tulkintaa. Todellinen autokohtainen malli edellyttää vähintään massa- ja akselivälitietoja sekä kiihdytys-, jarrutus- ja mutkatestien dataa.

Jarrujen enimmäisvoima on 4500 N, ja voima jaetaan akselien käytettävissä olevan pidon mukaan. Jarru vähentää kaasun vetovoimaa, joten kaasun pitäminen pohjassa ei heikennä täyttä jarrutusta. Simulaatiotestissä suora pysähtyminen kuivalla asfaltilla nopeudesta 100 km/h kestää noin 1,76 sekuntia ja 24 metriä. Nurmella pysähtymismatka on pidempi. Tarkistukset: `node tests/braking.test.cjs`.

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

## Verkkotuloslista

Yl?palkin ?? avaa suoraan tuloslistan ja nimimerkin valinnan. Ratin ja polkimien kalibrointi on poistettu. K?ytt??notto: [cloudflare/README.md](cloudflare/README.md).

Saunapakun ulkomallissa on referenssivalokuvasta perspektiivikorjattu kylkimaalaus (`assets/sauna-reference.jpg`), py?re? savupiippu, yksityiskohtaiset ter?svanteet, ikkunatiivisteet, peilit, pyyhkij?t ja etus?leikk?. Kylkitekstuuri latautuu paikallisesti; ennen latautumista n?kyy geometrinen varamaalaus. Molemmat kyljet k?ytt?v?t samaa referenssin n?kyv?? kylke?.


Auton mitat ja massa ovat yhteisess? `shared/vehicle-spec.js`-tiedostossa: 450 kg sis?lt?? 80 kg kuljettajan (auto ilman kuljettajaa 370 kg), akseliv?li 1525 mm, raideleveys 1472 mm, kokonaispituus 2900 mm ja kokonaiskorkeus 1300 mm. Korin konseptimalli on sovitettu n?ihin ulkomittoihin. Kaikki nelj? py?r?? ja t?rm?yspinnat k?ytt?v?t samoja akselipaikkoja kuin fysiikka. Vanteet ovat nimelliskooltaan OZ Racing 13 ? 7 tuumaa ja renkaat Hoosier 20.5 ? 7?13 tuumaa (nimellinen ulkohalkaisija 520,7 mm, leveys 177,8 mm ja vannehalkaisija 330,2 mm). OZ:n tarkkaa vannemallia eik? Hoosierin seosta ole m??ritetty.

Pelin voimansiirron suunnittelutavoite on yksi EMRAX 208 -luokan sähkömoottori, takaveto (kaksi vetävää takapyörää), 60 kW:n mekaaninen huipputeho ja 140 Nm:n huippuvääntö. Nämä ovat peliä varten valittuja tavoitearvoja, jotka korvaavat mekaniikkasuunnittelun aiemmin antamat 14 kW / 80 Nm. Ne eivät ole vahvistetun oikean auton arvoja. Vertailukohtana [EMRAX 208:n valmistajan tiedot](https://emrax.com/wp-content/uploads/2022/11/EMRAX_208_datasheet_A00.pdf) ilmoittavat 86 kW:n huipputehon, 150 Nm:n huippuväännön ja 7000 r/min kierroslukurajan. Jatkuva teho riippuu jäähdytyksestä; peli ei vielä simuloi lämpenemistä tai akun varaustilaa. Painojakauma on tiimin mukaan lähellä 50/50; pelissä käytetään alustavasti tasan 50/50-jakaumaa. Arvot ovat yhteisessä `shared/vehicle-spec.js`-tiedostossa.

Pelimallin alustavat arviot ovat yksivaihteinen 6:1-välitys, mekaanisen voimansiirron 95 % hyötysuhde ja moottorin sekä invertterin yhteinen 90 % hyötysuhde. [FSG 2026 -sääntöjen](https://www.formulastudent.de/fileadmin/user_upload/all/2026/rules/FS-Rules_2026_v1.1.pdf#page=82) EV2.2.1 rajoittaa akuston ulostulotehon 80 kW:iin. Malli rajoittaa tehon tämän mukaan ennen mekaanisia häviöitä: 60 kW:n moottoriteho tarvitsee arviolta 66,7 kW akustolta ja tuottaa 57 kW renkaille. Vetovoima on enintään noin 3065 N yhteensä taka-akselilla ennen pitorajoituksia. Yksinkertainen vääntö-/tehoraja vähentää vääntöä nopeuden kasvaessa; 7000 r/min kierroslukuraja ja rengaskoko rajoittavat nopeuden noin 114,5 km/h:iin. Todellinen toteutettavuus edellyttää sopivan moottorin, invertterin, akun, välityksen ja jäähdytyksen mitoitusta. Sääntöjen muita sähkö- ja turvallisuusvaatimuksia ei validoida pelissä.

Jousitustyyppi on vahvistettu push rod. Nykyinen kuvamalli sisältää työntötangot ja korin sisäpuoliset jousi-vaimenninelementit; fysiikka käyttää pyörälle muunnettuja jousi- ja vaimennusarvoja. Tarkkaa kinematiikkaa, jousijäykkyyksiä, vaimennuksia tai liikesuhdetta ei ole annettu, joten ne ovat edelleen arvioita (liikesuhde 0,70). Myös painopisteen korkeus 290 mm, jarruvoima 4500 N ja pito ovat pelimallin arvioita. Kokonaiskorkeus ei määritä painopisteen korkeutta. Hitausmomentit ja renkaiden sivuttaisjäykkyydet on suhteutettu massaan ja mittoihin. Renkaiden koko vastaa annettua nimelliskokoa; tarkat asennetut mitat ja rengasvoimat vaativat rengasdataa. Tarkistukset: `npm run test:physics`, `node tests/vehicle-dimensions.test.cjs`, `node tests/braking.test.cjs` ja `node tests/kerb.test.cjs`.

## Pelianalytiikka

Aloitusnäkymässä hyväksytään nimimerkkiin yhdistetyn pelihistorian tallennus
90 päiväksi ennen pelaamista. Ilman hyväksyntää ajo ei ala eikä analytiikkaa lähetetä.
Tiedot-linkistä voi lukea lisätietoja ja poistaa oman analytiikkaprofiilin;
samassa kohdassa valinnan poistaminen lopettaa keräyksen ja keskeyttää ajon.
Ylläpidon suojattu raportti ja palvelimen käyttöönotto:
[cloudflare/README.md](cloudflare/README.md#vapaaehtoinen-pelianalytiikka-20102026).
Testit: `npm run test:analytics`.
