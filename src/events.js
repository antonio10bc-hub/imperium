// Eventos neutrales: cada ~2 minutos (desde el minuto 3) pasa algo en el mapa que no controla ningún bando.
// · Bandidos: una banda neutral asalta los pueblos del bando con más territorio; un pueblo sin defensores cae y queda neutral.
// · Mercenarios: durante 45 s, cualquiera de los dos bandos puede contratar tropas veteranas.
// · Caravana: cruza el mapa de norte a sur por el centro; quien la destruya se lleva su oro.
import { spreadTo } from './behavior.js';
import { applyRank, nearestEnemy, strike } from './combat.js';
import { MD, MW, TOWN0 } from './config.js';
import { ping } from './effects.js';
import { capOf, capR, elapsed, fields, popOf, toast } from './game.js';
import { spots } from './map.js';
import { bfs, cellX, cellZ, inMain, nearestNode } from './nav.js';
import { alive, followField, sel, setMax, sideState, spawnAt, spawnUnit, units } from './units.js';

export const MERC = { cost: 220, time: 45, types: ['horse', 'horse', 'bow', 'sword'], rank: 2 };
const CARAVAN_GOLD = 150;
export const ev = { t: 0, last: '', merc: null };   // merc: oferta en curso { t, hired: [false, false] }

// pruebas: lanza un evento ya ('bandits', 'mercs' o 'caravan')
export function triggerEvent(k) { return k === 'bandits' ? bandits() : k === 'mercs' ? mercs() : caravan(); }
export function resetEvents() { ev.t = 180; ev.last = ''; ev.merc = null; }
export function updateEvents(dt) {
  if (ev.merc && (ev.merc.t -= dt) <= 0) ev.merc = null;
  if ((ev.t -= dt) > 0) return;
  ev.t = 110 + Math.random() * 40;
  const kinds = ['bandits', 'mercs', 'caravan'].filter(k => k !== ev.last), k = kinds[Math.random() * kinds.length | 0];
  if ((k === 'bandits' && bandits()) || (k === 'mercs' && mercs()) || (k === 'caravan' && caravan())) ev.last = k;
}

// ---------- bandidos ----------
const ownTowns = sd => spots.filter(s => s.kind === 'town' && s.owner === sd);
function bandits() {
  const a = ownTowns(0).length, b = ownTowns(1).length; if (!a && !b) return false;
  const victim = a === b ? (Math.random() < .5 ? 0 : 1) : a > b ? 0 : 1, list = ownTowns(victim), town = list[Math.random() * list.length | 0];
  // aparecen a unas 26 casillas del pueblo, lejos de las dos fortalezas
  let at = -1;
  for (let k = 0; k < 24 && at < 0; k++) {
    const ang = Math.random() * Math.PI * 2, n = nearestNode(town.x + Math.cos(ang) * 26, town.z + Math.sin(ang) * 26);
    if (spots.slice(0, 2).every(f => Math.hypot(cellX(n) - f.x, cellZ(n) - f.z) > 40) && fields[spots.indexOf(town)][n] < 80) at = n;
  }
  if (at < 0) return false;
  const n = Math.min(9, 4 + Math.floor(elapsed / 240)), T = ['sword', 'bow', 'horse', 'sword', 'bow'];
  for (let k = 0; k < n; k++) {
    const u = spawnAt(2, T[k % T.length], cellX(at) + (k % 3) - 1, cellZ(at) + (k / 3 | 0) - 1);
    u.raid = victim; u.raidAt = spots.indexOf(town);
    if (k % 3 === 0) { u.rank = 1; setMax(u); u.hp = u.maxHp; applyRank(u); }
  }
  toast(victim === 0 ? `¡BANDIDOS CERCA DE ${town.name}!` : 'BANDIDOS ASALTAN PUEBLOS DEL RIVAL', victim === 0 ? 'bad' : '', victim === 0 ? { x: cellX(at), z: cellZ(at) } : null);
  return true;
}
// los bandidos pelean con quien se les acerque y van de pueblo en pueblo de su víctima
export function raiderUnit(u, dt) {
  if ((u.think -= dt) <= 0) { u.think = .35; u.enemy = nearestEnemy(u, u.def.aggro); }
  if (alive(u.enemy) && strike(u, u.enemy, dt)) return;
  let s = spots[u.raidAt];
  if (!s || s.owner !== u.raid) {   // ese pueblo ya no es de la víctima: al siguiente más cercano
    let best = -1, bv = 1e9;
    for (let t = TOWN0; t < spots.length; t++) if (spots[t].owner === u.raid && fields[t][u.node] < bv) { bv = fields[t][u.node]; best = t; }
    u.raidAt = best; s = spots[best];
  }
  if (s) spreadTo(u, s.x, s.z, fields[u.raidAt], 0, 0, dt, capR(s) - .8);
}
// bandidos dentro del círculo de un pueblo que asaltan (los cuenta updateTowns como atacantes)
export const raidersAt = (s, inside) => inside.some(u => u.side === 2 && u.raid === s.owner);

// ---------- mercenarios ----------
function mercs() {
  ev.merc = { t: MERC.time, hired: [false, false] };
  toast(`MERCENARIOS: ${MERC.types.length} VETERANOS POR ${MERC.cost} DE ORO (${MERC.time} S)`, 'good');
  return true;
}
export const mercRoom = sd => popOf(sd) + MERC.types.length <= capOf(sd);
export function hireMercs(sd) {
  const st = sideState[sd];
  if (!ev.merc || ev.merc.hired[sd] || st.gold < MERC.cost || !mercRoom(sd)) return false;
  st.gold -= MERC.cost; ev.merc.hired[sd] = true;
  for (const t of MERC.types) { const u = spawnUnit(sd, t); u.rank = MERC.rank; setMax(u); u.hp = u.maxHp; applyRank(u); }
  if (sd === 0) toast('MERCENARIOS CONTRATADOS', 'good', spots[sd]);
  return true;
}

// ---------- caravana ----------
function caravan() {
  const x0 = MW / 2 + (Math.random() - .5) * 60, from = nearestNode(x0, 6), to = nearestNode(MW / 2 + (Math.random() - .5) * 60, MD - 6);
  if (!inMain[from] || !inMain[to]) return false;
  const f = bfs([to]); if (f[from] >= 1e9) return false;
  const u = spawnAt(2, 'horse', cellX(from), cellZ(from), Math.PI / 2);
  u.caravan = f; u.bounty = CARAVAN_GOLD; u.maxHp = u.hp = 420;
  toast(`UNA CARAVANA CRUZA EL MAPA: ${CARAVAN_GOLD} DE ORO PARA QUIEN LA DETENGA`, 'good', { x: cellX(from), z: cellZ(from) });
  return true;
}
// la caravana no pelea: sigue su camino y desaparece al salir por el otro lado
export function caravanUnit(u, dt) {
  if (u.caravan[u.node] <= 1) { u.dead = true; units.splice(units.indexOf(u), 1); sel.delete(u); u.g.parent?.remove(u.g); return; }
  followField(u, u.caravan, dt, 2.6);
  if ((u.pingT = (u.pingT ?? 0) - dt) <= 0) { u.pingT = 3; ping(u.pos, '#e8c870'); }
}
