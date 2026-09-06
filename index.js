const mineflayer = require('mineflayer')
const OpenAI = require('openai')

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
// OPENAI
// ======================================================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const AI_MODEL =
  process.env.OPENAI_MODEL || 'gpt-5.6-luna'


// Optional:
// Wenn du in Railway BOT_OWNER einträgst,
// hört der Bot nur auf diesen Minecraft-Spieler.
const BOT_OWNER =
  process.env.BOT_OWNER || ''


// ======================================================
// BOT
// ======================================================

const bot = mineflayer.createBot({
  host: process.env.MC_HOST,
  port: Number(process.env.MC_PORT || 25565),

  username: process.env.MC_USERNAME,
  auth: 'microsoft',

  // Railway Volume:
  profilesFolder: '/app/auth'
})


bot.loadPlugin(pathfinder)
bot.loadPlugin(collectBlock)
bot.loadPlugin(pvp)


let mcData = null
let movements = null

let busy = false
let currentTask = 'nichts'

let protectionEnabled = false
let protectedPlayer = null
let protectionLoop = null


// ======================================================
// START
// ======================================================

bot.once('spawn', () => {

  mcData = require('minecraft-data')(bot.version)

  movements = new Movements(bot, mcData)

  // Beim normalen Laufen erstmal nichts abbauen
  movements.canDig = false

  bot.pathfinder.setMovements(movements)

  console.log('')
  console.log('======================================')
  console.log('       NAXY AI IST ONLINE')
  console.log('======================================')
  console.log('KI:          AN')
  console.log('Folgen:      AN')
  console.log('Farming:     AN')
  console.log('Droppen:     AN')
  console.log('Kampf:       AN')
  console.log('Beschützen:  AN')
  console.log('======================================')
  console.log('')
})


// ======================================================
// HELFER
// ======================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}


function getPlayer(username) {

  const player = bot.players[username]

  if (!player || !player.entity) {

    console.log(
      `[SPIELER] ${username} ist gerade nicht sichtbar.`
    )

    return null
  }

  return player
}


function isAllowedPlayer(username) {

  if (!BOT_OWNER) {
    return true
  }

  return (
    username.toLowerCase() ===
    BOT_OWNER.toLowerCase()
  )
}


// ======================================================
// BOT STATUS FÜR DIE KI
// ======================================================

function getBotState(username) {

  const player =
    bot.players[username]?.entity


  const inventory =
    bot.inventory
      .items()
      .slice(0, 25)
      .map(item =>
        `${item.name} x${item.count}`
      )
      .join(', ')


  const nearby =
    Object.values(bot.entities)
      .filter(entity => {

        if (!entity.position) return false

        if (entity === bot.entity)
          return false

        return (
          bot.entity.position.distanceTo(
            entity.position
          ) <= 16
        )
      })
      .slice(0, 20)
      .map(entity => {

        const name =
          entity.username ||
          entity.name ||
          entity.displayName ||
          entity.type

        const distance =
          bot.entity.position
            .distanceTo(
              entity.position
            )
            .toFixed(1)

        return (
          `${name}: ${distance} Blöcke`
        )
      })
      .join(', ')


  return `
BOT STATUS

Leben:
${bot.health}/20

Hunger:
${bot.food}/20

Position:
X ${Math.floor(bot.entity.position.x)}
Y ${Math.floor(bot.entity.position.y)}
Z ${Math.floor(bot.entity.position.z)}

Aktuelle Aufgabe:
${currentTask}

Beschützungsmodus:
${protectionEnabled ? 'AN' : 'AUS'}

Auftraggeber sichtbar:
${player ? 'JA' : 'NEIN'}

Inventar:
${inventory || 'leer'}

In der Nähe:
${nearby || 'nichts Besonderes'}
`
}


// ======================================================
// BEWEGUNG
// ======================================================

function followPlayer(username) {

  const player =
    getPlayer(username)

  if (!player)
    return


  bot.pvp.stop()

  currentTask =
    `${username} folgen`


  bot.pathfinder.setMovements(
    movements
  )


  bot.pathfinder.setGoal(
    new GoalFollow(
      player.entity,
      2
    ),
    true
  )


  console.log(
    `[AKTION] Folge ${username}`
  )
}


