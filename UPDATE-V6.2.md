# CardScan CM – Update 6.2

Dieses Update behebt gezielt die wiederkehrenden Hänger bei Bildern aus der iPhone-Mediathek.

## Vollständige Dateien ersetzen

Lade im GitHub-Repository diese beiden vollständigen Dateien hoch:

- `app.js`
- `service-worker.js`

Die Dateien müssen direkt im Hauptverzeichnis des Repositorys liegen. Danach `Commit changes` wählen und den erfolgreichen Pages-Deploy unter `Actions` abwarten.

## Neue Version aufrufen

Öffne danach in Safari:

`https://chestervanzilla.github.io/pokemon-card-scanner/?force=6201`

Schließe anschließend die Home-Bildschirm-App vollständig und öffne sie erneut. In den Erkennungsdetails muss `CardScan CM v6.2` stehen.

## Technische Änderungen

- Keine OpenCV-Initialisierung mehr bei Galerie-Fotos.
- Galerie-Fotos werden auf maximal 1280 Pixel verkleinert.
- Nur noch zwei leichte Kartenausschnitte statt fünf großer Kopien.
- Vorschau wird als Blob statt als großer Base64-String gehalten.
- KI läuft zuerst; Tesseract-OCR startet nur bei Bedarf.
- OCR-Worker wird nach jedem Scan beendet und aus dem Speicher entfernt.
- OCR-Zwischen-Canvas-Flächen werden sofort freigegeben.
- Bei sicherer KI-Erkennung entfällt der zusätzliche Vergleich mit vielen Kartenbildern.
- Bildladen wird nach 15 Sekunden kontrolliert abgebrochen statt die App dauerhaft zu blockieren.
- Service Worker erzwingt online aktuelle Dateien ohne alten Browsercache.
