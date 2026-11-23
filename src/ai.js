// IA de los bandos. Cada bando controlado por la IA tiene un cerebro:
// · simple: la IA original (va al pueblo más cercano y alterna atacar/defender).
// · smart: no hace trampas (solo sabe lo que ven sus tropas y pueblos), contrarresta lo que ha visto,
//   defiende sus pueblos amenazados, evita objetivos que sabe que no puede tomar, cura a sus heridos en el sitio propio más cercano
//   y, en difícil, cada tropa elige a quién atacar.
import { escortUnit, spreadTo } from './behavior.js';
import { spotPos } from './buildings.js';
import { assign, nearestEnemy, siege, strike } from './combat.js';
import { DIFF, GAME, TOWN0, TYPES, UNITS } from './config.js';
import { capR, elapsed, noGold, enqueue, fields, hasGod, heroCount, heroesOf, startRitual, summonGod, summonHero, townInc, upgradeTown } from './game.js';
import { spots } from './map.js';
import { MERC, ev, hireMercs } from './events.js';
import { UGRID, alive, followField, sideState, stepToward, units } from './units.js';
import { hiddenFrom } from './rules.js';
import { weatherVis } from './ambient.js';
import { BRIDGE_COST, R, buildBridge, hitBridge, lastBridge, startChop } from './rules.js';
import { GEOT, cellOf } from './map.js';
import { bfs, nearestNode } from './nav.js';

// valor aproximado de cada tropa para medir fuerzas (coste, con algo de peso al héroe)
const WORTH = { sword: 40, bow: 55, horse: 80, harcher: 70, titan: 150, hero: 260, god: 400, cart: 0 };
const worth = u => WORTH[u.type] * (.35 + .65 * u.hp / u.maxHp) * (1 + u.rank * .15);
const COUNTER = { sword: 'bow', bow: 'horse', horse: 'sword', harcher: 'horse', titan: 'bow' };   // qué tropa vence a cada una
const AI_VISION = 15, AI_MEMORY = 45;   // casillas a las que ve la IA y segundos que recuerda lo visto

// estado de la IA de un bando según la dificultad (o el cerebro pedido para pruebas)
export function makeAI(side, diff, brain) {
  const Df = DIFF[diff];
  return { side, brain: brain || Df.brain, inc: Df.inc, Df, stance: 'defend', next: 'sword', planT: 0, phase: 'gather', target: -1, targetT: 0, retreatT: 0, mem: new Map(), roles: new Map(), blocked: new Set() };
}
export function updateAIs(dt) {
  for (const sd of [0, 1]) { const A = sideState[sd].ai; if (!A) continue; if (A.brain === 'simple') simplePlan(A); else if ((A.planT -= dt) <= 0) { A.planT = A.Df.plan; smartPlan(A); } }
}
export function aiUnit(u, dt) { const A = sideState[u.side].ai; return A.brain === 'simple' ? simpleUnit(u, dt, A) : smartUnit(u, dt, A); }

