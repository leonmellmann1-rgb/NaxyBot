const mineflayer = require('mineflayer')

const bot = mineflayer.createBot({
  host: process.env.MC_HOST,
  port: Number(process.env.MC_PORT || 25565),
  username: process.env.MC_USERNAME,
  auth: 'microsoft'
})

bot.once('spawn', () => {
  console.log(`NaxyBot ist auf ${process.env.MC_HOST} gejoint!`)
  bot.chat('Jo Bro, ich bin da 😎')
})

bot.on('chat', (username, message) => {
  if (username === bot.username) return

  console.log(`<${username}> ${message}`)

  if (message.toLowerCase().includes('bot komm')) {
    bot.chat(`Jo ${username}, bin am Start.`)
  }
})

bot.on('kicked', reason => {
  console.log('Bot wurde gekickt:', reason)
})

bot.on('error', err => {
  console.log('Bot-Fehler:', err)
})
