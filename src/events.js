// Eventos neutrales: cada ~2 minutos (desde el minuto 3) pasa algo en el mapa que no controla ningún bando.
// · Bandidos: una banda neutral asalta los pueblos del bando con más territorio; un pueblo sin defensores cae y queda neutral.
// · Mercenarios: durante 45 s, cualquiera de los dos bandos puede contratar tropas veteranas.
// · Caravana: cruza el mapa de norte a sur por el centro; quien la destruya se lleva su oro.
import { orderMove, spreadTo } from './behavior.js';
import { applyRank, nearestEnemy, strike } from './combat.js';
import { MD, MW, NEU, NP, TOWN0, players } from './config.js';
import { ping } from './effects.js';
import { capOf, capR, elapsed, fields, popOf, toast } from './game.js';
import { spots } from './map.js';
import { bfs, cellX, cellZ, inMain, nearestNode } from './nav.js';
import { alive, followField, sel, setMax, sideState, spawnAt, units } from './units.js';

export const MERC = { cost: 180, time: 45, types: ['horse', 'horse', 'bow', 'sword'], rank: 2 };
const CARAVAN_GOLD = 150, CARAVAN_CARTS = 3, CARAVAN_GAP = 2.4;   // oro total, carros y segundos entre uno y el siguiente
export const ev = { t: 0, last: '', merc: null, cara: null };   // cara: carros de la caravana que faltan por salir   // merc: oferta en curso { t, hired: [false, false] }

// pruebas: lanza un evento ya ('bandits', 'mercs' o 'caravan')
export function triggerEvent(k) { return k === 'bandits' ? bandits() : k === 'mercs' ? mercs() : caravan(); }
export function resetEvents() { ev.t = 180; ev.last = ''; ev.merc = null; ev.cara = null; }
export function updateEvents(dt) {
  if (ev.merc && (ev.merc.t -= dt) <= 0) ev.merc = null;
  if (ev.cara && (ev.cara.t -= dt) <= 0) { ev.cara.t = CARAVAN_GAP; spawnCart(ev.cara.from, ev.cara.f, false); if (--ev.cara.n <= 0) ev.cara = null; }
  if ((ev.t -= dt) > 0) return;
  ev.t = 110 + Math.random() * 40;
  const kinds = ['bandits', 'mercs', 'caravan'].filter(k => k !== ev.last), k = kinds[Math.random() * kinds.length | 0];
  if ((k === 'bandits' && bandits()) || (k === 'mercs' && mercs()) || (k === 'caravan' && caravan())) ev.last = k;
}

