const mineflayer = require('mineflayer')
const OpenAI = require('openai')

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const bot = mineflayer.createBot({
  host: process.env.MC_HOST,
  port: Number(process.env.MC_PORT || 25565),
  username: process.env.MC_USERNAME,
  auth: 'microsoft'
})

bot.once('spawn', () => {
  console.log('NaxyBot ist online!')
  bot.chat('Jo Bro, ich bin wieder da 😎')
})

bot.on('chat', async (username, message) => {
  if (username === bot.username) return

  console.log(`<${username}> ${message}`)

  try {
    const response = await openai.responses.create({
      model: 'gpt-5.6-luna',
      input: `Du bist NaxyBot, ein Minecraft-Begleiter auf einem privaten Server.
Antworte auf Deutsch, locker und kurz.
Spieler ${username} schreibt: ${message}`
    })

    const answer = response.output_text

    if (answer) {
      bot.chat(answer.slice(0, 240))
    }
  } catch (err) {
    console.error('OpenAI Fehler:', err)
    bot.chat('Bro, bei meiner KI ist gerade ein Fehler 😭')
  }
})

bot.on('kicked', reason => {
  console.log('Bot wurde gekickt:', reason)
})

bot.on('error', err => {
  console.log('Minecraft Fehler:', err)
})

bot.on('end', reason => {
  console.log('Verbindung beendet:', reason)
})