function comeToPlayer(username) {

  const player =
    getPlayer(username)

  if (!player)
    return


  bot.pvp.stop()

  currentTask =
    `Zu ${username} laufen`


  const pos =
    player.entity.position


  bot.pathfinder.setMovements(
    movements
  )


  bot.pathfinder.setGoal(
    new GoalNear(
      Math.floor(pos.x),
      Math.floor(pos.y),
      Math.floor(pos.z),
      1
    )
  )


  console.log(
    `[AKTION] Laufe zu ${username}`
  )
}


function stopEverything() {

  busy = false

  currentTask =
    'nichts'


  bot.pvp.stop()

  bot.pathfinder.setGoal(null)

  bot.clearControlStates()


  console.log(
    '[AKTION] Alles gestoppt.'
  )
}


// ======================================================
// SPRINGEN
// ======================================================

async function jump() {

  console.log(
    '[AKTION] Springe.'
  )

  bot.setControlState(
    'jump',
    true
  )

  await sleep(500)

  bot.setControlState(
    'jump',
    false
  )
}


// ======================================================
// SPIELER ANSCHAUEN
// ======================================================

async function lookAtPlayer(username) {

  const player =
    getPlayer(username)

  if (!player)
    return


  try {

    await bot.lookAt(
      player.entity.position.offset(
        0,
        1.6,
        0
      )
    )

    console.log(
      `[AKTION] Schaue ${username} an.`
    )

  } catch (error) {

    console.log(
      '[LOOK FEHLER]',
      error.message
    )
  }
}


// ======================================================
// HOSTILE MOBS
// ======================================================

const hostileMobs = [

  'zombie',
  'zombie_villager',
  'skeleton',

  'spider',
  'cave_spider',

  'creeper',

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
  'endermite',

  'blaze',
  'ghast',

  'warden'
]


function getEntityName(entity) {

  return String(
    entity?.name ||
    entity?.displayName ||
    ''
  ).toLowerCase()
}


function isHostile(entity) {

  if (!entity)
    return false


  const name =
    getEntityName(entity)


  return hostileMobs.some(
    hostile =>
      name.includes(hostile)
  )
}


// ======================================================
// KAMPF
// ======================================================

function attackNearestEnemy() {

  const enemy =
    bot.nearestEntity(entity => {

      if (!isHostile(entity))
        return false


      return (
        bot.entity.position.distanceTo(
          entity.position
        ) <= 18
      )
    })


  if (!enemy) {

    console.log(
      '[KAMPF] Kein Gegner gefunden.'
    )

    return
  }


  currentTask =
    `${getEntityName(enemy)} bekämpfen`


  console.log(
    `[KAMPF] Greife ${getEntityName(enemy)} an.`
  )


  bot.pvp.attack(enemy)
}


// ======================================================
// BESCHÜTZEN
// ======================================================

function protectPlayer(username) {

  const player =
    getPlayer(username)

  if (!player)
    return


  protectedPlayer =
    username

  protectionEnabled =
    true


  currentTask =
    `${username} beschützen`


  if (protectionLoop) {

    clearInterval(
      protectionLoop
    )
  }


  protectionLoop =
    setInterval(() => {

      if (
        !protectionEnabled ||
        busy
      ) {
        return
      }


      const playerEntity =
        bot.players[
          protectedPlayer
        ]?.entity


      if (!playerEntity)
        return


      // Suche Feinde in der Nähe
      // des beschützten Spielers

      const enemy =
        bot.nearestEntity(entity => {

          if (!isHostile(entity))
            return false


          const distance =
            entity.position.distanceTo(
              playerEntity.position
            )


          return distance <= 10
        })


      if (enemy) {

        console.log(
          `[SCHUTZ] ${getEntityName(enemy)} entdeckt.`
        )

        currentTask =
          `${protectedPlayer} gegen ${getEntityName(enemy)} verteidigen`


        bot.pvp.attack(
          enemy
        )

        return
      }


      // Kein Gegner:
      // Bot bleibt in deiner Nähe

      bot.pvp.stop()


      const distance =
        bot.entity.position.distanceTo(
          playerEntity.position
        )


      if (distance > 4) {

        bot.pathfinder.setGoal(
          new GoalFollow(
            playerEntity,
            2
          ),
          true
        )
      }


      currentTask =
        `${protectedPlayer} beschützen`

    }, 700)


  console.log(
    `[SCHUTZ] Beschütze jetzt ${username}.`
  )
}


