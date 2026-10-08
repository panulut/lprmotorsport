# LPR Lap Challenge

Selainpohjainen Formula Student -henkinen 3D-ajopeli kuljettajan näkökulmasta. Sama peli toimii puhelimen kosketusohjaimilla, tietokoneen näppäimistöllä ja selaimen tunnistamalla ratilla sekä polkimilla. 3D-näkymä käyttää WebGL:ää ilman ulkoisia kirjastoja.

## Käynnistys

Käynnistä projektikansiossa paikallinen palvelin:

```powershell
node server.js
```

Avaa tietokoneella `http://localhost:8000`. Puhelimella voit avata `http://TIETOKONEEN-LÄHIVERKKO-OSOITE:8000`, kun molemmat laitteet ovat samassa verkossa ja palomuuri sallii yhteyden. Julkista käyttöä varten sijoita tiedostot HTTPS-palvelimelle. Pelin kierrosajat tallentuvat vain käytetyn selaimen omaan tallennustilaan.

## Ohjaus

- Puhelin: liu’uta vasenta peukaloa ohjausalueella. Keskellä ratti on suorassa, reunoja kohti ohjaus kasvaa. Oikealla pidä kaasua tai jarrua; ohjaus ja poljin toimivat samanaikaisesti. Molemmat peukaloalueet pysyvät näkyvissä pysty- ja vaaka-asennossa. Ohjaus palautuu keskelle, kun sormen nostaa. Sovelluksen vaihtaminen keskeyttää kierrosajan ja vapauttaa ohjaimet.
- Näppäimistö: nuolinäppäimet tai A/D ohjaukseen, W/ylänuoli kaasuun ja S/alanuoli jarruun.
- Ratti ja polkimet: liitä laitteet ja avaa **Ohjain**. Tallenna keskiasento, ratin ääriasennot, vapautetut polkimet ja kummankin polkimen pohja-asento. Asetukset tallentuvat selaimeen laitteen tunnisteen mukaan.

Ratin tarkka toiminta riippuu laitteesta, ajurista ja selaimesta. Testaa tapahtumapisteen omalla laitteistolla ennen tapahtumaa. Tässä versiossa ei ole voimavastetta.

## Ajomalli ja sen rajat

`vehicle.js` käyttää dynaamista polkupyörämallia: auton sivuttaisnopeus ja kiertymisnopeus syntyvät renkaiden voimista, ja kaasun tai jarrun käyttö vähentää samanaikaisesti käytettävissä olevaa sivuttaispitoa. Mukana on yksinkertaistettu pitkittäinen painonsiirto, ilmanvastus sekä pienempi pito radan ulkopuolella. Digitaalinen ohjaus pehmenee vauhdin kasvaessa, kun taas kalibroitu ratti antaa analogisen ohjauskulman. Ohjaamossa näkyvä liike reagoi hidastuvuuteen, sivuttaiskiihtyvyyteen ja radan ulkopuolella ajamiseen.

Luistonesto on oletuksena päällä: se leikkaa vetovoimaa, kun takarenkaalle arvioitu sivuttais- ja vetovoiman yhteistarve lähestyy pidon rajaa. Näytön `TC RAJOITTAA TEHOA` kertoo, milloin se puuttuu ajoon. Koska mallissa ei ole pyöränopeusantureita eikä tarkkaa rengasdataa, tämä on arvioitu momentinrajoitin, ei oikean auton luistosuhteeseen perustuvan säätimen kopio. Luistonesto ei voi korjata mutkaan liian suurella nopeudella ajamista.

Harjoitusrata on noin 220 metriä pitkä ja 5,4 metriä leveä. Radan ensimmäisessä versiossa oli noin 4 metrin säteinen mutka, joka vaati jo 30 km/h nopeudessa yli 1,6 g sivuttaiskiihtyvyyden. Nykyisen radan tiukin kaarresäde on noin 33 metriä. Puhelimen ja näppäimistön painikkeet pyytävät kääntymisnopeutta ja ohjausapu säätää etupyörän kulmaa auton vasteen mukaan; ratin ohjaus pysyy analogisena.

Parametrit (massa, akseliväli, teho, rengaspito, vetotapa) ovat alustavia. Käytettävissä on auton valokuva mutta ei mittaus- tai testidataa, joten peli ei kuvaa juuri LPR Motorsportin auton mitattua suorituskykyä. Kuvan perusteella ohjaamon ulkoasu on muutettu avoimeksi ja siniputkiseksi. Eturenkaat, vanteet ja ripustuksen osat piirretään nyt 3D-muotoina, ja renkaat kääntyvät sekä pyörivät ajossa. Yksityiskohdat ovat edelleen tulkintaa. Todellinen autokohtainen malli edellyttää vähintään massa- ja akselivälitietoja sekä kiihdytys-, jarrutus- ja mutkatestien dataa.

