// Reglas propias de cada geografía: lo que hace que cada mapa se juegue distinto.
// · Río: dos puentes que se pueden construir con oro.          · Cordillera: la nieve frena; desde lo alto se ve más lejos.
// · Archipiélago: mareas que cubren y descubren los bajíos.    · Barrancos: emboscadas desde arriba; en el fondo no se ve a nadie de lejos.
// · Afluentes: crecidas que cierran los vados un rato.        · Delta: los pantanos ocultan a las tropas y atascan a los jinetes.
// · Bosque: se puede talar el bosque denso; dentro, cobertura contra flechas.
// · Desierto: lejos del agua y de los caminos, las tropas pasan sed.   · Caldera: el volcán entra en erupción de vez en cuando.
// (Istmo y cordillera colocan además la ciudadela y las atalayas en sus pasos; la meseta tiene tres rampas estrechas.)
import * as THREE from 'three';
import { sfx } from './audio.js';
import { damage } from './combat.js';
import { MD, MW, N, RANGED, idx } from './config.js';
import { orderMove } from './behavior.js';
import { burst, ping, plume, streak } from './effects.js';
import { refreshFields, toast } from './game.js';
import { GEOT, HM, bridgeSites, geoR, removeTrees, roadCell, scen, treeCell } from './map.js';
import { blocked, cellX, cellZ, nearestOpen, refreshCells } from './nav.js';
import { bake, part, world } from './render.js';
import { UGRID, sideState, units } from './units.js';

export const R = { on: {}, gates: [], bridges: [], jobs: [], cycle: null, hide: null, cover: null, wet: null, volcano: null, meshes: [], thirstTold: false };
const _near = [];