function stopProtection() {

  protectionEnabled =
    false

  protectedPlayer =
    null


  if (protectionLoop) {

    clearInterval(
      protectionLoop
    )

    protectionLoop =
      null
  }


  bot.pvp.stop()


  currentTask =
    'nichts'


  console.log(
    '[SCHUTZ] Beschützungsmodus AUS.'
  )
}


// ======================================================
// RESSOURCEN -> BLÖCKE
// ======================================================

const resources = {

  holz: [
    'oak_log',
    'spruce_log',
    'birch_log',
    'jungle_log',
    'acacia_log',
    'dark_oak_log',
    'mangrove_log',
    'cherry_log'
  ],

  eichenholz: [
    'oak_log'
  ],

  fichtenholz: [
    'spruce_log'
  ],

  birkenholz: [
    'birch_log'
  ],

  stein: [
    'stone'
  ],

  kohle: [
    'coal_ore',
    'deepslate_coal_ore'
  ],

  eisen: [
    'iron_ore',
    'deepslate_iron_ore'
  ],

  kupfer: [
    'copper_ore',
    'deepslate_copper_ore'
  ],

  gold: [
    'gold_ore',
    'deepslate_gold_ore'
  ],

  redstone: [
    'redstone_ore',
    'deepslate_redstone_ore'
  ],

  lapis: [
    'lapis_ore',
    'deepslate_lapis_ore'
  ],

  diamant: [
    'diamond_ore',
    'deepslate_diamond_ore'
  ],

  diamanten: [
    'diamond_ore',
    'deepslate_diamond_ore'
  ],

  smaragd: [
    'emerald_ore',
    'deepslate_emerald_ore'
  ],

  smaragde: [
    'emerald_ore',
    'deepslate_emerald_ore'
  ],

  sand: [
    'sand'
  ],

  erde: [
    'dirt'
  ],

  kies: [
    'gravel'
  ]
}


// ======================================================
// RESSOURCE -> ITEM DROP
// ======================================================

const resourceDrops = {

  holz: [
    'oak_log',
    'spruce_log',
    'birch_log',
    'jungle_log',
    'acacia_log',
    'dark_oak_log',
    'mangrove_log',
    'cherry_log'
  ],

  eichenholz: [
    'oak_log'
  ],

  fichtenholz: [
    'spruce_log'
  ],

  birkenholz: [
    'birch_log'
  ],

  stein: [
    'cobblestone',
    'stone'
  ],

  kohle: [
    'coal'
  ],

  eisen: [
    'raw_iron',
    'iron_ingot'
  ],

  kupfer: [
    'raw_copper',
    'copper_ingot'
  ],

  gold: [
    'raw_gold',
    'gold_ingot'
  ],

  redstone: [
    'redstone'
  ],

  lapis: [
    'lapis_lazuli'
  ],

  diamant: [
    'diamond'
  ],

  diamanten: [
    'diamond'
  ],

  smaragd: [
    'emerald'
  ],

  smaragde: [
    'emerald'
  ],

  sand: [
    'sand'
  ],

  erde: [
    'dirt'
  ],

  kies: [
    'gravel',
    'flint'
  ]
}


// ======================================================
// RESSOURCEN-NAMEN NORMALISIEREN
// ======================================================

function normalizeResource(resource) {

  let name =
    String(resource)
      .toLowerCase()
      .trim()


  const aliases = {

    'diamant':
      'diamanten',

    'diamonds':
      'diamanten',

    'diamond':
      'diamanten',

    'smaragd':
      'smaragde',

    'emerald':
      'smaragde',

    'iron':
      'eisen',

    'iron ore':
      'eisen',

    'coal':
      'kohle',

    'wood':
      'holz',

    'logs':
      'holz',

    'log':
      'holz',

    'oak':
      'eichenholz',

    'oak wood':
      'eichenholz',

    'spruce':
      'fichtenholz',

    'birch':
      'birkenholz',

    'stone':
      'stein',

    'copper':
      'kupfer',

    'redstone dust':
      'redstone',

    'emeralds':
      'smaragde',

    'dirt':
      'erde',

    'gravel':
      'kies'
  }


  if (aliases[name]) {

    name =
      aliases[name]
  }


  return name
}


// ======================================================
// ITEM-MENGE ZÄHLEN
// ======================================================

function countResource(resource) {

  resource =
    normalizeResource(resource)


  const allowedItems =
    resourceDrops[resource] || []


  return bot.inventory
    .items()
    .filter(item =>
      allowedItems.includes(
        item.name
      )
    )
    .reduce(
      (
        total,
        item
      ) =>
        total + item.count,

      0
    )
}


