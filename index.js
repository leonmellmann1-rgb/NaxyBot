const mineflayer = require('mineflayer')
const OpenAI = require('openai')

const {
  pathfinder,
  Movements,
  goals
} = require('mineflayer-pathfinder')

const pvp = require('mineflayer-pvp').plugin
const toolPlugin = require('mineflayer-tool').plugin

const {
  GoalFollow,
  GoalNear
} = goals


// ======================================================
// EINSTELLUNGEN
// ======================================================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const AI_MODEL =
  process.env.OPENAI_MODEL || 'gpt-5.6-luna'

const BOT_OWNER =
  process.env.BOT_OWNER || ''


// ======================================================
// BOT STARTEN
// ======================================================

const bot = mineflayer.createBot({
  host: process.env.MC_HOST,
  port: Number(process.env.MC_PORT || 25565),

  username: process.env.MC_USERNAME,
  auth: 'microsoft',

  // Microsoft Login bleibt im Railway Volume gespeichert
  profilesFolder: '/app/auth'
})

bot.loadPlugin(pathfinder)
bot.loadPlugin(pvp)
bot.loadPlugin(toolPlugin)


// ======================================================
// STATUS
// ======================================================

let mcData = null
let movements = null

let currentTask = 'nichts'
let busy = false

let protectionEnabled = false
let protectedPlayer = null

let combatActive = false
let combatTarget = null
let taskBeforeCombat = null

let eating = false

let currentFarmTask = null

let survivalLoop = null


// ======================================================
// START
// ======================================================

bot.once('spawn', () => {

  mcData = require('minecraft-data')(bot.version)

  movements = new Movements(bot, mcData)

  movements.canDig = false

  bot.pathfinder.setMovements(movements)

  console.log('')
  console.log('==========================================')
  console.log('        NAXY AI V4 IST ONLINE')
  console.log('==========================================')
  console.log('KI:                 AN')
  console.log('SMART FARMING:      AN')
  console.log('AUTO TOOL:           AN')
  console.log('SELBSTSCHUTZ:        IMMER AN')
  console.log('SPIELERSCHUTZ:       BEREIT')
  console.log('AUTO ESSEN:          AN')
  console.log('FARM RESUME:         AN')
  console.log('ITEM DROP:           AN')
  console.log('==========================================')
  console.log('')

  startSurvivalSystem()
})


// ======================================================
// HELFER
// ======================================================

function sleep(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  )
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


function getPlayer(username) {

  const player =
    bot.players[username]

  if (
    !player ||
    !player.entity
  ) {

    console.log(
      `[SPIELER] ${username} ist nicht sichtbar.`
    )

    return null
  }

  return player
}


// ======================================================
// BOT STATUS FÜR KI
// ======================================================

function getBotState(username) {

  const player =
    bot.players[username]?.entity

  const inventory =
    bot.inventory
      .items()
      .slice(0, 30)
      .map(item =>
        `${item.name} x${item.count}`
      )
      .join(', ')

  const nearby =
    Object.values(bot.entities)
      .filter(entity => {

        if (!entity.position)
          return false

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
            .distanceTo(entity.position)
            .toFixed(1)

        return `${name} (${distance} Blöcke)`
      })
      .join(', ')

  return `
BOT STATUS:

Leben: ${bot.health}/20
Hunger: ${bot.food}/20

Position:
X ${Math.floor(bot.entity.position.x)}
Y ${Math.floor(bot.entity.position.y)}
Z ${Math.floor(bot.entity.position.z)}

Aufgabe:
${currentTask}

Farmt gerade:
${currentFarmTask ? 'JA' : 'NEIN'}

Im Kampf:
${combatActive ? 'JA' : 'NEIN'}

Spielerschutz:
${protectionEnabled ? 'AN' : 'AUS'}

Spieler sichtbar:
${player ? 'JA' : 'NEIN'}

Inventar:
${inventory || 'leer'}

Umgebung:
${nearby || 'nichts Besonderes'}
`
}


// ======================================================
// FEINDLICHE MOBS
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
  'warden',
  'hoglin',
  'zoglin',
  'piglin_brute'
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
// BESTE WAFFE
// ======================================================

