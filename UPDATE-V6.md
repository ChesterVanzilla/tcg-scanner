# CardScan CM – Update auf Version 6.0

Version 6 ergänzt die bisherige OCR- und Bildvergleichserkennung um eine echte serverseitige KI-Bilderkennung. Die App bleibt ohne KI-Worker nutzbar; dann arbeitet sie wie Version 5.1.

## 1. Frontend aktualisieren

Lade diese vier Dateien aus dem Update-Paket in das bestehende GitHub-Repository und ersetze die vorhandenen Dateien:

- `index.html`
- `styles.css`
- `app.js`
- `service-worker.js`

Danach `Commit changes` auswählen und etwa zwei Minuten warten.

## 2. Cloudflare-Worker einrichten

Der Ordner `pokemon-card-ai-worker` enthält den kleinen privaten KI-Dienst. Er hält den Cloudflare-Zugang aus dem Browser heraus und analysiert das Kartenfoto mit Workers AI.

### Variante A – mit Wrangler

1. Installiere Node.js, falls es noch nicht vorhanden ist.
2. Öffne im Ordner `pokemon-card-ai-worker` ein Terminal.
3. Führe aus:

```bash
npm install
npx wrangler login
npx wrangler secret put SCANNER_KEY
npm run deploy
```

Bei `SCANNER_KEY` gibst du einen selbst gewählten langen Schlüssel ein. Nach dem Deployment zeigt Wrangler eine Adresse wie diese:

```text
https://cardscan-ai.DEIN-CLOUDFLARE-NAME.workers.dev
```

### Zugelassene Website

In `wrangler.toml` ist bereits folgende GitHub-Pages-Domain eingetragen:

```text
https://chestervanzilla.github.io
```

Falls dein GitHub-Benutzername oder deine Domain anders lautet, ändere `ALLOWED_ORIGIN` vor dem Deployment.

## 3. KI in der App verbinden

1. Öffne die aktualisierte App in Safari.
2. Klappe `KI-Bilderkennung verbinden` auf.
3. Trage die Worker-Adresse ohne `/identify` ein.
4. Trage denselben privaten Schlüssel ein, den du bei `SCANNER_KEY` festgelegt hast.
5. Tippe auf `KI-Verbindung speichern`.

Die App sendet danach beim Erkennen einen verkleinerten Kartenausschnitt an deinen Worker. Der Worker gibt Kartenname, Sammlernummer, Setkürzel und eine Konfidenz zurück. Diese Angaben werden mit OCR, TCGdex und dem Kartenbildvergleich kombiniert.

## 4. Neue Version auf dem iPhone laden

Öffne einmal:

```text
https://chestervanzilla.github.io/pokemon-card-scanner/?v=6
```

Lade die Seite neu, schließe die Home-Screen-App vollständig und öffne sie erneut. Unter `Erkennungsdetails anzeigen` muss `CardScan CM v6.0` stehen.

## Datenschutz

Das Kartenfoto wird nur für die einzelne Erkennung an deinen Cloudflare-Worker übertragen. Der mitgelieferte Worker speichert keine Bilder und setzt `cache-control: no-store`.
