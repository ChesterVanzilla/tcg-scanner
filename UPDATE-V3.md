# CardScan CM – Update auf Version 3

Version 3 verbessert zwei Punkte:

1. Die App prüft mehrere mögliche Kartengrößen im Foto. Dadurch werden Karten erkannt, die nicht fast das gesamte Bild ausfüllen.
2. Cardmarket wird nur noch mit Kartenname und Sammlernummer durchsucht. Der abweichende Setname wird nicht mehr mitgegeben.

## Update bei GitHub

Ersetze im Hauptverzeichnis deines Repositorys diese drei Dateien:

- `index.html`
- `app.js`
- `service-worker.js`

Danach die Änderung mit **Commit changes** speichern und ungefähr zwei Minuten warten.

## Version auf dem iPhone aktualisieren

Öffne die Website einmal direkt in Safari mit `?v=3` am Ende, zum Beispiel:

`https://DEIN-NAME.github.io/pokemon-card-scanner/?v=3`

Aktualisiere die Seite. Schließe danach die installierte Home-Bildschirm-App vollständig und öffne sie erneut.

Unter **Erkannten Text anzeigen** muss oben `CardScan CM v3.0` stehen.
