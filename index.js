const fs = require('node:fs');
const path = require('node:path');
const {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || null;
const TEAM_ROLE_ID = process.env.TEAM_ROLE_ID || null;
const TEAM_REVIEW_CHANNEL_ID = process.env.TEAM_REVIEW_CHANNEL_ID || null;
const GIVEAWAY_CHANNEL_ID = process.env.GIVEAWAY_CHANNEL_ID || null;
const FILE = path.join(__dirname, 'naxy-data.json');

if (!TOKEN || !CLIENT_ID) {
  console.error('DISCORD_TOKEN und CLIENT_ID fehlen.');
  process.exit(1);
}

function readData() {
  try {
    const value = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return { guilds: value.guilds || {}, giveaways: value.giveaways || {}, requests: value.requests || {}, tickets: value.tickets || {} };
  } catch {
    return { guilds: {}, giveaways: {}, requests: {}, tickets: {} };
  }
}
const data = readData();
function save() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, FILE);
}
function id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function team(i) {
  return Boolean(i.guild && (i.user.id === i.guild.ownerId || i.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || (TEAM_ROLE_ID && i.member?.roles?.cache?.has(TEAM_ROLE_ID))));
}
function config(gid) { data.guilds[gid] ||= {}; return data.guilds[gid]; }
function button(customId, label, style, emoji) {
  const b = new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
  if (emoji) b.setEmoji(emoji);
  return b;
}
async function channelById(guild, channelId) {
  return channelId ? guild.channels.fetch(channelId).catch(() => null) : null;
}
function gwEmbed(g) {
  return new EmbedBuilder().setColor(0x5865F2).setTitle('Giveaway: ' + g.prize)
    .setDescription(g.description || 'Klicke auf Mitmachen, um teilzunehmen.')
    .addFields(
      { name: 'Teilnehmer', value: String(g.participants.length), inline: true },
      { name: 'Gewinner', value: g.manualWinners ? 'Manuelle Auslosung' : String((g.claimedWinners || []).length) + '/' + String(g.winnerCount || 1), inline: true },
      { name: 'Endet', value: '<t:' + Math.floor(g.endsAt / 1000) + ':R>', inline: true },
      { name: 'Claim-Frist', value: g.claimMinutes + ' Minuten', inline: true }
    ).setFooter({ text: 'Giveaway-ID: ' + g.id });
}
function parseDuration(input) {
  const value = String(input || '').trim().toUpperCase();
  const re = /(\d+)\s*(MIN(?:UTE|UTEN)?|M|H(?:OUR|OURS|STUNDE|STUNDEN)?|D(?:AY|AYS|TAG|TAGE|TAGS)?)/g;
  let match, total = 0, consumed = '', count = 0;
  while ((match = re.exec(value)) !== null) {
    const unit = match[2];
    const multiplier = unit === 'M' || unit.startsWith('MIN') ? 1 :
      (unit === 'H' || unit.startsWith('HOUR') || unit.startsWith('STUNDE') ? 60 : 1440);
    total += Number(match[1]) * multiplier;
    consumed += match[0].replace(/\s/g, '');
    count++;
  }
  if (!count || value.replace(/\s/g, '') !== consumed) return null;
  return total;
}
}
async function updateGw(guild, g) {
  const ch = await channelById(guild, g.channelId);
  const msg = ch && g.messageId ? await ch.messages.fetch(g.messageId).catch(() => null) : null;
  if (msg) await msg.edit({ embeds: [gwEmbed(g)], components: [new ActionRowBuilder().addComponents(button('gw_join:' + g.id, 'Mitmachen', ButtonStyle.Success, '🎉').setDisabled(g.status !== 'active'))] }).catch(() => {});
}
async function createPrivateChannel(guild, user, name, topic) {
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
    { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
  ];
  if (TEAM_ROLE_ID) {
    const role = await guild.roles.fetch(TEAM_ROLE_ID).catch(() => null);
    if (role) overwrites.push({ id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }
  return guild.channels.create({ name, type: ChannelType.GuildText, topic, permissionOverwrites: overwrites });
}
async function createClaim(guild, g, user) {
  const slug = user.username.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 16) || 'gewinner';
  const ch = await createPrivateChannel(guild, user, 'giveaway-claim-' + slug, 'Giveaway Claim ' + g.id + ' für ' + user.tag);
  g.claimedWinners ||= [];
  if (!g.claimedWinners.includes(user.id)) g.claimedWinners.push(user.id);
  g.status = 'drawing';
  g.claimChannelId = ch.id;
  g.claimedBy = user.id;
  save();
  await ch.send({
    content: (TEAM_ROLE_ID ? '<@&' + TEAM_ROLE_ID + '> ' : '') + '<@' + user.id + '>',
    embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('Giveaway Claim')
      .setDescription('Du hast ' + g.prize + ' gewonnen. Sende hier bitte deinen Minecraft-Namen oder die Angaben zur Übergabe.')],
    components: [new ActionRowBuilder().addComponents(button('claim_close:' + g.id, 'Claim schließen', ButtonStyle.Danger))]
  });
  return ch;
}
async function disableWinnerDM(g, user, label) {
  if (!g.winnerDmMessageId) return;
  const dm = await user.createDM().catch(() => null);
  const msg = dm ? await dm.messages.fetch(g.winnerDmMessageId).catch(() => null) : null;
  if (msg) await msg.edit({
    embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('Giveaway abgeschlossen').setDescription(label)],
    components: [new ActionRowBuilder().addComponents(button('gw_claim:' + g.id, 'Abgeschlossen', ButtonStyle.Secondary).setDisabled(true))]
  }).catch(() => {});
}
async function sendWinnerOffer(guild, g, winnerId) {
  g.winnerId = winnerId; g.status = 'awaiting_claim';
  g.claimExpiresAt = Date.now() + g.claimMinutes * 60000; save(); await updateGw(guild, g);
  const publicChannel = await channelById(guild, g.channelId);
  if (publicChannel) await publicChannel.send('🎉 Glückwunsch <@' + winnerId + '>! Du hast **' + g.prize + '** gewonnen. Prüfe deine DMs.');
  const user = await client.users.fetch(winnerId).catch(() => null);
  const dm = user ? await user.send({
    embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle('Du hast gewonnen! 🎉')
      .setDescription('Du hast **' + g.prize + '** gewonnen. Klicke auf „Annehmen“, wenn du deinen Preis möchtest. Du hast **' + g.claimMinutes + ' Minuten** Zeit.')
      .setFooter({ text: 'Giveaway-ID: ' + g.id })],
    components: [new ActionRowBuilder().addComponents(button('gw_claim:' + g.id, 'Annehmen', ButtonStyle.Success, '🎁'))]
  }).catch(() => null) : null;
  if (!dm) {
    g.status = 'winner_dm_failed'; save();
    const review = await channelById(guild, TEAM_REVIEW_CHANNEL_ID);
    if (review) await review.send('Die Gewinn-DM für <@' + winnerId + '> konnte nicht zugestellt werden. Bitte prüft Giveaway ' + g.id + '.');
    return;
  }
  g.winnerDmMessageId = dm.id; save();
  setTimeout(async () => {
    const freshGuild = await client.guilds.fetch(g.guildId).catch(() => null);
    if (freshGuild && g.status === 'awaiting_claim' && g.winnerId === winnerId)
      await requestTeamReroll(freshGuild, g, 'Die Annahmefrist ist abgelaufen.');
  }, Math.max(0, Math.min(2147480000, g.claimExpiresAt - Date.now())));
}
async function requestTeamReroll(guild, g, reason) {
  if (!g.winnerId || g.status !== 'awaiting_claim') return;
  g.status = 'awaiting_team_decision'; g.rerollReason = reason; save();
  const review = await channelById(guild, TEAM_REVIEW_CHANNEL_ID);
  if (review) await review.send({
    embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle('Team-Entscheidung: Giveaway-Gewinner')
      .setDescription('Gewinner: <@' + g.winnerId + '>\nGrund: ' + reason + '\nGiveaway-ID: ' + g.id + '\nSoll neu ausgelost werden?')],
    components: [new ActionRowBuilder().addComponents(button('gw_reroll_ok:' + g.id, 'Neu auslosen', ButtonStyle.Danger), button('gw_reroll_no:' + g.id, 'Gewinner behalten', ButtonStyle.Success))]
  });
  else { g.status = 'awaiting_claim'; save(); }
}
async function drawWinner(guild, g, reason) {
  g.claimedWinners ||= []; g.excluded ||= [];
  if (g.winnerId && ['awaiting_claim','awaiting_team_decision'].includes(g.status)) {
    if (!g.excluded.includes(g.winnerId)) g.excluded.push(g.winnerId);
    const old = await client.users.fetch(g.winnerId).catch(() => null);
    if (old) await disableWinnerDM(g, old, reason || 'Neuauslosung durch das Team.');
  }
  g.winnerId = null; g.winnerDmMessageId = null; g.claimExpiresAt = null;
  if (g.claimedWinners.length >= g.winnerCount) {
    g.status = 'finished'; save(); await updateGw(guild, g);
    const done = await channelById(guild, g.channelId);
    if (done) await done.send('🎉 Alle Gewinner haben ihren Preis angenommen!');
    return;
  }
  const pool = g.participants.filter(uid => !g.excluded.includes(uid) && !g.claimedWinners.includes(uid));
  if (!pool.length) {
    g.status = 'finished_no_winner'; save(); await updateGw(guild, g);
    const ch = await channelById(guild, g.channelId);
    if (ch) await ch.send('Giveaway beendet: Es gibt keine weiteren verfügbaren Teilnehmer.');
    return;
  }
  await sendWinnerOffer(guild, g, pool[Math.floor(Math.random() * pool.length)]);
}
function scheduleGw(g) {
  if (g.status !== 'active') return;
  setTimeout(async () => {
    if (g.status !== 'active') return;
    if (Date.now() < g.endsAt) return scheduleGw(g);
    const guild = await client.guilds.fetch(g.guildId).catch(() => null);
    if (!guild || g.status !== 'active') return;
    if (g.manualWinners) {
      g.status = 'awaiting_manual_winner'; save(); await updateGw(guild, g);
      const review = await channelById(guild, TEAM_REVIEW_CHANNEL_ID);
      if (review) await review.send('Giveaway **' + g.prize + '** ist beendet. Bitte lost manuell aus und legt den Gewinner mit /giveaway-manual-winner fest. ID: ' + g.id);
      const channel = await channelById(guild, g.channelId);
      if (channel) await channel.send('Das Giveaway ist beendet. Die Gewinnerauslosung übernimmt das Team.');
      return;
    }
    g.status = 'drawing';
    save();
    await drawWinner(guild, g, 'Giveaway-Laufzeit beendet.');
  }, Math.max(0, Math.min(2147480000, g.endsAt - Date.now())));
}
async function createTicket(guild, user, subject, details) {
  const slug = user.username.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 18) || 'user';
  const ch = await createPrivateChannel(guild, user, 'ticket-' + slug, 'Support-Ticket von ' + user.tag + ' (' + user.id + ')');
  data.tickets[ch.id] = { guildId: guild.id, userId: user.id, status: 'open' };
  save();
  await ch.send({
    content: (TEAM_ROLE_ID ? '<@&' + TEAM_ROLE_ID + '> ' : '') + '<@' + user.id + '>',
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Support-Ticket')
      .addFields({ name: 'Thema', value: subject }, { name: 'Anliegen', value: details })],
    components: [new ActionRowBuilder().addComponents(button('ticket_close:' + ch.id, 'Ticket schließen', ButtonStyle.Danger))]
  });
  return ch;
}

