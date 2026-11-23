// Reglas propias de cada geografía: lo que hace que cada mapa se juegue distinto.
// · Río: dos puentes que se pueden construir con oro.          · Cordillera: la nieve frena; desde lo alto se ve más lejos.
// · Archipiélago: mareas que cubren y descubren los bajíos.    · Barrancos: emboscadas desde arriba; en el fondo no se ve a nadie de lejos.
// · Afluentes: crecidas que cierran los vados un rato.        · Delta: los pantanos ocultan a las tropas y atascan a los jinetes.
// · Bosque: se puede talar el bosque denso; dentro, cobertura contra flechas.
// · Desierto: lejos del agua y de los caminos, las tropas pasan sed.   · Caldera: el volcán entra en erupción de vez en cuando.
// · Valle helado: el hielo se rompe si hay demasiadas tropas encima.  · Cañón: tres puentes que se pueden destruir y reparar.
// · Llanura: los jinetes van más rápido.   · Ruinas: tesoros por las calles para el primero que llegue.   · Costa: dos niveles unidos por pocas rampas.
// (Istmo y cordillera colocan además la ciudadela y las atalayas en sus pasos; la meseta tiene tres rampas estrechas.)
import * as THREE from 'three';
import { sfx } from './audio.js';
import { damage } from './combat.js';
import { MD, MW, N, RANGED, idx } from './config.js';
import { orderMove } from './behavior.js';
import { burst, dropBox, ping, plume, takeBox } from './effects.js';
import { refreshFields, toast } from './game.js';
import { GEOT, HM, bridgeSites, geoR, removeTrees, roadCell, scen, spots, treeCell } from './map.js';
import { blocked, cellX, cellZ, nearestOpen, refreshCells } from './nav.js';
import { bake, part, world } from './render.js';
import { UGRID, sideState, units } from './units.js';

export const R = { half: {}, on: {}, gates: [], bridges: [], jobs: [], cycle: null, hide: null, cover: null, wet: null, volcano: null, meshes: [], thirstTold: false };
const _near = [];

