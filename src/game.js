// Partida: producción, héroes, pueblos, campamentos, defensas, IA del rival y paso de simulación.
import * as THREE from 'three';
import { makeAI, updateAIs } from './ai.js';
import { sfx, startMusic } from './audio.js';
import { updateUnit } from './behavior.js';
import { buildAltar, buildBarracks, buildCastle, buildTown, buildWalls, decos, setOwner, spotPos, townLevelLook } from './buildings.js';
import { BONUS, bonusOf, civOf, resolveCivs, uname } from './civs.js';
import { alarm, applyRank, corpses, damage, raiseAlarm, shoot } from './combat.js';
import { ALT0, BARR0, BASE0, BASE1, DIFF, GAME, TEAM, TOWN0, UNITS } from './config.js';
import { burst, dropBox, floatText, ping, seenAt } from './effects.js';
import { resetFog } from './fog.js';
import { GEO } from './geo.js';
import { refreshPanel, syncDiff, syncTools, updateCtx } from './hud.js';
import { focusOn } from './input.js';
import { fortPt, forts, generate, paintRegion, regions, scen, spots, wallR } from './map.js';
import { showPortraits } from './menu.js';
import { cellX, cellZ, fieldAround, nearestNode } from './nav.js';
import { seed } from './noise.js';
import { bakedGeos, world } from './render.js';
import { $, S, track } from './state.js';
import { UGRID, _nearTown, _nearWall, arrows, floats, makeThumbs, pings, puffs, sel, setMax, sideState, spawnAt, spawnUnit, units } from './units.js';