async function equipBestWeapon() {

  const priorities = [
    'netherite_sword',
    'diamond_sword',
    'iron_sword',
    'stone_sword',
    'golden_sword',
    'wooden_sword',

    'netherite_axe',
    'diamond_axe',
    'iron_axe',
    'stone_axe',
    'golden_axe',
    'wooden_axe'
  ]

  for (
    const weaponName
    of priorities
  ) {

    const weapon =
      bot.inventory
        .items()
        .find(
          item =>
            item.name === weaponName
        )

    if (!weapon)
      continue

    try {

      await bot.equip(
        weapon,
        'hand'
      )

      console.log(
        `[HOTBAR] Waffe: ${weapon.name}`
      )

      return true

    } catch (_) {}
  }

  console.log(
    '[HOTBAR] Keine Waffe - kämpfe mit der Hand.'
  )

  return false
}


// ======================================================
// ESSEN
// ======================================================

const foodPriority = [
  'golden_carrot',
  'cooked_beef',
  'cooked_porkchop',
  'cooked_mutton',
  'cooked_chicken',
  'cooked_rabbit',
  'bread',
  'baked_potato',
  'carrot',
  'apple'
]


async function eatFood() {

  if (eating)
    return false

  const food =
    foodPriority
      .map(name =>
        bot.inventory
          .items()
          .find(
            item =>
              item.name === name
          )
      )
      .find(Boolean)

  if (!food)
    return false

  eating = true

  try {

    console.log(
      `[SURVIVAL] Esse ${food.name}`
    )

    await bot.equip(
      food,
      'hand'
    )

    await bot.consume()

    console.log(
      '[SURVIVAL] Essen fertig.'
    )

    return true

  } catch (error) {

    console.log(
      '[ESSEN FEHLER]',
      error.message
    )

    return false

  } finally {

    eating = false
  }
}


// ======================================================
// BEDROHUNG SUCHEN
// ======================================================

function findThreat() {

  let threat = null
  let bestDistance = Infinity

  const protectedEntity =
    protectedPlayer
      ? bot.players[protectedPlayer]?.entity
      : null

  for (
    const entity
    of Object.values(bot.entities)
  ) {

    if (!isHostile(entity))
      continue

    if (!entity.position)
      continue

    const distanceToBot =
      bot.entity.position.distanceTo(
        entity.position
      )

    let danger =
      distanceToBot <= 8

    if (
      protectionEnabled &&
      protectedEntity
    ) {

      const distanceToPlayer =
        protectedEntity.position.distanceTo(
          entity.position
        )

      if (distanceToPlayer <= 9) {
        danger = true
      }
    }

    if (!danger)
      continue

    if (
      distanceToBot <
      bestDistance
    ) {

      threat = entity
      bestDistance = distanceToBot
    }
  }

  return threat
}


// ======================================================
// KAMPF STARTEN
// ======================================================

async function startCombat(enemy) {

  if (
    !enemy ||
    !enemy.isValid
  ) {
    return
  }

  if (
    combatActive &&
    combatTarget &&
    combatTarget.id === enemy.id
  ) {
    return
  }

  if (!combatActive) {

    taskBeforeCombat =
      currentTask
  }

  combatActive = true
  combatTarget = enemy

  bot.pathfinder.setGoal(null)

  currentTask =
    `Selbstverteidigung gegen ${getEntityName(enemy)}`

  console.log(
    `[SURVIVAL] Gefahr: ${getEntityName(enemy)}`
  )

  try {

    await equipBestWeapon()

    bot.pvp.attack(enemy)

  } catch (error) {

    console.log(
      '[KAMPF FEHLER]',
      error.message
    )
  }
}


// ======================================================
// KAMPF BEENDEN
// ======================================================

function finishCombat() {

  if (!combatActive)
    return

  bot.pvp.stop()

  combatActive = false
  combatTarget = null

  if (taskBeforeCombat) {

    currentTask =
      taskBeforeCombat

  } else {

    currentTask =
      currentFarmTask
        ? `${currentFarmTask.amount} ${currentFarmTask.resource} farmen`
        : 'nichts'
  }

  taskBeforeCombat = null

  console.log(
    '[SURVIVAL] Gefahr weg - vorherige Aufgabe wird fortgesetzt.'
  )
}