// ---------- preparación al empezar cada partida ----------
export function setupRules() {
  for (const m of R.meshes) { world.remove(m); m.traverse(o => { if (o.isMesh && o.userData.own) { o.geometry.dispose(); o.material.dispose(); } }); }
  for (const b of R.bombs || []) if (b.m) dropBox(b.m);
  Object.assign(R, { lava: null, on: {}, gates: [], bridges: [], jobs: [], cycle: null, hide: null, cover: null, wet: null, volcano: null, meshes: [], thirstTold: false, bombs: [], breaks: [], treasures: null });
  const on = R.on;
  on.bridges = bridgeSites.length > 0;
  // en una mezcla, cada regla vale solo en la mitad de su geografía
  const has = k => scen === k || !!geoR?.mix?.includes(k);
  R.half = {}; for (const k of geoR?.mix || []) { const w = geoR.mix[0] === k; R.half[k] = (x, z) => (x < geoR.seam(z)) === w; }
  const inK = (k, i) => !R.half[k] || R.half[k](i % MW + .5, ((i / MW) | 0) + .5);
  on.snow = has('cordillera'); on.highVision = has('cordillera');
  on.tides = has('archipielago'); on.floods = has('afluentes');
  on.canyon = has('barrancos'); on.swamp = has('delta');
  on.chop = has('bosque'); on.cover = has('bosque');
  on.thirst = has('oasis'); on.volcano = has('lago') && !!geoR?.volcano;
  on.ice = has('helado'); on.plains = has('llanura'); on.treasures = has('ruinas');
  // casillas donde las tropas se ocultan: el fondo de los barrancos y los pantanos del delta
  if (on.canyon || on.swamp) { R.hide = new Uint8Array(N); for (let i = 0; i < N; i++) if ((on.canyon && HM[i] === 1 && inK('barrancos', i)) || (on.swamp && GEOT[i] === 2 && inK('delta', i))) R.hide[i] = 1; }
  // cobertura: junto al bosque denso o entre árboles
  if (on.cover) { R.cover = new Uint8Array(N); for (let z = 1; z < MD - 1; z++) for (let x = 1; x < MW - 1; x++) { const i = idx(x, z); if (treeCell[i] || [-1, 0, 1].some(dz => [-1, 0, 1].some(dx => GEOT[idx(x + dx, z + dz)] === 1))) R.cover[i] = 1; } }
  // agua en el desierto: a menos de 12 casillas de un oasis, del agua o de una fortaleza no hay sed
  if (on.thirst) { R.wet = wetMap(12); if (R.half.oasis) for (let i = 0; i < N; i++) if (!inK('oasis', i)) R.wet[i] = 1; }
  // mareas (bajíos del archipiélago) y crecidas (vados de los afluentes): grupos de casillas que se cierran a ratos
  if (on.tides || on.floods) {
    const cells = [];
    for (let z = 1; z < MD - 1; z++) for (let x = 1; x < MW - 1; x++) { const i = idx(x, z);
      if (on.tides ? GEOT[i] === 2 && HM[i] === 1 && inK('archipielago', i) : HM[i] === 1 && GEOT[i] === 0 && inK('afluentes', i) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => HM[idx(x + a, z + b)] <= 0)) cells.push(i); }
    if (cells.length) { const g = { cells, open: true, layer: waterLayer(cells) }; R.gates.push(g); R.cycle = { phase: 'open', t: on.tides ? 100 : 140 }; }
  }
  for (const b of bridgeSites) { const br = makeBridge(b); R.bridges.push(br); if (b.built) { br.built = true; br.group.visible = true; } }
  R.breaks = [];
  if (on.treasures) R.treasures = (geoR.treasures || []).map(([x, z]) => makeChest(x, z));
  if (on.volcano) {   // lava en el cráter (brilla siempre) y humo constante
    const [x, z] = geoR.volcano, y = HM[idx(Math.floor(x), Math.floor(z))]; R.volcano = { x, z, y: y + 1, t: 150, phase: 'calm' };
    const lava = R.lava = new THREE.Mesh(new THREE.BoxGeometry(2.6, .2, 2.6), new THREE.MeshBasicMaterial({ color: 0xff7a1a })); lava.position.set(Math.floor(x) + .5, y + .12, Math.floor(z) + .5); lava.userData.own = true; world.add(lava); R.meshes.push(lava);
  }
}
// distancia (en casillas, sin obstáculos) al agua, a los oasis y a las fortalezas, hasta r
function wetMap(r) {
  const d = new Uint8Array(N).fill(255), q = [];
  for (let i = 0; i < N; i++) if (HM[i] <= 0 || GEOT[i] === 4) { d[i] = 0; q.push(i); }
  for (const s of spots) { if (s.kind !== 'base' && s.kind !== 'town') continue; const R2 = s.kind === 'base' ? 24 : 12;   // fortalezas y pueblos tienen pozos
    for (let dz = -R2; dz <= R2; dz++) for (let dx = -R2; dx <= R2; dx++) { const x = Math.floor(s.x) + dx, z = Math.floor(s.z) + dz; if (x >= 0 && z >= 0 && x < MW && z < MD && dx * dx + dz * dz < R2 * R2) { const i = idx(x, z); if (d[i]) { d[i] = 0; q.push(i); } } } }
  for (let h = 0; h < q.length; h++) { const v = q[h], x = v % MW, z = (v / MW) | 0; if (d[v] >= r) continue;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + a, nz = z + b; if (nx < 0 || nz < 0 || nx >= MW || nz >= MD) continue; const j = idx(nx, nz); if (d[j] > d[v] + 1) { d[j] = d[v] + 1; q.push(j); } } }
  const w = new Uint8Array(N); for (let i = 0; i < N; i++) w[i] = d[i] <= r ? 1 : 0; return w;
}
// capa de agua sobre unas casillas (se ve cuando están cerradas)
function waterLayer(cells, color = 0x5fb0d4) {
  const p = [], ix = [];
  for (const c of cells) { const x = c % MW, z = (c / MW) | 0, y = HM[c] + .07, v = p.length / 3; p.push(x, y, z, x + 1, y, z, x + 1, y, z + 1, x, y, z + 1); ix.push(v, v + 2, v + 1, v, v + 3, v + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(ix); g.computeBoundingSphere();
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .92, depthWrite: false })); m.visible = false; m.userData.own = true; m.renderOrder = 1;
  world.add(m); R.meshes.push(m); return m;
}

