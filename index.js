const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const OpenAI = require('openai')

const { GoalFollow, GoalNear } = goals

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const bot = mineflayer.createBot({
  host: process.env.MC_HOST,
  port: Number(process.env.MC_PORT || 25565),
  username: process.env.MC_USERNAME,
  auth: 'microsoft',
  profilesFolder: '/app/auth'
})

bot.loadPlugin(pathfinder)

let movements
let following = null

bot.once('spawn', () => {
  const mcData = require('minecraft-data')(bot.version)

  movements = new Movements(bot, mcData)

  // Darf normale Blöcke überqueren und springen
  movements.canDig = false

  bot.pathfinder.setMovements(movements)

  console.log('NaxyBot ist online!')
  bot.chat('Jo Bro, ich bin da 😎')
})

function getPlayer(username) {
  const player = bot.players[username]

  if (!player || !player.entity) {
    bot.chat(`${username}, ich kann dich gerade nicht sehen.`)
    return null
  }

  return player
}

function followPlayer(username) {
  const player = getPlayer(username)
  if (!player) return

  following = username

  bot.pathfinder.setGoal(
    new GoalFollow(player.entity, 2),
    true
  )

  bot.chat(`Jo ${username}, ich folge dir.`)
}

function stopBot() {
  following = null
  bot.pathfinder.setGoal(null)

  bot.clearControlStates()

  bot.chat('Okay, ich bleibe hier.')
}

function comeToPlayer(username) {
  const player = getPlayer(username)
  if (!player) return

  const pos = player.entity.position

  bot.pathfinder.setGoal(
    new GoalNear(pos.x, pos.y, pos.z, 1)
  )

  bot.chat(`Komme, ${username}.`)
}

bot.on('chat', async (username, message) => {
  if (username === bot.username) return

  console.log(`<${username}> ${message}`)

  const msg = message.toLowerCase()

  // ===== BEWEGUNG =====

  if (
    msg.includes('folg mir') ||
    msg.includes('folge mir') ||
    msg.includes('komm mit')
  ) {
    followPlayer(username)
    return
  }

  if (
    msg === 'komm' ||
    msg.includes('komm her') ||
    msg.includes('komm zu mir')
  ) {
    comeToPlayer(username)
    return
  }

  if (
    msg.includes('stopp') ||
    msg.includes('bleib stehen') ||
    msg.includes('warte hier')
  ) {
    stopBot()
    return
  }

  if (msg.includes('spring')) {
    bot.setControlState('jump', true)

    setTimeout(() => {
      bot.setControlState('jump', false)
    }, 500)

    return
  }

  if (
    msg.includes('schau mich an') ||
    msg.includes('guck mich an')
  ) {
    const player = getPlayer(username)
    if (!player) return

    await bot.lookAt(
      player.entity.position.offset(0, 1.6, 0)
    )

    return
  }

  // ===== KI-ANTWORT =====

  try {
    const response = await openai.responses.create({
      model: 'gpt-5.6-luna',
      input: `
Du bist NaxyBot, ein Minecraft-Begleiter.

Du bist locker, freundlich und antwortest auf Deutsch.
Halte deine Antworten kurz.

Spieler: ${username}
Nachricht: ${message}
`
    })

    const answer = response.output_text

    if (answer) {
      bot.chat(answer.slice(0, 240))
    }
  } catch (error) {
    console.error('OpenAI Fehler:', error)
    bot.chat('Bro, meine KI hat gerade einen Fehler.')
  }
})

bot.on('death', () => {
  following = null
  console.log('NaxyBot ist gestorben.')
})

bot.on('kicked', reason => {
  console.log('Bot wurde gekickt:')
  console.log(reason)
})

bot.on('error', error => {
  console.error('Minecraft Fehler:')
  console.error(error)
})

bot.on('end', reason => {
  console.log('Verbindung beendet:', reason)
})