// ======================================================
// SURVIVAL SYSTEM
// ======================================================

function startSurvivalSystem() {

  if (survivalLoop) {
    clearInterval(
      survivalLoop
    )
  }

  survivalLoop =
    setInterval(
      async () => {

        try {

          if (!bot.entity)
            return

          const threat =
            findThreat()

          if (threat) {

            await startCombat(
              threat
            )

            return
          }

          if (
            combatActive &&
            (
              !combatTarget ||
              !combatTarget.isValid
            )
          ) {

            finishCombat()
          }

          // Bei Hunger automatisch essen.
          // Nicht essen, wenn direkt ein Gegner da ist.
          if (
            !combatActive &&
            !eating &&
            (
              bot.food <= 14 ||
              bot.health <= 11
            )
          ) {

            await eatFood()
          }

        } catch (error) {

          console.log(
            '[SURVIVAL LOOP FEHLER]',
            error.message
          )
        }

      },
      500
    )
}


// ======================================================
// WARTEN BIS KAMPF VORBEI
// ======================================================

async function waitForSafety() {

  while (combatActive) {

    await sleep(250)
  }

  if (
    bot.food <= 12 &&
    !combatActive
  ) {

    await eatFood()
  }
}


// ======================================================
// BEWEGUNG
// ======================================================

function followPlayer(username) {

  const player =
    getPlayer(username)

  if (!player)
    return

  currentTask =
    `${username} folgen`

  bot.pvp.stop()

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

  if (currentFarmTask) {
    currentFarmTask.cancelled = true
  }

  currentFarmTask = null

  currentTask = 'nichts'

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

  bot.setControlState(
    'jump',
    true
  )

  await sleep(500)

  bot.setControlState(
    'jump',
    false
  )

  console.log(
    '[AKTION] Springen'
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

  } catch (error) {

    console.log(
      '[LOOK FEHLER]',
      error.message
    )
  }
}


// ======================================================
// SPIELER BESCHÜTZEN
// ======================================================

function protectPlayer(username) {

  const player =
    getPlayer(username)

  if (!player)
    return

  protectionEnabled = true
  protectedPlayer = username

  currentTask =
    `${username} beschützen`

  console.log(
    `[SCHUTZ] ${username} wird jetzt beschützt.`
  )

  followPlayer(username)
}


function stopProtection() {

  protectionEnabled = false
  protectedPlayer = null

  bot.pvp.stop()

  currentTask = 'nichts'

  console.log(
    '[SCHUTZ] Spielerschutz AUS.'
  )
}


// ======================================================
// NÄCHSTEN GEGNER ANGREIFEN
// ======================================================

async function attackNearestEnemy() {

  const enemy =
    bot.nearestEntity(
      entity =>
        isHostile(entity) &&
        bot.entity.position.distanceTo(
          entity.position
        ) <= 18
    )

  if (!enemy) {

    console.log(
      '[KAMPF] Kein Gegner gefunden.'
    )

    return
  }

  await startCombat(enemy)
}


// ======================================================
// RESSOURCEN
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
    'cherry_log',
    'pale_oak_log'
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

  sand: [
    'sand',
    'red_sand'
  ],

  erde: [
    'dirt',
    'grass_block'
  ],

  kies: [
    'gravel'
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

  diamanten: [
    'diamond_ore',
    'deepslate_diamond_ore'
  ],

  smaragde: [
    'emerald_ore',
    'deepslate_emerald_ore'
  ]
}


// ======================================================
// ERWARTETE DROPS
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
    'cherry_log',
    'pale_oak_log'
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

  sand: [
    'sand',
    'red_sand'
  ],

  erde: [
    'dirt',
    'grass_block'
  ],

  kies: [
    'gravel',
    'flint'
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

  diamanten: [
    'diamond'
  ],

  smaragde: [
    'emerald'
  ]
}


// ======================================================
// NAMEN NORMALISIEREN
// ======================================================

