# CardScan CM v6.1 – KI-Diagnose und Bildausrichtung

Ersetze im GitHub-Repository nur:

- `app.js`
- `service-worker.js`

Änderungen:

- Die Cloudflare-KI erhält immer den ursprünglichen aufrechten Kartenausschnitt.
- KI und lokale OCR laufen parallel.
- Worker-Fehler werden nicht mehr still verschluckt.
- In den Erkennungsdetails erscheinen HTTP-Status und Fehlermeldung.
- Beim Speichern der KI-Daten wird `/health` geprüft.
- Neuer Cache-Name `cardscan-cm-v6-1`.
