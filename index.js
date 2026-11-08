const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
} = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const targetChannelId = process.env.TARGET_CHANNEL_ID;
const sourceChannelIds = (process.env.SOURCE_CHANNEL_IDS || "")
  .split(",").map(x => x.trim()).filter(Boolean);
const scanIntervalMinutes = Math.max(1, Number(process.env.SCAN_INTERVAL_MINUTES || 2));
const maxMessagesPerChannel = Math.min(500, Math.max(20, Number(process.env.MAX_MESSAGES_PER_CHANNEL || 150)));
const undercut = 1_000_000;

if (!token) throw new Error("DISCORD_TOKEN fehlt.");
if (!targetChannelId) throw new Error("TARGET_CHANNEL_ID fehlt.");
if (sourceChannelIds.length === 0) throw new Error("SOURCE_CHANNEL_IDS fehlt. Trage die fünf Quell-Channel-IDs kommasepariert ein.");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const ALIASES = [
  { key: "Skeleton", names: ["skeleton", "skelly", "skelett", "skelet", "skele"] },
  { key: "Zombie", names: ["zombie", "zombies"] },
  { key: "Creeper", names: ["creeper", "creeper"] },
  { key: "Blaze", names: ["blaze"] },
  { key: "Spider", names: ["spider", "spinne"] },
  { key: "Cave Spider", names: ["cave spider", "höhlenspinne", "hohlenspinne"] },
  { key: "Enderman", names: ["enderman", "endermen"] },
  { key: "Pig", names: ["pig", "schwein"] },
  { key: "Cow", names: ["cow", "kuh"] },
  { key: "Iron Golem", names: ["iron golem", "eisengolem"] },
  { key: "Witch", names: ["witch", "hexe"] },
  { key: "Guardian", names: ["guardian"] },
  { key: "Slime", names: ["slime"] },
  { key: "Magma Cube", names: ["magma cube", "magmacube"] },
  { key: "Wither Skeleton", names: ["wither skeleton", "wither-skelett"] },
  { key: "Phantom", names: ["phantom"] },
  { key: "Drowned", names: ["drowned", "ertrunkener"] },
  { key: "Husk", names: ["husk"] },
  { key: "Villager", names: ["villager", "dorfbewohner"] },
];

function normalizeText(value) {
  return value.toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function detectSpawner(text) {
  const normalized = normalizeText(text);
  if (!/spawner|spaw.?ner/.test(normalized)) return null;
  for (const entry of ALIASES) {
    if (entry.names.some(name => normalized.includes(normalizeText(name)))) return entry.key;
  }
  return null;
}

function parsePrice(text) {
  const normalized = text.toLowerCase().replace(/,/g, ".");
  const patterns = [
    /(?:^|\s)(\d+(?:\.\d+)?)\s*(mio|millionen|million|m)\b/,
    /(?:^|\s)(\d+(?:\.\d+)?)\s*(k|tsd|tausend)\b/,
    /(?:^|\s)(\d{1,3}(?:\.\d{3})+|\d{6,})\s*(?:\$|coins?|geld)?\b/,
  ];
  for (const regex of patterns) {
    const match = normalized.match(regex);
    if (!match) continue;
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) continue;
    const unit = match[2] || "";
    const multiplier = ["m", "mio", "million", "millionen"].includes(unit)
      ? 1_000_000
      : ["k", "tsd", "tausend"].includes(unit) ? 1_000 : 1;
    const value = Math.round(amount * multiplier);
    if (value > 0 && value < 1_000_000_000_000) return value;
  }
  return null;
}

function isBuyOffer(text) {
  const t = normalizeText(text);
  if (/\b(verkauf|verkaufe|verkaufen|verkauft|verkaufe|sell|selling|verkaufspreis)\b/.test(t)) return false;
  return /\b(ankauf|kaufe|kaufen|suche|buy|buying|wir kaufen|ich kaufe)\b/.test(t);
}

