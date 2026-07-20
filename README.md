# CardScan CM – Version 5

Private iPhone-Web-App zum Erkennen von Pokémon-Karten und Öffnen der passenden Cardmarket-Suche.

## Schwerpunkt von Version 5

Version 5 verbessert vor allem Karten, deren Name als Logo oder stark stilisierte Schrift dargestellt wird. Dazu zählen insbesondere:

- moderne Pokémon-ex
- Mega-Pokémon-ex
- ältere Pokémon-EX und Mega-EX
- GX, VMAX und VSTAR
- Full-Art- und stark holografische Karten

Die App ist nicht mehr darauf angewiesen, dass der große Kartenname fehlerfrei gelesen wird. Sie kombiniert mehrere voneinander unabhängige Merkmale.

## Erkennungspipeline

1. Geführter Live-Scanner mit festem Kartenrahmen
2. Exakter Karten-Zuschnitt beziehungsweise Perspektivkorrektur
3. Getrennte OCR-Bereiche für Name, Kontextzeilen, Regelbox und Sammlernummer
4. Lokale Kontrastnormalisierung gegen Holo- und Regenbogenglanz
5. Erkennung der Kartenmechanik wie Mega, ex, GX, VMAX oder VSTAR
6. Ableitung des Basisnamens aus Sätzen wie „Die Mega-entwickelte Form von Stalobor“
7. Prüfung von Kartennummer, Setgröße und Setkürzel
8. Suche in der gewählten TCGdex-Sprache plus englischer Rückfallebene für sehr neue Datensätze
9. Bildvergleich mit offiziellen Kartenabbildungen
10. Cardmarket-Suche mit Kartenname und Sammlernummer

## Beispiel Mega-Stalobor ex

Bei einer schwer lesbaren Titelzeile kann die App jetzt trotzdem kombinieren:

```text
Mega-Mechanik erkannt
ex-Regel erkannt
Basisname aus „von Stalobor“
Sammlernummer 065/084
```

Daraus entsteht der Suchhinweis:

```text
Mega-Stalobor ex 065
```

## Bedienung

### Empfohlen: Live-Scanner

1. `Live-Scanner öffnen` antippen.
2. Die Außenkanten der Karte möglichst genau an den gelben Rahmen legen.
3. Das iPhone parallel zur Karte halten.
4. Spiegelungen möglichst nicht über die untere Sammlernummer legen.
5. Auslösen und den vorbereiteten Ausschnitt prüfen.
6. `Karte erkennen` antippen.
7. Treffer anhand von Kartenbild und Nummer kontrollieren.
8. `Auf Cardmarket öffnen` antippen.

### Vorhandenes Bild

Mit `Bild auswählen` kann ein Foto aus der Mediathek verwendet werden. Die App versucht zuerst die Kartenränder zu erkennen und bereitet mehrere alternative Ausschnitte vor.

## Rückfallebenen

- Falls der deutsche Datensatz eines sehr neuen Sets noch fehlt, durchsucht die App zusätzlich die englische TCGdex-Datenbank über Kartennummer und Setgröße.
- Falls gar kein Datenbanktreffer vorhanden ist, erscheint trotzdem ein Cardmarket-Link aus den erkannten Angaben.
- Die manuelle Suche bleibt weiterhin verfügbar.

## Veröffentlichung über GitHub Pages

1. Alle Dateien aus diesem Ordner in das Hauptverzeichnis des GitHub-Repositorys hochladen.
2. `index.html` muss direkt im Hauptverzeichnis liegen.
3. Unter `Settings → Pages` die Quelle `Deploy from a branch` verwenden.
4. Branch `main` und Ordner `/(root)` auswählen.
5. Nach dem Speichern die von GitHub angezeigte HTTPS-Adresse öffnen.

## Installation auf dem iPhone

1. GitHub-Pages-Adresse in Safari öffnen.
2. Teilen-Symbol antippen.
3. `Zum Home-Bildschirm` auswählen.
4. `Hinzufügen` bestätigen.

## Externe Komponenten

- Tesseract.js für OCR
- OpenCV.js für Kartenrand- und Perspektiverkennung
- TCGdex für Kartendaten, Bilder und vorhandene Preisfelder
- Cardmarket als Ziel der Produktsuche

Es werden keine eigenen API-Schlüssel benötigt. Die Bildverarbeitung findet im Browser statt; das Kartenfoto wird von der App nicht an einen eigenen Server übertragen.

## Versionskontrolle

Unter `Erkennungsdetails anzeigen` muss stehen:

```text
CardScan CM v5.0
```
