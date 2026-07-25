# CardDex AI

CardDex AI ist eine private, iPhone-optimierte Web-App zum Scannen, Erkennen und Sammeln von Pokémon-Karten.

## Aktuelle Version

**v6.12 – SetDex**

Die aktuelle Version ergänzt eine vollständige Set-Übersicht mit Sammlungsfortschritt, fehlenden Karten, Dubletten und direkter Wunschlisten-Verknüpfung. Für die Nutzung ist keine zusätzliche Anmeldung erforderlich.

## Hauptfunktionen

- geführter Live-Scanner und Bilder aus der Mediathek
- KI-Erkennung über einen optionalen eigenen Cloudflare Worker
- lokale OCR als Rückfallebene
- TCGdex und Pokémon TCG API als anmeldefreie Datenquellen
- stabile Cardmarket-Suche
- mehrere lokale Sammlungen
- Suche, Schnellfilter und Sortierung innerhalb jeder Sammlung
- automatische Erkennung und Kennzeichnung doppelter Karten
- Set-Übersicht mit Fortschritt, fehlenden Karten und Dubletten
- vollständige Set-Kartenlisten mit Wunschlisten- und Cardmarket-Aktionen
- Mengen, Sprache, Variante, Zustand, Kaufpreis, Kaufdatum und Notizen
- automatische Bild-Rückfallebenen
- lokales Dashboard
- Scannerhistorie mit Verifizierungsstatus
- JSON-Sicherung und Wiederherstellung
- installierbar als PWA auf dem iPhone

## Installation über GitHub Pages

1. Alle Dateien in das Hauptverzeichnis des Repositorys hochladen.
2. Unter `Settings → Pages` die Quelle `Deploy from a branch` wählen.
3. Branch `main` und Ordner `/(root)` auswählen.
4. Die veröffentlichte HTTPS-Adresse in Safari öffnen.
5. Über das Teilen-Menü `Zum Home-Bildschirm` auswählen.

## Projektstruktur

- `index.html` – Oberfläche
- `styles.css` – Gestaltung
- `app.js` – Scanner und Erkennung
- `collection.js` – Sammlungsdatenbank
- `carddex-core.js` – gemeinsame Kernfunktionen
- `library-engine.js` – Historie und Dashboard-Daten
- `library-ui.js` – Library-Oberfläche und Navigation
- `set-engine.js` – Set-Katalog, Fortschrittsberechnung und lokaler Set-Cache
- `set-ui.js` – Set-Übersicht und Kartenlisten
- `service-worker.js` – Offline-Cache und PWA-Aktualisierung
- `src.js` – optionaler Cloudflare-Worker

## Datenschutz

Sammlungen, Einstellungen und Scannerhistorie werden lokal auf dem Gerät gespeichert. Kartenbilder werden nur dann an den selbst eingerichteten Cloudflare Worker übertragen, wenn die optionale KI-Verbindung aktiviert ist.

Pokémon, Cardmarket und weitere genannte Marken gehören ihren jeweiligen Rechteinhabern. CardDex AI ist eine private Fan-Anwendung.


## v6.11 – Wishlist

Siehe `README-V6.11.md`.


## v6.11.1 – Wishlist Bugfix

Siehe `README-V6.11.1.md`.


## v6.12 – SetDex

Siehe `README-V6.12.md`.
