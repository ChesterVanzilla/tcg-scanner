# CardDex AI v6.15.1 – Set Navigation Fix

## Verbesserte Bedienung langer Set-Listen

Diese Version konzentriert sich auf die Navigation innerhalb der Set-Übersicht und der Set-Details. Der Kartenbestand, die Set-Projekte und alle bisherigen Funktionen bleiben unverändert.

## Feste Set-Kopfzeile

Beim Scrollen innerhalb eines Sets bleibt eine kompakte Kopfzeile sichtbar. Sie enthält:

- den Zurück-Button zur Set-Übersicht
- den aktuellen Setnamen
- Fortschritt und Sammelstand
- den Projektstatus
- die Aktualisieren-Funktion

Auf kleinen iPhone-Displays werden Projekt- und Aktualisieren-Schaltfläche platzsparend als Symbole dargestellt.

## Schwebende Schnellnavigation

Nach längerem Scrollen erscheinen zwei kompakte Schaltflächen am unteren Bildschirmrand:

- **Nach oben** führt direkt zum Beginn der aktuellen Set-Ansicht.
- **Sprungmenü** öffnet passende Sprungmarken.

In der Set-Übersicht stehen Sprünge zu Kopf, Filtern, Setliste und Listenende zur Verfügung. In den Set-Details kann zusätzlich zu regulären Karten und zum ersten Secret Rare gesprungen werden.

## Scrollpositionen bleiben erhalten

- Beim Öffnen eines Sets merkt CardDex die Position in der Set-Übersicht.
- Beim Zurückgehen landet man wieder beim zuvor geöffneten Set.
- Beim Wechsel in einen anderen Hauptbereich und zurück wird die letzte Position in SetDex wiederhergestellt.
- Aktualisierungen der Karten- oder Projektdaten setzen die Ansicht nicht mehr unnötig an den Anfang.

## Stabiler Worker

Der enthaltene `src.js` ist weiterhin unverändert der bestätigte **Cloudflare-Worker v2.2.1**. Für dieses Update ist keine Änderung oder erneute Bereitstellung des Workers notwendig.

## Datenübernahme

Bestehende Sammlungen, Wunschlisten, Set-Projekte, Scannerhistorie, Bilder, Cardmarket-Links, Dubletten- und Tauschangaben bleiben erhalten. Die PWA-Cache-Version wurde auf v6.15.1 erhöht.
