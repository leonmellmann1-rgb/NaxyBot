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
  GoalNear,
  GoalLookAtBlock
} = goals


// ======================================================
// OPENAI
// ======================================================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const AI_MODEL =
  process.env.OPENAI_MODEL || 'gpt-5.6-luna'

const BOT_OWNER =
  process.env.BOT_OWNER || ''

// Standard AUS, weil wir vorher den
// chat_validation_failed Fehler hatten.
const BOT_CHAT =
  String(process.env.BOT_CHAT || 'false')
    .toLowerCase() === 'true'


// ======================================================
// MINECRAFT BOT
// ======================================================

const bot = mineflayer.createBot({

  host:
    process.env.MC_HOST,

  port:
    Number(
      process.env.MC_PORT || 25565
    ),

  username:
    process.env.MC_USERNAME,

  auth:
    'microsoft',

  // WICHTIG:
  // Keine automatische Versionserkennung mehr.
  version:
    '1.21.11',

  // Railway Volume für Microsoft Login
  profilesFolder:
    '/app/auth',

  onMsaCode: data => {
    console.log(
      '[MICROSOFT LOGIN]',
      data
    )
  }
})


bot.loadPlugin(pathfinder)
bot.loadPlugin(pvp)
bot.loadPlugin(toolPlugin)


// ======================================================
// STATUS
// ======================================================

let movements = null

let busy = false

let currentTask =
  'nichts'

let currentFarmTask =
  null


let protectionEnabled =
  false

let protectedPlayer =
  null


let combatActive =
  false

let combatTarget =
  null


let eating =
  false

let dodgingCreeper =
  false


let survivalLoop =
  null


// ======================================================
// HELFER
// ======================================================

function sleep(ms) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  )
}


function log(
  section,
  text
) {

  console.log(
    `[${section}] ${text}`
  )
}


// ======================================================
// CHAT AUSGABE
// ======================================================

async function safeSay(text) {

  if (!BOT_CHAT) {

    // Solange Minecraft Chat Probleme macht,
    // schreibt der Bot nur in Railway Logs.

    log(
      'BOT',
      text
    )

    return
  }


  try {

    bot.chat(
      String(text)
        .slice(0, 200)
    )

  } catch (error) {

    log(
      'CHAT FEHLER',
      error.message
    )
  }
}


// ======================================================
// SPIELER BERECHTIGUNG
// ======================================================

function isAllowedPlayer(
  username
) {

  if (!BOT_OWNER) {

    return true
  }


  return (
    username.toLowerCase() ===
    BOT_OWNER.toLowerCase()
  )
}


// ======================================================
// SPIELER FINDEN
// ======================================================

function getPlayer(
  username
) {

  const player =
    bot.players[username]


  if (
    !player ||
    !player.entity
  ) {

    return null
  }


  return player
}


// ======================================================
// FEINDLICHE MOBS
// ======================================================

const hostileMobs =
  new Set([

    'zombie',
    'zombie_villager',

    'skeleton',
    'stray',
    'bogged',

    'spider',
    'cave_spider',

    'creeper',

    'drowned',
    'husk',

    'witch',

    'pillager',
    'vindicator',
    'evoker',

    'ravager',
    'vex',

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

    'piglin_brute',

    'guardian',
    'elder_guardian',

    'shulker'
  ])


function entityName(
  entity
) {

  return String(

    entity?.name ||

    entity?.displayName ||

    ''

  ).toLowerCase()
}


