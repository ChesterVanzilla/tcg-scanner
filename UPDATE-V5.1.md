# CardScan CM – Update 5.1

Dieses Zwischenupdate behebt das Hängenbleiben vorhandener Bilder bei ungefähr 12 %.

## Ursache

Auf iOS konnte die Initialisierung von OpenCV/WebAssembly beim Galerieimport hängen bleiben. Da die App darauf gewartet hat, wurde der Fortschritt nicht fortgesetzt.

## Änderung

- Vorhandene Bilder erhalten sofort mehrere robuste Karten-Ausschnitte.
- OpenCV ist nur noch eine optionale Verbesserung mit kurzem Zeitlimit.
- Eine fehlgeschlagene OpenCV-Initialisierung blockiert spätere Versuche nicht mehr.
- Der Cache wurde auf Version 5.1 erhöht.

## Hochladen

Ersetze im GitHub-Repository:

- `app.js`
- `service-worker.js`

Danach die Seite einmal mit `?v=5.1` in Safari öffnen und neu laden.
