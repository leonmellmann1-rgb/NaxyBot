# NAXY Helper

Neustart des Discord-Bots auf Basis von discord.js v14.

## Einrichtung

1. Node.js 20 oder neuer installieren.
2. `npm install` ausführen.
3. Die Umgebungsvariablen aus `.env.example` beim Hoster hinterlegen.
4. Den Bot im Discord Developer Portal mit den Scopes `bot` und `applications.commands` einladen.
5. Dem Bot die benötigten Serverrechte geben und seine Rolle über die Rollen der Mitglieder setzen.
6. `npm start` starten.

## Umgebungsvariablen

- `DISCORD_TOKEN`: Bot-Token (geheim halten)
- `CLIENT_ID`: Application ID des Bots
- `GUILD_ID`: optional; registriert Befehle sofort nur auf diesem Testserver. Ohne diese Variable werden globale Commands registriert.

## Aktuelle Slash-Commands

- `/clear anzahl` – löscht 1 bis 100 aktuelle Nachrichten.
- `/kick mitglied [grund]`
- `/ban mitglied [grund]`
- `/timeout mitglied minuten [grund]` – 1 bis 40.320 Minuten.
- `/untimeout mitglied`
- `/ping`
- `/help`

Moderationsbefehle prüfen die Discord-Berechtigungen und die Rollen-Hierarchie. Discord kann Nachrichten, die älter als 14 Tage sind, nicht per Bulk-Delete löschen.

## Geplante Module

Giveaway-Anfragen mit Team-Freigabe, Laufzeit und Claim-Frist, persönliche Gewinner-DMs, private `giveaway-claim`-Kanäle, Rollenpanels, Welcome-System und Support-Tickets.
