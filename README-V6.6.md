# CardDex AI v6.6 – Retro-Systemupdate

Diese Version baut auf CardDex AI v6.5.1 auf. Die Kartenerkennung und die Worker-Schnittstelle bleiben erhalten; das Update konzentriert sich auf Bedienung, Kamera und Retro-Atmosphäre.

## Neu

- kurze Pokédex-Startanimation, antippbar und in den Einstellungen deaktivierbar
- seitlich von rechts einschiebendes Retro-Systemmenü
- KI-Verbindung und Diagnose aus dem Hauptscreen in die Einstellungen verschoben
- Kamera-Umschalter im Live-Scanner, sofern Safari mehrere Rückkameras bereitstellt
- optionale Speicherung der zuletzt gewählten Kamera
- Schutzhüllen-/Toploader-Modus mit größerem Sicherheitsrand und dezenter Kontrastkopie
- einstellbare Kartensprache und Anzahl der angezeigten Treffer
- App-Cache leeren und Bedienungseinstellungen zurücksetzen
- App- und Worker-Version im Systemmenü

## Installation

Den kompletten Inhalt dieses Ordners in die oberste Ebene des GitHub-Repositories laden und die bisherigen Dateien ersetzen.

Der Cloudflare-Worker 2.2.1 muss für dieses Update nicht verändert werden. Worker-Adresse und privater Schlüssel verwenden weiterhin dieselben Local-Storage-Schlüssel und bleiben beim Update erhalten.

## Prüfung nach dem Upload

Unter Einstellungen > System & Wartung muss `APP v6.6` stehen. In den Erkennungsdetails steht nach einem Scan `CardDex AI App v6.6`.
