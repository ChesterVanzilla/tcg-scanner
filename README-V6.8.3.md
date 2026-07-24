# CardDex AI v6.8.3 – Persistenz- und Cardmarket-Fix

- Pokémon-TCG-API-Bilder bleiben dauerhaft im IndexedDB-Kartendatensatz gespeichert.
- Parallel laufende Reparaturen dürfen ein erfolgreiches Direktbild nicht mehr überschreiben.
- Direkte PNG/JPG/WebP-URLs werden unabhängig vom alten Kennzeichen erkannt.
- Die von der Pokémon TCG API gelieferten `prices.pokemontcg.io/cardmarket/...`-Weiterleitungen werden als gültige Kartenlinks übernommen.
- Die Cardmarket-Ersatzsuche nutzt englischen Namen, Setname, Setcode und Kartennummer.
- App- und Service-Worker-Version auf 6.8.3 erhöht.
