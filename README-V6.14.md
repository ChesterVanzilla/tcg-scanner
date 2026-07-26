# CardDex AI v6.14 – Completion

## Persönliche Sammelziele

Jedes Set-Projekt kann jetzt mit einem eigenen Ziel geführt werden:

- **Jede Kartennummer einmal** – eine beliebige vorhandene Variante zählt
- **Normal/Holo + Reverse** – Reverse-Karten werden zusätzlich zur Grundversion gezählt
- **Alle bekannten Varianten** – alle von der Kartendatenbank gemeldeten Varianten zählen einzeln

Der Set-Fortschritt wird in den Details sofort neu berechnet. Reguläre Karten und Secret Rares werden getrennt ausgewiesen. Die Einstellungen der Set-Projekte sind Bestandteil der JSON-Sicherung.

## Auswahlmodus für fehlende Karten

- mehrere Karten innerhalb eines Sets markieren
- alle aktuell sichtbaren Karten auswählen
- ausgewählte fehlende Karten gesammelt zur Wunschliste hinzufügen
- ausgewählte Wunschlisteneinträge gesammelt entfernen
- Suche und Filter können vor der Mehrfachauswahl verwendet werden

Wird eine Karte später in derselben Sprache und Variante zur Sammlung hinzugefügt, entfernt CardDex den entsprechenden Eintrag automatisch von der Wunschliste.

## Dubletten-Manager

Doppelte Exemplare werden jetzt pro Sprache und Variante berechnet. Dadurch gelten beispielsweise eine normale Karte und eine Reverse-Holo-Karte nicht mehr automatisch als Dublette.

Für echte Dubletten stehen folgende Aktionen zur Verfügung:

- Exemplare für den Tausch markieren oder die Markierung reduzieren
- ein Exemplar als verkauft markieren
- ein Exemplar als getauscht markieren
- Bestand automatisch um das abgegebene Exemplar verringern

Verkaufte und getauschte Mengen werden im lokalen Datensatz historisch mitgeführt und über das Backup gesichert.

## Stabiler Cloudflare-Worker

Der im Paket enthaltene `src.js` entspricht weiterhin dem bestätigten stabilen **Cloudflare-Worker v2.2.1**. Für v6.14 ist kein Worker-Update erforderlich. App und Worker werden weiterhin getrennt versioniert.

## Datenübernahme

Bestehende Sammlungen, Kartenbilder, Wunschlisten, Set-Projekte, Scannerhistorie und Cardmarket-Links bleiben erhalten. Die PWA-Cache-Version wurde auf v6.14 erhöht.