// ================= cerebro simple (la IA original) =================
function simplePlan(A) {
  const side = A.side, Df = A.Df, mine = units.filter(u => u.side === side && u.type !== 'hero'), theirs = units.filter(u => u.side === 1 - side);
  const count = t => theirs.filter(u => u.type === t).length, st = sideState[side];
  const wantH = Df.hero ? Math.min(GAME.maxHeroes, 1 + Math.floor(mine.length / 10)) : 0, hc = heroCount(side);
  const saving = hc < wantH && mine.length >= 4;   // ahorra para el siguiente héroe
  if (hc < wantH && mine.length >= 3 && st.gold >= UNITS.hero.cost) summonHero(side);
  else if (!saving && st.queue.length < 2 && st.gold >= UNITS[A.next].cost && enqueue(side, A.next)) {
    const r = Math.random();
    A.next = count('bow') > count('sword') && r < .6 ? 'horse' : count('horse') > count('bow') && r < .6 ? 'sword' : count('sword') > count('horse') && r < .6 ? 'bow' : TYPES[r * 3 | 0];
  }
  for (const h of heroesOf(side)) {   // escolta en formación para cada héroe: hasta 20 tropas, en cuña para atacar y en bloque para defender
    h.formShape = A.stance === 'attack' ? 'wedge' : 'block';
    if (h.escort.length < 20) { const free = mine.filter(u => !u.leader && !u.retreat).sort((a, b) => a.pos.distanceTo(h.pos) - b.pos.distanceTo(h.pos)); if (free.length > 1) assign(free[0], h); }
  }
  // mejora sus pueblos cuando le sobra oro
  if (!saving && st.gold > 320) { const t = spots.filter(s => s.kind === 'town' && !noGold(s) && s.owner === side && s.lvl < 3).sort((a, b) => a.lvl - b.lvl)[0]; if (t) upgradeTown(side, t); }
  const bp = spotPos(spots[side]), threat = theirs.filter(u => u.pos.distanceTo(bp) < 16).length;
  if (threat > mine.length * .7 && threat > 0) A.stance = 'defend';
  else if (mine.length >= Df.attackAt || (mine.length >= 2 && spots.some(s => s.kind === 'town' && s.owner === -1))) A.stance = 'attack';
  else if (mine.length <= 1) A.stance = 'defend';
}
function simpleUnit(u, dt, A) {
  if (u.leader) return escortUnit(u, dt);
  const side = u.side;
  // retirada: con poca vida vuelve a casa a curarse (salvo que tenga un enemigo encima)
  const k = u.hp / u.maxHp; if (k < .3 && u.type !== 'hero') u.retreat = true; else if (k > .85) u.retreat = false;
  if ((u.think -= dt) <= 0) { u.think = .35; u.enemy = nearestEnemy(u, u.retreat ? 1.8 : u.def.aggro); }
  if (alive(u.enemy) && strike(u, u.enemy, dt)) return;
  const home = spots[side];
  if (u.retreat || A.stance === 'defend') { spreadTo(u, home.x, home.z, fields[side], 3.5, 1.15, dt); return; }   // en casa, repartidos por el recinto
  // varios frentes: la mitad del ejército va al pueblo más cercano y la otra mitad al segundo.
  // Cada tropa se compromete con su objetivo y solo lo replantea cada pocos segundos o al conquistarlo (antes lo cambiaba a cada paso y se quedaba clavada a medio camino)
  const valid = t => t >= TOWN0 && spots[t] && spots[t].owner !== side && !(spots[t].guards > 0 && ((spots[t].fortified && u.armyN < 24) || (spots[t].keep && u.armyN < 14)));
  if ((u.aiReT = (u.aiReT ?? 0) - dt) <= 0 || !valid(u.aiT)) {
    u.aiReT = 5 + (u.id % 5); u.armyN = units.filter(o => o.side === side && o.type !== 'hero').length;
    let bt = -1, bv = 1e9, st = -1, sv = 1e9;
    for (let t = TOWN0; t < spots.length; t++) if (valid(t)) { const v = fields[t][u.node]; if (v < bv) { st = bt; sv = bv; bt = t; bv = v; } else if (v < sv) { st = t; sv = v; } }
    u.aiT = u.id % 2 && st >= 0 && sv < bv * 2.5 + 20 ? st : bt; u.aiV = u.aiT === st ? sv : bv;
  }
  const bs = spots[u.aiT];
  if (bs && (u.aiV < 90 || u.type !== 'hero')) spreadTo(u, bs.x, bs.z, fields[u.aiT], 0, 0, dt, capR(bs) - .8);   // dentro del círculo de conquista, sin amontonarse
  else siege(u, spots[1 - side], dt);
}