function isHostile(
  entity
) {

  if (
    !entity ||
    !entity.position
  ) {

    return false
  }


  const name =
    entityName(
      entity
    )


  if (
    hostileMobs.has(name)
  ) {

    return true
  }


  return (
    [...hostileMobs]
      .some(
        hostile =>
          name.includes(
            hostile
          )
      )
  )
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
// WAS BEIM ABBAU INS INVENTAR KOMMT
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
    'dirt'
  ],


  kies: [
    'gravel'
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
// RESSOURCEN NAMEN VERSTEHEN
// ======================================================

function normalizeResource(
  resource
) {

  const name =
    String(
      resource || ''
    )
      .toLowerCase()
      .trim()


  const aliases = {

    diamant:
      'diamanten',

    dia:
      'diamanten',

    dias:
      'diamanten',

    diamond:
      'diamanten',

    diamonds:
      'diamanten',


    smaragd:
      'smaragde',

    emerald:
      'smaragde',

    emeralds:
      'smaragde',


    iron:
      'eisen',

    'iron ore':
      'eisen',


    coal:
      'kohle',


    copper:
      'kupfer',


    wood:
      'holz',

    log:
      'holz',

    logs:
      'holz',


    oak:
      'eichenholz',

    'oak wood':
      'eichenholz',


    spruce:
      'fichtenholz',


    birch:
      'birkenholz',


    stone:
      'stein',


    dirt:
      'erde',


    gravel:
      'kies'
  }


  return (
    aliases[name] ||
    name
  )
}


// ======================================================
// ITEMS ZÄHLEN
// ======================================================

function countResource(
  resource
) {

  const name =
    normalizeResource(
      resource
    )


  const allowed =
    resourceDrops[name] || []


  return (
    bot.inventory
      .items()

      .filter(
        item =>
          allowed.includes(
            item.name
          )
      )

      .reduce(
        (
          total,
          item
        ) =>
          total +
          item.count,

        0
      )
  )
}


// ======================================================
// BOT STATUS FÜR KI
// ======================================================

function getBotState(
  username
) {

  const player =
    getPlayer(
      username
    )?.entity


  const inventory =

    bot.inventory
      .items()

      .slice(
        0,
        30
      )

      .map(
        item =>
          `${item.name} x${item.count}`
      )

      .join(', ') ||

    'leer'


  const nearby =

    Object.values(
      bot.entities
    )

      .filter(
        entity => {

          if (
            !entity?.position
          ) {

            return false
          }


          if (
            entity ===
            bot.entity
          ) {

            return false
          }


          return (

            bot.entity.position
              .distanceTo(
                entity.position
              ) <= 16
          )
        }
      )

      .slice(
        0,
        20
      )

      .map(
        entity =>

          `${
            entity.username ||
            entity.name ||
            entity.type
          } (${
            bot.entity.position
              .distanceTo(
                entity.position
              )
              .toFixed(1)
          } Blöcke)`
      )

      .join(', ') ||

    'nichts Besonderes'


  return `
Leben: ${bot.health}/20
Hunger: ${bot.food}/20

Position:
${Math.floor(bot.entity.position.x)}
${Math.floor(bot.entity.position.y)}
${Math.floor(bot.entity.position.z)}

Aufgabe:
${currentTask}

Farmt:
${currentFarmTask ? 'ja' : 'nein'}

Im Kampf:
${combatActive ? 'ja' : 'nein'}

Spielerschutz:
${protectionEnabled ? 'an' : 'aus'}

Auftraggeber sichtbar:
${player ? 'ja' : 'nein'}

Inventar:
${inventory}

In der Nähe:
${nearby}
`
}


// ======================================================
// ESSEN
// ======================================================

const foodPriority = [

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

  if (
    eating ||
    combatActive
  ) {

    return false
  }


  const food =

    foodPriority

      .map(
        name =>
          bot.inventory
            .items()
            .find(
              item =>
                item.name ===
                name
            )
      )

      .find(
        Boolean
      )


  if (!food) {

    return false
  }


  eating =
    true


  try {

    await bot.equip(
      food,
      'hand'
    )


    log(
      'SURVIVAL',
      `Esse ${food.name}`
    )


    await bot.consume()


    return true


  } catch (error) {

    log(
      'ESSEN FEHLER',
      error.message
    )


    return false


  } finally {

    eating =
      false
  }
}


// ======================================================
// BESTE WAFFE
// ======================================================

const weaponPriority = [

  'netherite_sword',

  'diamond_sword',

  'iron_sword',

  'stone_sword',

  'wooden_sword',


  'netherite_axe',

  'diamond_axe',

  'iron_axe',

  'stone_axe',

  'wooden_axe'
]


async function equipBestWeapon() {

  for (
    const weaponName
    of weaponPriority
  ) {

    const weapon =

      bot.inventory
        .items()

        .find(
          item =>
            item.name ===
            weaponName
        )


    if (!weapon) {

      continue
    }


    try {

      await bot.equip(
        weapon,
        'hand'
      )


      log(
        'HOTBAR',
        `Waffe: ${weapon.name}`
      )


      return true


    } catch (_) {}
  }


  return false
}


// ======================================================
// GEFAHR FINDEN
// ======================================================

function findThreat() {

  const protectedEntity =

    protectedPlayer

      ? getPlayer(
          protectedPlayer
        )?.entity

      : null


  let bestThreat =
    null


  let bestScore =
    Infinity


  for (
    const entity
    of Object.values(
      bot.entities
    )
  ) {

    if (
      !isHostile(
        entity
      )
    ) {

      continue
    }


    const distanceBot =

      bot.entity.position
        .distanceTo(
          entity.position
        )


    const distancePlayer =

      protectedEntity

        ? protectedEntity.position
            .distanceTo(
              entity.position
            )

        : Infinity


    const threatensBot =
      distanceBot <= 8


    const threatensPlayer =

      protectionEnabled &&
      distancePlayer <= 9


    if (
      !threatensBot &&
      !threatensPlayer
    ) {

      continue
    }


    const score =
      Math.min(
        distanceBot,
        distancePlayer
      )


    if (
      score <
      bestScore
    ) {

      bestThreat =
        entity

      bestScore =
        score
    }
  }


  return bestThreat
}


// ======================================================
// CREEPER AUSWEICHEN
// ======================================================

async function dodgeCreeper(
  creeper
) {

  if (
    dodgingCreeper ||
    !creeper?.position
  ) {

    return
  }


  dodgingCreeper =
    true


  try {

    bot.pvp.stop()


    try {

      bot.stopDigging()

    } catch (_) {}


    bot.pathfinder
      .setGoal(
        null
      )


    const position =
      bot.entity.position


    const dx =
      position.x -
      creeper.position.x


    const dz =
      position.z -
      creeper.position.z


    const length =
      Math.max(
        Math.sqrt(
          dx * dx +
          dz * dz
        ),
        0.1
      )


    const safeX =
      Math.floor(

        position.x +

        (
          dx /
          length
        ) * 8
      )


    const safeZ =
      Math.floor(

        position.z +

        (
          dz /
          length
        ) * 8
      )


    const safeY =
      Math.floor(
        position.y
      )


    log(
      'SURVIVAL',
      'Creeper zu nah - gehe auf Abstand'
    )


    await bot.pathfinder.goto(

      new GoalNear(
        safeX,
        safeY,
        safeZ,
        2
      )
    )


  } catch (_) {

    bot.setControlState(
      'back',
      true
    )


    await sleep(
      900
    )


    bot.setControlState(
      'back',
      false
    )


  } finally {

    dodgingCreeper =
      false
  }
}


// ======================================================
// KAMPF
// ======================================================

async function startCombat(
  enemy
) {

  if (
    !enemy?.isValid ||
    !enemy.position
  ) {

    return
  }


  const name =
    entityName(
      enemy
    )


  const distance =

    bot.entity.position
      .distanceTo(
        enemy.position
      )


  // Creeper nicht stumpf umarmen :D

  if (
    name.includes(
      'creeper'
    ) &&
    distance <= 4.5
  ) {

    await dodgeCreeper(
      enemy
    )

    return
  }


  if (
    combatActive &&
    combatTarget?.id ===
    enemy.id
  ) {

    return
  }


  combatActive =
    true


  combatTarget =
    enemy


  // Farming wird NICHT gelöscht.
  // Nur kurz unterbrochen.

  try {

    bot.stopDigging()

  } catch (_) {}


  bot.pathfinder
    .setGoal(
      null
    )


  log(
    'SURVIVAL',
    `Verteidige mich gegen ${name}`
  )


  try {

    await equipBestWeapon()


    bot.pvp.attack(
      enemy
    )


  } catch (error) {

    log(
      'KAMPF FEHLER',
      error.message
    )
  }
}


// ======================================================
// KAMPF FERTIG
// ======================================================

function finishCombat() {

  if (!combatActive) {

    return
  }


  bot.pvp.stop()


  combatActive =
    false


  combatTarget =
    null


  if (
    currentFarmTask
  ) {

    currentTask =
      `${currentFarmTask.amount} ${currentFarmTask.resource} farmen`

  } else if (
    protectionEnabled &&
    protectedPlayer
  ) {

    currentTask =
      `${protectedPlayer} beschützen`

  } else {

    currentTask =
      'nichts'
  }


  log(
    'SURVIVAL',
    'Gefahr vorbei - Aufgabe geht weiter'
  )
}


// ======================================================
// SURVIVAL LOOP
// ======================================================

function startSurvivalLoop() {

  if (
    survivalLoop
  ) {

    clearInterval(
      survivalLoop
    )
  }


  survivalLoop =

    setInterval(

      async () => {

        if (!bot.entity) {

          return
        }


        try {

          const threat =
            findThreat()


          if (threat) {

            await startCombat(
              threat
            )

            return
          }


          if (
            combatActive
          ) {

            const valid =

              combatTarget?.isValid &&
              combatTarget?.position


            const distance =

              valid

                ? bot.entity.position
                    .distanceTo(
                      combatTarget.position
                    )

                : Infinity


            if (
              !valid ||
              distance > 20
            ) {

              finishCombat()
            }
          }


          // Automatisch essen

          if (
            !combatActive &&
            !eating &&
            (
              bot.food <= 14 ||
              bot.health <= 10
            )
          ) {

            await eatFood()
          }


        } catch (error) {

          log(
            'SURVIVAL FEHLER',
            error.message
          )
        }

      },

      450
    )
}


// ======================================================
// WARTEN BIS GEFAHR VORBEI
// ======================================================

async function waitUntilSafe() {

  while (
    combatActive ||
    dodgingCreeper
  ) {

    await sleep(
      250
    )
  }
}


// ======================================================
// FOLGEN
// ======================================================

function followPlayer(
  username
) {

  const player =
    getPlayer(
      username
    )


  if (!player) {

    return
  }


  currentTask =
    `${username} folgen`


  bot.pathfinder
    .setMovements(
      movements
    )


  bot.pathfinder
    .setGoal(

      new GoalFollow(
        player.entity,
        2
      ),

      true
    )


  log(
    'AKTION',
    `Folge ${username}`
  )
}


// ======================================================
// KOMM ZU MIR
// ======================================================

function comeToPlayer(
  username
) {

  const player =
    getPlayer(
      username
    )


  if (!player) {

    return
  }


  currentTask =
    `Zu ${username} laufen`


  const position =
    player.entity.position


  bot.pathfinder
    .setMovements(
      movements
    )


  bot.pathfinder
    .setGoal(

      new GoalNear(

        Math.floor(
          position.x
        ),

        Math.floor(
          position.y
        ),

        Math.floor(
          position.z
        ),

        1
      )
    )


  log(
    'AKTION',
    `Laufe zu ${username}`
  )
}


// ======================================================
// SPIELER BESCHÜTZEN
// ======================================================

function protectPlayer(
  username
) {

  if (
    !getPlayer(
      username
    )
  ) {

    return
  }


  protectionEnabled =
    true


  protectedPlayer =
    username


  currentTask =
    `${username} beschützen`


  followPlayer(
    username
  )


  log(
    'SCHUTZ',
    `Beschütze ${username}`
  )
}


function stopProtection() {

  protectionEnabled =
    false


  protectedPlayer =
    null


  if (
    !currentFarmTask
  ) {

    currentTask =
      'nichts'
  }


  log(
    'SCHUTZ',
    'Spielerschutz aus - Selbstschutz bleibt an'
  )
}


// ======================================================
// GEGNER ANGREIFEN
// ======================================================

async function attackNearestEnemy() {

  const enemy =

    bot.nearestEntity(
      entity =>

        isHostile(
          entity
        ) &&

        bot.entity.position
          .distanceTo(
            entity.position
          ) <= 18
    )


  if (!enemy) {

    log(
      'KAMPF',
      'Kein Gegner gefunden'
    )

    return
  }


  await startCombat(
    enemy
  )
}


// ======================================================
// ALLES STOPPEN
// ======================================================

function stopEverything() {

  if (
    currentFarmTask
  ) {

    currentFarmTask.cancelled =
      true
  }


  currentFarmTask =
    null


  busy =
    false


  currentTask =
    'nichts'


  bot.pvp.stop()


  bot.pathfinder
    .setGoal(
      null
    )


  bot.clearControlStates()


  try {

    bot.stopDigging()

  } catch (_) {}


  log(
    'AKTION',
    'Aufgabe gestoppt'
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


  await sleep(
    450
  )


  bot.setControlState(
    'jump',
    false
  )
}


// ======================================================
// SPIELER ANSCHAUEN
// ======================================================

async function lookAtPlayer(
  username
) {

  const player =
    getPlayer(
      username
    )


  if (!player) {

    return
  }


  await bot.lookAt(

    player.entity.position
      .offset(
        0,
        1.6,
        0
      )
  )
}


// ======================================================
// RESSOURCEN BLÖCKE FINDEN
// ======================================================

function findResourceBlocks(
  resource
) {

  const name =
    normalizeResource(
      resource
    )


  const blockNames =
    resources[name]


  if (!blockNames) {

    return []
  }


  const ids =

    blockNames

      .map(
        blockName =>
          bot.registry
            .blocksByName[
              blockName
            ]?.id
      )

      .filter(
        id =>
          Number.isInteger(
            id
          )
      )


  if (
    ids.length === 0
  ) {

    return []
  }


  const positions =

    bot.findBlocks({

      matching:
        ids,

      maxDistance:
        64,

      count:
        48
    })


  return (

    positions

      .map(
        position =>
          bot.blockAt(
            position
          )
      )

      .filter(
        Boolean
      )

      .sort(
        (
          a,
          b
        ) =>

          bot.entity.position
            .distanceTo(
              a.position
            ) -

          bot.entity.position
            .distanceTo(
              b.position
            )
      )
  )
}


// ======================================================
// BESTEN BLOCK WÄHLEN
// ======================================================

function chooseResourceBlock(
  resource
) {

  const blocks =
    findResourceBlocks(
      resource
    )


  if (
    blocks.length === 0
  ) {

    return null
  }


  // Nicht direkt den Block
  // unter den eigenen Füßen abbauen.

  const safer =
    blocks.filter(
      block => {

        const dx =
          Math.abs(

            block.position.x +
            0.5 -

            bot.entity.position.x
          )


        const dz =
          Math.abs(

            block.position.z +
            0.5 -

            bot.entity.position.z
          )


        const dy =

          bot.entity.position.y -
          block.position.y


        const directlyBelow =

          dx < 0.8 &&
          dz < 0.8 &&
          dy > 0 &&
          dy < 2


        return !directlyBelow
      }
    )


  return (
    safer[0] ||
    blocks[0]
  )
}


// ======================================================
// SMART DIG
// ======================================================

async function smartDigBlock(
  block
) {

  if (!block) {

    return false
  }


  await waitUntilSafe()


  try {

    // Zum Block laufen

    bot.pathfinder
      .setMovements(
        movements
      )


    await bot.pathfinder.goto(

      new GoalLookAtBlock(

        block.position,

        bot.world,

        {
          reach: 4.5
        }
      )
    )


    await waitUntilSafe()


    // Block nach dem Laufen neu prüfen.
    // Wichtig bei Sand/Kies.

    const freshBlock =
      bot.blockAt(
        block.position
      )


    if (
      !freshBlock ||
      freshBlock.name ===
      'air'
    ) {

      return false
    }


    // ==================================================
    // AUTOMATISCHE WERKZEUGWAHL
    // ==================================================

    try {

      await bot.tool
        .equipForBlock(

          freshBlock,

          {
            requireHarvest:
              true
          }
        )


    } catch (error) {

      log(
        'TOOL',
        `Kein geeignetes Werkzeug für ${freshBlock.name}: ${error.message}`
      )


      return false
    }


    log(
      'HOTBAR',
      `Werkzeug: ${
        bot.heldItem?.name ||
        'Hand'
      }`
    )


    // Block anschauen

    await bot.lookAt(

      freshBlock.position
        .offset(
          0.5,
          0.5,
          0.5
        ),

      true
    )


    // ==================================================
    // BLOCK KOMPLETT ABBAUEN
    // ==================================================

    log(
      'MINE',
      `Baue ${freshBlock.name} komplett ab`
    )


    await bot.dig(
      freshBlock
    )


    // Sand/Kies können runterfallen.
    // Erst warten, dann Welt neu prüfen.

    if (
      [
        'sand',
        'red_sand',
        'gravel'
      ].includes(
        freshBlock.name
      )
    ) {

      await sleep(
        550
      )

    } else {

      await sleep(
        250
      )
    }


    // Drop aufnehmen lassen

    await sleep(
      250
    )


    return true


  } catch (error) {

    log(
      'MINE FEHLER',
      error.message
    )


    try {

      bot.stopDigging()

    } catch (_) {}


    return false
  }
}


// ======================================================
// WEITERSUCHEN
// ======================================================

async function exploreForResource(
  resource,
  attempt
) {

  // Oberflächen-Ressourcen kann er
  // sinnvoll durch Herumlaufen suchen.

  const surfaceResource =

    [
      'holz',
      'eichenholz',
      'fichtenholz',
      'birkenholz',
      'sand',
      'erde',
      'kies'
    ].includes(
      resource
    )


  if (!surfaceResource) {

    log(
      'SUCHE',
      `${resource} ist in den geladenen Blöcken nicht sichtbar`
    )

    return false
  }


  const distance =
    10 +
    attempt * 6


  const angle =
    attempt *
    1.73


  const x =
    Math.floor(

      bot.entity.position.x +

      Math.cos(
        angle
      ) *
      distance
    )


  const y =
    Math.floor(
      bot.entity.position.y
    )


  const z =
    Math.floor(

      bot.entity.position.z +

      Math.sin(
        angle
      ) *
      distance
    )


  try {

    log(
      'SUCHE',
      `Suche weiter nach ${resource}`
    )


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
    Date.now() -
    start <
    timeout
  ) {

    await waitUntilSafe()


    const player =
      getPlayer(
        username
      )?.entity


    if (!player) {

      await sleep(
        1000
      )

      continue
    }


    if (

      bot.entity.position
        .distanceTo(
          player.position
        ) <= 3

    ) {

      bot.pathfinder
        .setGoal(
          null
        )


      return player
    }


    bot.pathfinder
      .setMovements(
        movements
      )


    bot.pathfinder
      .setGoal(

        new GoalFollow(
          player,
          2
        ),

        true
      )


    await sleep(
      500
    )
  }


  bot.pathfinder
    .setGoal(
      null
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

  const name =
    normalizeResource(
      resource
    )


  const allowed =
    resourceDrops[name] || []


  let remaining =
    amount


  const player =
    getPlayer(
      username
    )?.entity


  if (player) {

    try {

      await bot.lookAt(

        player.position
          .offset(
            0,
            1,
            0
          )
      )

    } catch (_) {}
  }


  for (
    const item
    of bot.inventory.items()
  ) {

    if (
      remaining <= 0
    ) {

      break
    }


    if (
      !allowed.includes(
        item.name
      )
    ) {

      continue
    }


    const count =
      Math.min(

        item.count,

        remaining
      )


    try {

      await bot.toss(

        item.type,

        item.metadata,

        count
      )


      remaining -=
        count


      log(
        'DROP',
        `${count}x ${item.name}`
      )


      await sleep(
        200
      )


    } catch (error) {

      log(
        'DROP FEHLER',
        error.message
      )


      break
    }
  }


  log(
    'DROP',
    `${
      amount -
      remaining
    }/${amount} abgegeben`
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
    normalizeResource(
      resource
    )


  if (
    !resources[resource]
  ) {

    log(
      'FARM',
      `Ressource kenne ich noch nicht: ${resource}`
    )

    return
  }


  if (busy) {

    log(
      'FARM',
      'Ich habe schon eine Aufgabe'
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


  busy =
    true


  const task = {

    resource,

    amount,

    username,

    cancelled:
      false
  }


  currentFarmTask =
    task


  currentTask =
    `${amount} ${resource} farmen`


  const before =
    countResource(
      resource
    )


  let farmed =
    0


  let searchAttempts =
    0


  let failures =
    0


  log(
    'FARM',
    `Auftrag: ${amount} ${resource}`
  )


  try {

    while (

      !task.cancelled &&

      farmed < amount

    ) {

      // ================================================
      // 1. SELBSTSCHUTZ
      // ================================================

      await waitUntilSafe()


      // ================================================
      // 2. ESSEN
      // ================================================

      if (
        bot.food <= 12 ||
        bot.health <= 10
      ) {

        await eatFood()
      }


      // ================================================
      // 3. INVENTAR
      // ================================================

      if (
        bot.inventory
          .emptySlotCount() === 0
      ) {

        log(
          'FARM',
          'Inventar voll'
        )

        break
      }


      // ================================================
      // 4. BLOCK SUCHEN
      // ================================================

      const target =
        chooseResourceBlock(
          resource
        )


      if (!target) {

        searchAttempts++


        if (
          searchAttempts > 5
        ) {

          log(
            'FARM',
            `${resource} nicht gefunden`
          )

          break
        }


        const moved =
          await exploreForResource(

            resource,

            searchAttempts
          )


        if (!moved) {

          break
        }


        continue
      }


      searchAttempts =
        0


      // ================================================
      // 5. SMART ABBAUEN
      // ================================================

      const success =
        await smartDigBlock(
          target
        )


      if (!success) {

        failures++


        if (
          failures >= 6
        ) {

          log(
            'FARM',
            'Zu viele Mining-Fehler'
          )

          break
        }


        await sleep(
          300
        )


        continue
      }


      failures =
        0


      // ================================================
      // 6. ECHTE ITEMS ZÄHLEN
      // ================================================

      farmed =
        Math.max(

          0,

          countResource(
            resource
          ) -
          before
        )


      log(
        'FARM',
        `Fortschritt ${farmed}/${amount}`
      )
    }


  } catch (error) {

    log(
      'FARM FEHLER',
      error.message
    )


  } finally {

    farmed =
      Math.max(

        0,

        countResource(
          resource
        ) -
        before
      )


    // ================================================
    // ZURÜCKKOMMEN + DROPPEN
    // ================================================

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

        await waitUntilSafe()


        await dropResource(

          resource,

          Math.min(
            farmed,
            amount
          ),

          username
        )
      }
    }


    currentFarmTask =
      null


    busy =
      false


    currentTask =

      protectionEnabled &&
      protectedPlayer

        ? `${protectedPlayer} beschützen`

        : 'nichts'
  }
}


// ======================================================
// SCHNELLE COMMAND ERKENNUNG
// ======================================================
// Häufige Sachen gehen OHNE API.
// Dadurch reagiert Farming deutlich schneller.
// Schwierige Sätze gehen danach zur KI.
// ======================================================

function parseFastCommand(
  username,
  message
) {

  const msg =
    message
      .toLowerCase()
      .trim()


  if (
    /\b(stopp|stop|warte hier|bleib stehen)\b/
      .test(
        msg
      )
  ) {

    stopEverything()

    return true
  }


  if (
    msg.includes(
      'beschütz mich'
    ) ||

    msg.includes(
      'beschuetze mich'
    ) ||

    msg.includes(
      'pass auf mich auf'
    )
  ) {

    protectPlayer(
      username
    )

    return true
  }


  if (
    msg.includes(
      'schutz aus'
    ) ||

    msg.includes(
      'beschütz mich nicht mehr'
    )
  ) {

    stopProtection()

    return true
  }


  if (
    msg.includes(
      'folg mir'
    ) ||

    msg.includes(
      'folge mir'
    ) ||

    msg.includes(
      'komm mit'
    )
  ) {

    followPlayer(
      username
    )

    return true
  }


  if (
    msg === 'komm' ||

    msg.includes(
      'komm her'
    ) ||

    msg.includes(
      'komm zu mir'
    )
  ) {

    comeToPlayer(
      username
    )

    return true
  }


  if (
    msg.includes(
      'mach den'
    ) ||

    msg.includes(
      'greif'
    ) ||

    msg.includes(
      'kämpf'
    )
  ) {

    attackNearestEnemy()

    return true
  }


  const known = [

    [
      'diamanten',
      [
        'diamant',
        'diamanten',
        'dia',
        'dias'
      ]
    ],

    [
      'smaragde',
      [
        'smaragd',
        'smaragde'
      ]
    ],

    [
      'eisen',
      [
        'eisen',
        'iron'
      ]
    ],

    [
      'kohle',
      [
        'kohle',
        'coal'
      ]
    ],

    [
      'kupfer',
      [
        'kupfer',
        'copper'
      ]
    ],

    [
      'gold',
      [
        'gold'
      ]
    ],

    [
      'redstone',
      [
        'redstone'
      ]
    ],

    [
      'lapis',
      [
        'lapis'
      ]
    ],

    [
      'sand',
      [
        'sand'
      ]
    ],

    [
      'kies',
      [
        'kies',
        'gravel'
      ]
    ],

    [
      'erde',
      [
        'erde',
        'dirt'
      ]
    ],

    [
      'stein',
      [
        'stein',
        'stone'
      ]
    ],

    [
      'eichenholz',
      [
        'eichenholz'
      ]
    ],

    [
      'fichtenholz',
      [
        'fichtenholz'
      ]
    ],

    [
      'birkenholz',
      [
        'birkenholz'
      ]
    ],

    [
      'holz',
      [
        'holz',
        'wood'
      ]
    ]
  ]


  const farmWords = [

    'farm',

    'hol',

    'besorg',

    'sammel',

    'sammle',

    'brauch'
  ]


  if (
    !farmWords.some(
      word =>
        msg.includes(
          word
        )
    )
  ) {

    return false
  }


  let resource =
    null


  for (
    const [
      canonical,
      aliases
    ]
    of known
  ) {

    if (
      aliases.some(
        alias =>
          msg.includes(
            alias
          )
      )
    ) {

      resource =
        canonical

      break
    }
  }


  if (!resource) {

    return false
  }


  let amount =
    16


  const number =
    msg.match(
      /\b(\d{1,3})\b/
    )


  if (number) {

    amount =
      Number(
        number[1]
      )

  } else if (
    msg.includes(
      'stack'
    )
  ) {

    amount =
      64

  } else if (
    msg.includes(
      'bisschen'
    ) ||

    msg.includes(
      'etwas'
    )
  ) {

    amount =
      16
  }


  farmResource(

    resource,

    amount,

    username
  )


  return true
}


// ======================================================
// KI TOOLS
// ======================================================

const aiTools = [

  {

    type:
      'function',

    name:
      'farm_resource',

    description:
      'Farme eine Ressource. Der Bot wählt Werkzeug, verteidigt sich, setzt danach fort und bringt Items zurück.',

    parameters: {

      type:
        'object',

      properties: {

        resource: {

          type:
            'string',

          description:
            'holz, eichenholz, fichtenholz, birkenholz, sand, erde, kies, stein, kohle, eisen, kupfer, gold, redstone, lapis, diamanten oder smaragde'
        },

        amount: {

          type:
            'integer',

          minimum:
            1,

          maximum:
            64
        }
      },

      required: [
        'resource',
        'amount'
      ],

      additionalProperties:
        false
    },

    strict:
      true
  },


  {

    type:
      'function',

    name:
      'follow_player',

    description:
      'Folge dem Spieler.',

    parameters: {

      type:
        'object',

      properties: {},

      additionalProperties:
        false
    },

    strict:
      true
  },


  {

    type:
      'function',

    name:
      'come_to_player',

    description:
      'Laufe zum Spieler.',

    parameters: {

      type:
        'object',

      properties: {},

      additionalProperties:
        false
    },

    strict:
      true
  },


  {

    type:
      'function',

    name:
      'protect_player',

    description:
      'Beschütze zusätzlich den Spieler. Selbstschutz ist immer aktiv.',

    parameters: {

      type:
        'object',

      properties: {},

      additionalProperties:
        false
    },

    strict:
      true
  },


  {

    type:
      'function',

    name:
      'stop_protection',

    description:
      'Beende den zusätzlichen Spielerschutz.',

    parameters: {

      type:
        'object',

      properties: {},

      additionalProperties:
        false
    },

    strict:
      true
  },


  {

    type:
      'function',

    name:
      'attack_enemy',

    description:
      'Greife den nächsten feindlichen Mob an.',

    parameters: {

      type:
        'object',

      properties: {},

      additionalProperties:
        false
    },

    strict:
      true
  },


  {

    type:
      'function',

    name:
      'stop',

    description:
      'Stoppe die aktuelle Aufgabe.',

    parameters: {

      type:
        'object',

      properties: {},

      additionalProperties:
        false
    },

    strict:
      true
  },


  {

    type:
      'function',

    name:
      'jump',

    description:
      'Springe einmal.',

    parameters: {

      type:
        'object',

      properties: {},

      additionalProperties:
        false
    },

    strict:
      true
  },


  {

    type:
      'function',

    name:
      'look_at_player',

    description:
      'Schau den Spieler an.',

    parameters: {

      type:
        'object',

      properties: {},

      additionalProperties:
        false
    },

    strict:
      true
  }
]


// ======================================================
// KI
// ======================================================

async function askAI(
  username,
  message
) {

  try {

    const response =

      await openai.responses
        .create({

          model:
            AI_MODEL,


          instructions: `

Du bist das Entscheidungs-Gehirn von NaxyBot.

NaxyBot ist ein intelligenter
Minecraft-Java-Begleiter.

Verstehe lockeres deutsches Minecraft-Deutsch.

Der Code kümmert sich um die technische Ausführung.
Du wählst die passende Aktion.

Minecraft-Wissen:

- Sand, Erde und Kies werden sinnvoll mit einer Schaufel abgebaut.

- Holz wird sinnvoll mit einer Axt abgebaut.

- Stein und Erze benötigen eine Spitzhacke.

- Wertvolle Erze dürfen nicht mit falschem Werkzeug zerstört werden.

- Sand und Kies können nach unten fallen.
  Deshalb wird nach jedem Block die Welt neu geprüft.

- Selbstschutz läuft IMMER und hat Vorrang.

- Nach einem Kampf wird eine Farm-Aufgabe fortgesetzt.

- Bei Hunger oder wenig Leben kann der Bot essen.

- Nach dem Farming kommt der Bot zum Auftraggeber zurück.

- Danach droppt er die neu gesammelten Items.

- Ein Stack bedeutet 64.

- "bisschen" bedeutet ungefähr 16.

- "Dias" bedeutet Diamanten.

- Kämpfe nicht gegen Spieler.

- Nutze ausschließlich vorhandene Tools.
`,


          input:
            `SPIELER: ${username}

NACHRICHT:
${message}

${getBotState(username)}`,


          tools:
            aiTools,


          tool_choice:
            'auto'
        })


    const call =

      response.output
        .find(
          item =>
            item.type ===
            'function_call'
        )


    if (!call) {

      const answer =
        response.output_text
          ?.trim()


      if (answer) {

        await safeSay(
          answer
        )
      }


      return
    }


    let args = {}


    try {

      args =
        JSON.parse(
          call.arguments || '{}'
        )

    } catch (_) {}


    log(
      'KI',
      `${call.name} ${JSON.stringify(args)}`
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


  } catch (error) {

    log(
      'KI FEHLER',
      error.message
    )
  }
}


// ======================================================
// SPAWN
// ======================================================

bot.once(
  'spawn',

  () => {

    movements =
      new Movements(
        bot
      )


    // Beim normalen Laufen keine Welt zerstören.
    // Zielblöcke werden gezielt mit smartDigBlock abgebaut.

    movements.canDig =
      false


    movements.allow1by1towers =
      false


    bot.pathfinder
      .setMovements(
        movements
      )


    log(
      'START',
      'NaxyBot ist online auf Minecraft 1.21.11'
    )


    log(
      'START',
      'Smart Farming aktiv'
    )


    log(
      'START',
      'Auto Werkzeug aktiv'
    )


    log(
      'START',
      'Selbstschutz aktiv'
    )


    log(
      'START',
      'Auto Essen aktiv'
    )


    if (!BOT_CHAT) {

      log(
        'START',
        'Bot Chat AUS wegen dem bisherigen Chat-Validation-Problem'
      )
    }


    startSurvivalLoop()
  }
)


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

      return
    }


    log(
      'CHAT',
      `${username}: ${message}`
    )


    // Häufige Commands instant verstehen.
    // Kein Warten auf OpenAI nötig.

    if (
      parseFastCommand(
        username,
        message
      )
    ) {

      return
    }


    // Komplizierte Sprache -> KI

    await askAI(
      username,
      message
    )
  }
)


// ======================================================
// GEGNER VERSCHWINDET / STIRBT
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
// TOD
// ======================================================

bot.on(
  'death',

  () => {

    log(
      'TOD',
      'NaxyBot ist gestorben'
    )


    bot.pvp.stop()


    combatActive =
      false


    combatTarget =
      null


    if (
      currentFarmTask
    ) {

      currentFarmTask.cancelled =
        true
    }


    currentFarmTask =
      null


    busy =
      false
  }
)


// ======================================================
// RESPAWN
// ======================================================

bot.on(
  'respawn',

  () => {

    log(
      'RESPAWN',
      'NaxyBot ist wieder da'
    )
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
// ENDE
// ======================================================

bot.on(
  'end',

  reason => {

    log(
      'ENDE',
      reason
    )
  }
)
