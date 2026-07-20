# Update auf CardScan CM Version 2

Diese Version verbessert die automatische Erkennung deutlich:

- Der Kartenname wird nur aus dem oberen Kartenbereich gelesen.
- Die Kartennummer wird separat aus dem unteren Kartenbereich gelesen.
- Zeilen wie „Entwickelt sich aus …“ werden nicht mehr als Kartenname verwendet.
- Einzelne zufällige Zahlen werden nicht mehr als Kartennummer übernommen.
- Mehrere Bildaufbereitungen werden kombiniert, damit schwarze Schrift auf farbigem Hintergrund besser lesbar wird.
- Der Offline-Cache lädt bei bestehender Internetverbindung künftig zuerst die aktuelle GitHub-Version.

## Dateien auf GitHub ersetzen

Am einfachsten alle Dateien und den Ordner `icons` aus diesem Ordner erneut in das bestehende Repository hochladen. GitHub fragt bei gleichen Dateinamen automatisch nach dem Ersetzen.

Mindestens müssen diese drei Dateien ersetzt werden:

- `index.html`
- `app.js`
- `service-worker.js`

## Neue Version sicher laden

Nach dem Hochladen ungefähr 1–2 Minuten warten und die GitHub-Pages-Adresse in Safari einmal mit `?v=2` am Ende öffnen.

Beispiel:

```text
https://DEIN-NAME.github.io/pokemon-card-scanner/?v=2
```

Danach die Seite einmal neu laden, vollständig schließen und die Home-Bildschirm-App erneut öffnen.

Im Bereich „Erkannten Text anzeigen“ steht oben `CardScan CM v2.0`. Daran ist erkennbar, dass die neue Version geladen wurde.