// ================= cerebro smart =================
const _seen = [];
const near = (a, x, z, r) => Math.hypot(a.x - x, a.z - z) < r;
// lo que sabe del enemigo: lo que ve ahora (cerca de sus tropas, pueblos o fortaleza) más lo visto en los últimos AI_MEMORY segundos
function observe(A) {
  const side = A.side, foe = 1 - side, places = spots.filter(s => (s.kind === 'base' && s.side === side) || (s.kind === 'town' && s.owner === side));
  for (const e of units) {
    if (e.side !== foe && !(e.side === 2 && e.raid === side)) continue;   // el rival y los bandidos que vienen a por él
    const seen = places.some(s => near(s, e.pos.x, e.pos.z, s.kind === 'base' ? 28 : s.watch ? GAME.watchVision : 14)) || UGRID.near(e.pos.x, e.pos.z, AI_VISION, _seen).some(o => o.side === side && Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) < AI_VISION * weatherVis());
    if (seen && !hiddenFrom(e, side)) A.mem.set(e.id, { type: e.type, x: e.pos.x, z: e.pos.z, w: worth(e), t: elapsed });
  }
  const live = new Set(); for (const u of units) live.add(u.id);
  for (const [id, m] of A.mem) if (elapsed - m.t > AI_MEMORY || !live.has(id)) A.mem.delete(id);   // olvida lo antiguo y a los caídos
}
const memNear = (A, x, z, r, fresh = AI_MEMORY) => { let w = 0; for (const m of A.mem.values()) if (elapsed - m.t <= fresh && Math.hypot(m.x - x, m.z - z) < r) w += m.w; return w; };

