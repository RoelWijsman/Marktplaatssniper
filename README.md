# Marktplaats Sniper

Vul een zoekterm, je postcode, een maximale afstand en een maximale prijs in. Verschijnt er op Marktplaats.nl een **nieuwe** advertentie die past, dan staat die binnen een minuut in je browser, met foto, prijskaartje, plaats, afstand, omschrijving en een link naar de advertentie.

De monitor draait op je eigen laptop. Met een of meer **proxy's** ziet Marktplaats niet jouw IP-adres maar dat van de proxy.

Gebouwd met Next.js. De monitor draait in hetzelfde proces als de webpagina.

---

## 1. Starten op Windows

Dubbelklik op **`start-windows.bat`**. Het script:

1. installeert Node.js als dat nog niet op je laptop staat (via winget);
2. installeert de benodigde pakketten;
3. bouwt de app (de eerste keer, en na elke wijziging aan de code; dat duurt ongeveer een minuut);
4. start de app en opent **http://localhost:3000** in je browser.

Laat het zwarte venster open: sluit je het, dan stopt de sniper. In slaapstand wordt er ook niet gecheckt.

> Automatisch starten met Windows: druk op `Win + R`, typ `shell:startup` en zet daar een snelkoppeling naar `start-windows.bat`.

### Mac / Linux

```bash
npm install
npm run build
npm start
```

Open daarna http://localhost:3000.

---

## 2. Proxy's instellen

Zonder proxy gaan de checks via je eigen internetverbinding, en ziet Marktplaats dus jouw IP-adres. De app laat dat in rood zien.

1. Klik bovenaan op **Eigen IP zichtbaar**, of bij Proxy's op **Toevoegen**.
2. Zet er een of meer proxy's in, één per regel:

   ```
   http://gebruiker:wachtwoord@185.10.20.30:8080
   socks5://185.10.20.31:1080
   185.10.20.32:3128:gebruiker:wachtwoord
   ```

3. Klik op **Opslaan**. De app test de proxy's meteen en laat per proxy zien welk IP-adres Marktplaats nu ziet.

**Zo gaat de app met je proxy's om**

- **Om de beurt.** Elke check gaat via de volgende proxy in de lijst.
- **Werkt een proxy niet?** Dan probeert de app de volgende. Een kapotte proxy rust een paar minuten voordat hij weer gebruikt wordt.
- **Nooit via je eigen IP.** Zijn er proxy's ingesteld en werkt er geen enkele, dan wordt de check overgeslagen. Er gaat dan dus geen verzoek via je eigen verbinding.
- **Lekkende proxy's tellen niet mee.** Een proxy die bij de test je eigen IP-adres laat zien, wordt niet gebruikt.
- **Foto's lopen ook via de proxy**, zodat Marktplaats ook bij het bekijken van de lijst je IP niet ziet. Open je zelf een advertentie, dan bezoek je Marktplaats wel met je eigen verbinding.
- **SOCKS5:** ook de DNS-opzoeking gaat via de proxy.
- **Opslag:** de proxylijst wordt bewaard in `data/settings.json`, zodat hij een herstart overleeft. Zoekopdrachten en vondsten staan alleen in het geheugen.

---

## 3. Gebruik

| Veld | Uitleg |
|---|---|
| Zoekterm | Waar je op zoekt, bijvoorbeeld `gazelle damesfiets` |
| Postcode | Je eigen postcode, bijvoorbeeld `3511AB`; hiermee wordt de afstand berekend |
| Max afstand | 3 / 5 / 10 / 15 / 25 / 50 / 75 / 100 km of heel Nederland |
| Max prijs | In euro's, bijvoorbeeld `150` of `49,95` |
| Ook zonder prijs | Neem ook advertenties met 'Bieden', 'Zie omschrijving' en dergelijke mee |

- **Gevonden.** Nieuwe advertenties, de nieuwste bovenaan. Wat je nog niet gezien hebt, krijgt een geel randje en het label **Nieuw**. Staat de pagina op de achtergrond, dan zie je het aantal nieuwe in de tabtitel.
- **Meldingen.** Met het belletje bovenaan krijg je een melding van je browser bij elke nieuwe vondst.
- **Pauzeer / Hervat.** Na hervatten komen alleen advertenties binnen die daarna verschijnen.
- **Nu checken.** Doet meteen een check.
- **Verwijder.** Haalt de zoekopdracht en de vondsten ervan weg.
- **Logboek.** Elke check, via welke proxy, en eventuele fouten.

**Op je telefoon:** onderaan de linkerkolom staat een adres zoals `192.168.1.23:3000`. Open dat op je telefoon via hetzelfde wifi-netwerk. Sta de app toe als de Windows-firewall erom vraagt. Op een smal scherm krijg je een tabbalk onderin.

