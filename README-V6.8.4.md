# CardDex AI v6.8.4 – Cardmarket-Link-Fix

Diese Version korrigiert die Cardmarket-Weiterleitung im Scanner und in der Sammlung.

## Änderungen

- Cardmarket-Suchen enthalten keine langen, gemischtsprachigen Setnamen mehr.
- Interne TCGdex-Set-IDs wie `swsh11.5tg` werden nicht mehr mit der Kartennummer verklebt.
- Aus `SWSH11.5TGTG08` wird eine kurze Suche wie `Hisuian Arcanine TG08` oder – wenn vorhanden – `Hisuian Arcanine LOR TG08`.
- Der PTCGO/Cardmarket-Setcode der Pokémon TCG API wird gespeichert.
- Die Pokémon-TCG-Karten-ID wird gespeichert, damit vorhandene Cardmarket-Weiterleitungen dauerhaft genutzt werden können.
- Alte Sammlungseinträge laden fehlende Cardmarket-Metadaten beim Öffnen automatisch nach.
- Direkte Cardmarket- und `prices.pokemontcg.io`-Weiterleitungen werden robuster erkannt.
- Bilddaten bleiben bei der Link-Reparatur unverändert erhalten.
- App- und Service-Worker-Version auf 6.8.4 erhöht.

## Beispiel

Die Karte `Hisuian Arcanine · TG08` erzeugt nicht mehr die fehlerhafte Suche
`Hisuian Arcanine Verlorener Ursprung Trainer-Galerie SWSH11.5TGTG08`, sondern nutzt eine direkte Weiterleitung oder die kurze Suche `Hisuian Arcanine LOR TG08`.