// ---------- preparación al empezar cada partida ----------
export function setupRules() {
  for (const m of R.meshes) { world.remove(m); m.traverse(o => { if (o.isMesh && o.userData.own) { o.geometry.dispose(); o.material.dispose(); } }); }
  Object.assign(R, { on: {}, gates: [], bridges: [], jobs: [], cycle: null, hide: null, cover: null, wet: null, volcano: null, meshes: [], thirstTold: false, bombs: [] });
  const on = R.on;
  on.bridges = bridgeSites.length > 0;
  on.snow = scen === 'cordillera'; on.highVision = scen === 'cordillera';
  on.tides = scen === 'archipielago'; on.floods = scen === 'afluentes';
  on.canyon = scen === 'barrancos'; on.swamp = scen === 'delta';
  on.chop = scen === 'bosque'; on.cover = scen === 'bosque';
  on.thirst = scen === 'oasis'; on.volcano = scen === 'lago' && !!geoR?.volcano;
  // casillas donde las tropas se ocultan: el fondo de los barrancos y los pantanos del delta
  if (on.canyon || on.swamp) { R.hide = new Uint8Array(N); for (let i = 0; i < N; i++) if (on.canyon ? HM[i] === 1 : GEOT[i] === 2) R.hide[i] = 1; }
  // cobertura: junto al bosque denso o entre árboles
  if (on.cover) { R.cover = new Uint8Array(N); for (let z = 1; z < MD - 1; z++) for (let x = 1; x < MW - 1; x++) { const i = idx(x, z); if (treeCell[i] || [-1, 0, 1].some(dz => [-1, 0, 1].some(dx => GEOT[idx(x + dx, z + dz)] === 1))) R.cover[i] = 1; } }
  // agua en el desierto: a menos de 12 casillas de un oasis, del agua o de una fortaleza no hay sed
  if (on.thirst) R.wet = wetMap(12);
  // mareas (bajíos del archipiélago) y crecidas (vados de los afluentes): grupos de casillas que se cierran a ratos
  if (on.tides || on.floods) {
    const cells = [];
    for (let z = 1; z < MD - 1; z++) for (let x = 1; x < MW - 1; x++) { const i = idx(x, z);
      if (on.tides ? GEOT[i] === 2 && HM[i] === 1 : HM[i] === 1 && GEOT[i] === 0 && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => HM[idx(x + a, z + b)] <= 0)) cells.push(i); }
    if (cells.length) { const g = { cells, open: true, layer: waterLayer(cells) }; R.gates.push(g); R.cycle = { phase: 'open', t: on.tides ? 100 : 140 }; }
  }
  for (const b of bridgeSites) R.bridges.push(makeBridge(b));
  if (on.volcano) {   // lava en el cráter (brilla siempre) y humo constante
    const [x, z] = geoR.volcano, y = HM[idx(Math.floor(x), Math.floor(z))]; R.volcano = { x, z, y: y + 1, t: 150, phase: 'calm' };
    const lava = new THREE.Mesh(new THREE.BoxGeometry(2.6, .2, 2.6), new THREE.MeshBasicMaterial({ color: 0xff7a1a })); lava.position.set(Math.floor(x) + .5, y + .12, Math.floor(z) + .5); lava.userData.own = true; world.add(lava); R.meshes.push(lava);
  }
}
// distancia (en casillas, sin obstáculos) al agua, a los oasis y a las fortalezas, hasta r
function wetMap(r) {
  const d = new Uint8Array(N).fill(255), q = [];
  for (let i = 0; i < N; i++) if (HM[i] <= 0 || GEOT[i] === 4) { d[i] = 0; q.push(i); }
  for (const s of spots0()) for (let dz = -24; dz <= 24; dz++) for (let dx = -24; dx <= 24; dx++) { const x = Math.floor(s.x) + dx, z = Math.floor(s.z) + dz; if (x >= 0 && z >= 0 && x < MW && z < MD && dx * dx + dz * dz < 576) { const i = idx(x, z); if (d[i]) { d[i] = 0; q.push(i); } } }
  for (let h = 0; h < q.length; h++) { const v = q[h], x = v % MW, z = (v / MW) | 0; if (d[v] >= r) continue;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + a, nz = z + b; if (nx < 0 || nz < 0 || nx >= MW || nz >= MD) continue; const j = idx(nx, nz); if (d[j] > d[v] + 1) { d[j] = d[v] + 1; q.push(j); } } }
  const w = new Uint8Array(N); for (let i = 0; i < N; i++) w[i] = d[i] <= r ? 1 : 0; return w;
}
const spots0 = () => geoR?.F ? geoR.F.map(([x, z]) => ({ x, z })) : [];
// capa de agua sobre unas casillas (se ve cuando están cerradas)
function waterLayer(cells) {
  const p = [], ix = [];
  for (const c of cells) { const x = c % MW, z = (c / MW) | 0, y = HM[c] + .07, v = p.length / 3; p.push(x, y, z, x + 1, y, z, x + 1, y, z + 1, x, y, z + 1); ix.push(v, v + 2, v + 1, v, v + 3, v + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(ix); g.computeBoundingSphere();
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x5fb0d4, transparent: true, opacity: .92, depthWrite: false })); m.visible = false; m.userData.own = true; m.renderOrder = 1;
  world.add(m); R.meshes.push(m); return m;
}

