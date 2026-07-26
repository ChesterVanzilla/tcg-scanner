# CardDex AI v6.15 – Insights

## Neue Statistikansicht

CardDex AI erhält einen eigenen Hauptbereich **INSIGHTS**. Alle Auswertungen werden aus der lokalen IndexedDB und den bereits vorhandenen Set-Daten berechnet. Es wird kein neues Konto, keine Cloud-Synchronisierung und kein zusätzlicher API-Schlüssel benötigt.

## Bestandsübersicht

Die neue Ansicht zeigt:

- gesamte Kartenexemplare
- eindeutige Karten
- unterschiedliche Sprach-/Variantenkombinationen
- zusätzliche Dubletten
- für den Tausch markierte Exemplare
- Wunschlistenkarten und gewünschte Exemplare
- erfasste Einkaufssumme des aktuellen Bestands
- Zielbudget der Wunschliste
- historisch als verkauft oder getauscht markierte Exemplare

Die Einkaufssumme ist ausdrücklich kein Marktwert. Sie basiert nur auf den von dir eingetragenen Kaufpreisen.

## Sammlungen, Sprachen und Varianten

- Verteilung des Bestands auf die einzelnen Sammlungen
- Sprachverteilung nach Exemplaren
- Variantenverteilung nach Exemplaren
- direkte Navigation aus der Statistik in die jeweilige Sammlung
- neuer Sammlungsfilter **TAUSCH** für markierte Tausch-Dubletten

## Sets und Projekte

- stärkste begonnene Sets mit Fortschrittsbalken
- aktive Set-Projekte
- abgeschlossene Projekte
- durchschnittlicher Projektfortschritt
- Anzahl noch fehlender Projektkarten
- direkter Sprung aus Insights in das entsprechende Set

Die Set-Auswertung verwendet den vorhandenen lokalen Set-Cache. Wenn der vollständige Katalog kurzzeitig nicht erreichbar ist, bleiben lokale Grundstatistiken verfügbar.

## Scanneraktivität

- Scans der letzten sieben Tage als kompaktes Balkendiagramm
- Anzahl der Scans in den letzten 7 und 30 Tagen
- Verifizierungsquote der letzten 30 Tage

## Datenpflege

CardDex weist auf lokal erkennbare offene Punkte hin:

- vorläufige Karten
- Karten mit Prüfstatus
- Kartendatensätze ohne Bild
- Sammlungseinträge ohne Kaufpreis

## Stabiler Worker

Der enthaltene `src.js` bleibt unverändert beim bestätigten **Cloudflare-Worker v2.2.1**. Für v6.15 ist kein Worker-Update erforderlich. App und Worker werden weiterhin getrennt versioniert.

## Datenübernahme

Bestehende Sammlungen, Wunschlisten, Bilder, Set-Projekte, Scannerhistorie, Dublettenangaben und Cardmarket-Links bleiben erhalten. Die PWA-Cache-Version wurde auf v6.15 erhöht.
