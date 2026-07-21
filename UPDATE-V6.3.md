# CardDex AI – Design-Update 6.3

Dieses Paket ersetzt das bisherige CardScan-CM-Design vollständig durch das neue **CardDex-AI-Retro-Handheld-Design**.

## Vollständige Dateien ersetzen

Lade alle Dateien und den kompletten Ordner `icons` direkt in das Hauptverzeichnis des GitHub-Repositories:

- `index.html`
- `styles.css`
- `app.js`
- `service-worker.js`
- `manifest.webmanifest`
- `icons/`

Die Dateien liegen danach direkt nebeneinander im Root des Repositories. Der Ordner `icons` bleibt ein Unterordner.

## Was bleibt erhalten?

Die Cloudflare-Verbindung wird weiterhin unter denselben lokalen Schlüsseln gespeichert. Worker-Adresse und privater Schlüssel sollten nach dem Update daher weiterhin vorhanden sein.

Der Cloudflare-Worker selbst wird durch dieses Design-Update nicht verändert.

## GitHub Pages neu laden

1. Dateien hochladen und `Commit changes` wählen.
2. Unter `Actions` auf den grünen Haken des Pages-Deployments warten.
3. In Safari öffnen:

   `https://chestervanzilla.github.io/pokemon-card-scanner/?force=6301`

4. Die installierte Home-Bildschirm-App vollständig schließen und erneut öffnen.
5. Unter „Erkennungsdetails anzeigen“ muss stehen:

   `CardDex AI App v6.3`

## Neue Gestaltung

- Neuer App-Name: CardDex AI
- Neuer Untertitel: Dein persönlicher Card Assistant
- Retro-Handheld-/Kanto-inspiriertes Design
- Neue rote, schwarze und cremefarbene Oberfläche
- Neues Homescreen-Icon und neue Manifest-Icons
- Neuer Scan-Bereich, neue Ergebnisdarstellung und neue Statusanzeigen
- Bestehende Scanner-, KI-, TCGdex- und Cardmarket-Funktionen bleiben erhalten