// ---------- casillas que se abren y se cierran ----------
function setGate(g, open) {
  g.open = open; g.layer.visible = !open; g.layer.material.opacity = .92;
  for (const c of g.cells) blocked[c] = open ? 0 : 1;
  refreshCells(g.cells);
  if (!open) evict(g.cells);
  refreshFields();
}
// las tropas que se quedan en una casilla cerrada saltan a la tierra más cercana (o se ahogan si no la hay)
function evict(cells, drown = false) {
  const set = new Set(cells);
  for (const u of [...units]) if (!u.dead && set.has(u.node)) {
    const o = drown ? -1 : nearestOpen(u.pos.x, u.pos.z, 12);
    if (o < 0) { damage({ side: 2, vis: u.vis, def: {} }, u, u.hp + 1); continue; }
    u.pos.set(cellX(o), HM[o], cellZ(o)); u.node = o; u.chase = null;
  }
}
const TEXT = {
  tides: { warn: 'LA MAREA SUBE EN 10 S: LOS BAJÍOS SE VAN A CUBRIR', close: 'MAREA ALTA: LOS BAJÍOS ESTÁN CUBIERTOS', open: 'MAREA BAJA: YA SE CRUZA POR LOS BAJÍOS' },
  floods: { warn: 'EL RÍO CRECE: LOS VADOS SE CIERRAN EN 10 S', close: '¡CRECIDA! LOS VADOS ESTÁN CERRADOS', open: 'EL RÍO BAJA: LOS VADOS SE ABREN' },
};
function updateCycle(dt) {
  const c = R.cycle, g = R.gates[0], tx = TEXT[R.on.tides ? 'tides' : 'floods'];
  c.t -= dt;
  if (c.phase === 'warn') { g.layer.visible = true; g.layer.material.opacity = .25 + .25 * Math.sin(performance.now() / 160); }   // el agua empieza a asomar
  if (c.t > 0) return;
  if (c.phase === 'open') { c.phase = 'warn'; c.t = 10; toast(tx.warn, 'bad'); sfx('deny'); }
  else if (c.phase === 'warn') { c.phase = 'closed'; c.t = R.on.tides ? 45 : 60; setGate(g, false); toast(tx.close, 'bad'); }
  else { c.phase = 'open'; c.t = (R.on.tides ? 100 : 130) + Math.random() * 40; setGate(g, true); toast(tx.open, 'good'); }
}

// ---------- puentes ----------
export const BRIDGE_COST = 150;
function makeBridge(site) {
  const xs = site.cells.map(c => c % MW), zs = site.cells.map(c => (c / MW) | 0), x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, z0 = Math.min(...zs), z1 = Math.max(...zs) + 1;
  const b = { kind: 'bridge', x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: 1, cells: site.cells, h0: site.cells.map(c => HM[c]), built: false, name: 'PUENTE', group: new THREE.Group() };
  const g = b.group, L = site.axis === 'x' ? x1 - x0 + 1.5 : z1 - z0 + 1.5, W = site.axis === 'x' ? z1 - z0 : x1 - x0, wood = 0x8a5a34, wood2 = 0x6a4224, stone = 0xa8a49a;
  const P = (w, h, d, c, x, y, z) => site.axis === 'x' ? part(g, w, h, d, c, x, y, z) : part(g, d, h, w, c, z, y, x);
  P(L, .25, W, wood, 0, .88, 0);
  for (let k = 0; k < L; k += 1.1) P(.12, .04, W + .1, wood2, -L / 2 + k, 1.02, 0);   // tablones
  for (const s of [-1, 1]) { P(L, .12, .14, wood2, 0, 1.55, s * (W / 2 - .05)); for (let k = 0; k <= L; k += 2) P(.16, .7, .16, wood2, -L / 2 + k, 1.25, s * (W / 2 - .05)); }
  for (let k = 2; k < L - 1; k += 4) P(.8, 1.8, W - .4, stone, -L / 2 + k, -.1, 0);   // pilares
  bake(g); g.position.set(b.x, 0, b.z); g.visible = false; world.add(g); R.meshes.push(g);
  return b;
}
export function setBridge(b, built) {
  b.built = built; b.group.visible = built;
  b.cells.forEach((c, k) => { HM[c] = built ? 1 : b.h0[k]; });
  refreshCells(b.cells); if (!built) evict(b.cells, true);
  refreshFields();
}
export function buildBridge(side, b) {
  const st = sideState[side];
  if (b.built || st.gold < BRIDGE_COST) { if (side === 0) sfx('deny'); return false; }
  st.gold -= BRIDGE_COST; setBridge(b, true);
  burst(new THREE.Vector3(b.x, 1.5, b.z), [0x8a5a34, 0xffffff, 0xe8c870], 24, 3, 5, 1, .25); ping(new THREE.Vector3(b.x, 1, b.z), '#e8c870');
  toast(side === 0 ? '¡PUENTE CONSTRUIDO!' : 'EL RIVAL HA CONSTRUIDO UN PUENTE', side === 0 ? 'good' : 'bad', b); sfx('capture');
  return true;
}