const commands = [
  new SlashCommandBuilder().setName('clear').setDescription('Löscht 1 bis 100 Nachrichten.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName('anzahl').setDescription('Anzahl').setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('Kickt ein Mitglied.')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o => o.setName('mitglied').setDescription('Mitglied').setRequired(true))
    .addStringOption(o => o.setName('grund').setDescription('Grund').setMaxLength(500)),
  new SlashCommandBuilder().setName('ban').setDescription('Bannt ein Mitglied.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName('mitglied').setDescription('Mitglied').setRequired(true))
    .addStringOption(o => o.setName('grund').setDescription('Grund').setMaxLength(500)),
  new SlashCommandBuilder().setName('timeout').setDescription('Setzt einen Timeout.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('mitglied').setDescription('Mitglied').setRequired(true))
    .addIntegerOption(o => o.setName('minuten').setDescription('Minuten').setMinValue(1).setMaxValue(40320).setRequired(true))
    .addStringOption(o => o.setName('grund').setDescription('Grund').setMaxLength(500)),
  new SlashCommandBuilder().setName('untimeout').setDescription('Entfernt einen Timeout.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('mitglied').setDescription('Mitglied').setRequired(true)),
  new SlashCommandBuilder().setName('ping').setDescription('Zeigt die Bot-Latenz.'),
  new SlashCommandBuilder().setName('help').setDescription('Zeigt alle Befehle.'),
  new SlashCommandBuilder().setName('serverinfo').setDescription('Zeigt Serverinformationen.'),
  new SlashCommandBuilder().setName('giveaway-request').setDescription('Reicht eine Giveaway-Anfrage beim Team ein.')
    .addStringOption(o => o.setName('gewinn').setDescription('Was wird verlost?').setMaxLength(180).setRequired(true))
    .addStringOption(o => o.setName('beschreibung').setDescription('Zusätzliche Infos').setMaxLength(800))
    .addChannelOption(o => o.setName('kanal').setDescription('Öffentlicher Giveaway-Kanal (optional)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
  new SlashCommandBuilder().setName('endgiveaway').setDescription('Beendet ein Giveaway sofort.')
    .addStringOption(o => o.setName('id').setDescription('Giveaway-ID').setRequired(true)),
  new SlashCommandBuilder().setName('reroll').setDescription('Startet nach Teamentscheidung eine Neuauslosung.')
    .addStringOption(o => o.setName('id').setDescription('Giveaway-ID').setRequired(true)),
  new SlashCommandBuilder().setName('giveaway-manual-winner').setDescription('Legt bei manueller Auslosung den Gewinner fest.')
    .addStringOption(o => o.setName('id').setDescription('Giveaway-ID').setRequired(true))
    .addUserOption(o => o.setName('mitglied').setDescription('Manuell ausgeloster Gewinner').setRequired(true)),
  new SlashCommandBuilder().setName('welcome-setup').setDescription('Legt den Welcome-Kanal fest.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o => o.setName('kanal').setDescription('Welcome-Kanal').addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder().setName('rollenpanel').setDescription('Erstellt ein Rollenpanel mit bis zu fünf auswählbaren Rollen.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addRoleOption(o => o.setName('rolle1').setDescription('Erste Rolle').setRequired(true))
    .addRoleOption(o => o.setName('rolle2').setDescription('Zweite Rolle (optional)'))
    .addRoleOption(o => o.setName('rolle3').setDescription('Dritte Rolle (optional)'))
    .addRoleOption(o => o.setName('rolle4').setDescription('Vierte Rolle (optional)'))
    .addRoleOption(o => o.setName('rolle5').setDescription('Fünfte Rolle (optional)'))
    .addStringOption(o => o.setName('text').setDescription('Beschreibung über den Buttons (optional)').setMaxLength(900)),
  new SlashCommandBuilder().setName('ticket-setup').setDescription('Erstellt das Support-Panel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('ticket-close').setDescription('Schließt das Ticket in diesem Kanal.'),
  new SlashCommandBuilder().setName('say').setDescription('Sendet eine Team-Nachricht als Bot.')
    .addStringOption(o => o.setName('nachricht').setDescription('Nachrichtentext').setMaxLength(2000).setRequired(true))
    .addChannelOption(o => o.setName('kanal').setDescription('Zielkanal').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addAttachmentOption(o => o.setName('bild').setDescription('Optionales Bild')),
  new SlashCommandBuilder().setName('sayembed').setDescription('Sendet eine formatierte Embed-Nachricht als Bot.')
    .addStringOption(o => o.setName('titel').setDescription('Titel').setMaxLength(256).setRequired(true))
    .addStringOption(o => o.setName('beschreibung').setDescription('Beschreibung').setMaxLength(4000))
    .addStringOption(o => o.setName('farbe').setDescription('Hex-Farbe, z. B. #5865F2').setMaxLength(7))
    .addStringOption(o => o.setName('bild_url').setDescription('HTTPS-Bildlink').setMaxLength(500))
    .addAttachmentOption(o => o.setName('bild').setDescription('Alternativ Bild hochladen'))
    .addChannelOption(o => o.setName('kanal').setDescription('Zielkanal').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
].map(c => c.toJSON());

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const rest = new REST({ version: '10' }).setToken(TOKEN);
async function register() {
  const route = GUILD_ID ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID) : Routes.applicationCommands(CLIENT_ID);
  await rest.put(route, { body: commands });
}
async function moderationProblem(i, member, permission) {
  if (!i.memberPermissions?.has(permission)) return 'Dir fehlt die nötige Berechtigung.';
  if (!member) return 'Mitglied nicht gefunden.';
  if (member.id === i.guild.ownerId || member.id === i.user.id) return 'Dieses Mitglied kann nicht moderiert werden.';
  if (member.roles.highest.position >= i.guild.members.me.roles.highest.position) return 'Die Rolle des Mitglieds ist gleich hoch oder höher als meine höchste Rolle.';
  if (i.user.id !== i.guild.ownerId) {
    const actor = await i.guild.members.fetch(i.user.id).catch(() => null);
    if (actor && member.roles.highest.position >= actor.roles.highest.position) return 'Die Rolle des Mitglieds ist gleich hoch oder höher als deine höchste Rolle.';
  }
  return null;
}
client.once('ready', () => {
  console.log('NAXY Helper online als ' + client.user.tag);
  for (const g of Object.values(data.giveaways)) {
    if (g.status === 'active') scheduleGw(g);
    if (g.status === 'awaiting_claim' && g.claimExpiresAt) {
      setTimeout(async () => {
        const guild = await client.guilds.fetch(g.guildId).catch(() => null);
        if (guild && g.status === 'awaiting_claim') await drawWinner(guild, g, 'Claim-Frist abgelaufen.');
      }, Math.max(0, Math.min(2147480000, g.claimExpiresAt - Date.now())));
    }
  }
});
client.on('guildMemberAdd', async member => {
  const cfg = config(member.guild.id);
  const ch = await channelById(member.guild, cfg.welcomeChannelId);
  if (!ch) return;
  const embed = new EmbedBuilder().setColor(0x57F287).setTitle('Willkommen! 👋')
    .setDescription('Hey <@' + member.id + '>, willkommen auf **' + member.guild.name + '**!')
    .setThumbnail(member.user.displayAvatarURL())
    .setFooter({ text: 'Mitglied #' + member.guild.memberCount });
  await ch.send({ embeds: [embed] }).catch(console.error);
});

client.on('interactionCreate', async i => {
  try {
    if (i.isChatInputCommand()) {
      const n = i.commandName;
      if (n === 'ping') return i.reply({ content: 'Pong! API-Latenz: ' + client.ws.ping + ' ms', ephemeral: true });
      if (n === 'help') return i.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('NAXY Helper')
        .setDescription('**Moderation**\n/clear · /kick · /ban · /timeout · /untimeout\n\n**Giveaways**\n/giveaway-request · /endgiveaway · /reroll\n\n**Server**\n/welcome-setup · /rolepanel · /ticket-setup · /ticket-close · /serverinfo\n\n**Nachrichten**\n/say · /sayembed')], ephemeral: true });
      if (!i.inGuild()) return i.reply({ content: 'Nur auf einem Server nutzbar.', ephemeral: true });

      if (n === 'serverinfo') return i.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(i.guild.name)
        .setThumbnail(i.guild.iconURL()).addFields(
          { name: 'Mitglieder', value: String(i.guild.memberCount), inline: true },
          { name: 'Erstellt', value: '<t:' + Math.floor(i.guild.createdTimestamp / 1000) + ':D>', inline: true },
          { name: 'Server-ID', value: i.guild.id })], ephemeral: true });

      if (n === 'say' || n === 'sayembed') {
        if (!team(i)) return i.reply({ content: 'Nur das Team darf /say und /sayembed verwenden.', ephemeral: true });
        const target = i.options.getChannel('kanal') || i.channel;
        if (!target || !target.isTextBased() || typeof target.send !== 'function') {
          return i.reply({ content: 'Der ausgewählte Kanal kann keine Nachrichten empfangen.', ephemeral: true });
        }
        const perms = target.permissionsFor(i.guild.members.me);
        if (!perms?.has(PermissionFlagsBits.SendMessages)) {
          return i.reply({ content: 'Mir fehlt im Zielkanal die Berechtigung „Nachrichten senden“.', ephemeral: true });
        }
        await i.deferReply({ ephemeral: true });
        if (n === 'say') {
          const content = i.options.getString('nachricht', true);
          const image = i.options.getAttachment('bild');
          if (image && !perms.has(PermissionFlagsBits.AttachFiles)) {
            return i.editReply('Mir fehlt im Zielkanal die Berechtigung „Dateien anhängen“.');
          }
          await target.send({ content, files: image ? [image.url] : [] });
          return i.editReply('Nachricht wurde in ' + target.toString() + ' gesendet.');
        }

        const title = i.options.getString('titel', true);
        const description = i.options.getString('beschreibung');
        const rawColor = i.options.getString('farbe') || '#5865F2';
        const imageUrl = i.options.getString('bild_url');
        const imageAttachment = i.options.getAttachment('bild');
        if (!/^#?[0-9a-fA-F]{6}$/.test(rawColor)) {
          return i.editReply('Ungültige Farbe. Nutze sechs Hex-Zeichen, zum Beispiel #5865F2.');
        }
        if (imageUrl && !/^https:\/\//i.test(imageUrl)) {
          return i.editReply('Der Bildlink muss mit https:// beginnen.');
        }
        if (!perms.has(PermissionFlagsBits.EmbedLinks)) {
          return i.editReply('Mir fehlt im Zielkanal die Berechtigung „Links einbetten“.');
        }
        const embed = new EmbedBuilder().setColor(parseInt(rawColor.replace('#', ''), 16)).setTitle(title);
        if (description) embed.setDescription(description);
        if (imageAttachment || imageUrl) {
          embed.setImage(imageAttachment ? imageAttachment.url : imageUrl);
        }
        await target.send({ embeds: [embed] });
        return i.editReply('Embed wurde in ' + target.toString() + ' gesendet.');
      }

      if (n === 'clear') {
        if (!i.memberPermissions?.has(PermissionFlagsBits.ManageMessages) || !i.appPermissions?.has(PermissionFlagsBits.ManageMessages)) return i.reply({ content: 'Dir oder mir fehlt „Nachrichten verwalten“.', ephemeral: true });
        await i.deferReply({ ephemeral: true });
        const deleted = await i.channel.bulkDelete(i.options.getInteger('anzahl', true), true);
        return i.editReply(deleted.size + ' Nachrichten gelöscht. Nachrichten älter als 14 Tage kann Discord nicht gesammelt löschen.');
      }

      if (['kick', 'ban', 'timeout', 'untimeout'].includes(n)) {
        const user = i.options.getUser('mitglied', true);
        const member = await i.guild.members.fetch(user.id).catch(() => null);
        const perm = n === 'kick' ? PermissionFlagsBits.KickMembers : n === 'ban' ? PermissionFlagsBits.BanMembers : PermissionFlagsBits.ModerateMembers;
        const problem = await moderationProblem(i, member, perm);
        if (problem) return i.reply({ content: problem, ephemeral: true });
        const reason = i.options.getString('grund') || 'Kein Grund angegeben';
        if (n === 'kick') {
          if (!i.appPermissions?.has(PermissionFlagsBits.KickMembers)) return i.reply({ content: 'Mir fehlt „Mitglieder kicken“.', ephemeral: true });
          await member.kick(i.user.tag + ': ' + reason);
          return i.reply({ content: user.tag + ' wurde gekickt.', ephemeral: true });
        }
        if (n === 'ban') {
          if (!i.appPermissions?.has(PermissionFlagsBits.BanMembers)) return i.reply({ content: 'Mir fehlt „Mitglieder bannen“.', ephemeral: true });
          await i.guild.members.ban(user.id, { reason: i.user.tag + ': ' + reason });
          return i.reply({ content: user.tag + ' wurde gebannt.', ephemeral: true });
        }
        if (!i.appPermissions?.has(PermissionFlagsBits.ModerateMembers)) return i.reply({ content: 'Mir fehlt „Mitglieder moderieren“.', ephemeral: true });
        if (n === 'timeout') {
          const minutes = i.options.getInteger('minuten', true);
          await member.timeout(minutes * 60000, i.user.tag + ': ' + reason);
          return i.reply({ content: 'Timeout für ' + user.tag + ': ' + minutes + ' Minuten.', ephemeral: true });
        }
        await member.timeout(null, i.user.tag + ': Timeout entfernt');
        return i.reply({ content: 'Timeout von ' + user.tag + ' entfernt.', ephemeral: true });
      }

      if (n === 'giveaway-request') {
        const review = await channelById(i.guild, TEAM_REVIEW_CHANNEL_ID);
        if (!review) return i.reply({ content: 'TEAM_REVIEW_CHANNEL_ID ist beim Hoster noch nicht gesetzt.', ephemeral: true });
        const target = i.options.getChannel('kanal') || i.channel;
        if (!target || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(target.type)) {
          return i.reply({ content: 'Bitte wähle einen Text- oder Ankündigungskanal.', ephemeral: true });
        }
        const rid = id();
        const req = { id: rid, guildId: i.guild.id, userId: i.user.id, userTag: i.user.tag,
          prize: i.options.getString('gewinn', true), description: i.options.getString('beschreibung') || '',
          publishChannelId: target.id, status: 'pending' };
        const slug = i.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 14) || 'mitglied';
        const privateChannel = await createPrivateChannel(i.guild, i.user, 'giveaway-anfrage-' + slug,
          'Giveaway-Anfrage ' + rid + ' von ' + i.user.tag);
        req.privateChannelId = privateChannel.id;
        data.requests[rid] = req;
        save();
        await privateChannel.send({
          content: (TEAM_ROLE_ID ? '<@&' + TEAM_ROLE_ID + '> ' : '') + '<@' + i.user.id + '>',
          embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle('Giveaway-Anfrage')
            .addFields(
              { name: 'Gewinn', value: req.prize },
              { name: 'Beschreibung', value: req.description || 'Keine zusätzlichen Infos' },
              { name: 'Vorgesehener Veröffentlichungs-Kanal', value: target.toString() },
              { name: 'Status', value: 'Wartet auf Prüfung durch das Team' }
            )]
        });
        await review.send({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle('Neue Giveaway-Anfrage')
          .setDescription('**Gewinn:** ' + req.prize + '\\n**Info:** ' + (req.description || 'Keine') +
            '\\n**Von:** <@' + req.userId + '>\\n**Zielkanal:** <#' + target.id + '>\\n**Privater Anfrage-Kanal:** <#' + privateChannel.id + '>')],
          components: [new ActionRowBuilder().addComponents(
            button('gw_approve:' + rid, 'Annehmen & einstellen', ButtonStyle.Success),
            button('gw_reject:' + rid, 'Ablehnen', ButtonStyle.Danger)
          )] });
        return i.reply({ content: 'Deine Anfrage wurde erstellt. Das Team prüft sie hier: ' + privateChannel.toString(), ephemeral: true });
      }

      if (n === 'endgiveaway' || n === 'reroll') {
        if (!team(i)) return i.reply({ content: 'Nur das Team darf das.', ephemeral: true });
        const g = data.giveaways[i.options.getString('id', true)];
        if (!g || g.guildId !== i.guild.id) return i.reply({ content: 'Giveaway nicht gefunden.', ephemeral: true });
        if (n === 'endgiveaway') {
          if (g.status !== 'active') return i.reply({ content: 'Giveaway läuft nicht mehr.', ephemeral: true });
          g.status = 'drawing'; save();
          await drawWinner(i.guild, g, 'Giveaway beendet.');
          return i.reply({ content: 'Giveaway beendet und Gewinner gezogen.', ephemeral: true });
        }
        if (!g.winnerId) return i.reply({ content: 'Es gibt gerade keinen Gewinner zum Ersetzen.', ephemeral: true });
        await drawWinner(i.guild, g, 'Team hat neu ausgelost.');
        return i.reply({ content: 'Neuer Gewinner gezogen.', ephemeral: true });
      }

      if (n === 'giveaway-manual-winner') {
        if (!team(i)) return i.reply({ content: 'Nur das Team darf den Gewinner festlegen.', ephemeral: true });
        const g = data.giveaways[i.options.getString('id', true)];
        const user = i.options.getUser('mitglied', true);
        if (!g || g.guildId !== i.guild.id || !g.manualWinners || g.status !== 'awaiting_manual_winner')
          return i.reply({ content: 'Dieses Giveaway wartet nicht auf eine manuelle Auslosung.', ephemeral: true });
        if (!g.participants.includes(user.id) || (g.claimedWinners || []).includes(user.id) || (g.excluded || []).includes(user.id)) return i.reply({ content: 'Diese Person ist nicht mehr für dieses Giveaway verfügbar.', ephemeral: true });
        await sendWinnerOffer(i.guild, g, user.id);
        return i.reply({ content: 'Gewinner ausgewählt. Die Person erhält eine DM mit dem Annehmen-Button.', ephemeral: true });
      }

      if (n === 'welcome-setup') {
        const ch = i.options.getChannel('kanal', true);
        config(i.guild.id).welcomeChannelId = ch.id; save();
        return i.reply({ content: 'Welcome-Kanal gesetzt: ' + ch.toString() + '. Der Server-Members-Intent muss im Developer Portal aktiviert sein.', ephemeral: true });
      }

      if (n === 'rollenpanel') {
        const roles = [1, 2, 3, 4, 5].map(number => i.options.getRole('rolle' + number)).filter(Boolean);
        if (!roles.length) return i.reply({ content: 'Wähle mindestens eine Rolle aus.', ephemeral: true });
        const botMember = await i.guild.members.fetchMe();
        const invalid = roles.find(role => role.managed || role.id === i.guild.id || role.position >= botMember.roles.highest.position);
        if (invalid) return i.reply({ content: 'Die Rolle ' + invalid.name + ' liegt über meiner Bot-Rolle oder kann nicht vergeben werden.', ephemeral: true });
        const uniqueRoles = [...new Map(roles.map(role => [role.id, role])).values()];
        const description = i.options.getString('text') || 'Klicke auf einen Button, um die jeweilige Rolle zu erhalten. Beim erneuten Klicken wird sie wieder entfernt.';
        const row = new ActionRowBuilder().addComponents(...uniqueRoles.map(role =>
          button('role_toggle:' + role.id, role.name.slice(0, 80), ButtonStyle.Primary)
        ));
        await i.channel.send({
          embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Rollenpanel').setDescription(description)],
          components: [row]
        });
        return i.reply({ content: 'Rollenpanel mit ' + uniqueRoles.length + ' Rolle(n) erstellt.', ephemeral: true });
      }

      if (n === 'ticket-setup') {
        await i.channel.send({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Support')
          .setDescription('Klicke auf Ticket erstellen. Der private Support-Channel ist nur für dich und das Team sichtbar.')],
          components: [new ActionRowBuilder().addComponents(button('ticket_open', 'Ticket erstellen', ButtonStyle.Primary, '🎫'))] });
        return i.reply({ content: 'Ticket-Panel erstellt.', ephemeral: true });
      }

      if (n === 'ticket-close') {
        const t = data.tickets[i.channelId];
        if (!t || (t.userId !== i.user.id && !team(i))) return i.reply({ content: 'Du darfst dieses Ticket nicht schließen.', ephemeral: true });
        await i.reply({ content: 'Ticket wird geschlossen.', ephemeral: true });
        t.status = 'closed'; save();
        setTimeout(() => i.channel.delete().catch(() => {}), 4000);
        return;
      }
    }

    if (i.isButton()) {
      const parts = i.customId.split(':');
      const action = parts[0];
      const key = parts[1];

      if (action === 'role_toggle') {
        const role = await i.guild.roles.fetch(key).catch(() => null);
        if (!role || role.managed || role.id === i.guild.id) {
          return i.reply({ content: 'Diese Rolle ist nicht mehr verfügbar.', ephemeral: true });
        }
        const member = await i.guild.members.fetch(i.user.id);
        const botMember = await i.guild.members.fetchMe();
        if (role.position >= botMember.roles.highest.position || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
          return i.reply({ content: 'Der Bot darf diese Rolle nicht vergeben. Prüfe seine Rollenposition und Berechtigung „Rollen verwalten“.', ephemeral: true });
        }
        if (member.roles.cache.has(role.id)) {
          await member.roles.remove(role, 'Rollenpanel: Mitglied hat Button erneut geklickt.');
          return i.reply({ content: 'Rolle **' + role.name + '** wurde entfernt.', ephemeral: true });
        }
        await member.roles.add(role, 'Rollenpanel: Mitglied hat Button geklickt.');
        return i.reply({ content: 'Du hast die Rolle **' + role.name + '** erhalten.', ephemeral: true });
      }

      if (action === 'gw_approve') {
        const req = data.requests[key];
        if (!req || req.status !== 'pending') return i.reply({ content: 'Anfrage ist nicht mehr offen.', ephemeral: true });
        if (!team(i)) return i.reply({ content: 'Nur das Team kann annehmen.', ephemeral: true });
        const modal = new ModalBuilder().setCustomId('gw_config:' + key).setTitle('Giveaway einstellen');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('duration').setLabel('Laufzeit (z. B. 10 MIN, 2 H, 1 D)').setPlaceholder('10 MIN oder 1 H 30 MIN').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('claim').setLabel('Zeit zum Annehmen (z. B. 2 H)').setPlaceholder('60 MIN').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('winners').setLabel('Gewinnerzahl (leer = manuell)').setPlaceholder('z. B. 1 oder leer lassen').setMaxLength(4).setStyle(TextInputStyle.Short).setRequired(false))
        );
        return i.showModal(modal);
      }
      if (action === 'gw_reject') {
        const req = data.requests[key];
        if (!req || req.status !== 'pending') return i.reply({ content: 'Anfrage ist nicht mehr offen.', ephemeral: true });
        if (!team(i)) return i.reply({ content: 'Nur das Team kann ablehnen.', ephemeral: true });
        req.status = 'rejected'; save();
        await i.update({ content: 'Anfrage abgelehnt.', embeds: [], components: [] });
        const user = await client.users.fetch(req.userId).catch(() => null);
        if (user) user.send('Deine Giveaway-Anfrage für ' + req.prize + ' wurde abgelehnt.').catch(() => {});
        return;
      }
      if (action === 'gw_join') {
        const g = data.giveaways[key];
        if (!g || g.status !== 'active') return i.reply({ content: 'Dieses Giveaway ist nicht aktiv.', ephemeral: true });
        if (g.participants.includes(i.user.id)) return i.reply({ content: 'Du bist bereits dabei. Zum Verlassen nutze die DM.', ephemeral: true });
        g.participants.push(i.user.id); save();
        await updateGw(i.guild, g);
        const dmSent = await i.user.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('Du bist dabei! 🎉')
          .setDescription('Du nimmst an **' + g.prize + '** teil. Du kannst deine Teilnahme hier zurückziehen.')],
          components: [new ActionRowBuilder().addComponents(button('gw_leave:' + key, 'Teilnahme verlassen', ButtonStyle.Danger))] }).then(() => true).catch(() => false);
        return i.reply({
          content: dmSent ? 'Du bist dabei! Du kannst deine Teilnahme hier oder per DM verlassen.' : 'Du bist dabei! Du kannst deine Teilnahme über diesen Button verlassen.',
          components: [new ActionRowBuilder().addComponents(button('gw_leave:' + key, 'Teilnahme verlassen', ButtonStyle.Danger))],
          ephemeral: true
        });
      }
      if (action === 'gw_leave') {
        const g = data.giveaways[key];
        if (!g || g.status !== 'active') return i.reply({ content: 'Dieses Giveaway ist nicht aktiv.', ephemeral: true });
        g.participants = g.participants.filter(uid => uid !== i.user.id); save();
        await i.update({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('Teilnahme beendet').setDescription('Du bist nicht mehr bei diesem Giveaway dabei.')], components: [] });
        const guild = await client.guilds.fetch(g.guildId).catch(() => null);
        if (guild) await updateGw(guild, g);
        return;
      }
      if (action === 'gw_claim') {
        const g = data.giveaways[key];
        if (!g || g.status !== 'awaiting_claim' || g.winnerId !== i.user.id) return i.reply({ content: 'Dieser Claim gehört nicht dir oder ist abgelaufen.', ephemeral: true });
        await i.deferUpdate();
        const guild = await client.guilds.fetch(g.guildId);
        const ch = await createClaim(guild, g, i.user);
        await disableWinnerDM(g, i.user, 'Gewinn angenommen. Claim-Kanal: ' + ch.name);
        g.winnerId = null; g.winnerDmMessageId = null; g.claimExpiresAt = null;
        if (g.manualWinners) {
          g.status = 'awaiting_manual_winner'; save(); await updateGw(guild, g);
        } else if (g.claimedWinners.length < (g.winnerCount || 1)) {
          save();
          await drawWinner(guild, g, 'Der nächste Gewinner wird gezogen.');
        } else {
          g.status = 'finished';
          save();
          await updateGw(guild, g);
          const publicChannel = await channelById(guild, g.channelId);
          if (publicChannel) await publicChannel.send('🎉 Alle ' + g.claimedWinners.length + ' Gewinner haben ihren Gewinn angenommen!');
        }
        await i.followUp({ content: 'Dein privater Claim-Kanal wurde erstellt: ' + ch.toString() }).catch(() => {});
        return;
      }
      if (action === 'gw_reroll_request') {
        const g = data.giveaways[key];
        if (!g || g.status !== 'awaiting_claim' || g.winnerId !== i.user.id) {
          return i.reply({ content: 'Dieser Gewinn ist nicht mehr offen.', ephemeral: true });
        }
        await i.deferUpdate();
        const guild = await client.guilds.fetch(g.guildId);
        await requestTeamReroll(guild, g, 'Der Gewinner hat den Gewinn abgelehnt.');
        return;
      }
      if (action === 'gw_reroll_ok' || action === 'gw_reroll_no') {
        if (!team(i)) return i.reply({ content: 'Nur das Team darf entscheiden.', ephemeral: true });
        const g = data.giveaways[key];
        if (!g || g.status !== 'awaiting_team_decision') return i.reply({ content: 'Für dieses Giveaway ist gerade keine Teamentscheidung offen.', ephemeral: true });
        if (action === 'gw_reroll_ok') {
          await drawWinner(i.guild, g, 'Das Team hat die Neuauslosung bestätigt.');
          return i.update({ content: 'Neuauslosung durchgeführt.', components: [], embeds: [] });
        }
        g.status = 'awaiting_claim'; save();
        const winner = await client.users.fetch(g.winnerId).catch(() => null);
        if (winner) winner.send('Das Team hat entschieden, dass du Gewinner bleibst. Bitte klicke in deiner vorherigen DM auf „Annehmen“.').catch(() => {});
        return i.update({ content: 'Der bisherige Gewinner bleibt bestehen.', components: [], embeds: [] });
      }
      if (action === 'claim_close') {
        const g = data.giveaways[key];
        if (!g || !team(i)) return i.reply({ content: 'Nur das Team kann diesen Claim schließen.', ephemeral: true });
        await i.reply({ content: 'Claim wird geschlossen.', ephemeral: true });
        setTimeout(() => i.channel.delete().catch(() => {}), 4000);
        return;
      }
      if (action === 'role_toggle') {
        const role = await i.guild.roles.fetch(key).catch(() => null);
        if (!role || role.managed || role.position >= i.guild.members.me.roles.highest.position) return i.reply({ content: 'Diese Rolle kann ich nicht vergeben.', ephemeral: true });
        const member = await i.guild.members.fetch(i.user.id);
        if (member.roles.cache.has(role.id)) {
          await member.roles.remove(role);
          return i.reply({ content: 'Rolle entfernt: ' + role.name, ephemeral: true });
        }
        await member.roles.add(role);
        return i.reply({ content: 'Rolle hinzugefügt: ' + role.name, ephemeral: true });
      }
      if (action === 'ticket_open') {
        const modal = new ModalBuilder().setCustomId('ticket_create').setTitle('Support-Ticket');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('subject').setLabel('Thema').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('details').setLabel('Beschreibe dein Anliegen').setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(true))
        );
        return i.showModal(modal);
      }
      if (action === 'ticket_close') {
        const t = data.tickets[i.channelId];
        if (!t || (t.userId !== i.user.id && !team(i))) return i.reply({ content: 'Du darfst dieses Ticket nicht schließen.', ephemeral: true });
        await i.reply({ content: 'Ticket wird geschlossen.', ephemeral: true });
        t.status = 'closed'; save();
        setTimeout(() => i.channel.delete().catch(() => {}), 4000);
        return;
      }
    }

    if (i.isModalSubmit()) {
      if (i.customId.startsWith('gw_config:')) {
        if (!i.inGuild() || !team(i)) return i.reply({ content: 'Nur das Team kann konfigurieren.', ephemeral: true });
        const rid = i.customId.split(':')[1];
        const req = data.requests[rid];
        if (!req || req.status !== 'pending') return i.reply({ content: 'Anfrage nicht mehr offen.', ephemeral: true });
        const duration = parseDuration(i.fields.getTextInputValue('duration'));
        const claimMinutes = parseDuration(i.fields.getTextInputValue('claim'));
        const winnerRaw = i.fields.getTextInputValue('winners').trim();
        const winnerCount = winnerRaw ? Number(winnerRaw) : null;
        if (!Number.isInteger(duration) || duration < 1 || duration > 43200 || !Number.isInteger(claimMinutes) || claimMinutes < 1 || claimMinutes > 10080 ||
            (winnerRaw && (!Number.isInteger(winnerCount) || winnerCount < 1 || winnerCount > 1000))) {
          return i.reply({ content: 'Laufzeit: 1 Minute bis 30 Tage. Annahmefrist: 1 Minute bis 7 Tage. Gewinnerzahl: 1–1000 oder leer lassen.', ephemeral: true });
        }
        const postChannel = await channelById(i.guild, req.publishChannelId) ||
          await channelById(i.guild, GIVEAWAY_CHANNEL_ID) || i.channel;
        const g = { id: rid, guildId: i.guild.id, prize: req.prize, description: req.description,
          creatorId: req.userId, channelId: postChannel.id, participants: [], excluded: [], claimedWinners: [],
          winnerCount, manualWinners: !winnerRaw, status: 'active', endsAt: Date.now() + duration * 60000, claimMinutes };
        data.giveaways[rid] = g; req.status = 'approved'; save();
        const msg = await postChannel.send({ embeds: [gwEmbed(g)], components: [new ActionRowBuilder().addComponents(button('gw_join:' + rid, 'Mitmachen', ButtonStyle.Success, '🎉'))] });
        g.messageId = msg.id; save(); scheduleGw(g);
        return i.reply({ content: 'Giveaway veröffentlicht. ID: ' + rid, ephemeral: true });
      }
      if (i.customId === 'ticket_create') {
        const subject = i.fields.getTextInputValue('subject');
        const details = i.fields.getTextInputValue('details');
        const ch = await createTicket(i.guild, i.user, subject, details);
        return i.reply({ content: 'Dein privater Support-Channel wurde erstellt: ' + ch.toString(), ephemeral: true });
      }
    }
  } catch (error) {
    console.error('Fehler bei Interaction:', error);
    const msg = 'Aktion fehlgeschlagen. Prüfe Bot-Rechte, Rollenposition und Kanal-Einstellungen.';
    if (i.deferred || i.replied) await i.followUp({ content: msg, ephemeral: true }).catch(() => {});
    else await i.reply({ content: msg, ephemeral: true }).catch(() => {});
  }
});

(async () => {
  try {
    await register();
    await client.login(TOKEN);
  } catch (error) {
    console.error('Bot-Start fehlgeschlagen:', error);
    process.exit(1);
  }
})();