// ---------- Cuartel, cola y héroe ----------
// límite de tropas: crece con el territorio (pueblos y campamentos propios)
export const capOf = side => Math.min(GAME.capMax, GAME.capBase + GAME.capTown * spots.filter(s => s.kind === 'town' && s.owner === side).length);
export const popOf = side => units.filter(u => u.side === side && u.type !== 'hero').length + sideState[side].queue.length;
export function enqueue(side, type) {
  const st = sideState[side], def = UNITS[type];
  if (state !== 'play') return false;
  if (st.gold < def.cost || st.queue.length >= GAME.queueMax || popOf(side) >= capOf(side)) { if (side === 0) sfx('deny'); return false; }
  st.gold -= def.cost; st.queue.push({ type, t: def.time });
  if (side === 0) { sfx('select'); track('unit_queued', { type }); refreshPanel(); }
  return true;
}
export function cancelQueue(i) { const st = sideState[0], q = st.queue[i]; if (!q) return; st.gold += UNITS[q.type].cost; st.queue.splice(i, 1); sfx('deny'); refreshPanel(); }
export const heroesOf = side => units.filter(u => u.side === side && u.type === 'hero');
export const heroCount = side => heroesOf(side).length + sideState[side].heroQ.length;   // vivos + en camino + esperando a volver tras caer
// el héroe "activo": para ti, el seleccionado (o el primero); para la IA, el primero
export function heroOf(side) { if (side === 0) { const hs = [...sel].find(u => u.type === 'hero' && u.side === 0 && !u.dead); if (hs) return hs; } return units.find(u => u.side === side && u.type === 'hero'); }
export function summonHero(side) {
  const st = sideState[side];
  if (state !== 'play' || heroCount(side) >= GAME.maxHeroes || st.gold < UNITS.hero.cost) { if (side === 0) sfx('deny'); return false; }
  st.gold -= UNITS.hero.cost; st.heroQ.push({ state: 'training', t: UNITS.hero.time });
  if (side === 0) { sfx('select'); track('hero_summon'); refreshPanel(); }
  return true;
}
function updateProduction(dt) {
  for (const side of [0, 1]) {
    const st = sideState[side], q = st.queue;
    if (q.length) {
      q[0].t -= dt;
      if (q[0].t <= 0) {
        const it = q.shift(), u = spawnUnit(side, it.type);
        if (side === 0) { sfx('ready'); floatText(spotPos(spots[BARR0], 4.5), uname(0, it.type) + ' LISTO', '#8ad8f0', 9); refreshPanel(); }
        burst(u.pos, [0xffffff, TEAM[side].l], 6, 1.5, 2, .4, .16);
      }
    }
    for (let i = st.heroQ.length - 1; i >= 0; i--) {
      const h = st.heroQ[i]; h.t -= dt;
      if (h.t <= 0) {
        st.heroQ.splice(i, 1);
        if (h.state === 'training') {
          const u = spawnUnit(side, 'hero', ALT0);
          burst(u.pos, [0xffd23f, 0xffffff, TEAM[side].c], 24, 3, 6, 1, .26); ping(u.pos, '#e8c870');
          toast(side === 0 ? '¡TU HÉROE HA LLEGADO!' : 'EL RIVAL TIENE UN HÉROE', side === 0 ? 'good' : 'bad', side === 0 ? u.pos : null); sfx('hero');
        }
      }
    }
  }
}
// ---------- Partida ----------
export let state = 'menu', fields = null, elapsed = 0;
function clearWorld() {
  for (const u of [...units]) world.remove(u.g); units.length = 0; sel.clear(); S.follow = null;
  for (const l of [arrows, puffs]) { for (const a of l) dropBox(a.m); l.length = 0; }
  for (const c of corpses) world.remove(c.g); corpses.length = 0;
  floats.length = 0; pings.length = 0;
  for (const s of spots) if (s.group) world.remove(s.group);
  for (const d of decos) world.remove(d); decos.length = 0;
  for (const g of bakedGeos) g.dispose(); bakedGeos.length = 0;   // edificios y murallas fundidos de la partida anterior
  if (S.rallyFlag) { world.remove(S.rallyFlag); S.rallyFlag = null; } S.rally = null;
}
// keepCivs: conserva las civilizaciones de la partida actual (reiniciar el mismo mapa)
export function newGame(s, keepCivs = false) {
  $('loading').hidden = false; $('end').hidden = true; $('start').hidden = true; $('menu').hidden = true; S.menuOpen = false; $('ui').classList.add('hidden-ui');
  requestAnimationFrame(() => setTimeout(() => {
    clearWorld(); resetFog(false); if (!keepCivs) resolveCivs(true);
    generate(s);
    const B = { base: buildCastle, barracks: buildBarracks, altar: buildAltar, town: buildTown };
    for (const sp of spots) B[sp.kind](sp);
    for (const f of forts) buildWalls(f);
    spawnGuards(); makeThumbs();
    regions.forEach((_, r) => paintRegion(r));
    fields = spots.map(sp => fieldAround(sp.x, sp.z, sp.kind === 'base' ? 4.4 : sp.kind === 'town' ? 2.6 : 3.2));
    for (const st of sideState) Object.assign(st, { gold: GAME.startGold, queue: [], heroQ: [] });
    sideState[0].ai = S.aiPlayer ? makeAI(0, S.aiPlayer.diff, S.aiPlayer.brain) : null; sideState[1].ai = makeAI(1, S.diff, S.aiRival);   // el bando 0 lo juega la IA solo en pruebas
    elapsed = 0; S.selBld = null; S.selSpot = null; Object.assign(alarm, { t: 0, pos: null, cool: 0 }); S.paused = false; S.speed = 1; syncTools();
    focusOn(spots[BASE0].x, spots[BASE0].z, true);
    $('mt').textContent = GAME.towns; $('cap').textContent = capOf(0);
    updateCtx(); syncDiff();
    $('loading').hidden = true; state = 'menu'; S.menuDirty = false;
    if (S.pendingStart) { S.pendingStart = false; startGame(); } else { $('start').hidden = false; showPortraits(); }
  }, 30));
}
export function startGame() { $('start').hidden = true; $('how').hidden = true; startMusic(); $('ui').classList.remove('hidden-ui'); state = 'play'; toast('MAPA: ' + GEO.LIST[scen]); { const b = BONUS[civOf(0).id]; if (b) toast(`${civOf(0).name} · ${b.name}: ${b.text.toUpperCase()}`, 'good'); } resetFog(true); S.selBld = null; S.selSpot = null; updateCtx(); track('game_start', { seed, diff: S.diff, map: scen }); }
export function endGame(win, surrender = false) {
  state = 'end'; $('menu').hidden = true; S.menuOpen = false; $('ui').classList.add('hidden-ui'); $('toast').hidden = true; $('pause').hidden = true;
  const s = spots[win ? BASE1 : BASE0];
  for (let k = 0; k < 4; k++) burst(spotPos(s, 2 + k), [0xd4cde2, TEAM[s.side].c, 0xffa03a, 0x3a2a4a], 14, 6, 6, 1.4, .45);
  focusOn(s.x, s.z);
  $('endT').textContent = win ? 'VICTORIA' : 'DERROTA';
  $('endT').style.color = win ? 'var(--blue)' : 'var(--red)';
  const m = Math.floor(elapsed / 60), sec = Math.floor(elapsed % 60);
  $('endP').textContent = (win ? 'La fortaleza roja ha caído' : surrender ? 'Te has rendido' : 'Tu fortaleza ha caído') + ` en ${m}:${String(sec).padStart(2, '0')} (${DIFF[S.diff].label}).`;
  setTimeout(() => { $('end').hidden = false; }, 1400);
  sfx(win ? 'win' : 'lost'); track('game_end', { win, surrender, seconds: Math.round(elapsed), diff: S.diff });
}
export const miniPings = [];
export function toast(msg, kind = '', pos = null) {   // avisos en columna, arriba a la derecha; con posición se pueden pulsar para ir allí
  const f = $('feed'), d = document.createElement('div'); d.textContent = msg; d.className = kind; f.prepend(d);
  if (pos) { const p = { x: pos.x, z: pos.z }; d.classList.add('go'); d.title = 'Ir allí'; d.addEventListener('pointerdown', () => focusOn(p.x, p.z)); miniPings.push({ x: p.x, z: p.z, t: 0, c: kind === 'bad' ? '#d83a4a' : kind === 'good' ? '#e8c870' : '#f4f4e8' }); }
  while (f.children.length > 4) f.lastChild.remove(); setTimeout(() => d.remove(), 4500);
}
export const TOWN_LV = { cost: [0, 120, 220], inc: [1, 1.8, 2.6] };
export const townInc = s => s.camp ? 0 : GAME.townIncome * TOWN_LV.inc[s.lvl - 1] * (s.special ? 2 : 1) * (s.fortified ? 2 : 1) * (bonusOf(s.owner).income || 1);
export const incomeOf = sd => GAME.income + spots.reduce((a, s) => a + (s.kind === 'town' && s.owner === sd ? townInc(s) : 0), 0);
export const towerRange = s => GAME.towerRange + (s.lvl - 1) * 1.5, towerDmg = s => GAME.towerDmg * (1 + (s.lvl - 1) * .5);
export function upgradeTown(side, s) {
  const st = sideState[side];
  if (s.camp || s.owner !== side || s.lvl >= 3 || st.gold < TOWN_LV.cost[s.lvl]) { if (side === 0) sfx('deny'); return false; }
  st.gold -= TOWN_LV.cost[s.lvl]; s.lvl++; townLevelLook(s);
  burst(spotPos(s, 1), [0xffd23f, 0xffffff], 16, 2.5, 5, .9, .22);
  if (side === 0) { sfx('capture'); floatText(spotPos(s, 5), 'NIVEL ' + s.lvl, '#e8c870', 10); refreshPanel(); }
  return true;
}
export function campSpawn(s) {   // el campamento da jinetes arqueros a su dueño, hasta 20 vivos por campamento
  const own = s.owner; if (own < 0) return;
  if (units.filter(u => u.campOf === s && u.side === own).length >= GAME.campMax || popOf(own) >= capOf(own)) return;
  const a = Math.random() * 6.28, u = spawnAt(own, 'harcher', s.x + Math.cos(a) * 4.5, s.z + Math.sin(a) * 4.5, a); u.campOf = s;
  burst(u.pos, [0xffffff, TEAM[own].l], 6, 1.5, 2, .4, .16);
  if (own === 0) { floatText(spotPos(s, 4.5), 'JINETE ARQUERO', '#8ad8f0', 9); refreshPanel(); }
}
function spawnGuards() {
  const post = (s, x, z, type, a) => { const n = nearestNode(x, z), u = spawnAt(2, type, cellX(n), cellZ(n), a); u.home = s; u.post = [cellX(n), cellZ(n)]; s.guards = (s.guards || 0) + 1; return u; };
  for (const s of spots) {
    if (s.camp) for (let k = 0; k < GAME.campGuards; k++) { const a = k / GAME.campGuards * 6.28; post(s, s.x + Math.cos(a) * 2.2, s.z + Math.sin(a) * 2.2, k % 2 ? 'harcher' : 'sword', a); }
    if (s.fortified) { const T = ['sword', 'bow', 'sword', 'horse', 'bow'];   // seis dentro y el resto en dos corros alrededor; muchos son veteranos
      for (let k = 0; k < GAME.fortGuards; k++) { const ring = k < 6 ? 0 : k < 14 ? 1 : 2, n = [6, 8, GAME.fortGuards - 14][ring], j = k - [0, 6, 14][ring], a = j / n * 6.28 + ring * .4, r = [2.6, 6.6, 9.2][ring];
        const u = post(s, s.x + Math.cos(a) * r, s.z + Math.sin(a) * r, T[k % 5], a); u.rank = k % 4 === 0 ? 2 : k % 2 ? 1 : 0; if (u.rank) { setMax(u); u.hp = u.maxHp; applyRank(u); } } }
  }
}
export const capR = s => s.fortified ? 5.7 : 3.9;   // radio del círculo de conquista
// arqueros en las murallas: varios puntos del recinto disparan a los enemigos que se acercan
function castleDefense(dt) {
  for (const f of forts) {
    if (!f.shooters) { f.shooters = []; for (let k = 0; k < GAME.wallShooters; k++) { const th = k / GAME.wallShooters * Math.PI * 2, p = fortPt(f, wallR(f, th), th); f.shooters.push({ x: p.x, z: p.z, cd: Math.random() * GAME.wallCd }); } }
    for (const sh of f.shooters) {
      if ((sh.cd -= dt) > 0) continue;
      let best = null, bd = GAME.wallRange;
      for (const u of UGRID.near(sh.x, sh.z, bd, _nearWall)) if (u.side !== f.side) { const d = Math.hypot(u.pos.x - sh.x, u.pos.z - sh.z); if (d < bd) { bd = d; best = u; } }
      if (!best) { sh.cd = .35; continue; }
      sh.cd = GAME.wallCd; const from = new THREE.Vector3(sh.x, Math.round(f.h) + 2.2, sh.z);
      shoot(from, best.pos, 0); damage({ side: f.side, vis: seenAt(from), def: {} }, best, GAME.wallDmg);
    }
  }
}
function updateTowns(dt) {
  for (let k = TOWN0; k < spots.length; k++) {
    const s = spots[k], p = spotPos(s), here = [0, 0, 0];
    const inside = UGRID.near(p.x, p.z, capR(s), _nearTown).filter(u => u.pos.distanceTo(p) < capR(s)); for (const u of inside) here[u.side]++;
    const cheer = sd => { for (const u of inside) if (u.side === sd && !u.enemy) u.capT = .25; };   // los que conquistan saltan en el sitio
    if ((s.camp || s.fortified) && s.owner === -1 && s.guards > 0) { s.prog = [0, 0]; continue; }   // hay que acabar antes con los defensores
    if (s.camp && s.owner >= 0 && (s.genT -= dt) <= 0) { s.genT = GAME.campGen; campSpawn(s); }
    if (s.owner === -1) {
      for (const sd of [0, 1]) {
        if (here[sd] && !here[1 - sd]) { s.prog[sd] += dt / GAME.capture * (bonusOf(sd).capture || 1); cheer(sd); } else s.prog[sd] = Math.max(0, s.prog[sd] - dt / GAME.capture / 2);
        if (s.prog[sd] >= 1 && s.owner === -1) { s.prog = [0, 0]; setOwner(s, sd); }
      }
    } else {
      const own = s.owner, en = 1 - own;
      if (here[en] && !here[own]) {
        s.lose += dt / (GAME.capture * 2) * (bonusOf(en).capture || 1); cheer(en);
        if (own === 0) raiseAlarm(p, `¡TE ESTÁN QUITANDO ${s.name}!`);
        if (s.lose >= 1) { s.lose = 0; setOwner(s, -1); }
      } else s.lose = Math.max(0, s.lose - dt / GAME.capture);
      if (!s.camp && s.owner >= 0 && (s.towerCd -= dt) <= 0) {
        let best = null, bd = towerRange(s);
        for (const u of UGRID.near(p.x, p.z, bd, _nearTown)) if (u.side !== s.owner) { const d = u.pos.distanceTo(p); if (d < bd) { bd = d; best = u; } }
        if (best) { s.towerCd = GAME.towerCd; shoot(s.tower, best.pos, 0); damage({ side: s.owner, vis: s.vis, def: {} }, best, towerDmg(s)); }
      }
    }
  }
}
export function updateGame(dt) {
  elapsed += dt; S.bfsBudget = 4;
  for (const sd of [0, 1]) sideState[sd].gold += incomeOf(sd) * dt * (sideState[sd].ai?.inc ?? 1);
  updateAIs(dt); updateProduction(dt);
  UGRID.rebuild();
  for (const u of [...units]) if (!u.dead) updateUnit(u, dt);
  updateTowns(dt); castleDefense(dt);
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i]; a.t += dt * 4; const k = Math.min(1, a.t);
    a.m.position.copy(a.a).lerp(a.b, k); a.m.position.y += Math.sin(k * Math.PI) * 1.2;
    a.m.lookAt(a.b);
    if (a.t >= 1) { dropBox(a.m); arrows.splice(i, 1); }
  }
  alarm.cool -= dt;
  if (spots[BASE1].hp <= 0) endGame(true); else if (spots[BASE0].hp <= 0) endGame(false);
}