// ---------- tala del bosque denso ----------
// clic derecho sobre el bosque con tropas: van al borde y, mientras alguna esté al lado, lo talan en unos segundos
export function startChop(x, z, list) {
  if (!R.on.chop || !list.length) return false;
  const cx = Math.floor(x), cz = Math.floor(z), cells = [];
  for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) { const nx = cx + dx, nz = cz + dz; if (nx < 1 || nz < 1 || nx >= MW - 1 || nz >= MD - 1 || dx * dx + dz * dz > 7) continue; const i = idx(nx, nz); if (GEOT[i] === 1) cells.push(i); }
  if (!cells.length) return false;
  const o = nearestOpen(x, z, 12); if (o < 0) return false;
  const side = list[0].side, job = R.jobs.find(j => Math.hypot(j.x - x, j.z - z) < 3) || (R.jobs.push({ x: cx + .5, z: cz + .5, y: HM[cells[0]], cells, t: 0, need: 6, side }), R.jobs[R.jobs.length - 1]);
  orderMove(list, cellX(o), cellZ(o), false);
  if (side === 0) { toast('A TALAR EL BOSQUE: ABRIRÁN UN PASO NUEVO', 'good'); ping(new THREE.Vector3(job.x, job.y, job.z), '#9ad86a'); }
  return true;
}
function updateJobs(dt) {
  for (let k = R.jobs.length - 1; k >= 0; k--) {
    const j = R.jobs[k], near = UGRID.near(j.x, j.z, 4.5, _near).some(u => u.side === j.side && Math.hypot(u.pos.x - j.x, u.pos.z - j.z) < 4.5);
    if (!near) continue;
    j.t += dt;
    if ((j.fx = (j.fx ?? 0) - dt) <= 0) { j.fx = .3; burst(new THREE.Vector3(j.x + Math.random() * 3 - 1.5, j.y + .4, j.z + Math.random() * 3 - 1.5), [0x8a5a34, 0x2f5a35, 0xc8a070], 3, 2, 3, .5, .14); }
    if (j.t >= j.need) {
      removeTrees(j.cells); refreshCells(j.cells); refreshFields(); R.jobs.splice(k, 1);
      if (R.cover) for (const c of j.cells) R.cover[c] = 1;
      burst(new THREE.Vector3(j.x, j.y + 1, j.z), [0x8a5a34, 0x2f5a35], 20, 3, 4, .8, .2);
      if (j.side === 0) { toast('BOSQUE TALADO: HAY UN PASO NUEVO', 'good', j); sfx('capture'); }
    }
  }
}

// ---------- reglas que afectan a cada tropa ----------
// multiplica el daño: emboscada desde lo alto en los barrancos; cobertura contra flechas en el bosque
export function geoDmg(att, tgt) {
  let k = 1;
  if (R.on.canyon && att.node != null && HM[att.node] - HM[tgt.node] >= 2) k *= 1.25;
  if (R.cover && RANGED(att.type) && R.cover[tgt.node]) k *= .7;
  return k;
}
// velocidad: nieve en las cumbres de la cordillera
export const geoSlow = u => R.on.snow && HM[u.node] >= 9 ? .7 : 1;
// en el delta los jinetes se atascan aún más en el pantano
export const swampMounted = () => R.on.swamp ? .32 : .45;
// visión extra desde las alturas de la cordillera
export const visionBonus = u => R.on.highVision && HM[u.node] >= 6 ? 6 : 0;
// ¿está oculta esta tropa para el bando sd? (fondo de barranco o pantano, sin tropas de sd a menos de 7 casillas)
export const hiddenFrom = (u, sd) => !!(u.hid && u.hid[sd]);
function updateHide() {
  for (const u of units) {
    if (u.dead || !R.hide[u.node]) { u.hid = null; continue; }
    const seen = [false, false];
    for (const o of UGRID.near(u.pos.x, u.pos.z, 7, _near)) if (o.side < 2 && o.side !== u.side && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 7) seen[o.side] = true;
    u.hid = [!seen[0] && u.side !== 0, !seen[1] && u.side !== 1];
  }
}
function updateThirst() {
  for (const u of units) {
    if (u.dead || u.side > 1 || u.type === 'god' || R.wet[u.node] || (roadCell && roadCell[u.node])) continue;
    if (u.hp > u.maxHp * .3) { u.hp = Math.max(u.maxHp * .3, u.hp - 1.5); if ((u.thirstFx = (u.thirstFx ?? 0) - 1) <= 0) { u.thirstFx = 3; plume(u.pos.clone().setY(u.pos.y + 2), 0xe8d8a0, .18, .8, 1.2, -.4); } }
    if (u.side === 0 && !R.thirstTold) { R.thirstTold = true; toast('TUS TROPAS PASAN SED LEJOS DEL AGUA: PIERDEN VIDA', 'bad', u.pos); }
  }
}