// ---------- casillas que se abren y se cierran ----------
function setGate(g, open, drown = false) {
  g.open = open; g.layer.visible = !open; g.layer.material.opacity = .92;
  for (const c of g.cells) blocked[c] = open ? 0 : 1;
  refreshCells(g.cells);
  if (!open) evict(g.cells, drown);
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
  const hb = site.h ?? 1, b = { kind: 'bridge', x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: hb, hb, cells: site.cells, h0: site.cells.map(c => site.h0 ?? HM[c]), built: false, breakable: !!site.breakable, name: 'PUENTE', group: new THREE.Group() };
  const g = b.group, L = site.axis === 'x' ? x1 - x0 + 1.5 : z1 - z0 + 1.5, W = site.axis === 'x' ? z1 - z0 : x1 - x0, wood = 0x8a5a34, wood2 = 0x6a4224, stone = 0xa8a49a;
  const P = (w, h, d, c, x, y, z) => site.axis === 'x' ? part(g, w, h, d, c, x, y, z) : part(g, d, h, w, c, z, y, x);
  P(L, .25, W, wood, 0, .88, 0);
  for (let k = 0; k < L; k += 1.1) P(.12, .04, W + .1, wood2, -L / 2 + k, 1.02, 0);   // tablones
  for (const s of [-1, 1]) { P(L, .12, .14, wood2, 0, 1.55, s * (W / 2 - .05)); for (let k = 0; k <= L; k += 2) P(.16, .7, .16, wood2, -L / 2 + k, 1.25, s * (W / 2 - .05)); }
  for (let k = 2; k < L - 1; k += 4) P(.8, 1.8 + hb, W - .4, stone, -L / 2 + k, .8 - (1.8 + hb) / 2, 0);   // pilares hasta el agua
  bake(g); g.position.set(b.x, hb - 1, b.z); g.visible = false; world.add(g); R.meshes.push(g);
  return b;
}
export function setBridge(b, built) {
  b.built = built; b.group.visible = built;
  b.cells.forEach((c, k) => { HM[c] = built ? b.hb : b.h0[k]; });
  refreshCells(b.cells); if (!built) evict(b.cells, true);
  refreshFields();
}
export function buildBridge(side, b) {
  const st = sideState[side];
  if (b.built || st.gold < BRIDGE_COST) { if (side === 0) sfx('deny'); return false; }
  st.gold -= BRIDGE_COST; setBridge(b, true);
  burst(new THREE.Vector3(b.x, 1.5, b.z), [0x8a5a34, 0xffffff, 0xe8c870], 24, 3, 5, 1, .25); ping(new THREE.Vector3(b.x, 1, b.z), '#e8c870');
  toast(side === 0 ? (b.breakable ? '¡PUENTE REPARADO!' : '¡PUENTE CONSTRUIDO!') : 'EL RIVAL HA CONSTRUIDO UN PUENTE', side === 0 ? 'good' : 'bad', b); sfx('capture');
  return true;
}

// cañón: destruir un puente propio (hace falta una tropa tuya cerca y que quede al menos otro en pie)
export const canBreak = (side, b) => b.breakable && b.built && R.bridges.some(o => o !== b && o.built) && units.some(u => u.side === side && Math.hypot(u.pos.x - b.x, u.pos.z - b.z) < 12);
export function breakBridge(side, b) {
  if (!canBreak(side, b)) { if (side === 0) sfx('deny'); return false; }
  setBridge(b, false);
  burst(new THREE.Vector3(b.x, b.hb, b.z), [0x8a5a34, 0x6a4224, 0xa8a49a], 30, 4, 4, 1.2, .3); plume(new THREE.Vector3(b.x, b.hb, b.z), 0x8a8a86, 1.4, 1.6);
  toast(side === 0 ? 'HAS DESTRUIDO EL PUENTE' : '¡EL RIVAL HA DESTRUIDO UN PUENTE!', side === 0 ? 'good' : 'bad', b); sfx('lost');
  return true;
}

