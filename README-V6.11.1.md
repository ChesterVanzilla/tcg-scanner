# CardDex AI v6.11.1 – Wishlist Bugfix

## Behoben

- Kartennummern wie `116/086` behalten führende Nullen im Nenner.
- Einzelne Symbole oder zwei Seltenheitssterne werden nicht mehr als Nenner `2` übernommen.
- Erkennt die KI `116/2`, können Name und Kartennummer über den passenden Datenbankeintrag auf `116/086` korrigiert werden.
- Die Datenbankbestätigung berücksichtigt neben Name und Nummer nun auch den Nenner und Kartenmechaniken wie `Mega` und `ex`.
- Karten mit alleinstehender Nummer wie `046`, `MEP 046` oder Promokennungen bleiben weiterhin gültig und erhalten keinen künstlichen Nenner.
- Die Versionsanzeige verwendet zentral `v6.11.1` in Startanimation, Einstellungen, Debug-Ausgabe und Footer.

## Bedienung der Scanergebnisse

- Die dauerhaft sichtbare Sammlungs-Auswahlliste wurde entfernt.
- `Zur Sammlung hinzufügen` öffnet nun eine kompakte Auswahl von unten.
- In dieser Auswahl erscheinen nur echte Sammlungen; die Wunschliste ist kein Sammlungsziel mehr.
- Die Wunschliste ist eine eigene kompakte Stern-Aktion.
- Cardmarket ist als zweite kompakte Aktion neben der Wunschliste angeordnet.
- Die alternative Cardmarket-Suche liegt nur noch unter `Weitere Optionen`.
- Auch in der Scannerhistorie ist die Wunschliste von der normalen Sammlungswahl getrennt.

## Datenübernahme

Bestehende Sammlungen, Wunschlisten, Bilder, Cardmarket-Links und Scannerhistorie bleiben vollständig erhalten.