// ======================================================
// BLOCK FINDEN
// ======================================================

function findResourceBlock(resource) {

  resource =
    normalizeResource(resource)


  const blockNames =
    resources[resource]


  if (!blockNames)
    return null


  let closest =
    null

  let closestDistance =
    Infinity


  for (
    const blockName
    of blockNames
  ) {

    const blockData =
      mcData.blocksByName[
        blockName
      ]


    if (!blockData)
      continue


    const block =
      bot.findBlock({

        matching:
          blockData.id,

        maxDistance:
          64
      })


    if (!block)
      continue


    const distance =
      bot.entity.position.distanceTo(
        block.position
      )


    if (
      distance <
      closestDistance
    ) {

      closest =
        block

      closestDistance =
        distance
    }
  }


  return closest
}


// ======================================================
// ZUM SPIELER ZURÜCKKEHREN
// ======================================================

async function returnToPlayer(
  username,
  timeout = 30000
) {

  const startTime =
    Date.now()


  console.log(
    `[RÜCKWEG] Suche ${username}.`
  )


  while (
    Date.now() - startTime <
    timeout
  ) {

    const player =
      bot.players[username]?.entity


    if (!player) {

      await sleep(1000)

      continue
    }


    const distance =
      bot.entity.position.distanceTo(
        player.position
      )


    if (distance <= 3) {

      bot.pathfinder.setGoal(null)

      console.log(
        `[RÜCKWEG] Bei ${username} angekommen.`
      )

      return player
    }


    bot.pathfinder.setMovements(
      movements
    )


    bot.pathfinder.setGoal(
      new GoalFollow(
        player,
        2
      ),
      true
    )


    await sleep(500)
  }


  bot.pathfinder.setGoal(null)


  console.log(
    '[RÜCKWEG] Timeout.'
  )


  return null
}


// ======================================================
// ITEMS DROPPEN
// ======================================================

async function dropResource(
  resource,
  amount,
  username
) {

  resource =
    normalizeResource(resource)


  const allowedItems =
    resourceDrops[resource] || []


  let remaining =
    amount


  const player =
    bot.players[username]?.entity


  if (player) {

    try {

      await bot.lookAt(
        player.position.offset(
          0,
          1,
          0
        )
      )

    } catch (_) {}
  }


  console.log(
    `[DROP] Droppe ${amount} ${resource} für ${username}.`
  )


  for (
    const item
    of bot.inventory.items()
  ) {

    if (remaining <= 0)
      break


    if (
      !allowedItems.includes(
        item.name
      )
    ) {
      continue
    }


    const amountToDrop =
      Math.min(
        item.count,
        remaining
      )


    try {

      await bot.toss(
        item.type,
        item.metadata,
        amountToDrop
      )


      remaining -=
        amountToDrop


      console.log(
        `[DROP] ${amountToDrop}x ${item.name}`
      )


      await sleep(250)

    } catch (error) {

      console.log(
        '[DROP FEHLER]',
        error.message
      )

      break
    }
  }


  const dropped =
    amount - remaining


  console.log(
    `[DROP] ${dropped}/${amount} Items gedroppt.`
  )
}


// ======================================================
// FARMEN
// ======================================================