function normalizeResource(resource) {

  let name =
    String(resource)
      .toLowerCase()
      .trim()

  const aliases = {

    'diamant':
      'diamanten',

    'diamond':
      'diamanten',

    'diamonds':
      'diamanten',

    'dias':
      'diamanten',

    'dia':
      'diamanten',

    'smaragd':
      'smaragde',

    'emerald':
      'smaragde',

    'emeralds':
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

    'dirt':
      'erde',

    'gravel':
      'kies'
  }

  return aliases[name] || name
}


// ======================================================
// ITEM ANZAHL
// ======================================================

function countResource(resource) {

  resource =
    normalizeResource(resource)

  const allowed =
    resourceDrops[resource] || []

  return bot.inventory
    .items()
    .filter(
      item =>
        allowed.includes(item.name)
    )
    .reduce(
      (total, item) =>
        total + item.count,
      0
    )
}


// ======================================================
// BLOCKKANDIDATEN SUCHEN
// ======================================================

function findResourceCandidates(resource) {

  resource =
    normalizeResource(resource)

  const names =
    resources[resource]

  if (!names)
    return []

  const ids =
    names
      .map(
        name =>
          mcData.blocksByName[name]?.id
      )
      .filter(
        id =>
          typeof id === 'number'
      )

  if (ids.length === 0)
    return []

  const positions =
    bot.findBlocks({
      matching: ids,
      maxDistance: 64,
      count: 40
    })

  return positions
    .map(pos =>
      bot.blockAt(pos)
    )
    .filter(Boolean)
    .sort(
      (a, b) =>
        bot.entity.position.distanceTo(
          a.position
        ) -
        bot.entity.position.distanceTo(
          b.position
        )
    )
}


// ======================================================
// EINEN GUTEN BLOCK AUSWÄHLEN
// ======================================================

function findResourceBlock(resource) {

  const candidates =
    findResourceCandidates(resource)

  if (candidates.length === 0)
    return null

  // Nicht direkt den Block unter den eigenen Füßen nehmen,
  // solange es andere Optionen gibt.
  const safeCandidates =
    candidates.filter(block => {

      const dx =
        Math.abs(
          block.position.x -
          bot.entity.position.x
        )

      const dz =
        Math.abs(
          block.position.z -
          bot.entity.position.z
        )

      const dy =
        bot.entity.position.y -
        block.position.y

      const standingOnIt =
        dx < 1 &&
        dz < 1 &&
        dy > 0 &&
        dy < 2

      return !standingOnIt
    })

  return (
    safeCandidates[0] ||
    candidates[0]
  )
}


// ======================================================
// SMART MINING
// ======================================================

async function smartDigBlock(block) {

  if (!block)
    return false

  await waitForSafety()

  try {

    console.log(
      `[MINE] Ziel: ${block.name}`
    )

    // Erst hinlaufen
    bot.pathfinder.setMovements(
      movements
    )

    await bot.pathfinder.goto(
      new GoalNear(
        block.position.x,
        block.position.y,
        block.position.z,
        2
      )
    )

    await waitForSafety()

    // Block kann sich durch Sand/Kies verändert haben
    const freshBlock =
      bot.blockAt(
        block.position
      )

    if (
      !freshBlock ||
      freshBlock.name === 'air'
    ) {

      return false
    }

    // BESTES Werkzeug automatisch wählen.
    // Sand -> Schaufel
    // Holz -> Axt
    // Stein/Erze -> Spitzhacke
    //
    // requireHarvest verhindert z.B.,
    // dass Eisen/Diamant mit falschem Werkzeug zerstört wird.

    try {

      await bot.tool.equipForBlock(
        freshBlock,
        {
          requireHarvest: true
        }
      )

    } catch (error) {

      console.log(
        `[TOOL] Kein passendes Werkzeug für ${freshBlock.name}: ${error.message}`
      )

      return false
    }

    console.log(
      `[HOTBAR] Benutze: ${bot.heldItem?.name || 'Hand'}`
    )

    await bot.lookAt(
      freshBlock.position.offset(
        0.5,
        0.5,
        0.5
      ),
      true
    )

    await waitForSafety()

    // WICHTIG:
    // bot.dig wartet, bis der Block komplett abgebaut ist.
    // Kein Linksklick-Spam.

    console.log(
      `[MINE] Halte Abbauen auf ${freshBlock.name}...`
    )

    await bot.dig(
      freshBlock
    )

    console.log(
      `[MINE] ${freshBlock.name} komplett abgebaut.`
    )

    // Sand/Kies kann danach runterfallen.
    // Kurz warten und danach neu suchen.

    if (
      freshBlock.name === 'sand' ||
      freshBlock.name === 'red_sand' ||
      freshBlock.name === 'gravel'
    ) {

      await sleep(500)

    } else {

      await sleep(250)
    }

    // Wir stehen nahe genug am Drop.
    // Kurz Zeit geben, damit Minecraft ihn einsammelt.

    await sleep(350)

    return true

  } catch (error) {

    console.log(
      `[SMART MINE FEHLER] ${error.message}`
    )

    try {
      bot.stopDigging()
    } catch (_) {}

    return false
  }
}


