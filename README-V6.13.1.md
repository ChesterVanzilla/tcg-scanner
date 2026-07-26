# CardDex AI v6.13.1 – MasterSet Bugfix

## Erkennung von Mega-ex-Karten

- stilisierte Schreibweisen wie `Mega-Ohrdoch@ex` werden zu `Mega-Ohrdoch ex` normalisiert
- Regulationszeichen, Setcode, Sprache, Kartennummer und Seltenheit werden getrennt behandelt
- eine vollständige Kennung wie `253/217` wird nicht mehr wegen eines einzelnen fehlerhaften Zeichens im Namen verworfen
- bei einem eindeutigen Treffer über Nummer und Nenner übernimmt CardDex den korrekten Kartennamen aus der Datenbank
- führende Nullen und Karten ohne Nenner, beispielsweise `046`, bleiben weiterhin unterstützt
- die KI-Anweisung berücksichtigt ausdrücklich Kartenzeilen wie `J ASC DE 253/217 ★★`

## Trainer-Galerien

- Trainer-Galerien ohne eigenes Logo verwenden automatisch das Logo ihres zugehörigen Hauptsets
- die Rückfallreihenfolge lautet: eigenes Logo, Hauptset-Logo, Setsymbol, Hauptset-Symbol, Platzhalter
- der Fallback gilt in der Set-Übersicht und in den Set-Details

## Cardmarket

- Scanner, Sammlung, Wunschliste, Verlauf und SetDex verwenden dieselbe zentrale Linklogik
- vorhandene Cardmarket-Produkt-IDs aus TCGdex werden bevorzugt und direkt geöffnet
- fehlt die Produkt-ID in der Set-Kartenliste, lädt CardDex den vollständigen Kartendatensatz beim Antippen nach
- die Ersatzsuche verwendet nur Kartenname, offiziellen Setcode und Kartennummer
- Bindestriche vor Kartenmechaniken werden normalisiert, beispielsweise `Pikachu-ex` zu `Pikachu ex`
- bekannte Setcodes für Trainer-Galerien und aktuelle Mega-Sets werden berücksichtigt

## Datenübernahme

Bestehende Sammlungen, Wunschlisten, Set-Projekte, Bilder, Scannerhistorie und Backups bleiben erhalten. Die Cache-Version wurde erhöht, damit GitHub Pages und die installierte PWA die aktualisierten Dateien laden.
