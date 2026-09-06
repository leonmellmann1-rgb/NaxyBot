const mineflayer = require('mineflayer')
const OpenAI = require('openai')

// OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// Minecraft Bot
const bot = mineflayer.createBot({
  host: process.env.MC_HOST,
  port: Number(process.env.MC_PORT || 25565),

  // Minecraft/Microsoft Account
  username: process.env.MC_USERNAME,
  auth: 'microsoft',

  // Microsoft-Login dauerhaft im Railway Volume speichern
  profilesFolder: '/app/auth'
})

bot.once('spawn', () => {
  console.log('NaxyBot ist online!')
  bot.chat('Jo Bro, ich bin da 😎')
})

// Nachrichten aus dem Minecraft-Chat
bot.on('chat', async (username, message) => {
  // Eigene Nachrichten ignorieren
  if (username === bot.username) return

  console.log(`<${username}> ${message}`)

  try {
    const response = await openai.responses.create({
      model: 'gpt-5.6-luna',
      input: `
Du bist NaxyBot, ein KI-Minecraft-Begleiter.

Du spielst auf einem privaten Minecraft-Server.
Antworte auf Deutsch.
Antworte locker und eher kurz.
Der Spieler heißt ${username}.

Nachricht des Spielers:
${message}
      `
    })

    const answer = response.output_text

    if (answer) {
      // Minecraft-Chat nicht mit extrem langen Antworten zuspammen
      bot.chat(answer.slice(0, 240))
    }
  } catch (error) {
    console.error('OpenAI Fehler:', error)
    bot.chat('Bro, meine KI hat gerade einen Fehler 😭')
  }
})

// Wenn der Server den Bot kickt
bot.on('kicked', reason => {
  console.log('Bot wurde gekickt:')
  console.log(reason)
})

// Minecraft-/Verbindungsfehler
bot.on('error', error => {
  console.log('Minecraft Fehler:')
  console.error(error)
})

// Verbindung beendet
bot.on('end', reason => {
  console.log('Verbindung beendet:', reason)
})