async function farmResource(
  resource,
  amount,
  username
) {

  resource =
    normalizeResource(resource)


  if (!resources[resource]) {

    console.log(
      `[FARM] Unbekannte Ressource: ${resource}`
    )

    return
  }


  if (busy) {

    console.log(
      '[FARM] Bin bereits beschäftigt.'
    )

    return
  }


  amount =
    Math.min(
      Math.max(
        Number(amount) || 1,
        1
      ),
      64
    )


  busy = true


  currentTask =
    `${amount} ${resource} farmen`


  bot.pvp.stop()

  bot.pathfinder.setGoal(null)


  console.log(
    `[FARM] Auftrag von ${username}: ${amount} ${resource}`
  )


  const inventoryBefore =
    countResource(resource)


  let farmed =
    0


  try {

    const farmMovements =
      new Movements(
        bot,
        mcData
      )


    // Während des Farmens darf
    // er Blöcke abbauen.
    farmMovements.canDig =
      true


    bot.pathfinder.setMovements(
      farmMovements
    )


    while (
      farmed < amount &&
      busy
    ) {


      // Bei wenig Leben abbrechen
      if (bot.health <= 5) {

        console.log(
          '[FARM] Zu wenig Leben. Breche Auftrag ab.'
        )

        break
      }


      const target =
        findResourceBlock(
          resource
        )


      if (!target) {

        console.log(
          `[FARM] Kein ${resource} innerhalb von 64 Blöcken gefunden.`
        )

        break
      }


      console.log(
        `[FARM] Ziel gefunden: ${target.name}`
      )


      try {

        await bot.collectBlock.collect(
          target
        )


        // Kurz warten, damit das Item
        // sicher aufgenommen wurde.
        await sleep(300)


        farmed =
          countResource(resource) -
          inventoryBefore


        console.log(
          `[FARM] Fortschritt: ${farmed}/${amount}`
        )

      } catch (error) {

        console.log(
          '[FARM SAMMELFEHLER]',
          error.message
        )

        break
      }
    }


  } catch (error) {

    console.log(
      '[FARM FEHLER]',
      error.message
    )


  } finally {

    // Normales Movement wieder
    bot.pathfinder.setMovements(
      movements
    )


    farmed =
      Math.max(
        0,
        countResource(resource) -
        inventoryBefore
      )


    console.log(
      `[FARM] Auftrag beendet: ${farmed}/${amount} ${resource}`
    )


    // ==================================================
    // ZURÜCK ZUM SPIELER
    // ==================================================

    currentTask =
      `${resource} zu ${username} bringen`


    const player =
      await returnToPlayer(
        username
      )


    // ==================================================
    // FARM-ITEMS DROPPEN
    // ==================================================

    if (
      player &&
      farmed > 0
    ) {

      const amountToDrop =
        Math.min(
          farmed,
          amount
        )


      await sleep(500)


      await dropResource(
        resource,
        amountToDrop,
        username
      )

    } else if (!player) {

      console.log(
        `[DROP] ${username} konnte nicht gefunden werden.`
      )

    } else {

      console.log(
        '[DROP] Nichts neu gefarmt.'
      )
    }


    busy =
      false


    currentTask =
      'nichts'


    // Wenn Schutzmodus vorher an war,
    // geht er danach wieder weiter.
    if (
      protectionEnabled &&
      protectedPlayer
    ) {

      console.log(
        '[SCHUTZ] Schutzmodus läuft weiter.'
      )
    }
  }
}


// ======================================================
// KI TOOLS
// ======================================================

const aiTools = [

  {
    type: 'function',

    name: 'follow_player',

    description:
      'Folge dem Spieler dauerhaft. Verwende dies bei Aussagen wie folg mir, komm mit, bleib bei mir.',

    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },

    strict: true
  },


  {
    type: 'function',

    name: 'come_to_player',

    description:
      'Laufe direkt zum Spieler.',

    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },

    strict: true
  },


  {
    type: 'function',

    name: 'stop',

    description:
      'Stoppe die aktuelle Bewegung oder Aufgabe.',

    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },

    strict: true
  },


  {
    type: 'function',

    name: 'protect_player',

    description:
      'Beschütze den Spieler dauerhaft und bekämpfe feindliche Minecraft-Mobs in seiner Nähe.',

    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },

    strict: true
  },


  {
    type: 'function',

    name: 'stop_protection',

    description:
      'Beende den Beschützungsmodus.',

    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },

    strict: true
  },


  {
    type: 'function',

    name: 'attack_enemy',

    description:
      'Bekämpfe den nächsten feindlichen Mob.',

    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },

    strict: true
  },


  {
    type: 'function',

    name: 'farm_resource',

    description:
      'Farme eine Ressource für den Spieler. Der Bot sammelt die Ressource, kehrt danach zum Spieler zurück und wirft die neu gefarmten Items vor ihm auf den Boden.',

    parameters: {

      type: 'object',

      properties: {

        resource: {

          type: 'string',

          description:
            'Zum Beispiel holz, eichenholz, fichtenholz, birkenholz, stein, kohle, eisen, kupfer, gold, redstone, lapis, diamanten, smaragde, sand, erde oder kies.'
        },

        amount: {

          type: 'integer',

          minimum: 1,

          maximum: 64
        }
      },

      required: [
        'resource',
        'amount'
      ],

      additionalProperties:
        false
    },

    strict: true
  },


  {
    type: 'function',

    name: 'jump',

    description:
      'Springe einmal.',

    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },

    strict: true
  },


  {
    type: 'function',

    name: 'look_at_player',

    description:
      'Schau den Spieler an.',

    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },

    strict: true
  }
]