// ---------- volcán ----------
function updateVolcano(dt) {
  const v = R.volcano, top = new THREE.Vector3(v.x, v.y, v.z);
  if ((v.fx = (v.fx ?? 0) - dt) <= 0) { v.fx = v.phase === 'calm' ? .35 : .08; plume(top.clone().setY(v.y + .5), Math.random() < .5 ? 0x4a4448 : 0x6a6266, v.phase === 'calm' ? 1.2 : 2, 3, 2.5, -.4); if (v.phase !== 'calm') plume(top, Math.random() < .5 ? 0xff7a1a : 0xffc83a, .8, .8, 4, 2); }
  v.t -= dt;
  if (v.phase === 'erupt' && (v.bt = (v.bt ?? 0) - dt) <= 0) {   // bombas de lava alrededor del volcán
    v.bt = .18; const a = Math.random() * 6.28, r = 6 + Math.random() * 26, x = v.x + Math.cos(a) * r, z = v.z + Math.sin(a) * r, i = idx(Math.max(0, Math.min(MW - 1, x | 0)), Math.max(0, Math.min(MD - 1, z | 0)));
    const to = new THREE.Vector3(x, Math.max(0, HM[i]) + .3, z); streak(top, to, 0xff7a1a, .5, .45); R.bombs.push({ to, t: .5 });
  }
  for (let k = R.bombs.length - 1; k >= 0; k--) { const b = R.bombs[k]; if ((b.t -= dt) > 0) continue; R.bombs.splice(k, 1);
    burst(b.to, [0xff7a1a, 0xffc83a, 0x3a3034], 8, 3, 4, .6, .24); plume(b.to, 0x56565c, 1, 1.6, 1.4);
    for (const u of UGRID.near(b.to.x, b.to.z, 2.8, _near)) if (Math.hypot(u.pos.x - b.to.x, u.pos.z - b.to.z) < 2.8) damage({ side: 2, vis: u.vis, def: {} }, u, 40);
  }
  if (v.t > 0) return;
  if (v.phase === 'calm') { v.phase = 'warn'; v.t = 8; toast('¡EL VOLCÁN RUGE! VA A ENTRAR EN ERUPCIÓN', 'bad', v); sfx('deny'); }
  else if (v.phase === 'warn') { v.phase = 'erupt'; v.t = 7; toast('¡ERUPCIÓN! LEJOS DEL VOLCÁN', 'bad', v); }
  else { v.phase = 'calm'; v.t = 160 + Math.random() * 60; }
}

export function updateRules(dt) {
  if (R.cycle) updateCycle(dt);
  if (R.jobs.length) updateJobs(dt);
  if (R.hide && (R.hideT = (R.hideT ?? 0) - dt) <= 0) { R.hideT = .3; updateHide(); }
  if (R.wet && (R.thirstT = (R.thirstT ?? 0) - dt) <= 0) { R.thirstT = 1; updateThirst(); }
  if (R.volcano) updateVolcano(dt);
}
// para pruebas y para el panel: estado de las reglas
export const rulesInfo = () => ({ on: R.on, cycle: R.cycle && { ...R.cycle }, bridges: R.bridges.map(b => b.built), jobs: R.jobs.length, volcano: R.volcano && R.volcano.phase });
