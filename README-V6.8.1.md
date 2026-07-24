# CardDex AI v6.8.1 – Collector

## Änderungen

- Korrekt gelesene Kartennummern werden nicht mehr verworfen, nur weil TCGdex noch keinen Datensatz besitzt.
- Ein echter Widerspruch wird nur noch angenommen, wenn dieselbe Nummer in der Datenbank eindeutig zu einer anderen Karte gehört.
- Pokémon TCG API als schlüssellose englische Rückfallebene für Datensätze und Kartenbilder.
- Vorläufig erkannte Karten können inklusive eigenem Scanbild lokal in einer Sammlung gespeichert werden.
- Sichtbarer Status „Vorläufig erkannt“ beziehungsweise „Pokémon-API-Fallback“.
- Bildsystem unterstützt jetzt zusätzlich direkte Bild-URLs und lokale Scanbilder.
- Service-Worker-Cache und sichtbare Versionsnummer auf 6.8.1 aktualisiert.

## Testfall

Endivie / MEP 046 darf bei fehlendem TCGdex-Eintrag nicht mehr verworfen werden. Die Karte wird als vorläufiger Datensatz mit Cardmarket-Link und Scanbild angeboten.