// ======================================================
// KLEINEN SUCHSCHRITT MACHEN
// ======================================================

async function exploreForResource(
  resource,
  attempt
) {

  console.log(
    `[SUCHE] Kein ${resource} gesehen. Suche weiter... (${attempt})`
  )

  const distance =
    10 + attempt * 5

  const angle =
    attempt * 1.7

  const x =
    Math.floor(
      bot.entity.position.x +
      Math.cos(angle) * distance
    )

  const y =
    Math.floor(
      bot.entity.position.y
    )

  const z =
    Math.floor(
      bot.entity.position.z +
      Math.sin(angle) * distance
    )

  try {

    await bot.pathfinder.goto(
      new GoalNear(
        x,
        y,
        z,
        3
      )
    )

    return true

  } catch (_) {

    return false
  }
}


// ======================================================
// ZUM SPIELER ZURÜCK
// ======================================================

async function returnToPlayer(
  username,
  timeout = 45000
) {

  const start =
    Date.now()

  while (
    Date.now() - start <
    timeout
  ) {

    await waitForSafety()

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

  const allowed =
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
    `[DROP] ${amount} ${resource} für ${username}`
  )

  for (
    const item
    of bot.inventory.items()
  ) {

    if (remaining <= 0)
      break

    if (
      !allowed.includes(
        item.name
      )
    ) {
      continue
    }

    const dropAmount =
      Math.min(
        remaining,
        item.count
      )

    try {

      await bot.toss(
        item.type,
        item.metadata,
        dropAmount
      )

      remaining -=
        dropAmount

      console.log(
        `[DROP] ${dropAmount}x ${item.name}`
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

  console.log(
    `[DROP] Fertig: ${amount - remaining}/${amount}`
  )
}


// ======================================================
// SMART FARMING
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
      '[FARM] Ich mache bereits eine Aufgabe.'
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

  const task = {
    resource,
    amount,
    username,
    cancelled: false
  }

  currentFarmTask =
    task

  currentTask =
    `${amount} ${resource} farmen`

  const inventoryBefore =
    countResource(resource)

  let farmed = 0
  let searchAttempts = 0
  let failures = 0

  console.log('')
  console.log(
    `[FARM] Neuer Auftrag: ${amount} ${resource}`
  )
  console.log('')

  try {

    while (
      farmed < amount &&
      !task.cancelled
    ) {

      // --------------------------------------------------
      // 1. SELBSTSCHUTZ HAT IMMER PRIORITÄT
      // --------------------------------------------------

      await waitForSafety()

      if (task.cancelled)
        break

      // --------------------------------------------------
      // 2. ESSEN
      // --------------------------------------------------

      if (
        bot.food <= 12 ||
        bot.health <= 10
      ) {

        await eatFood()
      }

      // --------------------------------------------------
      // 3. INVENTAR VOLL?
      // --------------------------------------------------

      if (
        bot.inventory.emptySlotCount() === 0
      ) {

        console.log(
          '[FARM] Inventar ist voll.'
        )

        break
      }

      // --------------------------------------------------
      // 4. BLOCK SUCHEN
      // --------------------------------------------------

      const target =
        findResourceBlock(
          resource
        )

      if (!target) {

        searchAttempts++

        if (
          searchAttempts > 5
        ) {

          console.log(
            `[FARM] ${resource} nach mehreren Suchversuchen nicht gefunden.`
          )

          break
        }

        await exploreForResource(
          resource,
          searchAttempts
        )

        continue
      }

      searchAttempts = 0

      console.log(
        `[FARM] Nächstes Ziel: ${target.name}`
      )

      // --------------------------------------------------
      // 5. RICHTIG ABBAUEN
      // --------------------------------------------------

      const success =
        await smartDigBlock(
          target
        )

      if (!success) {

        failures++

        if (failures >= 5) {

          console.log(
            '[FARM] Zu viele Mining-Fehler. Breche ab.'
          )

          break
        }

        await sleep(300)

        continue
      }

      failures = 0

      // --------------------------------------------------
      // 6. ECHTE ITEMS ZÄHLEN
      // --------------------------------------------------

      farmed =
        Math.max(
          0,
          countResource(resource) -
          inventoryBefore
        )

      console.log(
        `[FARM] Fortschritt: ${farmed}/${amount} ${resource}`
      )
    }

  } catch (error) {

    console.log(
      '[FARM FEHLER]',
      error.message
    )

  } finally {

    farmed =
      Math.max(
        0,
        countResource(resource) -
        inventoryBefore
      )

    console.log(
      `[FARM] Farming beendet: ${farmed}/${amount}`
    )

    // --------------------------------------------------
    // ZURÜCK ZUM SPIELER
    // --------------------------------------------------

    if (
      !task.cancelled &&
      farmed > 0
    ) {

      currentTask =
        `${resource} zu ${username} bringen`

      const player =
        await returnToPlayer(
          username
        )

      if (player) {

        await waitForSafety()

        const toDrop =
          Math.min(
            farmed,
            amount
          )

        await dropResource(
          resource,
          toDrop,
          username
        )
      }
    }

    currentFarmTask = null
    busy = false

    currentTask =
      protectionEnabled && protectedPlayer
        ? `${protectedPlayer} beschützen`
        : 'nichts'
  }
}


// ======================================================
// KI TOOLS
// ======================================================

const aiTools = [

  {
    type: 'function',
    name: 'farm_resource',

    description:
      'Farme eine Minecraft-Ressource. Naxy sucht sie, wählt automatisch das richtige Werkzeug, baut korrekt ab, verteidigt sich bei Gefahr, setzt danach das Farming fort, kehrt zurück und droppt die neu gefarmten Items.',

    parameters: {
      type: 'object',

      properties: {

        resource: {
          type: 'string',
          description:
            'holz, eichenholz, fichtenholz, birkenholz, sand, erde, kies, stein, kohle, eisen, kupfer, gold, redstone, lapis, diamanten oder smaragde'
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
    name: 'follow_player',

    description:
      'Folge dem Spieler dauerhaft.',

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
      'Laufe zum Spieler.',

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
      'Beschütze zusätzlich den Spieler. Selbstschutz des Bots ist sowieso immer aktiv.',

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
      'Beende den zusätzlichen Schutz des Spielers. Selbstschutz bleibt an.',

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
      'Greife den nächsten feindlichen Mob an.',

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
      'Stoppe die aktuelle Aufgabe.',

    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
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
Du bist das Gehirn von NaxyBot.

NaxyBot ist ein intelligenter Minecraft-Begleiter.

Der Spieler spricht normales lockeres Deutsch und muss keine festen Commands benutzen.

DEINE AUFGABE:
Verstehe, WAS der Spieler möchte.
Der Code kümmert sich darum, WIE Minecraft technisch gespielt wird.

WICHTIGES MINECRAFT-WISSEN:

- Sand wird am schnellsten mit einer Schaufel abgebaut.
- Holz wird am schnellsten mit einer Axt abgebaut.
- Stein und Erze benötigen normalerweise eine Spitzhacke.
- Manche Erze brauchen eine ausreichend gute Spitzhacke.
- Der Bot darf wertvolle Erze nicht mit einem falschen Werkzeug verschwenden.
- Wenn ein Gegner kommt, pausiert Farming automatisch.
- Nach dem Kampf setzt der Bot die Farming-Aufgabe automatisch fort.
- Der Bot schützt sich IMMER selbst.
- Wenn Spielerschutz aktiv ist, schützt er zusätzlich seinen Spieler.
- Wenn der Bot Hunger hat oder verletzt ist, kann er Essen benutzen.
- Nach dem Farming kehrt er zum Spieler zurück und droppt die neu gesammelten Items.
- Bei Sand und Kies können Blöcke herunterfallen. Der Bot sucht deshalb nach jedem Block erneut.
- Der Bot soll nicht stumpf auf denselben kaputten Block schlagen.
- Wenn keine Ressource direkt sichtbar ist, kann der Bot ein Stück weitersuchen.
- Wenn eine Menge nicht genannt wurde, wähle eine sinnvolle kleine Menge.
- "bisschen" bedeutet normalerweise etwa 16.
- "Stack" bedeutet 64.
- "Dias" bedeutet Diamanten.

BEISPIELE:

"hol mir einen stack sand"
=> farm_resource(resource="sand", amount=64)

"ich brauch bisschen holz"
=> farm_resource(resource="holz", amount=16)

"besorg mir 20 eisen"
=> farm_resource(resource="eisen", amount=20)

"farm 5 dias"
=> farm_resource(resource="diamanten", amount=5)

"komm mit"
=> follow_player

"komm her"
=> come_to_player

"pass auf mich auf"
=> protect_player

"mach den zombie weg"
=> attack_enemy

"stopp"
=> stop

Benutze ausschließlich Funktionen, die dir als Tools gegeben wurden.
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
        '[KI] Keine Aktion erkannt.'
      )

      return
    }

    // Mehrere Aktionen nacheinander möglich
    for (
      const call
      of calls
    ) {

      let args = {}

      try {

        args =
          JSON.parse(
            call.arguments || '{}'
          )

      } catch (_) {}

      console.log(
        `[KI] ${call.name}`,
        args
      )

      switch (
        call.name
      ) {

        case 'farm_resource':

          await farmResource(
            args.resource,
            args.amount,
            username
          )

          break


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


        case 'protect_player':

          protectPlayer(
            username
          )

          break


        case 'stop_protection':

          stopProtection()

          break


        case 'attack_enemy':

          await attackNearestEnemy()

          break


        case 'stop':

          stopEverything()

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
    }

  } catch (error) {

    console.log(
      '[KI FEHLER]'
    )

    console.error(error)
  }
}


// ======================================================
// CHAT LESEN
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
        `[IGNORIERT] ${username}`
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
// MOB STIRBT
// ======================================================

bot.on(
  'entityGone',

  entity => {

    if (
      combatTarget &&
      entity.id ===
      combatTarget.id
    ) {

      finishCombat()
    }
  }
)


// ======================================================
// BOT WIRD VERLETZT
// ======================================================

bot.on(
  'entityHurt',

  entity => {

    if (
      entity !==
      bot.entity
    ) {
      return
    }

    console.log(
      `[SURVIVAL] Naxy wurde getroffen. Leben: ${bot.health}/20`
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

    bot.pvp.stop()

    combatActive = false
    combatTarget = null

    // Aktuelle Farming-Aufgabe abbrechen,
    // damit nach Respawn nichts kaputt läuft.
    if (currentFarmTask) {
      currentFarmTask.cancelled = true
    }

    busy = false
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

    setTimeout(
      () => {

        if (
          protectionEnabled &&
          protectedPlayer
        ) {

          protectPlayer(
            protectedPlayer
          )
        }

      },
      1500
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

    console.log(reason)
    console.log('')
  }
)


// ======================================================
// FEHLER
// ======================================================

bot.on(
  'error',

  error => {

    console.log('')
    console.log(
      'MINECRAFT FEHLER:'
    )

    console.error(error)
    console.log('')
  }
)


// ======================================================
// ENDE
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
