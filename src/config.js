// Ajustes y reglas del juego: tamaño del mapa, bandos, tropas, rangos, economía y dificultad.
import * as THREE from 'three';

THREE.ColorManagement.enabled = false;   // colores tal cual, sin conversión sRGB: va aquí porque este módulo se evalúa antes que ningún otro que cree colores
// ---------- Ajustes ----------
export const CFG = { lines: 360, maxScale: 16, sat: 1.04 };
export const mixHex = (a, b, t) => { const ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255; return (Math.round(ar + ((b >> 16 & 255) - ar) * t) << 16) | (Math.round(ag + ((b >> 8 & 255) - ag) * t) << 8) | Math.round(ab + ((b & 255) - ab) * t); };
// Paleta del terreno: apagada para que las unidades (saturadas y con contorno) destaquen
export const TP = { lush: 0x6ea653, grass: 0x7db45b, grass2: 0x8bbd61, dry: 0x9fc56c, sand: 0xdccb95, cliff: 0x8a7656, cliffS: 0xbfae7e,
  path: 0xcbb48a, road: 0xc4ad80, ford: 0xcdb98c, plaza: 0xd6cfba, wallbase: 0xb3a990, edge: 0x8ccbe0, shallow: 0x5fb0d4, deep: 0x4594c6,
  canopy: 0x3f7a45, canopy2: 0x4b874c, pine: 0x31683f, trunk: 0x6b4a2e, outside: 0x2c4430 };
// tamaño del mapa: se elige en el menú (pequeño, normal o grande) y lo fija setMapSize antes de generar cada mapa
export let MW = 384, MD = 256, N = MW * MD;
export const INK = 0x0f0f1b, idx = (x, z) => z * MW + x;
export const MAP_SIZES = { p: { name: 'PEQUEÑO', w: 288, d: 192, towns: 12 }, n: { name: 'NORMAL', w: 384, d: 256, towns: 16 }, g: { name: 'GRANDE', w: 480, d: 320, towns: 22 } };
export function setMapSize(k) { const m = MAP_SIZES[k] || MAP_SIZES.n; MW = m.w; MD = m.d; N = MW * MD; GAME.towns = m.towns; }
export const TEAM = [{ c: 0x3a6ad8, d: 0x1e4a8a, l: 0x8ad8f0, css: '#3a6ad8', rgb: [58, 106, 216] }, { c: 0xd83a4a, d: 0x5a3a24, l: 0xe8c870, css: '#d83a4a', rgb: [216, 58, 74] },
  { c: 0x3aa860, d: 0x1e5a34, l: 0x9ae8a8, css: '#3aa860', rgb: [58, 168, 96] }, { c: 0xe89a20, d: 0x7a4a10, l: 0xf8d880, css: '#e89a20', rgb: [232, 154, 32] },
  { c: 0x9a4ad8, d: 0x4a2a7a, l: 0xd8a8f8, css: '#9a4ad8', rgb: [154, 74, 216] },
  { c: 0x9a7a3a, d: 0x4a3a24, l: 0xd8c89a, css: '#9a7a3a', rgb: [154, 122, 58] }];   // 0–4 = jugadores (azul, rojo, verde, ámbar, morado) · 5 = neutrales
export const NEU = 5;   // bando de los neutrales: guardianes, bandidos y caravanas
export const UNITS = {
  sword: { name: 'ESPADA', cost: 40, time: 4, hp: 120, dmg: 14, range: 1.5, cd: .8, speed: 3.2, aggro: 7, vs: { horse: 1.6 } },
  bow:   { name: 'ARCO',   cost: 55, time: 5, hp: 70,  dmg: 11, range: 8,   cd: 1.3, speed: 3, aggro: 9, vs: { sword: 1.4 } },
  horse: { name: 'JINETE', cost: 80, time: 7, hp: 160, dmg: 18, range: 1.8, cd: 1.0, speed: 5.5, aggro: 9, vs: { bow: 1.7 } },
  harcher: { name: 'JINETE ARQUERO', cost: 0, time: 0, hp: 110, dmg: 10, range: 7.5, cd: 1.25, speed: 5.2, aggro: 10, vs: { sword: 1.3 } },
  hero:  { name: 'HÉROE',  cost: 200, time: 10, hp: 650, dmg: 32, range: 2.1, cd: .9, speed: 4.5, aggro: 9, vs: {} },
  titan: { name: 'COLOSO', cost: 0, time: 0, hp: 620, dmg: 26, range: 1.9, cd: 1.4, speed: 2.1, aggro: 8, vs: {} },   // de la ciudadela central: lento, duro y cuerpo a cuerpo
  cart:  { name: 'CARRO DE CARAVANA', cost: 0, time: 0, hp: 280, dmg: 0, range: 0, cd: 1, speed: 2.6, aggro: 0, vs: {} },   // evento de la caravana: no pelea
  // asedio (cuartel): el ariete apenas pelea pero derriba puertas y castillos; la catapulta dispara piedras muy lejos y hace daño en área
  ram:   { name: 'ARIETE', cost: 140, time: 12, hp: 560, dmg: 6, range: 1.9, cd: 2, speed: 2.3, aggro: 0, vs: {}, bld: 8, gate: 30, siege: true },
  catapult: { name: 'CATAPULTA', cost: 190, time: 14, hp: 190, dmg: 24, range: 13, cd: 3.6, speed: 2, aggro: 13, vs: {}, bld: 2.6, gate: 4.5, splash: 2.2, siege: true },
  god:   { name: 'DIOS',   cost: 300, time: 20, hp: 1500, dmg: 40, range: 2.4, cd: 1.0, speed: 4, aggro: 10, vs: {} },   // del templo, tras el ritual; uno por bando
};
export const RANKS = [{ name: '', kills: 0, mul: 1 }, { name: 'BRONCE', kills: 2, mul: 1.12, hex: 0xc07a40, css: '#c07a40' },
  { name: 'PLATA', kills: 5, mul: 1.25, hex: 0xb4afa2, css: '#b4afa2' }, { name: 'ORO', kills: 10, mul: 1.4, hex: 0xe8c870, css: '#e8c870' }];