> Herstart je de app, dan zijn je zoekopdrachten en vondsten weg en vul je ze opnieuw in. De proxy's blijven bewaard.

---

## 4. Hoe het werkt

- Zo vaak als je instelt (standaard **elke minuut**, met willekeurige variatie) haalt de app per zoekopdracht de nieuwste advertenties op via het JSON-endpoint van Marktplaats, met een gewone browser-User-Agent. Heb je meerdere zoekopdrachten, dan zitten er een paar seconden tussen.
- **Reclame** (advertenties waarvan het itemId met een `a` begint) en gereserveerde advertenties worden overgeslagen.
- De app **controleert prijs en afstand nog een keer zelf**. 'Bieden vanaf €X' telt als prijs X, en 'Gratis' als €0.
- Bij een nieuwe zoekopdracht gelden alle huidige advertenties als gezien. Alleen wat daarna verschijnt, komt op de lijst, en elke advertentie maar één keer.
- Geeft Marktplaats **HTTP 429** (te veel verzoeken), dan stoppen alle checks **15 minuten**.

### Dataverbruik van je proxy's

Residentiële proxy's rekenen per GB. Bij **Dataverbruik** (onder Proxy's) zie je wat de app verbruikt en wat je per dag en per maand kunt verwachten.

Zo houdt de app het verbruik laag:

- **Alleen opvragen wat nodig is.** Marktplaats zet betaalde advertenties (Dagtoppers) bovenaan. De app vraagt per check het aantal Dagtoppers op plus 12 plekken voor nieuwe advertenties, in plaats van steeds 30. Zijn alle advertenties in beeld nieuw, dan vraagt de volgende check er automatisch meer op, zodat er niets gemist wordt.
- **TLS-sessies hergebruiken.** De versleutelde verbinding wordt per proxy hervat in plaats van steeds opnieuw opgezet. Dat scheelt ongeveer 4 KB per check.
- **Gecomprimeerd ophalen.** Gzip maakt het antwoord ongeveer vijf keer kleiner.
- **Hoe vaak checken** stel je zelf in: elke 1, 2, 5, 10 of 15 minuten. Elke 2 minuten halveert het verbruik.
- **’s Nachts rustiger** (standaard aan): tussen 01:00 en 07:00 hooguit elke 10 minuten. Dat scheelt ongeveer een vijfde.

Een check kost via een proxy meestal 20 tot 25 KB. Eén zoekopdracht die elke minuut checkt met nachtrust aan, komt daarmee op zo'n 25 MB per dag.

---

## 5. Problemen oplossen

| Probleem | Oplossing |
|---|---|
| Proxy: 'verbinding geweigerd' of 'time-out' | Controleer het adres en de poort, en of de proxy aan staat. |
| Proxy: 'vraagt om een gebruikersnaam en wachtwoord (407)' | Zet de inloggegevens erbij: `http://gebruiker:wachtwoord@host:poort`. |
| 'HTTP 403' in het logboek | Marktplaats weigert het IP-adres van die proxy. Probeer een andere proxy, bijvoorbeeld een residentiële. |
| 'HTTP 429' in het logboek | Te veel verzoeken. De app pauzeert zelf 15 minuten. Gebruik meer proxy's, minder zoekopdrachten of check minder vaak. |
| Proxy's verbruiken te veel data | Kies bij Dataverbruik een lagere frequentie en zet ‘’s Nachts rustiger’ aan. Het logboek laat per check zien hoeveel KB die kostte. |
| Port 3000 is al in gebruik | Er draait al een andere app op die poort, misschien de sniper zelf in een ander venster. Sluit die eerst. |
| Telefoon kan de pagina niet openen | Zelfde wifi? Sta Node.js toe in de Windows-firewall: Windows-beveiliging → Firewall → Een app toestaan via de firewall. |

---

## Voor ontwikkelaars

- `npm run dev` start de ontwikkelversie op http://localhost:3000.
- `lib/monitor.ts` bevat de checks en de planner. `instrumentation.ts` start die bij het opstarten van de server.
- `lib/proxies.ts` regelt het parsen, de rotatie, het overslaan van kapotte proxy's en de proxy-test.
- `lib/marktplaats.ts` haalt de advertenties op en filtert ze.
- De pagina staat in `app/page.tsx` en `components/`. De opmaak staat in `app/globals.css`.

*De app gebruikt het openbare zoek-endpoint dat de Marktplaats-website zelf ook gebruikt. Dat is geen officiële API, dus het kan zonder aankondiging veranderen. Gebruik de app voor jezelf en houd het aantal verzoeken redelijk.*
