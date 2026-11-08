# Spawner Tracker – Projektstand

Stand: 08.11.2026

## Ziel
Den bisher ungenutzten NaxyBot zu einem Discord-Bot namens „Spawner Tracker“ umbauen. Es soll kein zusätzlicher zweiter Bot entstehen: Die vorhandene Bot-Anwendung wird umfunktioniert und anschließend unter dem Namen Spawner Tracker eingeladen.

## Gewünschte Funktionen
- Ankaufpreise für Minecraft-Spawner auswerten; keine Verkaufspreise als Ziel.
- Preise aus fünf Discord-Marktservern sowie FriendsWithMoney (FWM), sofern die Daten dort legal und technisch zugänglich sind.
- Pro Spawner das höchste gefundene Ankaufangebot bestimmen.
- Eigenen Ankaufspreis berechnen: höchstes Angebot minus exakt 1.000.000.
- Schreibvarianten und Synonyme erkennen, z. B. Skelly, Skeleton und Skelett.
- Regelmäßig ein neues Embed im festgelegten Kanal des eigenen Discord-Servers veröffentlichen.
- Veröffentlichungsintervall ist noch festzulegen.
- Server-IDs und Kanal-IDs liefert der Nutzer später.

## Wichtige technische Grenzen
- Ein normaler Discord-Bot kann Nachrichten anderer Server nur lesen, wenn er dort eingeladen wurde und die nötigen Berechtigungen besitzt.
- Öffentliche Sichtbarkeit eines Discord-Servers bedeutet nicht, dass der Bot dessen Nachrichten automatisch lesen kann.
- Kein Selfbot und keine Automatisierung eines normalen Nutzerkontos.
- Alternative Quellen: offizielle/erlaubte API oder öffentlich zugängliche Preisdaten auf FWM.
- Discord-Token und andere Geheimnisse ausschließlich als Umgebungsvariablen beim Hosting speichern, niemals in GitHub-Code oder Chat schreiben.

## Hosting
GitHub speichert den Quellcode, führt den Bot aber nicht dauerhaft aus. Für 24/7-Betrieb wird später ein separater Host benötigt.

## Noch offen
- Die fünf Quellserver und ihre erlaubten Zugriffswege.
- FWM-Webadresse bzw. konkrete Datenquelle.
- Zielserver-ID und Zielkanal-ID.
- Quellserver-/Quellkanal-IDs.
- Veröffentlichungsintervall.
- Hosting-Anbieter und Umgebungsvariablen.

## Umbauplan
1. Bestehenden NaxyBot-Code vor Änderungen sichern.
2. Minecraft-Funktionen entfernen und Discord-Bot-Grundlage für Spawner Tracker einrichten.
3. Parser, Preisvergleich, Alias-Erkennung und Embed-Ausgabe implementieren.
4. Mit erlaubten Quellen testen.
5. Hosting einrichten und Bot in den eigenen Discord-Server einladen.
