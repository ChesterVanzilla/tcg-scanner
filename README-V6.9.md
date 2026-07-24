# CardDex AI v6.9 – Library

Version 6.9 führt die erste eigenständige **Library Engine** ein. Scanner, Sammlungen und lokale Aktivität werden nun in einer gemeinsamen Oberfläche zusammengeführt.

## Neu in v6.9

- neues Start-Dashboard mit Kartenanzahl, Sammlungen und heutigen Scans
- lokale Scannerhistorie für automatische Scans und manuelle Suchen
- Status je Erkennung: `Verifiziert`, `Vorläufig` oder `Prüfen`
- letzte Scans mit Bild, Uhrzeit, Set, Nummer und Sicherheitswert
- Karten aus der Historie direkt einer Sammlung hinzufügen
- Ergebnisse aus der Historie erneut prüfen
- stabiler Cardmarket-Zugriff auch aus der Historie
- Verlauf nach Status filtern oder vollständig löschen
- Scannerhistorie ist Bestandteil der JSON-Sicherung
- IndexedDB-Datenmodell auf Version 2 erweitert
- maximal 250 Historieneinträge, damit der lokale Speicher kontrollierbar bleibt

## Neue interne Struktur

Die bisherige Anwendung wurde ohne riskanten Komplettumbau um erste unabhängige Module ergänzt:

- `carddex-core.js` – gemeinsame Ereignisse, Bild- und Formatfunktionen
- `library-engine.js` – lokale Historie und Dashboard-Daten
- `library-ui.js` – Navigation, Dashboard und Verlaufsansicht
- `collection.js` – Sammlung und Sicherung
- `app.js` – Scanner und Erkennung

Damit können weitere Funktionen künftig ergänzt werden, ohne die komplette Scannerlogik erneut umzubauen.

## Daten und Datenschutz

Alle Sammlungs- und Verlaufsdaten bleiben lokal im Browser beziehungsweise in der installierten PWA. Es ist keine zusätzliche Anmeldung erforderlich. Eine JSON-Sicherung enthält ab v6.9 auch die Scannerhistorie.

## Aktualisierung

1. Alle Dateien aus dem ZIP in das Hauptverzeichnis des GitHub-Repositorys hochladen.
2. Vorhandene Dateien vollständig ersetzen.
3. CardDex AI auf dem iPhone vollständig schließen.
4. App erneut öffnen. Der Service Worker aktualisiert den Cache auf v6.9.

Bestehende Sammlungen werden automatisch übernommen. Die neue Historie beginnt mit dem ersten Scan unter v6.9.
