# CardDex AI v6.8 – Sammlungsdetails

## Neu in v6.8

- Karten in der Sammlung lassen sich antippen und als vollständiger Datensatz öffnen.
- Echte Kartenbilder werden aus TCGdex geladen.
- Fehlende oder defekte deutsche Bilder werden automatisch über englische TCGdex-Bilddaten ergänzt.
- Bereits in v6.7 gespeicherte Platzhalter werden beim Öffnen der Sammlung automatisch nachgeladen.
- Hochauflösendes Kartenbild in der Detailansicht.
- Bearbeitbare Kartensprache.
- Bearbeitbare Kartenvariante.
- Bearbeitbarer Zustand.
- Menge in der Detailansicht ändern.
- Kaufpreis und Kaufdatum speichern.
- Eigene Notizen speichern.
- Seltenheit, Illustrator, Kategorie und Datenbank-ID anzeigen.
- Vorhandene Cardmarket-Preise in der Detailansicht anzeigen.
- Einzelne Karte vollständig aus einer Sammlung löschen.
- Direkte Cardmarket-Suche aus der Sammlungsdetailansicht.
- Vorhandene v6.7-Sammlungen und Backups bleiben kompatibel.

## Installation

Alle Dateien aus diesem Ordner gemeinsam in das GitHub-Repository hochladen. `collection.js`, `index.html`, `styles.css`, `app.js` und `service-worker.js` wurden geändert.

Nach dem Upload:

1. CardDex AI öffnen.
2. In den Einstellungen den App-Cache leeren.
3. Die Seite vollständig neu laden.
4. Die Sammlung öffnen und kurz warten, während vorhandene Kartenbilder ergänzt werden.

Der Service Worker verwendet den Cache `carddex-ai-v6-8`.

## Datensicherheit

Die Sammlungen bleiben in IndexedDB gespeichert. Das Update löscht keine bestehenden Sammlungsdaten. JSON-Sicherungen aus v6.7 können weiterhin importiert werden. Neue v6.8-Sicherungen enthalten zusätzlich die erweiterten Kartendaten.