// ======================================================
// KI
// ======================================================

async function askAI(
  username,
  message
) {

  console.log(
    `[KI] ${username}: ${message}`
  )


  try {

    const response =
      await openai.responses.create({

        model:
          AI_MODEL,

        instructions: `
Du steuerst NaxyBot, einen Minecraft-Begleiter.

Der Spieler spricht normales lockeres Deutsch.
Er muss keine festen Commands verwenden.

Du entscheidest anhand seiner Nachricht, welche Minecraft-Funktion ausgeführt werden soll.

Beispiele:

"bro komm mal her"
=> come_to_player

"lauf mir hinterher"
=> follow_player

"bleib bei mir und pass auf mich auf"
=> protect_player

"mach den zombie weg"
=> attack_enemy

"hol mir 20 eisen"
=> farm_resource(resource="eisen", amount=20)

"ich brauch bisschen holz"
=> farm_resource(resource="holz", amount=16)

"besorg mir 5 dias"
=> farm_resource(resource="diamanten", amount=5)

"warte hier"
=> stop

WICHTIGE REGELN:

- Erfinde keine Funktion, die nicht vorhanden ist.
- Kämpfe nur gegen feindliche Mobs.
- Wenn keine Menge genannt wurde, wähle eine kleine sinnvolle Menge.
- Beachte Leben, Hunger, Inventar und die aktuelle Aufgabe.
- Beim Farmen bringt der Bot die Items danach automatisch zurück und droppt sie beim Spieler.
- Wenn die Nachricht nur normales Gespräch ist und keine Aktion verlangt, musst du kein Tool benutzen.
`,

        input: `
SPIELER:
${username}

NACHRICHT:
${message}

${getBotState(username)}
`,

        tools:
          aiTools,

        tool_choice:
          'auto'
      })


    const calls =
      response.output.filter(
        item =>
          item.type ===
          'function_call'
      )


    if (
      calls.length === 0
    ) {

      console.log(
        '[KI] Keine Minecraft-Aktion nötig.'
      )

      return
    }


    // Erste erkannte Aktion ausführen
    const call =
      calls[0]


    let args = {}


    try {

      args =
        JSON.parse(
          call.arguments || '{}'
        )

    } catch (_) {}


    console.log(
      `[KI] Entscheidung: ${call.name}`,
      args
    )


    switch (
      call.name
    ) {


      case 'follow_player':

        followPlayer(
          username
        )

        break


      case 'come_to_player':

        comeToPlayer(
          username
        )

        break


      case 'stop':

        stopEverything()

        break


      case 'protect_player':

        protectPlayer(
          username
        )

        break


      case 'stop_protection':

        stopProtection()

        break


      case 'attack_enemy':

        attackNearestEnemy()

        break


      case 'farm_resource':

        await farmResource(
          args.resource,
          args.amount,
          username
        )

        break


      case 'jump':

        await jump()

        break


      case 'look_at_player':

        await lookAtPlayer(
          username
        )

        break
    }


  } catch (error) {

    console.log(
      '[KI FEHLER]'
    )

    console.error(
      error
    )
  }
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


    if (
      !isAllowedPlayer(
        username
      )
    ) {

      console.log(
        `[IGNORIERT] ${username} darf den Bot nicht steuern.`
      )

      return
    }


    console.log(
      `[CHAT] ${username}: ${message}`
    )


    await askAI(
      username,
      message
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
      '[TOD] NaxyBot ist gestorben.'
    )


    busy =
      false


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
      '[RESPAWN] NaxyBot ist wieder da.'
    )
  }
)


// ======================================================
// KICK
// ======================================================

bot.on(
  'kicked',

  reason => {

    console.log('')
    console.log(
      'BOT WURDE GEKICKT:'
    )

    console.log(
      reason
    )

    console.log('')
  }
)


// ======================================================
// ERROR
// ======================================================

bot.on(
  'error',

  error => {

    console.log('')
    console.log(
      'MINECRAFT FEHLER:'
    )

    console.error(
      error
    )

    console.log('')
  }
)


// ======================================================
// VERBINDUNG BEENDET
// ======================================================

bot.on(
  'end',

  reason => {

    console.log(
      '[ENDE]',
      reason
    )
  }
)