// ---------- bandidos ----------
const ownTowns = sd => spots.filter(s => s.kind === 'town' && s.owner === sd);
function bandits() {
  const cnt = players().map(sd => sideState[sd]?.dead ? 0 : ownTowns(sd).length), top = Math.max(...cnt); if (!top) return false;
  const tops = players().filter(sd => cnt[sd] === top), victim = tops[Math.random() * tops.length | 0], list = ownTowns(victim), town = list[Math.random() * list.length | 0];   // el que más territorio tiene
  // aparecen a unas 26 casillas del pueblo, lejos de las dos fortalezas
  let at = -1;
  for (let k = 0; k < 24 && at < 0; k++) {
    const ang = Math.random() * Math.PI * 2, n = nearestNode(town.x + Math.cos(ang) * 26, town.z + Math.sin(ang) * 26);
    if (spots.slice(0, NP).every(f => Math.hypot(cellX(n) - f.x, cellZ(n) - f.z) > 40) && fields[spots.indexOf(town)][n] < 80) at = n;
  }
  if (at < 0) return false;
  const n = Math.min(9, 4 + Math.floor(elapsed / 240)), T = ['sword', 'bow', 'horse', 'sword', 'bow'];
  for (let k = 0; k < n; k++) {
    const u = spawnAt(NEU, T[k % T.length], cellX(at) + (k % 3) - 1, cellZ(at) + (k / 3 | 0) - 1);
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
export const raidersAt = (s, inside) => inside.some(u => u.side === NEU && u.raid === s.owner);

// ---------- mercenarios ----------
function mercs() {
  ev.merc = { t: MERC.time, hired: players().map(() => false) };
  toast(`MERCENARIOS: ${MERC.types.length} VETERANOS POR ${MERC.cost} DE ORO (${MERC.time} S)`, 'good');
  return true;
}
export const mercRoom = sd => popOf(sd) + MERC.types.length <= capOf(sd);
export function hireMercs(sd) {
  const st = sideState[sd];
  if (!ev.merc || ev.merc.hired[sd] || st.gold < MERC.cost || !mercRoom(sd)) return false;
  st.gold -= MERC.cost; ev.merc.hired[sd] = true;
  // llegan por el borde del mapa más cercano a tu castillo y van a esperar junto a él
  const c = spots[sd], e = mercEntry(c), list = [];
  MERC.types.forEach((t, k) => { const u = spawnAt(sd, t, cellX(e) + (k % 2) * 1.2, cellZ(e) + (k >> 1) * 1.2, Math.atan2(c.z - cellZ(e), c.x - cellX(e))); u.rank = MERC.rank; setMax(u); u.hp = u.maxHp; applyRank(u); list.push(u); });
  orderMove(list, c.x, c.z, false);
  if (sd === 0) toast('MERCENARIOS CONTRATADOS: LLEGAN POR EL BORDE DEL MAPA', 'good', { x: cellX(e), z: cellZ(e) });
  return true;
}

// casilla de entrada: desde cada punto del borde del mapa, avanza hacia el castillo hasta tocar tierra a la que se llega por camino
// (en mapas con mar, es la costa: llegan en barco); se queda con la que está más cerca del castillo por camino
function mercEntry(c) {
  const f = bfs([c.node]); let best = c.node, bd = 1e9;
  for (let k = 0; k <= 1; k += 1 / 64) for (const [x0, z0] of [[k * MW, 2], [k * MW, MD - 2], [2, k * MD], [MW - 2, k * MD]]) {
    const L = Math.hypot(c.x - x0, c.z - z0);
    for (let t = 0; t < L; t += 1.5) {
      const x = x0 + (c.x - x0) * t / L, z = z0 + (c.z - z0) * t / L, n = nearestNode(x, z);
      if (Math.hypot(cellX(n) - x, cellZ(n) - z) > 1.5 || !inMain[n]) continue;
      if (f[n] < bd) { bd = f[n]; best = n; }
      break;
    }
  }
  return best;
}
// ---------- caravana ----------
function caravan() {
  const x0 = MW / 2 + (Math.random() - .5) * 60, from = nearestNode(x0, 6), to = nearestNode(MW / 2 + (Math.random() - .5) * 60, MD - 6);
  if (!inMain[from] || !inMain[to]) return false;
  const f = bfs([to]); if (f[from] >= 1e9) return false;
  spawnCart(from, f, true); ev.cara = { n: CARAVAN_CARTS - 1, t: CARAVAN_GAP, from, f };   // los demás carros salen detrás, en fila
  toast(`UNA CARAVANA DE ${CARAVAN_CARTS} CARROS CRUZA EL MAPA: ${CARAVAN_GOLD} DE ORO PARA QUIEN LA DETENGA`, 'good', { x: cellX(from), z: cellZ(from) });
  return true;
}
function spawnCart(from, f, lead) {
  const u = spawnAt(NEU, 'cart', cellX(from), cellZ(from), Math.PI / 2);
  u.caravan = f; u.bounty = Math.round(CARAVAN_GOLD / CARAVAN_CARTS); u.lead = lead;
}
// la caravana no pelea: sigue su camino y desaparece al salir por el otro lado
export function caravanUnit(u, dt) {
  if (u.caravan[u.node] <= 1) { u.dead = true; units.splice(units.indexOf(u), 1); sel.delete(u); u.g.parent?.remove(u.g); return; }
  followField(u, u.caravan, dt, u.def.speed);
  if (u.lead && (u.pingT = (u.pingT ?? 0) - dt) <= 0) { u.pingT = 3; ping(u.pos, '#e8c870'); }
}
