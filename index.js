const mineflayer = require('mineflayer')

const {
  pathfinder,
  Movements,
  goals
} = require('mineflayer-pathfinder')

const collectBlock = require('mineflayer-collectblock').plugin
const pvp = require('mineflayer-pvp').plugin

const {
  GoalFollow,
  GoalNear
} = goals


// ======================================================
// BOT ERSTELLEN
// ======================================================

const bot = mineflayer.createBot({
  host: process.env.MC_HOST,
  port: Number(process.env.MC_PORT || 25565),
  username: process.env.MC_USERNAME,
  auth: 'microsoft',

  // Microsoft Login im Railway Volume speichern
  profilesFolder: '/app/auth'
})

bot.loadPlugin(pathfinder)
bot.loadPlugin(collectBlock)
bot.loadPlugin(pvp)

let mcData = null
let movements = null

let protectedPlayer = null
let protectionEnabled = false

let protectionInterval = null
let farming = false


// ======================================================
// SPAWN
// ======================================================

bot.once('spawn', () => {
  mcData = require('minecraft-data')(bot.version)

  movements = new Movements(bot, mcData)

  // Beim normalen Folgen keine Blöcke zerstören
  movements.canDig = false

  bot.pathfinder.setMovements(movements)

  console.log('==============================')
  console.log('NAXYBOT IST ONLINE')
  console.log('Bewegung: OK')
  console.log('Kampf: OK')
  console.log('Farming: OK')
  console.log('==============================')
})


// ======================================================
// SPIELER SUCHEN
// ======================================================

function getPlayer(username) {
  const player = bot.players[username]

  if (!player || !player.entity) {
    console.log(`Spieler ${username} ist nicht sichtbar.`)
    return null
  }

  return player
}


// ======================================================
// FOLGEN
// ======================================================

function followPlayer(username) {
  const player = getPlayer(username)

  if (!player) return

  bot.pathfinder.setMovements(movements)

  bot.pathfinder.setGoal(
    new GoalFollow(player.entity, 2),
    true
  )

  console.log(`Ich folge ${username}`)
}


// ======================================================
// KOMM ZU MIR
// ======================================================

function comeToPlayer(username) {
  const player = getPlayer(username)

  if (!player) return

  const pos = player.entity.position

  bot.pathfinder.setGoal(
    new GoalNear(
      Math.floor(pos.x),
      Math.floor(pos.y),
      Math.floor(pos.z),
      1
    )
  )

  console.log(`Ich komme zu ${username}`)
}


// ======================================================
// STOPP
// ======================================================

function stopBot() {
  bot.pvp.stop()

  bot.pathfinder.setGoal(null)

  bot.clearControlStates()

  console.log('Bot gestoppt.')
}


// ======================================================
// SPRINGEN
// ======================================================

function jump() {
  bot.setControlState('jump', true)

  setTimeout(() => {
    bot.setControlState('jump', false)
  }, 500)
}


// ======================================================
// SPIELER ANSCHAUEN
// ======================================================

async function lookAtPlayer(username) {
  const player = getPlayer(username)

  if (!player) return

  try {
    await bot.lookAt(
      player.entity.position.offset(0, 1.6, 0)
    )
  } catch (error) {
    console.log(
      'Fehler beim Anschauen:',
      error.message
    )
  }
}


// ======================================================
// FEINDLICHE MOBS
// ======================================================

const hostileMobs = [
  'zombie',
  'skeleton',
  'spider',
  'cave_spider',
  'drowned',
  'husk',
  'stray',
  'witch',
  'pillager',
  'vindicator',
  'ravager',
  'slime',
  'magma_cube',
  'phantom',
  'silverfish',
  'endermite'
]


function isHostile(entity) {
  if (!entity) return false

  const name = String(
    entity.name || entity.displayName || ''
  ).toLowerCase()

  return hostileMobs.some(
    mobName => name.includes(mobName)
  )
}


// ======================================================
// BESCHÜTZEN
// ======================================================

