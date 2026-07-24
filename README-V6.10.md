# CardDex AI v6.10 – Organizer

Version 6.10 erweitert die in v6.9 eingeführte Library um eine echte Sammlungsverwaltung. Auch größere Sammlungen lassen sich jetzt auf dem iPhone schnell durchsuchen, filtern und sortieren.

## Neu in v6.10

- Volltextsuche innerhalb der aktiven Sammlung
- Suche nach Kartenname, englischem Namen, Set, Set-ID, Kartennummer, Seltenheit, Illustrator und eigenen Notizen
- Schnellfilter für alle Karten, doppelte Karten, vorläufig erkannte Karten, Prüffälle und Karten mit Notizen
- zusätzliche Filter für Einzelkarten, verifizierte Karten, Kaufpreis und Kartensprache
- Sortierung nach Name, Set und Kartennummer, Anzahl, letzter Änderung oder Kaufpreis
- automatische Berechnung der zusätzlichen doppelten Exemplare
- sichtbare Kennzeichnung doppelter, vorläufiger und zu prüfender Karten
- Anzeige der aktuell sichtbaren Karten und Exemplare
- Filter- und Sortiereinstellungen bleiben lokal gespeichert
- eigene Leermeldung, wenn eine Suche keine Treffer ergibt
- bestehende Sammlung, Bilder, Cardmarket-Links und Scannerhistorie bleiben unverändert erhalten

## Bedienung

Die Sammlungsansicht besitzt unterhalb der Statistik einen neuen Organizer-Bereich. Die Volltextsuche kann mehrere Begriffe kombinieren. Die Suche `Pikachu 151` zeigt beispielsweise nur Einträge, deren gespeicherte Daten beide Begriffe enthalten.

Als doppelte Karten gelten Einträge mit einer Anzahl größer als eins. Die Statistik `DOPPELTE` zeigt nur die zusätzlichen Exemplare an. Bei einer Kartenmenge von drei werden also zwei doppelte Exemplare gezählt.

## Daten und Datenschutz

Alle Such-, Filter- und Sortiervorgänge erfolgen vollständig lokal auf dem Gerät. Es werden dafür keine zusätzlichen Daten an einen Server übertragen und keine weitere Anmeldung benötigt.

## Aktualisierung

1. Alle Dateien aus dem ZIP in das Hauptverzeichnis des GitHub-Repositorys hochladen.
2. Vorhandene Dateien vollständig ersetzen.
3. CardDex AI auf dem iPhone vollständig schließen.
4. App erneut öffnen. Der Service Worker aktualisiert den Cache auf v6.10.

Bestehende Datenbanken werden ohne Migration weiterverwendet. Die Datenbankversion bleibt bei CardDex DB v2.
