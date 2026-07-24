# CardDex AI v6.7 – Sammlungen

## Neu in v6.7

- lokale Sammlungsdatenbank mit IndexedDB
- automatische Standardsammlung „Meine Sammlung“
- beliebig viele weitere Sammlungen
- Sammlungen erstellen, umbenennen und löschen
- aktive Sammlung auswählen
- Karten direkt aus Such- und Scanergebnissen hinzufügen
- gleiche Karten automatisch über die Menge zusammenfassen
- Menge mit Plus und Minus verändern
- Übersicht über Gesamtzahl und unterschiedliche Karten
- vollständige JSON-Sicherung aller Sammlungen
- Wiederherstellung einer Sicherung
- Datenmodell vorbereitet für Zustand, Variante, Kaufpreis, Notizen und spätere Cloud-Synchronisation

## Datensicherheit

Die Sammlung wird lokal im Browser über IndexedDB gespeichert. Sie bleibt bei normalen App-Updates erhalten, kann aber beim Löschen der Website-Daten verloren gehen. Deshalb sollte regelmäßig über „JSON-Sicherung exportieren“ eine Sicherung erstellt werden.

## Installation

Alle Dateien aus diesem Ordner gemeinsam in das GitHub-Repository hochladen. `collection.js` ist neu und muss ebenfalls hochgeladen werden. Nach dem Upload die Seite vollständig neu laden. Der Service Worker verwendet den neuen Cache `carddex-ai-v6-7`.

## Wichtiger Hinweis

v6.7 übernimmt die Bedienungseinstellungen aus v6.6. Sammlungsdaten werden unabhängig davon in IndexedDB gespeichert und beim Zurücksetzen der App-Einstellungen nicht gelöscht.
