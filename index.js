const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
  console.error('Fehler: DISCORD_TOKEN und CLIENT_ID müssen gesetzt sein.');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Löscht eine bestimmte Anzahl Nachrichten.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(option =>
      option.setName('anzahl')
        .setDescription('Anzahl der Nachrichten (1 bis 100)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Wirft ein Mitglied vom Server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(option => option.setName('mitglied').setDescription('Mitglied').setRequired(true))
    .addStringOption(option => option.setName('grund').setDescription('Grund').setMaxLength(500)),
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bannt ein Mitglied vom Server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(option => option.setName('mitglied').setDescription('Mitglied').setRequired(true))
    .addStringOption(option => option.setName('grund').setDescription('Grund').setMaxLength(500)),
  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Gibt einem Mitglied einen Timeout.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option => option.setName('mitglied').setDescription('Mitglied').setRequired(true))
    .addIntegerOption(option => option.setName('minuten').setDescription('Dauer in Minuten (1 bis 40320)').setMinValue(1).setMaxValue(40320).setRequired(true))
    .addStringOption(option => option.setName('grund').setDescription('Grund').setMaxLength(500)),
  new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Entfernt den Timeout eines Mitglieds.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option => option.setName('mitglied').setDescription('Mitglied').setRequired(true)),
  new SlashCommandBuilder().setName('ping').setDescription('Zeigt die Bot-Latenz.'),
  new SlashCommandBuilder().setName('help').setDescription('Zeigt alle NAXY Helper-Befehle.')
].map(command => command.toJSON());

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const rest = new REST({ version: '10' }).setToken(token);

async function registerCommands() {
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  await rest.put(route, { body: commands });
  console.log(guildId
    ? 'Slash-Commands für den Testserver registriert.'
    : 'Globale Slash-Commands registriert.');
}

async function canModerate(interaction, targetMember, permission) {
  if (!interaction.memberPermissions?.has(permission)) return 'Dir fehlt die benötigte Berechtigung.';
  if (!targetMember) return 'Dieses Mitglied ist nicht mehr auf dem Server.';
  if (targetMember.id === interaction.guild.ownerId) return 'Der Serverinhaber kann nicht moderiert werden.';
  if (targetMember.id === interaction.user.id) return 'Du kannst dich nicht selbst moderieren.';
  const botMember = interaction.guild.members.me;
  if (botMember && targetMember.roles.highest.position >= botMember.roles.highest.position) {
    return 'Die Rolle des Mitglieds ist gleich hoch oder höher als meine höchste Rolle.';
  }
  if (interaction.user.id !== interaction.guild.ownerId) {
    const actorMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (actorMember && targetMember.roles.highest.position >= actorMember.roles.highest.position) {
      return 'Die Rolle des Mitglieds ist gleich hoch oder höher als deine höchste Rolle.';
    }
  }
  return null;
}

client.once('ready', () => {
  console.log(`NAXY Helper ist online als ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    const { commandName } = interaction;

    if (commandName === 'ping') {
      return interaction.reply({ content: `Pong! API-Latenz: ${client.ws.ping} ms`, ephemeral: true });
    }

    if (commandName === 'help') {
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('NAXY Helper – Befehle')
        .setDescription([
          '`/clear anzahl` – Nachrichten löschen',
          '`/kick mitglied [grund]` – Mitglied kicken',
          '`/ban mitglied [grund]` – Mitglied bannen',
          '`/timeout mitglied minuten [grund]` – Timeout setzen',
          '`/untimeout mitglied` – Timeout entfernen',
          '`/ping` – Bot-Latenz anzeigen',
          '`/help` – Diese Hilfe anzeigen'
        ].join('\n'))
        .setFooter({ text: 'Weitere Module wie Giveaways, Rollenpanels und Claims folgen.' });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'Dieser Befehl funktioniert nur auf einem Server.', ephemeral: true });
    }

    if (commandName === 'clear') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ content: 'Dir fehlt „Nachrichten verwalten“.', ephemeral: true });
      }
      if (!interaction.appPermissions?.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ content: 'Mir fehlt „Nachrichten verwalten“.', ephemeral: true });
      }
      const amount = interaction.options.getInteger('anzahl', true);
      await interaction.deferReply({ ephemeral: true });
      const deleted = await interaction.channel.bulkDelete(amount, true);
      return interaction.editReply(`${deleted.size} Nachrichten gelöscht. Nachrichten älter als 14 Tage können nicht per Bulk-Löschung entfernt werden.`);
    }

    const target = interaction.options.getUser('mitglied', true);
    const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);
    const actionPermission = commandName === 'kick'
      ? PermissionFlagsBits.KickMembers
      : commandName === 'ban'
        ? PermissionFlagsBits.BanMembers
        : PermissionFlagsBits.ModerateMembers;

    const permissionError = await canModerate(interaction, targetMember, actionPermission);
    if (permissionError) return interaction.reply({ content: permissionError, ephemeral: true });

    if (commandName === 'kick') {
      if (!interaction.appPermissions?.has(PermissionFlagsBits.KickMembers)) {
        return interaction.reply({ content: 'Mir fehlt „Mitglieder kicken“.', ephemeral: true });
      }
      const reason = interaction.options.getString('grund') || 'Kein Grund angegeben';
      await targetMember.kick(`${interaction.user.tag}: ${reason}`);
      return interaction.reply({ content: `👢 ${target.tag} wurde gekickt. Grund: ${reason}`, ephemeral: true });
    }

    if (commandName === 'ban') {
      if (!interaction.appPermissions?.has(PermissionFlagsBits.BanMembers)) {
        return interaction.reply({ content: 'Mir fehlt „Mitglieder bannen“.', ephemeral: true });
      }
      const reason = interaction.options.getString('grund') || 'Kein Grund angegeben';
      await interaction.guild.members.ban(target.id, { reason: `${interaction.user.tag}: ${reason}` });
      return interaction.reply({ content: `🔨 ${target.tag} wurde gebannt. Grund: ${reason}`, ephemeral: true });
    }

    if (commandName === 'timeout') {
      if (!interaction.appPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
        return interaction.reply({ content: 'Mir fehlt „Mitglieder moderieren“.', ephemeral: true });
      }
      const minutes = interaction.options.getInteger('minuten', true);
      const reason = interaction.options.getString('grund') || 'Kein Grund angegeben';
      await targetMember.timeout(minutes * 60 * 1000, `${interaction.user.tag}: ${reason}`);
      return interaction.reply({ content: `⏳ ${target.tag} hat einen Timeout für ${minutes} Minuten erhalten.`, ephemeral: true });
    }

    if (commandName === 'untimeout') {
      if (!interaction.appPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
        return interaction.reply({ content: 'Mir fehlt „Mitglieder moderieren“.', ephemeral: true });
      }
      await targetMember.timeout(null, `${interaction.user.tag}: Timeout entfernt`);
      return interaction.reply({ content: `✅ Timeout von ${target.tag} wurde entfernt.`, ephemeral: true });
    }
  } catch (error) {
    console.error('Command-Fehler:', error);
    const message = 'Beim Ausführen des Befehls ist ein Fehler aufgetreten. Prüfe Bot-Rechte und Rollenposition.';
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
    }
  }
});

(async () => {
  try {
    await registerCommands();
    await client.login(token);
  } catch (error) {
    console.error('Startfehler:', error);
    process.exit(1);
  }
})();