// ---------- hielo que se rompe ----------
// si diez tropas o más pisan el mismo trozo de hielo, cruje dos segundos y se rompe: quien esté encima cae al agua. Vuelve a helarse en 90 s
function updateIce(dt) {
  for (let k = R.breaks.length - 1; k >= 0; k--) {
    const b = R.breaks[k]; b.t -= dt;
    if (b.phase === 'crack') { if ((b.fx = (b.fx ?? 0) - dt) <= 0) { b.fx = .15; burst(new THREE.Vector3(b.x + Math.random() * 8 - 4, 1.1, b.z + Math.random() * 8 - 4), [0xffffff, 0xbcd8e8], 3, 2, 2, .4, .16); }
      if (b.t <= 0) { b.phase = 'broken'; b.t = 90; b.gate = { cells: b.cells, open: true, layer: waterLayer(b.cells, 0x3a7aa8) }; setGate(b.gate, false, true); burst(new THREE.Vector3(b.x, 1.2, b.z), [0xffffff, 0xbcd8e8, 0x3a7aa8], 40, 4, 5, 1, .26); sfx('lost'); } }
    else if (b.t <= 0) { setGate(b.gate, true); world.remove(b.gate.layer); b.gate.layer.geometry.dispose(); b.gate.layer.material.dispose(); R.breaks.splice(k, 1); }
  }
  if ((R.iceT = (R.iceT ?? 0) - dt) > 0) return; R.iceT = .5;
  for (const u of units) {
    if (u.dead || GEOT[u.node] !== 6 || R.breaks.some(b => Math.hypot(b.x - u.pos.x, b.z - u.pos.z) < 10)) continue;
    const on = UGRID.near(u.pos.x, u.pos.z, 5, _near).filter(o => GEOT[o.node] === 6 && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 5);
    if (on.length < 10) continue;
    const cx = Math.floor(u.pos.x), cz = Math.floor(u.pos.z), cells = [];
    for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) { const x = cx + dx, z = cz + dz; if (x >= 0 && z >= 0 && x < MW && z < MD && dx * dx + dz * dz <= 36 && GEOT[idx(x, z)] === 6) cells.push(idx(x, z)); }
    R.breaks.push({ x: u.pos.x, z: u.pos.z, cells, t: 2, phase: 'crack' });
    if (on.some(o => o.side === 0) || u.vis) toast('¡EL HIELO SE AGRIETA! SALID DE AHÍ', 'bad', u.pos);
  }
}