// off (solo pruebas): lista de mejoras desactivadas, para medir qué aporta cada una
const off = (A, f) => A.Df.off?.includes(f);
function smartPlan(A) {
  const side = A.side, foe = 1 - side, st = sideState[side], Df = A.Df;
  observe(A);
  const mine = units.filter(u => u.side === side && u.type !== 'hero'), heroes = heroesOf(side);
  const myW = mine.reduce((a, u) => a + worth(u), 0) + heroes.reduce((a, u) => a + worth(u), 0);
  let foeW = 0; const foeCount = { sword: 0, bow: 0, horse: 0, harcher: 0, titan: 0, hero: 0, god: 0 };
  for (const m of A.mem.values()) { foeW += m.w; foeCount[m.type]++; }

  // --- producción: contrarresta lo más numeroso que ha visto, sin descuidar el equilibrio propio
  const towns = spots.filter(s => s.kind === 'town' && s.owner === side).length;
  const wantH = Df.hero && (towns >= 2 || off(A, 'hero2')) ? Math.min(GAME.maxHeroes, 1 + Math.floor(mine.length / 10)) : 0, hc = heroCount(side);   // sin territorio, primero tropas: ahorrar para el héroe ahogaría la expansión
  // templo: con territorio, ejército y sin ir por detrás, ahorra para el ritual (si no, el oro se va siempre en tropas y mejoras)
  const wantRitual = st.ritual?.state === 'none' && towns >= 4 && elapsed > 240 && mine.length >= 8 && foeW < myW * 1.2;
  const wantGod = st.ritual?.state === 'done' && !hasGod(side);   // con el templo consagrado, el dios va antes que más tropas
  const saving = (hc < wantH && mine.length >= 4) || wantRitual || wantGod;
  if (hc < wantH && mine.length >= 3 && st.gold >= UNITS.hero.cost) summonHero(side);
  else if (!saving && st.queue.length < 2 && st.gold >= UNITS[A.next].cost && enqueue(side, A.next)) {
    const own = t => mine.filter(u => u.type === t).length + st.queue.filter(q => q.type === t).length;
    const top = ['sword', 'bow', 'horse', 'harcher', 'titan'].sort((a, b) => foeCount[b] - foeCount[a])[0];
    A.next = off(A, 'counter') ? TYPES[Math.random() * 3 | 0] : foeCount[top] > 0 && Math.random() < .7 ? COUNTER[top] : TYPES.slice().sort((a, b) => own(a) - own(b))[0];
  }
  for (const h of heroes) {   // escolta en formación para cada héroe: cuña al atacar, bloque al defender
    h.formShape = A.stance === 'attack' ? 'wedge' : 'block';
    if (h.escort.length < 20) { const free = mine.filter(u => !u.leader && !u.retreat && !A.roles.has(u)).sort((a, b) => a.pos.distanceTo(h.pos) - b.pos.distanceTo(h.pos)); if (free.length > 1) assign(free[0], h); }
  }
  // --- templo: con territorio y oro de sobra (y sin amenaza encima) empieza el ritual; después invoca a su dios en cuanto puede
  if (wantRitual && st.gold >= GAME.ritualCost) startRitual(side);
  else if (wantGod && st.gold >= UNITS.god.cost) summonGod(side);
  // --- geografía: talar, saquear tesoros, derribar o reparar puentes (cada pocos segundos)
  if ((A.geoT = (A.geoT ?? 8) - Df.plan) <= 0) { A.geoT = 12; geoTasks(A, mine, myW, foeW); }
  // --- mercenarios: si hay oferta y le sobra oro, los contrata
  if (ev.merc && !ev.merc.hired[side] && st.gold >= MERC.cost + 60 && !saving) hireMercs(side);
  // --- mejoras: con oro de sobra, primero los pueblos que más rinden y sin enemigos cerca
  const upAt = off(A, 'eco') ? (foeW > myW ? 420 : 320) : foeW > myW * 1.2 ? 400 : 140;   // una mejora se amortiza en ~80 s: si no va por detrás, mejora pronto
  if (!saving && st.gold > upAt) {
    const t = spots.filter(s => s.kind === 'town' && !noGold(s) && s.owner === side && s.lvl < 3 && memNear(A, s.x, s.z, 16, 10) === 0).sort((a, b) => townInc(b) - townInc(a) || a.lvl - b.lvl)[0];
    if (t) upgradeTown(side, t);
  }

  // --- defensa: el sitio propio más amenazado (la fortaleza cuenta doble) recibe las tropas más cercanas hasta superar al atacante
  const places = spots.filter(s => (s.kind === 'base' && s.side === side) || (s.kind === 'town' && s.owner === side));
  let worst = null, worstW = 0;
  for (const s of places) { const w = memNear(A, s.x, s.z, 16, 6) * (s.kind === 'base' ? 2 : 1); if (w > worstW) { worstW = w; worst = s; } }
  A.roles.clear();
  if (worst && !off(A, 'defend')) {
    const idx = spots.indexOf(worst), need = memNear(A, worst.x, worst.z, 16, 6) * 1.3;
    let got = 0;
    for (const u of mine.filter(u => !u.leader).sort((a, b) => fields[idx][a.node] - fields[idx][b.node])) { if (got >= need) break; A.roles.set(u, idx); got += worth(u); }
  }
  // --- objetivos que evita: donde ha visto más defensa de la que su ejército puede romper
  A.blocked = new Set();
  for (let t = TOWN0; t < spots.length; t++) { const s = spots[t]; if (s.owner === side) continue; const d = memNear(A, s.x, s.z, 14) + (s.owner === foe ? 60 * s.lvl : 0); if (d > myW * .7 && !off(A, 'block')) A.blocked.add(t); }
  // postura: defender si la fortaleza está en peligro; si no, atacar con lo que haya (como la IA original)
  A.concentrate = !off(A, 'conc') && foeW > myW * .4;   // con un ejército rival a la vista, todos al mismo objetivo en vez de repartirse
  const baseThreat = memNear(A, spots[side].x, spots[side].z, 18, 6);
  if (baseThreat > myW * .7 && baseThreat > 0) A.stance = 'defend';
  else if (mine.length >= Df.attackAt || (mine.length >= 2 && spots.some(s => s.kind === 'town' && s.owner === -1))) A.stance = 'attack';
  else if (mine.length <= 1) A.stance = 'defend';
}
// tareas de la IA con las reglas de cada geografía. Cada tarea la hacen unas pocas tropas libres (u.aiJob)
const freeUnits = (A, mine, x, z, n) => mine.filter(u => !u.leader && !u.retreat && !u.aiJob && !A.roles.has(u) && u.type !== 'god').sort((a, b) => Math.hypot(a.pos.x - x, a.pos.z - z) - Math.hypot(b.pos.x - x, b.pos.z - z)).slice(0, n);
function geoTasks(A, mine, myW, foeW) {
  const side = A.side, st = sideState[side], base = spots[side];
  // tesoros: una tropa va a por el más cercano que no esté lejísimos
  for (const t of R.treasures || []) { if (t.taken || t.claimed?.[side]) continue; const d = Math.hypot(t.x - base.x, t.z - base.z); if (d > 170) continue;
    const u = freeUnits(A, mine, t.x, t.z, 1)[0]; if (u) { u.aiJob = { type: 'go', x: t.x, z: t.z, f: null, until: elapsed + 90, done: () => t.taken }; (t.claimed ??= [])[side] = true; } break; }
  // tala: si un pueblo que quiere tomar queda mucho más lejos por camino que en línea recta y hay bosque en medio, abre paso
  if (R.on.chop && !R.jobs.some(j => j.side === side)) {
    let best = null, br = 1.8;
    for (let t = TOWN0; t < spots.length; t++) { const s = spots[t]; if (s.owner === side) continue; const e = Math.hypot(s.x - base.x, s.z - base.z), r = fields[t][base.node] / Math.max(1, e); if (r > br && e < 150) { br = r; best = s; } }
    if (best) for (let k = 1; k < 20; k++) { const x = base.x + (best.x - base.x) * k / 20, z = base.z + (best.z - base.z) * k / 20, i = cellOf(x, z);
      if (GEOT[i] === 1 || GEOT[i] === 16) { const us = freeUnits(A, mine, x, z, 3); if (us.length && startChop(x, z, us)) for (const u of us) u.aiJob = { type: 'go', x, z, f: null, until: elapsed + 60, done: () => !R.jobs.some(j => Math.hypot(j.x - x, j.z - z) < 4) }; break; } }
  }
  // puentes: si va perdiendo, derriba el puente por el que llega el enemigo; si va ganando y tiene oro, repara los caídos
  for (const b of R.bridges) {
    if (b.built && foeW > myW * 1.3 && !lastBridge(b) && memNear(A, b.x, b.z, 30, 20) > 0 && Math.hypot(b.x - base.x, b.z - base.z) < Math.hypot(b.x - spots[1 - side].x, b.z - spots[1 - side].z)) {
      for (const u of freeUnits(A, mine, b.x, b.z, 4)) u.aiJob = { type: 'demolish', b, until: elapsed + 60, done: () => !b.built }; break; }
    if (!b.built && myW > foeW && st.gold > BRIDGE_COST + 200) { buildBridge(side, b); break; }
  }
}
function aiJobStep(u, dt) {
  const j = u.aiJob;
  if (elapsed > j.until || j.done()) { u.aiJob = null; return false; }
  if ((u.think -= dt) <= 0) { u.think = .4; u.enemy = nearestEnemy(u, 4); }
  if (alive(u.enemy) && strike(u, u.enemy, dt)) return true;
  if (j.type === 'demolish') { if (u.order?.b !== j.b) u.order = { type: 'demolish', b: j.b }; hitBridge(u, j.b, dt); return true; }
  if (!j.f) j.f = bfs([nearestNode(j.x, j.z)]);
  if (Math.hypot(u.pos.x - j.x, u.pos.z - j.z) > 2.5) followField(u, j.f, dt) || stepToward(u, j.x, j.z, u.def.speed, dt);
  return true;
}
// en difícil, cada tropa elige objetivo: los que puede vencer, los débiles y el héroe antes que el más cercano
function pickTarget(u, range) {
  let best = null, bs = 1e9;
  for (const o of UGRID.near(u.pos.x, u.pos.z, range, _seen)) {
    if (o.side === u.side) continue;
    const d = u.pos.distanceTo(o.pos); if (d >= range) continue;
    const sc = d + (o.hp / o.maxHp) * 4 - (u.def.vs[o.type] ? 3 : 0) - (o.type === 'hero' ? 2 : 0);
    if (sc < bs) { bs = sc; best = o; }
  }
  return best;
}
function smartUnit(u, dt, A) {
  if (u.leader) return escortUnit(u, dt);
  if (u.aiJob && aiJobStep(u, dt)) return;
  const side = u.side, k = u.hp / u.maxHp;
  if (k < .3 && u.type !== 'hero') u.retreat = true; else if (k > .85) u.retreat = false;
  if ((u.think -= dt) <= 0) { u.think = .3; const r = u.retreat ? 1.8 : u.def.aggro; u.enemy = A.Df.focus && !u.retreat ? pickTarget(u, r) : nearestEnemy(u, r); }
  if (alive(u.enemy) && strike(u, u.enemy, dt)) return;
  if (u.retreat && off(A, 'heal')) { const h = spots[side]; spreadTo(u, h.x, h.z, fields[side], 3.5, 1.15, dt); return; }
  if (u.retreat) {   // a curarse al sitio propio más cercano por camino (no siempre a la fortaleza)
    if (!spots[u.healAt] || (spots[u.healAt].kind === 'town' && spots[u.healAt].owner !== side) || (u.healT = (u.healT ?? 0) - dt) <= 0) {
      u.healT = 4; let b = side, bv = fields[side][u.node];
      for (let t = TOWN0; t < spots.length; t++) if (spots[t].owner === side && fields[t][u.node] < bv) { bv = fields[t][u.node]; b = t; }
      u.healAt = b;
    }
    const h = spots[u.healAt]; spreadTo(u, h.x, h.z, fields[u.healAt], 3, 1, dt); return;
  }
  const def = A.roles.get(u);
  if (def != null) { const s = spots[def]; spreadTo(u, s.x, s.z, fields[def], 2.5, 1, dt); return; }
  const home = spots[side];
  if (A.stance === 'defend') { spreadTo(u, home.x, home.z, fields[side], 3.5, 1.15, dt); return; }
  // como la IA original: la mitad al objetivo más cercano y la otra mitad al segundo, pero sin meterse donde sabe que no puede ganar
  const valid = t => t >= TOWN0 && spots[t] && spots[t].owner !== side && !A.blocked?.has(t) && !(spots[t].guards > 0 && ((spots[t].fortified && u.armyN < 24) || (spots[t].keep && u.armyN < 14)));
  if ((u.aiReT = (u.aiReT ?? 0) - dt) <= 0 || !valid(u.aiT)) {
    u.aiReT = 5 + (u.id % 5); u.armyN = units.filter(o => o.side === side && o.type !== 'hero').length;
    let bt = -1, bv = 1e9, st = -1, sv = 1e9;
    for (let t = TOWN0; t < spots.length; t++) if (valid(t)) { const v = fields[t][u.node]; if (v < bv) { st = bt; sv = bv; bt = t; bv = v; } else if (v < sv) { st = t; sv = v; } }
    u.aiT = u.id % 2 && st >= 0 && sv < bv * 2.5 + 20 && !A.concentrate ? st : bt; u.aiV = u.aiT === st ? sv : bv;
  }
  const bs = spots[u.aiT];
  if (bs && (u.aiV < 90 || u.type !== 'hero')) spreadTo(u, bs.x, bs.z, fields[u.aiT], 0, 0, dt, capR(bs) - .8);
  else siege(u, spots[1 - side], dt);   // sin pueblo que tomar (o el héroe, si el pueblo queda lejos): a la fortaleza rival
}