export const TYPES = ['sword', 'bow', 'horse'], SIEGE = ['ram', 'catapult'], ALLT = ['god', 'hero', 'titan', 'sword', 'bow', 'horse', 'harcher', 'ram', 'catapult'];
export const RANGED = t => t === 'bow' || t === 'harcher' || t === 'catapult';
export const GAME = { startGold: 220, income: 1, townIncome: 1.3, townDecay: .08, townDecayMin: .45, richMul: 1.6, baseHp: 1500, capBase: 30, capTown: 6, capMax: 100, towns: 16, capture: 4, queueMax: 30, bounty: 6, maxHeroes: 3, wallShooters: 12, wallRange: 10, wallDmg: 10, wallCd: 1.6,
  campGen: 14, campMax: 20, campGuards: 6, fortGuards: 20, heroRespawn: 30, escortMax: 50, escortBonus: 1.2, chargeCd: 20, chargeTime: 3, ritualCost: 400, ritualTime: 60, godHeal: 5, godHealR: 10, godBounty: 150, regen: 4, towerRange: 9, towerDmg: 8, towerCd: 1.4,
  watchRange: 15, watchDmg: 13, watchCd: 1.1, watchVision: 32, keepGen: 22, keepMax: 10, keepGuards: 5,
  gateHp: 3200, gateLvlHp: 1200, gateRepair: 80 };
// muralla mejorable (desde la fortaleza): los arqueros de las almenas pasan a bronce, plata y oro; más daño, alcance y cadencia, y puertas más duras
// targets: a cuántos enemigos distintos dispara cada arquero en cada andanada
export const WALL_LV = { cost: [0, 150, 260, 420], dmg: [1, 1.3, 1.6, 2], range: [0, 1, 2, 3], cd: [1, .9, .8, .7], targets: [2, 2, 3, 4] };
// dificultad: fácil usa la IA simple con menos oro; normal, la IA smart con el mismo oro que el jugador; difícil decide más a menudo, concentra el fuego, contrarresta casi siempre,
// mejora antes sus pueblos, retira antes a sus heridos y tiene un 12 % más de oro (sin eso empataba con normal en la simulación)
// plan: segundos entre decisiones de la IA smart · focus: cada tropa elige objetivo en vez de atacar al más cercano
export const DIFF = { easy: { inc: .7, attackAt: 7, hero: false, brain: 'simple', label: 'FÁCIL' }, normal: { inc: 1, attackAt: 6, hero: true, brain: 'smart', plan: 1, focus: false, label: 'NORMAL' }, hard: { inc: 1.12, attackAt: 5, hero: true, brain: 'smart', plan: .5, focus: true, counter: .9, eco: .7, retreat: .38, label: 'DIFÍCIL' } };
// sitios: fortalezas, cuarteles, salones de héroes (ALT) y templos (TEMP) de cada bando; después, los pueblos
// jugadores en la partida (2 a 5) y posición de cada edificio en spots: castillos, cuarteles, salones de héroes y templos (uno por jugador), y después los pueblos
export let NP = 2;
export let BASE0 = 0, BASE1 = 1, BARR0 = 2, BARR1 = 3, ALT0 = 4, ALT1 = 5, TEMP0 = 6, TEMP1 = 7, TOWN0 = 8;
export function setPlayers(n) { NP = n; BARR0 = n; BARR1 = n + 1; ALT0 = 2 * n; ALT1 = 2 * n + 1; TEMP0 = 3 * n; TEMP1 = 3 * n + 1; TOWN0 = 4 * n; }
export const MAX_PLAYERS = { p: 2, n: 3, g: 5 };   // jugadores como máximo según el tamaño del mapa
export const players = () => Array.from({ length: NP }, (_, i) => i);
export const TOWN_NAMES = ['VILLAROCA', 'PINARES', 'ALBAMAR', 'ROBLEDO', 'FUENTEVIEJA', 'MONTEALTO', 'LAGUNILLA', 'PEÑASCO', 'VALDEORO', 'SALINAS', 'TORRENUEVA', 'ARENALES', 'CASTROVERDE', 'OLMEDA', 'MIRAFLORES', 'ROCAFRÍA', 'VADOHONDO', 'LOS LLANOS', 'PEÑAFIEL', 'ROBLEDAL', 'AGUAVIVA', 'CANTALOBOS', 'VILLAFRÍA', 'MONTERRUBIO', 'ENCINAR', 'VALDELAGUA'];