// ---------- tesoros de las ruinas ----------
function makeChest(x, z) {
  const g = new THREE.Group(), y = HM[idx(Math.floor(x), Math.floor(z))];
  part(g, .9, .5, .6, 0x7a4a24, 0, .25, 0); part(g, .94, .2, .64, 0x5a3418, 0, .58, 0); part(g, .2, .2, .1, 0xffc83a, 0, .4, .32); part(g, .5, .12, .3, 0xffd23f, 0, .72, 0);
  bake(g); g.position.set(x, y, z); world.add(g); R.meshes.push(g);
  return { x, z, y, g, taken: false };
}
function updateTreasures() {
  for (const t of R.treasures) {
    if (t.taken) continue;
    if ((t.fx = (t.fx ?? 0) - .25) <= 0) { t.fx = 1.2; plume(new THREE.Vector3(t.x, t.y + 1, t.z), 0xffe9a0, .18, .9, 1.4, -.6); }   // brillo
    const u = UGRID.near(t.x, t.z, 1.8, _near).find(o => o.side < 2 && Math.hypot(o.pos.x - t.x, o.pos.z - t.z) < 1.8); if (!u) continue;
    t.taken = true; t.g.visible = false; sideState[u.side].gold += TREASURE;
    burst(new THREE.Vector3(t.x, t.y + .5, t.z), [0xffd23f, 0xffffff, 0xe8c870], 24, 3, 5, 1, .22);
    toast(u.side === 0 ? `¡TESORO ENCONTRADO! +${TREASURE} ORO` : 'EL RIVAL HA ENCONTRADO UN TESORO', u.side === 0 ? 'good' : 'bad', t); if (u.side === 0) sfx('capture');
  }
}
export const TREASURE = 80;
// llanura abierta: los jinetes van un 15 % más rápido
export const geoSpeed = u => R.on.plains && (!R.half.llanura || R.half.llanura(u.pos.x, u.pos.z)) && (u.type === 'horse' || u.type === 'harcher' || (u.type === 'hero' && u.def.speed >= 4.5)) ? 1.15 : 1;

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
  if (R.on.canyon && att.node != null && HM[att.node] - HM[tgt.node] >= 2 && (!R.half.barrancos || R.half.barrancos(tgt.pos.x, tgt.pos.z))) k *= 1.25;
  if (R.cover && RANGED(att.type) && R.cover[tgt.node]) k *= .7;
  return k;
}
// velocidad: nieve en las cumbres de la cordillera
export const geoSlow = u => R.on.snow && HM[u.node] >= 9 ? .7 : 1;
// en el delta los jinetes se atascan aún más en el pantano
export const swampMounted = () => R.on.swamp ? .32 : .45;
// visión extra desde las alturas de la cordillera
export const visionBonus = u => R.on.highVision && HM[u.node] >= 6 && (!R.half.cordillera || R.half.cordillera(u.pos.x, u.pos.z)) ? 6 : 0;
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
  // humo siempre; al rugir, más humo y chispas; en erupción, columna de lava y nube negra (se ven aunque el volcán esté en la niebla)
  if ((v.fx = (v.fx ?? 0) - dt) <= 0) { const e = v.phase === 'erupt', w = v.phase === 'warn'; v.fx = e ? .05 : w ? .1 : .35;
    plume(top.clone().setY(v.y + .5), Math.random() < .5 ? 0x3a3438 : 0x6a6266, e ? 3.2 : w ? 2 : 1.2, e ? 4 : 3, e ? 6 : 2.5, -.4, true);
    if (w) burst(top, [0xff7a1a, 0xffc83a], 2, 1.5, 4, .6, .25, true);
    if (e) { burst(top, [0xff7a1a, 0xffc83a, 0xff4a1a], 7, 3, 12, 1.4, .45, true); plume(top.clone().setY(v.y + 3), 0xff7a1a, 1.4, .7, 7, 2, true); } }
  if (R.lava) { const k = v.phase === 'erupt' ? 1.6 + Math.sin(performance.now() / 60) * .3 : v.phase === 'warn' ? 1.2 + Math.sin(performance.now() / 90) * .2 : 1; R.lava.scale.set(k, 1 + (k - 1) * 4, k); }
  v.t -= dt;
  if (v.phase === 'erupt' && (v.bt = (v.bt ?? 0) - dt) <= 0) {   // bombas de lava alrededor del volcán
    v.bt = .18; const a = Math.random() * 6.28, r = 6 + Math.random() * 26, x = v.x + Math.cos(a) * r, z = v.z + Math.sin(a) * r, i = idx(Math.max(0, Math.min(MW - 1, x | 0)), Math.max(0, Math.min(MD - 1, z | 0)));
    const to = new THREE.Vector3(x, Math.max(0, HM[i]) + .3, z), T = 1.4, m = takeBox(Math.random() < .5 ? 0xff7a1a : 0xffc83a);   // bomba de lava en arco
    m.scale.setScalar(.7); m.position.copy(top); R.bombs.push({ to, t: T, m, v: new THREE.Vector3((to.x - top.x) / T, (to.y - top.y + 4.5 * T * T) / T, (to.z - top.z) / T) });
  }
  for (let k = R.bombs.length - 1; k >= 0; k--) { const b = R.bombs[k];
    if (b.m) { b.v.y -= 9 * dt; b.m.position.addScaledVector(b.v, dt); b.m.rotation.x += dt * 6; if ((b.tr = (b.tr ?? 0) - dt) <= 0) { b.tr = .06; plume(b.m.position.clone(), 0x4a4448, .45, .8, .6, -.2, true); } }
    if ((b.t -= dt) > 0) continue; R.bombs.splice(k, 1); if (b.m) dropBox(b.m);
    burst(b.to, [0xff7a1a, 0xffc83a, 0x3a3034], 12, 4, 5, .8, .3, true); plume(b.to, 0x56565c, 1.4, 1.8, 1.4, -.6, true);
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
  if (R.on.ice) updateIce(dt);
  if (R.treasures && (R.trT = (R.trT ?? 0) - dt) <= 0) { R.trT = .25; updateTreasures(); }
}
// para pruebas y para el panel: estado de las reglas
export const rulesInfo = () => ({ on: R.on, cycle: R.cycle && { ...R.cycle }, bridges: R.bridges.map(b => b.built), jobs: R.jobs.length, volcano: R.volcano && R.volcano.phase });
