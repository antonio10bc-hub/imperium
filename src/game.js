// Partida: producción, héroes, pueblos, campamentos, defensas, IA del rival y paso de simulación.
import * as THREE from 'three';
import { makeAI, updateAIs } from './ai.js';
import { raidersAt, resetEvents, updateEvents } from './events.js';
import { sfx, startMusic } from './audio.js';
import { updateUnit } from './behavior.js';
import { buildAltar, buildBarracks, buildCastle, buildFortDeco, buildTemple, buildTown, buildWalls, decos, setOwner, spotPos, townLevelLook } from './buildings.js';
import { BONUS, bonusOf, civOf, resolveCivs, uname } from './civs.js';
import { alarm, applyRank, corpses, damage, kill, raiseAlarm, shoot } from './combat.js';
import { ALT0, BARR0, BASE0, BASE1, DIFF, GAME, MAP_SIZES, MAX_PLAYERS, NEU, NP, TEAM, TEMP0, TOWN0, UNITS, players, setPlayers } from './config.js';
import { burst, dropBox, floatText, ping, seenAt } from './effects.js';
import { resetFog } from './fog.js';
import { GEO } from './geo.js';
import { refreshPanel, syncDiff, syncTools, updateCtx } from './hud.js';
import { focusOn } from './input.js';
import { fortPt, forts, generate, geoR, mapCode, paintRegion, regions, scen, spots, wallR } from './map.js';
import { showPortraits } from './menu.js';
import { cellX, cellZ, fieldAround, nearestNode } from './nav.js';
import { seed } from './noise.js';
import { bakedGeos, world } from './render.js';
import { $, S, track } from './state.js';
import { UGRID, _nearTown, _nearWall, arrows, floats, makeThumbs, pings, puffs, sel, setMax, sideState, spawnAt, spawnUnit, units } from './units.js';
import { setupRules, updateRules } from './rules.js';
import { setupAmbient, updateWeather } from './ambient.js';
import { addMoment, renderEndStats, resetStats, sampleStats, statMade } from './stats.js';

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
// ---------- Templo: ritual y dios ----------
// un dios por bando: el que camina o el que se está invocando
export const hasGod = side => !!sideState[side].godQ || units.some(u => u.side === side && u.type === 'god');
export function startRitual(side) {
  const st = sideState[side];
  if (state !== 'play' || st.ritual.state !== 'none' || st.gold < GAME.ritualCost) { if (side === 0) sfx('deny'); return false; }
  st.gold -= GAME.ritualCost; st.ritual = { state: 'ritual', t: GAME.ritualTime };
  burst(spotPos(spots[TEMP0 + side], 1), [0xffe9a0, 0xffffff], 20, 2.5, 6, 1, .24);
  if (side === 0) { sfx('hero'); toast('EL RITUAL HA COMENZADO EN EL TEMPLO', 'good', spots[TEMP0]); track('ritual_start'); refreshPanel(); }
  else toast('EL RIVAL HA COMENZADO UN RITUAL EN SU TEMPLO', 'bad');
  return true;
}
export function summonGod(side) {
  const st = sideState[side];
  if (state !== 'play' || st.ritual.state !== 'done' || hasGod(side) || st.gold < UNITS.god.cost || popOf(side) >= capOf(side)) { if (side === 0) sfx('deny'); return false; }
  st.gold -= UNITS.god.cost; st.godQ = { t: UNITS.god.time };
  if (side === 0) { sfx('select'); track('god_summon'); refreshPanel(); }
  return true;
}
function updateTemple(side, dt) {
  const st = sideState[side], r = st.ritual, tp = spots[TEMP0 + side];
  if (r.state === 'ritual' && (r.t -= dt) <= 0) {
    r.state = 'done'; if (side === 0) addMoment('TEMPLO CONSAGRADO'); burst(spotPos(tp, 2), [0xffe9a0, 0xffffff, TEAM[side].c], 40, 4, 8, 1.6, .3); ping(spotPos(tp), '#e8c870');
    toast(side === 0 ? `¡TEMPLO CONSAGRADO! YA PUEDES INVOCAR A ${uname(0, 'god')}` : 'EL TEMPLO RIVAL ESTÁ CONSAGRADO', side === 0 ? 'good' : 'bad', side === 0 ? tp : null); sfx('win', side);
    if (side === 0) refreshPanel();
  }
  if (st.godQ && (st.godQ.t -= dt) <= 0) {
    st.godQ = null; const u = spawnUnit(side, 'god', TEMP0); u.bounty = GAME.godBounty;
    burst(u.pos, [0xffe9a0, 0xffffff, TEAM[side].c], 40, 4, 9, 1.4, .3); ping(u.pos, '#e8c870');
    toast(side === 0 ? `¡${uname(0, 'god')} HA DESCENDIDO!` : `¡EL RIVAL HA INVOCADO A ${uname(1, 'god')}!`, side === 0 ? 'good' : 'bad', u.pos); sfx('hero', side);
    if (side === 0) refreshPanel();
  }
}
function updateProduction(dt) {
  for (const side of players()) {
    if (sideState[side].dead) continue;
    updateTemple(side, dt);
    const st = sideState[side], q = st.queue;
    if (q.length) {
      q[0].t -= dt;
      if (q[0].t <= 0) {
        const it = q.shift(), u = spawnUnit(side, it.type); statMade(side);
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
          toast(side === 0 ? '¡TU HÉROE HA LLEGADO!' : 'EL RIVAL TIENE UN HÉROE', side === 0 ? 'good' : 'bad', side === 0 ? u.pos : null); sfx('hero', side);
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
  for (const k in S.rallyFlag) world.remove(S.rallyFlag[k]); S.rallyFlag = {}; S.rally = {};
}
// keepCivs: conserva las civilizaciones de la partida actual (reiniciar el mismo mapa)
// consejos de la pantalla de carga: la regla de la geografía elegida o uno general
const TIPS = ['Las tropas suben de rango al matar y se curan en tus regiones.', 'E activa el ataque-mover: avanzan peleando con lo que encuentren.', 'Asigna tropas a un héroe: forman delante de él y cargan juntos.',
  'Los pueblos fortificados dan más oro, pero tienen veinte defensores.', 'La ciudadela da colosos: lentos, muy duros y cuerpo a cuerpo.', 'Desde la atalaya se ve muy lejos y su torre dispara más lejos.',
  'Cuantos más pueblos tienes, menos rinde cada uno: mejóralos.', 'Con el cuartel seleccionado, el clic derecho fija dónde salen las tropas.', 'El arco vence a la espada, la espada al jinete y el jinete al arco.',
  'El código de mapa (en la pausa) repite o comparte este mismo mapa.', 'Con varios rivales, todos luchan contra todos: deja que se desgasten.'];
export function newGame(s, keepCivs = false) {
  { const d = GEO.DESC[S.wantScen]; $('tip').textContent = d && Math.random() < .6 ? d : TIPS[Math.random() * TIPS.length | 0]; }
  $('loading').hidden = false; $('end').hidden = true; $('start').hidden = true; $('menu').hidden = true; S.menuOpen = false; $('ui').classList.add('hidden-ui');
  requestAnimationFrame(() => setTimeout(() => { try { buildGame(s, keepCivs); } catch (e) {   // si la generación falla, otra semilla (antes se quedaba en «cargando» para siempre)
    console.error(e); window.__errors = (window.__errors || []).concat(String(e && e.stack || e).slice(0, 500));
    if ((S.genFails = (S.genFails || 0) + 1) < 4) newGame(s + 7777, keepCivs); } }, 30));
}
function buildGame(s, keepCivs) {
  {
    clearWorld(); resetFog(false);
    if (!keepCivs) { const sz = MAP_SIZES[S.mapSize] ? S.mapSize : 'n'; setPlayers(Math.max(2, Math.min(S.players || 2, MAX_PLAYERS[sz]))); }   // jugadores (según el tamaño del mapa)
    if (!keepCivs) resolveCivs(true);
    generate(s); resetFog(false); UGRID.resize();
    const B = { base: buildCastle, barracks: buildBarracks, altar: buildAltar, temple: buildTemple, town: buildTown };
    for (const sp of spots) B[sp.kind](sp);
    for (const f of forts) { buildWalls(f); buildFortDeco(f); }
    setupRules(); setupAmbient();
    spawnGuards(); makeThumbs();
    regions.forEach((_, r) => paintRegion(r));
    fields = spots.map(sp => fieldAround(sp.x, sp.z, sp.kind === 'base' ? 4.4 : sp.kind === 'town' ? 2.6 : 3.2));
    sideState.length = 0; for (const sd of players()) sideState.push({ gold: GAME.startGold, queue: [], heroQ: [], ritual: { state: 'none', t: 0 }, godQ: null, dead: false });
    sideState[0].ai = S.aiPlayer ? makeAI(0, S.aiPlayer.diff, S.aiPlayer.brain) : null; for (let sd = 1; sd < NP; sd++) sideState[sd].ai = makeAI(sd, S.diff, S.aiRival);   // el bando 0 lo juega la IA solo en pruebas
    elapsed = 0; resetStats(); resetEvents(); S.selBld = null; S.selSpot = null; Object.assign(alarm, { t: 0, pos: null, cool: 0 }); S.paused = false; S.speed = 1; syncTools();
    focusOn(spots[BASE0].x, spots[BASE0].z, true);
    $('mt').textContent = GAME.towns; $('cap').textContent = capOf(0);
    updateCtx(); syncDiff();
    $('loading').hidden = true; state = 'menu'; S.menuDirty = false;
    if (S.pendingStart) { S.pendingStart = false; startGame(); } else { $('start').hidden = false; showPortraits(); }
    S.genFails = 0;
  }
}
// presentación al empezar: la cámara viaja desde la fortaleza rival hasta la tuya mientras aparece el duelo de civilizaciones (un clic o una tecla la saltan)
function startIntro() {
  const me = spots[BASE0], foe = spots[NP === 2 ? BASE1 : 1], d = S.camDist;
  S.intro = { t: 0, dur: 3.4, a: { x: foe.x, z: foe.z, d: Math.max(90, d * 1.6) }, b: { x: me.x, z: me.z, d } };
  const v = $('vs'); v.innerHTML = `<b style="color:${TEAM[0].css}">${civOf(0).name}</b><i>CONTRA</i><b style="color:${TEAM[1].css}">${players().slice(1).map(sd => civOf(sd).name).join(' · ')}</b><small>${GEO.NAME[scen]}</small>`;
  v.hidden = false; v.classList.remove('go'); void v.offsetWidth; v.classList.add('go'); S.fade = 0;
}
export function endIntro() { if (!S.intro) return; const b = S.intro.b; S.intro = null; focusOn(b.x, b.z, true); S.camGoal = S.camDist = b.d; $('vs').hidden = true; }
export function startGame() { $('start').hidden = true; $('how').hidden = true; startMusic(); $('ui').classList.remove('hidden-ui'); state = 'play'; startIntro(); $('miniWrap').dataset.tip = GEO.NAME[scen] + ': ' + (GEO.DESC[scen] || ''); toast('MAPA: ' + GEO.NAME[scen] + (geoR?.mix ? ': ' + geoR.mix.map(k => GEO.NAME[k]).join(' + ') : '')); { const b = BONUS[civOf(0).id]; if (b) toast(`${civOf(0).name} · ${b.name}: ${b.text.toUpperCase()}`, 'good'); } resetFog(true); S.selBld = null; S.selSpot = null; updateCtx(); track('game_start', { seed, diff: S.diff, map: scen }); }
export function endGame(win, surrender = false) {
  state = 'end'; $('menu').hidden = true; S.menuOpen = false; $('ui').classList.add('hidden-ui'); $('toast').hidden = true; $('pause').hidden = true;
  const s = win ? (lastFallen || spots[BASE1]) : spots[BASE0];
  for (let k = 0; k < 4; k++) burst(spotPos(s, 2 + k), [0xd4cde2, TEAM[s.side].c, 0xffa03a, 0x3a2a4a], 14, 6, 6, 1.4, .45);
  focusOn(s.x, s.z);
  $('endT').textContent = win ? 'VICTORIA' : 'DERROTA'; $('eCode').textContent = mapCode();
  $('endT').style.color = win ? 'var(--blue)' : 'var(--red)';
  const m = Math.floor(elapsed / 60), sec = Math.floor(elapsed % 60);
  $('endP').textContent = (win ? 'La fortaleza roja ha caído' : surrender ? 'Te has rendido' : 'Tu fortaleza ha caído') + ` en ${m}:${String(sec).padStart(2, '0')} (${DIFF[S.diff].label}).`;
  renderEndStats(win); setTimeout(() => { $('end').hidden = false; }, 1400);
  sfx(win ? 'win' : 'lost'); track('game_end', { win, surrender, seconds: Math.round(elapsed), diff: S.diff });
}
export const miniPings = [], edgeMarks = [];   // edgeMarks: avisos malos con sitio (ataques), que la capa 2D señala con una flecha en el borde si quedan fuera de la pantalla
export function toast(msg, kind = '', pos = null) {   // avisos en columna, arriba a la derecha; con posición se pueden pulsar para ir allí
  const f = $('feed'), d = document.createElement('div'); d.textContent = msg; d.className = kind; f.prepend(d);
  if (pos) { const p = { x: pos.x, z: pos.z }; d.classList.add('go'); d.title = 'Ir allí'; d.addEventListener('pointerdown', () => focusOn(p.x, p.z)); if (kind === 'bad') { for (let i = edgeMarks.length - 1; i >= 0; i--) if (Math.hypot(edgeMarks[i].x - p.x, edgeMarks[i].z - p.z) < 12) edgeMarks.splice(i, 1); edgeMarks.push({ x: p.x, z: p.z, t: 0 }); } miniPings.push({ x: p.x, z: p.z, t: 0, c: kind === 'bad' ? '#d83a4a' : kind === 'good' ? '#e8c870' : '#f4f4e8' }); }
  while (f.children.length > 4) f.lastChild.remove(); setTimeout(() => d.remove(), 4500);
}
export const TOWN_LV = { cost: [0, 120, 220], inc: [1, 1.5, 2] };
// pueblos que no dan oro: campamento, ciudadela y atalaya (dan tropas o defensa)
export const noGold = s => s.camp || s.keep || s.watch;
// oro de un pueblo por sí solo (nivel, oro doble de los fortificados y de la cima, ventaja de civilización)
export const townInc = s => noGold(s) ? 0 : GAME.townIncome * TOWN_LV.inc[s.lvl - 1] * (s.special || s.fortified || s.oasis || s.fumarole ? GAME.richMul : 1) * (bonusOf(s.owner).income || 1);
// rendimiento decreciente: el pueblo k-ésimo (del que más da al que menos) rinde un 8 % menos que el anterior, hasta un mínimo del 45 %
const decay = k => Math.max(GAME.townDecayMin, 1 - GAME.townDecay * k);
const goldTowns = sd => spots.filter(s => s.kind === 'town' && s.owner === sd && !noGold(s)).sort((a, b) => townInc(b) - townInc(a) || spots.indexOf(a) - spots.indexOf(b));
export const incomeOf = sd => GAME.income + goldTowns(sd).reduce((a, s, k) => a + townInc(s) * decay(k), 0);
// lo que aporta de verdad este pueblo ahora (con el rendimiento decreciente de su dueño)
export const townIncNow = s => { if (s.owner < 0) return townInc(s); const k = goldTowns(s.owner).indexOf(s); return k < 0 ? 0 : townInc(s) * decay(k); };
export const towerRange = s => s.watch ? GAME.watchRange : GAME.towerRange + (s.lvl - 1) * 1.5, towerDmg = s => s.watch ? GAME.watchDmg : GAME.towerDmg * (1 + (s.lvl - 1) * .5);
export function upgradeTown(side, s) {
  const st = sideState[side];
  if (noGold(s) || s.owner !== side || s.lvl >= 3 || st.gold < TOWN_LV.cost[s.lvl]) { if (side === 0) sfx('deny'); return false; }
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
export function keepSpawn(s) {   // la ciudadela da colosos a su dueño, hasta 10 vivos, alrededor del edificio
  const own = s.owner; if (own < 0) return;
  if (units.filter(u => u.keepOf === s && u.side === own).length >= GAME.keepMax || popOf(own) >= capOf(own)) return;
  const a = Math.random() * 6.28, u = spawnAt(own, 'titan', s.x + Math.cos(a) * 6.5, s.z + Math.sin(a) * 6.5, a); u.keepOf = s;
  burst(u.pos, [0xffffff, 0xb8b0a0, TEAM[own].l], 10, 2, 2.5, .5, .2);
  if (own === 0) { floatText(spotPos(s, 6), 'COLOSO', '#8ad8f0', 10); refreshPanel(); }
}
function spawnGuards() {
  const post = (s, x, z, type, a) => { const n = nearestNode(x, z), u = spawnAt(NEU, type, cellX(n), cellZ(n), a); u.home = s; u.post = [cellX(n), cellZ(n)]; s.guards = (s.guards || 0) + 1; return u; };
  for (const s of spots) {
    if (s.camp) for (let k = 0; k < GAME.campGuards; k++) { const a = k / GAME.campGuards * 6.28; post(s, s.x + Math.cos(a) * 2.2, s.z + Math.sin(a) * 2.2, k % 2 ? 'harcher' : 'sword', a); }
    if (s.keep) for (let k = 0; k < GAME.keepGuards; k++) { const a = k / GAME.keepGuards * 6.28 + .3; post(s, s.x + Math.cos(a) * 4.2, s.z + Math.sin(a) * 4.2, 'titan', a); }
    if (s.fortified) { const T = ['sword', 'bow', 'sword', 'horse', 'bow'];   // seis dentro y el resto en dos corros alrededor; muchos son veteranos
      for (let k = 0; k < GAME.fortGuards; k++) { const ring = k < 6 ? 0 : k < 14 ? 1 : 2, n = [6, 8, GAME.fortGuards - 14][ring], j = k - [0, 6, 14][ring], a = j / n * 6.28 + ring * .4, r = [2.6, 6.6, 9.2][ring];
        const u = post(s, s.x + Math.cos(a) * r, s.z + Math.sin(a) * r, T[k % 5], a); u.rank = k % 4 === 0 ? 2 : k % 2 ? 1 : 0; if (u.rank) { setMax(u); u.hp = u.maxHp; applyRank(u); } } }
  }
}
// campos de camino hacia cada sitio: se rehacen cuando una regla de la geografía abre o cierra casillas
export function refreshFields() { fields = spots.map(sp => fieldAround(sp.x, sp.z, sp.kind === 'base' ? 4.4 : sp.kind === 'town' ? 2.6 : 3.2)); }
export const capR = s => s.fortified || s.keep ? 5.7 : 3.9;   // radio del círculo de conquista
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
    const s = spots[k], p = spotPos(s), here = Array(NEU + 1).fill(0);
    const inside = UGRID.near(p.x, p.z, capR(s), _nearTown).filter(u => u.pos.distanceTo(p) < capR(s)); for (const u of inside) here[u.side]++;
    const cheer = sd => { for (const u of inside) if (u.side === sd && !u.enemy) u.capT = .25; };   // los que conquistan saltan en el sitio
    if ((s.camp || s.fortified || s.keep) && s.owner === -1 && s.guards > 0) { s.prog.fill(0); continue; }   // hay que acabar antes con los defensores
    if (s.camp && s.owner >= 0 && (s.genT -= dt) <= 0) { s.genT = GAME.campGen; campSpawn(s); }
    if (s.keep && s.owner >= 0 && (s.genT -= dt) <= 0) { s.genT = GAME.keepGen; keepSpawn(s); }
    if (s.owner === -1) {
      const present = players().filter(sd => here[sd]);   // conquista quien esté solo en el círculo
      for (const sd of players()) {
        if (present.length === 1 && present[0] === sd) { s.prog[sd] = (s.prog[sd] || 0) + dt / GAME.capture * (bonusOf(sd).capture || 1); cheer(sd); } else s.prog[sd] = Math.max(0, (s.prog[sd] || 0) - dt / GAME.capture / 2);
        if (s.prog[sd] >= 1 && s.owner === -1) { s.prog.fill(0); setOwner(s, sd); }
      }
    } else {
      const own = s.owner, ens = players().filter(sd => sd !== own && here[sd]), en = ens[0] ?? -1;
      if ((ens.length || raidersAt(s, inside)) && !here[own]) {   // un rival o bandidos que asaltan este pueblo, sin defensores
        s.lose += dt / (GAME.capture * 2) * (en >= 0 ? bonusOf(en).capture || 1 : 1); if (en >= 0) cheer(en);
        if (own === 0) raiseAlarm(p, `¡TE ESTÁN QUITANDO ${s.name}!`);
        if (s.lose >= 1) { s.lose = 0; setOwner(s, -1); }
      } else s.lose = Math.max(0, s.lose - dt / GAME.capture);
      if (!s.camp && s.owner >= 0 && (s.towerCd -= dt) <= 0) {
        let best = null, bd = towerRange(s);
        for (const u of UGRID.near(p.x, p.z, bd, _nearTown)) if (u.side !== s.owner) { const d = u.pos.distanceTo(p); if (d < bd) { bd = d; best = u; } }
        if (best) { s.towerCd = s.watch ? GAME.watchCd : GAME.towerCd; shoot(s.tower, best.pos, 0); damage({ side: s.owner, vis: s.vis, def: {} }, best, towerDmg(s)); }
      }
    }
  }
}
export function updateGame(dt) {
  elapsed += dt; S.bfsBudget = 4; sampleStats(dt);
  for (const sd of players()) if (!sideState[sd].dead) sideState[sd].gold += incomeOf(sd) * dt * (sideState[sd].ai?.inc ?? 1);
  updateAIs(dt); updateProduction(dt); updateEvents(dt); updateRules(dt); updateWeather(dt);
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
  if (spots[BASE0].hp <= 0) { endGame(false); return; }
  for (let sd = 1; sd < NP; sd++) if (!sideState[sd].dead && spots[sd].hp <= 0) eliminate(sd);
  if (players().every(sd => sd === 0 || sideState[sd].dead)) endGame(true);
}
// un rival cuya fortaleza cae queda fuera: sus tropas se rinden (desaparecen) y sus pueblos vuelven a ser neutrales
let lastFallen = null;
export const alivePlayers = () => players().filter(sd => !sideState[sd]?.dead);
function eliminate(sd) {
  addMoment(`CAE LA FORTALEZA DE ${civOf(sd).name}`); const st = sideState[sd]; st.dead = true; st.ai = null; st.queue = []; st.heroQ = []; st.godQ = null; lastFallen = spots[sd];
  for (let k = 0; k < 3; k++) burst(spotPos(spots[sd], 2 + k * 2), [0xd4cde2, TEAM[sd].c, 0xffa03a, 0x3a2a4a], 14, 6, 6, 1.4, .45);
  for (const u of [...units]) if (u.side === sd && !u.dead) { u.hp = 0; kill(u, { side: NEU, vis: false, def: {} }); }
  for (const s of spots) if (s.kind === 'town' && s.owner === sd) setOwner(s, -1);
  if (NP > 2 && alivePlayers().length > 1) { toast(`¡HA CAÍDO LA FORTALEZA ${civOf(sd).name === civOf(0).name ? '' : 'DE ' + civOf(sd).name}! QUEDAN ${alivePlayers().length - 1} RIVALES`, 'good', spots[sd]); sfx('win'); }
}
