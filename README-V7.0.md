# CardDex AI v7.0 – Evolution

v7.0 ist das große zusammenhängende Design- und Bedienungsupdate für CardDex AI. Die bestehende Sammlungs-, Scanner-, Set-, Wunschlisten- und Insights-Logik aus v6.15.1 bleibt erhalten.

## Neuer Pokédex-Systemstart

- vollständig neu aufgebauter Ladebildschirm
- Gestaltung als linke Innenseite eines geöffneten Pokédex
- sauber integrierte Linse, Status-LEDs und Hardware-Bedienelemente
- längere vollständige Bootsequenz bei einem echten Neustart
- kurze Wiederaufnahme-Sequenz innerhalb derselben Sitzung
- weiterhin überspring- und in den Einstellungen deaktivierbar

## Neue Hauptnavigation

- bisherige große Navigationsmatrix entfernt
- dauerhaft erreichbares unteres Pokédex-Bedienteil
- drei klare Hauptaktionen: Start, Scan und System
- Scanner als hervorgehobene zentrale Aktion
- neues Systemmenü für Sammlung, Wunschliste, Sets, Verlauf, Insights und Einstellungen
- aktive Module werden in der unteren Navigation sichtbar gekennzeichnet

## Überarbeitete Startseite

- hochwertigerer roter Systemkopf
- neues offenes Pokédex-Bild als Geräte- und App-Icon
- ruhigeres Dashboard ohne doppelte vollständige Navigation
- Sammlungszahlen, Tagesstatus und letzte Aktivitäten bleiben direkt sichtbar
- Live-Scanner bleibt als zentrale Schnellaktion erhalten

## Scanner-Menü

- dunkleres und hochwertigeres Scanner-Modul
- vollständig neu gezeichnete Kamera- und Galerie-Symbole
- technischer Kartenleser statt vereinfachter Platzhaltergrafik
- kompaktere Hinweise und klarere Modulstatusanzeige
- optisch passend zur übrigen Gerätehülle

## Live-Scanner

- eigener optischer Pokédex-Kopf
- Kamera- und Scanstatus über eine farbige LED
- neuer unterer Hardware-Bedienbereich
- Zurück links, Kamerawahl in der Mitte und Auslöser rechts
- stärkere visuelle Führung durch Scanrahmen, Scanlinie und abgedunkelte Außenflächen

## Einheitliche Designsprache

- dunkle Bildschirmmodule und rote Hardwareflächen
- konsistente Linien, Schatten, Rundungen und Statusanzeigen
- einheitliche Buttons und Bedienelemente in Sammlung, Sets, Wunschliste, Verlauf und Insights
- sanfte Modulübergänge ohne die Bedienung zu verlangsamen
- technische Detailbereiche bleiben einklappbar

## App-Icon

Die bisherigen Icons wurden durch das neue offene Pokédex-Motiv ersetzt. Enthalten sind Varianten für iOS, PWA, Standard-Icon und Maskable Icon.

## Bewusst nicht enthalten

- keine Haptik
- keine Sounds
- keine neue Sammlungsfunktion
- keine Änderung an der Erkennungs- oder Datenbanklogik
- kein Worker-Update

## Cloudflare-Worker

Der enthaltene `src.js` ist unverändert der bestätigte stabile Cloudflare-Worker **v2.2.1**. Für v7.0 darf der Worker nicht ersetzt oder neu angepasst werden.

## Datenübernahme

Bestehende Sammlungen, Wunschlisten, Set-Projekte, Scannerhistorie, Kartenbilder, Cardmarket-Links, Kaufdaten, Dubletten- und Tauschangaben bleiben erhalten. Die PWA-Cache-Version wurde auf v7.0 erhöht.