function formatMoney(value) {
  return value.toLocaleString("de-DE") + " $";
}

async function fetchRecentMessages(channel) {
  let before;
  let all = [];
  while (all.length < maxMessagesPerChannel) {
    const batch = await channel.messages.fetch({
      limit: Math.min(100, maxMessagesPerChannel - all.length),
      ...(before ? { before } : {}),
    });
    if (batch.size === 0) break;
    all.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  return all;
}

async function collectOffers() {
  const best = new Map();
  const checked = [];
  for (const channelId of sourceChannelIds) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased() || !channel.messages) {
        console.warn("Kein lesbarer Textkanal:", channelId);
        continue;
      }
      checked.push(channelId);
      const messages = await fetchRecentMessages(channel);
      for (const message of messages) {
        const text = [message.content, ...message.embeds.map(e =>
          [e.title, e.description, ...(e.fields || []).flatMap(f => [f.name, f.value])]
            .filter(Boolean).join(" ")
        )].filter(Boolean).join(" ");
        if (!isBuyOffer(text)) continue;
        const spawner = detectSpawner(text);
        const price = parsePrice(text);
        if (!spawner || !price) continue;
        const current = best.get(spawner);
        if (!current || price > current.marketPrice) {
          best.set(spawner, {
            spawner,
            marketPrice: price,
            ourPrice: Math.max(0, price - undercut),
            source: channel.guild?.name || "Discord-Server",
            channelId,
            messageUrl: message.url,
            createdTimestamp: message.createdTimestamp,
          });
        }
      }
    } catch (error) {
      console.error("Fehler beim Lesen von Channel", channelId, error.message);
    }
  }
  return { best, checked };
}

async function publish() {
  const target = await client.channels.fetch(targetChannelId);
  if (!target || !target.isTextBased() || !target.send) {
    throw new Error("Ziel-Channel ist nicht lesbar/beschreibbar.");
  }

  const { best, checked } = await collectOffers();
  const sorted = [...best.values()].sort((a, b) => a.spawner.localeCompare(b.spawner, "de"));
  const description = sorted.length
    ? sorted.map(x =>
        `**${x.spawner}-Spawner**\nUnser Ankauf: **${formatMoney(x.ourPrice)}** · höchstes gefundenes Angebot: ${formatMoney(x.marketPrice)}\nQuelle: [Nachricht öffnen](${x.messageUrl})`
      ).join("\n\n")
    : "Noch keine passenden Ankaufangebote gefunden. Prüfe Quell-Channel-IDs und Leseberechtigungen.";

  const embed = new EmbedBuilder()
    .setTitle("💰 Spawner Tracker · Ankauf")
    .setColor(0x7c3aed)
    .setDescription(description.slice(0, 4000))
    .addFields(
      { name: "Abzug", value: formatMoney(undercut), inline: true },
      { name: "Quellkanäle geprüft", value: String(checked.length) + "/" + sourceChannelIds.length, inline: true },
      { name: "Letzter Check", value: new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" }), inline: true },
    )
    .setFooter({ text: "Automatisch ermittelt · Preise vor dem Ankauf prüfen" });

  const recent = await target.messages.fetch({ limit: 25 });
  const previous = recent.find(m => m.author.id === client.user.id && m.embeds[0]?.title === "💰 Spawner Tracker · Ankauf");
  if (previous) await previous.edit({ embeds: [embed] });
  else await target.send({ embeds: [embed] });
  console.log(`Update fertig: ${sorted.length} Spawner, ${checked.length} Quellkanäle.`);
}

client.once("ready", async () => {
  console.log(`Spawner Tracker online als ${client.user.tag}`);
  try { await publish(); } catch (e) { console.error("Erstes Update fehlgeschlagen:", e); }
  setInterval(() => publish().catch(e => console.error("Update fehlgeschlagen:", e)), scanIntervalMinutes * 60 * 1000);
});

client.login(token);