function startProtection(username) {
  const player = getPlayer(username)

  if (!player) return

  protectedPlayer = username
  protectionEnabled = true

  console.log(`SCHUTZ AN für ${username}`)

  if (protectionInterval) {
    clearInterval(protectionInterval)
  }

  protectionInterval = setInterval(() => {
    if (!protectionEnabled) return

    const protectedEntity =
      bot.players[protectedPlayer]?.entity

    if (!protectedEntity) return

    // Suche Monster nahe beim Spieler
    const enemy = bot.nearestEntity(entity => {
      if (!isHostile(entity)) return false

      const distanceToPlayer =
        entity.position.distanceTo(
          protectedEntity.position
        )

      return distanceToPlayer <= 8
    })

    if (enemy) {
      const distance =
        bot.entity.position.distanceTo(
          enemy.position
        )

      console.log(
        `Feind entdeckt: ${enemy.name} (${distance.toFixed(1)} Blöcke)`
      )

      bot.pvp.attack(enemy)

      return
    }

    // Wenn kein Gegner da ist:
    // beim Spieler bleiben
    const distanceToPlayer =
      bot.entity.position.distanceTo(
        protectedEntity.position
      )

    if (
      distanceToPlayer > 4 &&
      !farming
    ) {
      bot.pvp.stop()

      bot.pathfinder.setGoal(
        new GoalFollow(
          protectedEntity,
          2
        ),
        true
      )
    }
  }, 1000)
}


function stopProtection() {
  protectionEnabled = false
  protectedPlayer = null

  bot.pvp.stop()

  if (protectionInterval) {
    clearInterval(protectionInterval)
    protectionInterval = null
  }

  console.log('SCHUTZ AUS')
}


// ======================================================
// ITEM-NAMEN ÜBERSETZEN
// ======================================================

const resourceNames = {

  // HOLZ
  holz: [
    'oak_log',
    'birch_log',
    'spruce_log',
    'jungle_log',
    'acacia_log',
    'dark_oak_log',
    'mangrove_log',
    'cherry_log'
  ],

  eiche: [
    'oak_log'
  ],

  fichte: [
    'spruce_log'
  ],

  birke: [
    'birch_log'
  ],

  // STEIN
  stein: [
    'stone'
  ],

  cobblestone: [
    'stone'
  ],

  // KOHLE
  kohle: [
    'coal_ore',
    'deepslate_coal_ore'
  ],

  // EISEN
  eisen: [
    'iron_ore',
    'deepslate_iron_ore'
  ],

  // KUPFER
  kupfer: [
    'copper_ore',
    'deepslate_copper_ore'
  ],

  // GOLD
  gold: [
    'gold_ore',
    'deepslate_gold_ore'
  ],

  // REDSTONE
  redstone: [
    'redstone_ore',
    'deepslate_redstone_ore'
  ],

  // LAPIS
  lapis: [
    'lapis_ore',
    'deepslate_lapis_ore'
  ],

  // DIAMANTEN
  diamant: [
    'diamond_ore',
    'deepslate_diamond_ore'
  ],

  diamanten: [
    'diamond_ore',
    'deepslate_diamond_ore'
  ],

  diamond: [
    'diamond_ore',
    'deepslate_diamond_ore'
  ],

  // SMARAGDE
  smaragd: [
    'emerald_ore',
    'deepslate_emerald_ore'
  ],

  smaragde: [
    'emerald_ore',
    'deepslate_emerald_ore'
  ],

  // SAND
  sand: [
    'sand'
  ],

  // ERDE
  erde: [
    'dirt'
  ]
}


// ======================================================
// FARMEN
// ======================================================

async function farmResource(resource, amount, username) {
  if (farming) {
    console.log('Ich farme bereits etwas.')
    return
  }

  const resourceList =
    resourceNames[resource]

  if (!resourceList) {
    console.log(
      `Ressource unbekannt: ${resource}`
    )
    return
  }

  farming = true

  bot.pvp.stop()
  bot.pathfinder.setGoal(null)

  console.log(
    `Farming gestartet: ${amount}x ${resource}`
  )

  try {
    // Beim Farmen darf er abbauen
    const farmMovements =
      new Movements(bot, mcData)

    farmMovements.canDig = true

    bot.pathfinder.setMovements(
      farmMovements
    )

    let collected = 0


    while (collected < amount) {

      let targetBlock = null


      // Suche nach den möglichen Blocktypen
      for (
        const blockName of resourceList
      ) {

        const blockData =
          mcData.blocksByName[blockName]

        if (!blockData) continue


        const blockPosition =
          bot.findBlock({
            matching: blockData.id,
            maxDistance: 64
          })


        if (blockPosition) {
          targetBlock = blockPosition
          break
        }
      }


      // Nichts gefunden
      if (!targetBlock) {
        console.log(
          `${resource} nicht mehr in der Nähe gefunden.`
        )

        break
      }


      try {
        console.log(
          `Gehe zu ${targetBlock.name}`
        )

        await bot.collectBlock.collect(
          targetBlock
        )

        collected++

        console.log(
          `Gesammelt: ${collected}/${amount}`
        )

      } catch (error) {

        console.log(
          'Block konnte nicht gesammelt werden:',
          error.message
        )

        break
      }
    }


    console.log(
      `Farming beendet. ${collected}/${amount} gesammelt.`
    )


  } catch (error) {

    console.log(
      'Farming Fehler:',
      error
    )

  } finally {

    farming = false

    movements.canDig = false

    bot.pathfinder.setMovements(
      movements
    )


    // Danach wieder zum Spieler
    const player =
      bot.players[username]?.entity

    if (player) {
      bot.pathfinder.setGoal(
        new GoalFollow(
          player,
          2
        ),
        true
      )
    }
  }
}


