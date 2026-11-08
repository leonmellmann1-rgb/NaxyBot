# Spawner Tracker

## Aktueller Stand
- NaxyBot wird zum Discord-Spawner-Tracker umgebaut.
- Der bisherige Mineflayer-Code liegt separat unter backup-naxybot-vor-umbau/index.js.
- Der Bot ermittelt ausschließlich Ankaufangebote.
- Pro Spawner wird das höchste erkannte Ankaufangebot aus den konfigurierten Quellkanälen genommen.
- Eigener Ankaufspreis = höchstes Angebot minus 1.000.000.
- Erkennung von Schreibweisen wie Skeleton, Skelly, Skelett und Skelet.
- Ausgabe als Embed im eigenen Zielkanal; vorhandenes Tracker-Embed wird bei Updates bearbeitet.
- Standardmäßiger Scan alle 2 Minuten.

## Einrichtung später
GitHub speichert nur den Code. Für 24/7-Betrieb braucht es einen Host.
Benötigte Umgebungsvariablen:
- DISCORD_TOKEN
- TARGET_CHANNEL_ID
- SOURCE_CHANNEL_IDS (fünf Channel-IDs, kommasepariert)
- optional SCAN_INTERVAL_MINUTES (Standard 2)
- optional MAX_MESSAGES_PER_CHANNEL (Standard 150)

## Discord-Berechtigungen
Auf den Quellservern muss der Bot eingeladen sein und in den betreffenden Channels mindestens Kanal ansehen, Nachrichtenverlauf lesen und Message Content Intent verfügbar haben. Im Zielkanal zusätzlich Nachrichten senden und Links einbetten. Keine Administratorrechte nötig.

## Grenzen
- Ein Bot kann nicht automatisch Nachrichten aus Servern lesen, auf denen er nicht Mitglied ist.
- Die öffentliche Sichtbarkeit eines Servers reicht nicht aus.
- Message Content Intent muss im Discord Developer Portal aktiviert sein.
- Aktuell ist die erste Version auf Discord-Quellkanäle ausgelegt. FriendsWithMoney-Webdaten werden erst ergänzt, wenn eine erlaubte und stabile Datenquelle/Seite bekannt ist.
- Parser ist eine erste Version und muss mit echten Beispielnachrichten der Server getestet werden.
