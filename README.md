# CardScan CM – Version 4

Private iPhone-Web-App zum Erkennen von Pokémon-Karten und Öffnen der passenden Cardmarket-Suche.

## Was Version 4 anders macht

Version 4 ist kein weiterer Einzelfall-Patch. Die Erkennung arbeitet als mehrstufige Pipeline:

1. **Geführter Live-Scanner** mit festem Kartenrahmen
2. **Exakter Zuschnitt** auf das Pokémon-Kartenformat
3. **Automatische Rand- und Perspektiverkennung** bei Bildern aus der Fotomediathek
4. **Mehrere Fallback-Ausschnitte**, falls der Kartenrand nicht sicher erkannt wird
5. **Getrennte OCR-Bereiche** für Kartenname und Sammlernummer
6. **Mehrere Kontrastvarianten** bei schwierigen Farben und Holo-Oberflächen
7. **Prüfung von Kartennummer, Setgröße und Setkürzel**
8. **Bildvergleich** mit den Kartenabbildungen der passenden Datenbanktreffer
9. **Cardmarket-Suche mit Kartenname + Sammlernummer**

## Bedienung

### Empfohlen: Live-Scanner

1. `Live-Scanner öffnen` antippen.
2. Die Außenkanten der Karte möglichst genau an den gelben Rahmen legen.
3. Das iPhone parallel zur Karte halten.
4. Spiegelungen vermeiden und den Auslöser antippen.
5. Den vorbereiteten Kartenausschnitt prüfen.
6. `Karte erkennen` antippen.
7. Den passenden Treffer anhand von Bild und Kartennummer kontrollieren.
8. `Auf Cardmarket öffnen` antippen.

### Vorhandenes Bild

Mit `Bild auswählen` kann ein Foto aus der Mediathek verwendet werden. Die App versucht zunächst, die Kartenränder automatisch zu erkennen. Falls das nicht gelingt, prüft sie mehrere sinnvolle Ausschnitte und Ausrichtungen.

## Gute Aufnahmebedingungen

- Karte vollständig sichtbar
- Kamera möglichst parallel zur Karte
- gleichmäßiges Licht
- keine harte Spiegelung über Name oder Kartennummer
- möglichst nur eine Karte im gelben Rahmen
- bei stark spiegelnden Karten das iPhone leicht seitlich versetzen, aber parallel halten

## Manuelle Suche

Die manuelle Suche bleibt als Ausweichmöglichkeit erhalten. Die Nummer kann beispielsweise so eingegeben werden:

```text
064/132
```

oder bei Promokarten:

```text
SVP 085
```

## Veröffentlichung über GitHub Pages

1. Alle Dateien aus diesem Ordner in das Hauptverzeichnis des GitHub-Repositorys hochladen.
2. `index.html` muss direkt im Hauptverzeichnis liegen.
3. Unter `Settings → Pages` die Quelle `Deploy from a branch` verwenden.
4. Branch `main` und Ordner `/(root)` auswählen.
5. Nach dem Speichern die von GitHub angezeigte HTTPS-Adresse öffnen.

## Installation auf dem iPhone

1. Die GitHub-Pages-Adresse in Safari öffnen.
2. Auf das Teilen-Symbol tippen.
3. `Zum Home-Bildschirm` auswählen.
4. `Hinzufügen` bestätigen.

## Dateien

- `index.html` – Oberfläche und Live-Scanner
- `styles.css` – Gestaltung
- `app.js` – Kamera, OCR, Kartenabgleich, Bildvergleich und Cardmarket-Link
- `manifest.webmanifest` – PWA-Einstellungen
- `service-worker.js` – App-Cache und Update-Verhalten
- `icons/` – App-Symbole

## Externe Komponenten

- Tesseract.js für die Texterkennung
- OpenCV.js für Kartenrand- und Perspektiverkennung
- TCGdex für Kartendaten, Kartenbilder und – sofern vorhanden – Preisfelder
- Cardmarket als Ziel der Produktsuche

Es werden keine eigenen API-Schlüssel benötigt. Kamera, Kartensuche, Bilderkennung und externe Bibliotheken benötigen eine Internetverbindung. Die Bildverarbeitung selbst findet im Browser statt; das Kartenfoto wird von dieser App nicht auf einen eigenen Server hochgeladen.

## Versionskontrolle

Unter `Erkennungsdetails anzeigen` muss in dieser Ausgabe stehen:

```text
CardScan CM v4.0
```