// ======================================================
// FARM-BEFEHL VERSTEHEN
// ======================================================

function parseFarmCommand(message) {
  const msg =
    message
      .toLowerCase()
      .trim()


  // Beispiele:
  //
  // farm mir 10 eisen
  // farm 20 holz
  // hol mir 5 diamanten
  // sammle 10 stein


  const patterns = [

    /farm mir (\d+) (.+)/,

    /farm (\d+) (.+)/,

    /hol mir (\d+) (.+)/,

    /sammle (\d+) (.+)/,

    /besorg mir (\d+) (.+)/
  ]


  for (const pattern of patterns) {

    const match =
      msg.match(pattern)

    if (match) {

      return {
        amount:
          Number(match[1]),

        resource:
          match[2]
            .trim()
            .replaceAll(' ', '_')
      }
    }
  }


  return null
}


// ======================================================
// CHAT
// ======================================================

bot.on(
  'chat',

  async (
    username,
    message
  ) => {

    if (
      username ===
      bot.username
    ) {
      return
    }


    console.log(
      `[CHAT] ${username}: ${message}`
    )


    const msg =
      message
        .toLowerCase()
        .trim()


    // =========================================
    // BESCHÜTZEN
    // =========================================

    if (
      msg.includes('beschütz mich') ||
      msg.includes('beschuetze mich') ||
      msg.includes('protect me') ||
      msg.includes('pass auf mich auf')
    ) {

      startProtection(
        username
      )

      return
    }


    if (
      msg.includes('hör auf mich zu beschützen') ||
      msg.includes('schutz aus') ||
      msg.includes('beschütz mich nicht mehr')
    ) {

      stopProtection()

      return
    }


    // =========================================
    // FARMEN
    // =========================================

    const farmCommand =
      parseFarmCommand(
        message
      )


    if (farmCommand) {

      await farmResource(
        farmCommand.resource,
        farmCommand.amount,
        username
      )

      return
    }


    // =========================================
    // FOLGEN
    // =========================================

    if (
      msg.includes('folg mir') ||
      msg.includes('folge mir') ||
      msg.includes('komm mit')
    ) {

      followPlayer(
        username
      )

      return
    }


    // =========================================
    // KOMM HER
    // =========================================

    if (
      msg === 'komm' ||
      msg.includes('komm her') ||
      msg.includes('komm zu mir')
    ) {

      comeToPlayer(
        username
      )

      return
    }


    // =========================================
    // STOPP
    // =========================================

    if (
      msg.includes('stopp') ||
      msg === 'stop' ||
      msg.includes('bleib stehen') ||
      msg.includes('warte hier')
    ) {

      stopBot()

      return
    }


    // =========================================
    // SPRINGEN
    // =========================================

    if (
      msg.includes('spring')
    ) {

      jump()

      return
    }


    // =========================================
    // ANSCHAUEN
    // =========================================

    if (
      msg.includes('schau mich an') ||
      msg.includes('guck mich an')
    ) {

      await lookAtPlayer(
        username
      )

      return
    }


    console.log(
      'Befehl noch nicht erkannt.'
    )
  }
)


// ======================================================
// TOD
// ======================================================

bot.on(
  'death',
  () => {

    console.log(
      'NaxyBot ist gestorben.'
    )

    bot.pvp.stop()
  }
)


// ======================================================
// RESPAWN
// ======================================================

bot.on(
  'respawn',
  () => {

    console.log(
      'NaxyBot ist respawned.'
    )

    if (
      protectionEnabled &&
      protectedPlayer
    ) {

      setTimeout(
        () => {

          startProtection(
            protectedPlayer
          )

        },
        2000
      )
    }
  }
)


// ======================================================
// KICK
// ======================================================

bot.on(
  'kicked',
  reason => {

    console.log(
      'BOT WURDE GEKICKT:'
    )

    console.log(
      reason
    )
  }
)


// ======================================================
// ERROR
// ======================================================

bot.on(
  'error',
  error => {

    console.log(
      'MINECRAFT FEHLER:'
    )

    console.error(
      error
    )
  }
)


// ======================================================
// VERBINDUNG BEENDET
// ======================================================

bot.on(
  'end',
  reason => {

    console.log(
      'Verbindung beendet:',
      reason
    )
  }
)
