# CardScan CM – erste Version

Eine private Progressive Web App (PWA), die ein Foto einer Pokémon-Karte per OCR ausliest, passende Karten über TCGdex sucht und die gewählte Karte in der Cardmarket-Suche öffnet.

## Funktionen

- Foto direkt mit dem iPhone aufnehmen
- vorhandenes Bild aus der Fotomediathek auswählen
- Name und Kartennummer per Tesseract.js erkennen
- Treffer mit Kartenbild, Set und Nummer über TCGdex anzeigen
- passende Cardmarket-Suche öffnen
- manuelle Suche als Ausweichmöglichkeit
- als App-Symbol auf dem iPhone-Homescreen installierbar

## Wichtig

Die App muss über HTTPS oder lokal über `localhost` laufen. Durch einfaches Öffnen der Datei `index.html` funktionieren Kamera, Service Worker und manche Browser-Sicherheitsfunktionen nicht zuverlässig.

Die automatische Erkennung ist eine erste OCR-Version. Gerade bei Reflexionen, schrägen Fotos, japanischen Karten oder sehr kleinen Kartennummern kann eine manuelle Korrektur nötig sein.

## Schnelltest auf einem Computer

Im Projektordner einen lokalen Webserver starten:

```bash
python3 -m http.server 8080
```

Danach im Browser öffnen:

```text
http://localhost:8080
```

## Veröffentlichung über GitHub Pages

1. Auf GitHub ein neues Repository anlegen, zum Beispiel `pokemon-card-scanner`.
2. Alle Dateien aus diesem Ordner in das Repository hochladen.
3. Im Repository `Settings` öffnen.
4. Links `Pages` auswählen.
5. Unter `Build and deployment` bei `Source` die Option `Deploy from a branch` wählen.
6. Als Branch `main` und als Ordner `/ (root)` auswählen und speichern.
7. Nach der Veröffentlichung zeigt GitHub die HTTPS-Adresse der App an.

## Installation auf dem iPhone

1. Die veröffentlichte HTTPS-Adresse in **Safari** öffnen.
2. Unten auf das **Teilen-Symbol** tippen.
3. Nach unten scrollen und **Zum Home-Bildschirm** wählen.
4. Den Namen bestätigen und rechts oben **Hinzufügen** antippen.
5. Danach startet die App über ihr Symbol nahezu wie eine normale iPhone-App.

## Dateien

- `index.html` – Oberfläche
- `styles.css` – Gestaltung
- `app.js` – OCR, Kartensuche und Cardmarket-Weiterleitung
- `manifest.webmanifest` – PWA-Einstellungen
- `service-worker.js` – App-Grunddateien zwischenspeichern
- `icons/` – App-Symbole und Platzhalter

## Externe Dienste

- Tesseract.js für die Texterkennung im Browser
- TCGdex für Karteninformationen und Kartenbilder
- Cardmarket als Ziel der Produktsuche

Für diese erste Version werden keine eigenen API-Schlüssel benötigt.
