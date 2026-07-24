# CardDex AI v6.8.5 – Cardmarket-Stabilitätsfix

Diese Version entfernt die zeitweise fehlerhafte Zwischenweiterleitung über `prices.pokemontcg.io` vollständig aus Scanner und Sammlung.

## Änderungen

- Nur echte Cardmarket-Produktlinks unter `cardmarket.com/.../Products/Singles/...` gelten noch als direkte Links.
- Weiterleitungen über `prices.pokemontcg.io` werden nicht mehr erzeugt, gespeichert oder geöffnet.
- Wenn kein echter Produktlink vorhanden ist, verwendet CardDex immer eine kurze Cardmarket-Suche aus Kartenname, Setcode und Kartennummer.
- Scanner und Sammlung benutzen dieselbe Linkprüfung.
- Bereits gespeicherte instabile Weiterleitungen werden beim ersten Start der neuen Version automatisch aus der lokalen Datenbank entfernt.
- Cardmarket-Preise aus der Pokémon TCG API bleiben erhalten; nur der instabile Link wird entfernt.
- Die Schaltfläche zeigt nun korrekt „Auf Cardmarket suchen“, wenn nur eine Suche verfügbar ist.
- App-, Script- und Service-Worker-Version wurden auf 6.8.5 erhöht.

## Beispiel

Für `Hisui-Arkani / Hisuian Arcanine · TG08` wird nun dauerhaft eine Cardmarket-Suche wie
`Hisui-Arkani LOR TG08` oder `Hisuian Arcanine LOR TG08` geöffnet. Die wechselhafte Zwischenadresse über `prices.pokemontcg.io` wird nicht mehr verwendet.
