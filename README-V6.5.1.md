# CardDex AI v6.5.1

Dieses Korrekturupdate behebt die Regression aus v6.5 / Worker 2.2.

## Wichtigste Korrekturen

- KI-Nummern werden nicht mehr ungeprüft als sichere Kartennummer übernommen.
- Name und Kartennummer müssen zu demselben TCGdex-Datenbankeintrag passen.
- Bei einem Konflikt wird die KI-Nummer verworfen und OCR plus Bildvergleich übernehmen.
- Der Bildvergleich läuft auch bei erfolgreicher KI-Erkennung, damit die richtige Kartenvariante gewählt wird.
- Der Worker-Prompt enthält keine konkreten TG-/GG-Beispielnummern mehr, die das Modell zu falschen Antworten verleiten können.
- Fehlende deutsche Kartenbilder werden nach Möglichkeit aus dem englischen Datensatz derselben Karten-ID ergänzt.
- App-Version: 6.5.1
- Worker-Version: 2.2.1

## Installation

1. Alle Dateien aus dem App-ZIP direkt in die oberste Ebene des GitHub-Repositories hochladen und vorhandene Dateien ersetzen.
2. Den vollständigen Inhalt von `carddex-worker-v2.2.1.js` in den bestehenden Cloudflare-Worker kopieren und bereitstellen.
3. Das AI-Binding `AI` sowie das Secret `SCANNER_KEY` unverändert lassen.
4. Die GitHub-Pages-Adresse zuerst direkt in Safari öffnen und neu laden.
5. In den Erkennungsdetails kontrollieren, dass `CardDex AI App v6.5.1` angezeigt wird.

Wenn dort weiterhin v6.4 steht, läuft noch die alte App-Datei. Dann ist der neue Worker bereits aktiv, aber die GitHub-App wurde noch nicht korrekt ersetzt oder aktualisiert.
