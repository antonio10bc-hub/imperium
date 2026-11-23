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
export const MW = 384, MD = 256, INK = 0x0f0f1b, N = MW * MD, idx = (x, z) => z * MW + x;
export const TEAM = [{ c: 0x3a6ad8, d: 0x1e4a8a, l: 0x8ad8f0, css: '#3a6ad8', rgb: [58, 106, 216] }, { c: 0xd83a4a, d: 0x5a3a24, l: 0xe8c870, css: '#d83a4a', rgb: [216, 58, 74] },
  { c: 0x9a7a3a, d: 0x4a3a24, l: 0xd8c89a, css: '#9a7a3a', rgb: [154, 122, 58] }];   // 2 = neutrales de los campamentos
export const UNITS = {
  sword: { name: 'ESPADA', cost: 40, time: 4, hp: 120, dmg: 14, range: 1.5, cd: .8, speed: 3.2, aggro: 7, vs: { horse: 1.6 } },
  bow:   { name: 'ARCO',   cost: 55, time: 5, hp: 70,  dmg: 11, range: 8,   cd: 1.3, speed: 3, aggro: 9, vs: { sword: 1.4 } },
  horse: { name: 'JINETE', cost: 80, time: 7, hp: 160, dmg: 18, range: 1.8, cd: 1.0, speed: 5.5, aggro: 9, vs: { bow: 1.7 } },
  harcher: { name: 'JINETE ARQUERO', cost: 0, time: 0, hp: 110, dmg: 10, range: 7.5, cd: 1.25, speed: 5.2, aggro: 10, vs: { sword: 1.3 } },
  hero:  { name: 'HÉROE',  cost: 200, time: 10, hp: 650, dmg: 32, range: 2.1, cd: .9, speed: 4.5, aggro: 9, vs: {} },
};
export const RANKS = [{ name: '', kills: 0, mul: 1 }, { name: 'BRONCE', kills: 2, mul: 1.12, hex: 0xc07a40, css: '#c07a40' },
  { name: 'PLATA', kills: 5, mul: 1.25, hex: 0xb4afa2, css: '#b4afa2' }, { name: 'ORO', kills: 10, mul: 1.4, hex: 0xe8c870, css: '#e8c870' }];
export const TYPES = ['sword', 'bow', 'horse'], ALLT = ['hero', 'sword', 'bow', 'horse', 'harcher'];
export const RANGED = t => t === 'bow' || t === 'harcher';
export const GAME = { startGold: 220, income: 1, townIncome: 1.8, baseHp: 1500, capBase: 30, capTown: 6, capMax: 100, towns: 16, capture: 4, queueMax: 30, bounty: 6, maxHeroes: 3, wallShooters: 12, wallRange: 10, wallDmg: 7, wallCd: 1.6,
  campGen: 14, campMax: 20, campGuards: 6, fortGuards: 20, heroRespawn: 30, escortMax: 50, escortBonus: 1.2, chargeCd: 20, chargeTime: 3, regen: 4, towerRange: 9, towerDmg: 8, towerCd: 1.4 };
export const DIFF = { easy: { inc: .7, attackAt: 7, hero: false, label: 'FÁCIL' }, normal: { inc: 1, attackAt: 5, hero: true, label: 'NORMAL' }, hard: { inc: 1.3, attackAt: 4, hero: true, label: 'DIFÍCIL' } };
export const BASE0 = 0, BASE1 = 1, BARR0 = 2, BARR1 = 3, ALT0 = 4, ALT1 = 5, TOWN0 = 6;
export const TOWN_NAMES = ['VILLAROCA', 'PINARES', 'ALBAMAR', 'ROBLEDO', 'FUENTEVIEJA', 'MONTEALTO', 'LAGUNILLA', 'PEÑASCO', 'VALDEORO', 'SALINAS', 'TORRENUEVA', 'ARENALES', 'CASTROVERDE', 'OLMEDA', 'MIRAFLORES', 'ROCAFRÍA', 'VADOHONDO', 'LOS LLANOS'];
