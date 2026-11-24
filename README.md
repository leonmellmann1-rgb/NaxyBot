# NAXY Helper

Neustart des Discord-Bots mit discord.js v14 und Node.js 20+.

## Einrichtung

1. Node.js 20 oder neuer verwenden.
2. Im Projektordner `npm install` ausführen.
3. Umgebungsvariablen aus `.env.example` beim Hoster eintragen.
4. Den Bot mit den Scopes `bot` und `applications.commands` einladen.
5. Im Developer Portal den **Server Members Intent** aktivieren, damit Welcome-Nachrichten funktionieren.
6. Dem Bot die benötigten Rechte geben und seine Bot-Rolle über die Rollen setzen, die er verwalten soll.
7. `npm start` starten.

## Umgebungsvariablen

- `DISCORD_TOKEN`: Bot-Token, niemals veröffentlichen.
- `CLIENT_ID`: Application ID.
- `GUILD_ID`: optional; registriert Slash-Commands sofort nur auf diesem Testserver.
- `TEAM_ROLE_ID`: optionale Team-Rolle für private Claim- und Ticket-Kanäle sowie Team-Aktionen.
- `TEAM_REVIEW_CHANNEL_ID`: Textkanal, in dem Giveaway-Anfragen und Neuauslosungsanfragen landen.
- `GIVEAWAY_CHANNEL_ID`: optionaler Standardkanal für angenommene Giveaways. Ohne diesen Wert wird im Team-Prüfungskanal veröffentlicht.

## Slash-Commands

### Moderation
- `/clear anzahl` – löscht 1 bis 100 Nachrichten.
- `/kick mitglied grund`
- `/ban mitglied grund`
- `/timeout mitglied minuten grund`
- `/untimeout mitglied`

### Giveaways
- `/giveaway-request gewinn beschreibung` – für alle Mitglieder verfügbar; das Team nimmt an oder lehnt ab.
- Bei Annahme stellt das Team Laufzeit und Claim-Frist ein.
- Teilnehmer erhalten eine DM mit der Möglichkeit, ihre Teilnahme zurückzuziehen.
- Gewinner erhalten eine DM zum Beanspruchen oder zum Anfragen einer Neuauslosung.
- Nach dem Beanspruchen wird automatisch ein privater `giveaway-claim`-Kanal für Gewinner und Team erstellt.
- Läuft die Claim-Frist ab, wird automatisch neu ausgelost.
- `/endgiveaway id` und `/reroll id` – Team-Aktionen.

### Server und Support
- `/welcome-setup kanal` – Welcome-Kanal festlegen.
- `/rolepanel rolle text` – Rollenbutton im aktuellen Kanal posten.
- `/ticket-setup` – Support-Panel posten.
- `/ticket-close` – Ticket schließen (Ersteller oder Team).
- `/serverinfo`, `/ping`, `/help`.

## Hinweise

- Discord kann Nachrichten, die älter als 14 Tage sind, nicht per Bulk-Delete löschen.
- Für Welcome-Nachrichten muss der Server Members Intent im Discord Developer Portal aktiviert sein.
- Die Daten werden lokal in `naxy-data.json` gespeichert. Beim Hoster sollte deshalb persistenter Speicher aktiviert sein, sonst können Daten bei einem Neustart oder Redeploy verloren gehen.
- Die Bot-Rolle muss oberhalb der Rollen liegen, die der Bot vergeben oder moderieren soll.
- Teste die Funktionen zuerst auf einem Testserver.
