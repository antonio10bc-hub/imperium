// Reglas propias de cada geografía: lo que hace que cada mapa se juegue distinto.
// · Río: dos puentes que se pueden construir con oro.          · Cordillera: la nieve frena; desde lo alto se ve más lejos.
// · Archipiélago: mareas que cubren y descubren los bajíos.    · Barrancos: en el fondo no se ve a nadie de lejos.
// · Afluentes: crecidas que cierran los vados un rato.        · Delta: los pantanos ocultan a las tropas y atascan a los jinetes.
// · Bosque: se puede talar el bosque denso; dentro, cobertura contra flechas.
// · Desierto: lejos del agua y de los caminos, las tropas pasan sed.   · Caldera: el volcán entra en erupción de vez en cuando.
// · Valle helado: el hielo se rompe si hay demasiadas tropas encima.  · Cañón: tres puentes que se pueden destruir y reparar.
// · Ruinas: tesoros por las calles para el primero que llegue.   · Costa: dos niveles unidos por pocas rampas y, a veces, un tsunami.
// · Caldera: en cada erupción, además, una roca enorme cae en un punto del mapa sin edificios.
// (Istmo y cordillera colocan además la ciudadela y las atalayas en sus pasos; la meseta tiene tres rampas estrechas.)
import * as THREE from 'three';
import { sfx } from './audio.js';
import { alarm, damage, shoot } from './combat.js';
import { MD, MW, N, NEU, NP, RANGED, TEAM, idx, players } from './config.js';
import { orderMove } from './behavior.js';
import { burst, dropBox, ping, plume, takeBox } from './effects.js';
import { refreshFields, toast } from './game.js';
import { GEOT, HM, bridgeSites, geoR, removeTrees, roadCell, scen, spots, treeCell } from './map.js';
import { bfs, blocked, cellX, cellZ, nearestOpen, refreshCells } from './nav.js';
import { bake, fogU, mat, part, world } from './render.js';
import { exploredAt } from './fog.js';
import { UGRID, followField, sideState, stepToward, units } from './units.js';

export const R = { debris: [], half: {}, on: {}, gates: [], bridges: [], jobs: [], cycle: null, hide: null, cover: null, wet: null, volcano: null, meshes: [], thirstTold: false };
const _near = [];

// ---------- preparación al empezar cada partida ----------
export function setupRules() {
  for (const m of R.meshes) { world.remove(m); m.traverse(o => { if (o.isMesh && o.userData.own) { o.geometry.dispose(); o.material.dispose(); } }); }
  for (const b of R.bombs || []) if (b.m) dropBox(b.m);
  for (const d of R.debris || []) dropBox(d.m);
  Object.assign(R, { debris: [], lava: null, on: {}, gates: [], bridges: [], jobs: [], cycle: null, hide: null, cover: null, wet: null, volcano: null, meshes: [], thirstTold: false, bombs: [], breaks: [], treasures: null });
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
  on.ice = has('helado'); on.treasures = has('ruinas') || has('bosque'); on.tsunami = has('costa');
  R.tsunami = on.tsunami ? { phase: 'calm', t: 200 + Math.random() * 60, n: 0 } : null; R.rock = null; R.tsuMesh = null;
  // casillas donde las tropas se ocultan: el fondo de los barrancos y los pantanos del delta
  if (on.canyon || on.swamp) { R.hide = new Uint8Array(N); for (let i = 0; i < N; i++) if ((on.canyon && HM[i] === 1 && inK('barrancos', i)) || (on.swamp && GEOT[i] === 2 && inK('delta', i))) R.hide[i] = 1; }
  // cobertura: junto al bosque denso o entre árboles
  if (on.cover) { R.cover = new Uint8Array(N); for (let z = 1; z < MD - 1; z++) for (let x = 1; x < MW - 1; x++) { const i = idx(x, z); if (treeCell[i] || [-1, 0, 1].some(dz => [-1, 0, 1].some(dx => GEOT[idx(x + dx, z + dz)] === 1 || GEOT[idx(x + dx, z + dz)] === 16))) R.cover[i] = 1; } }
  // agua en el desierto: a menos de 12 casillas de un oasis, del agua o de una fortaleza no hay sed
  if (on.thirst) { R.wet = wetMap(12); if (R.half.oasis) for (let i = 0; i < N; i++) if (!inK('oasis', i)) R.wet[i] = 1; }
  // mareas (bajíos del archipiélago) y crecidas (vados de los afluentes): grupos de casillas que se cierran a ratos
  if (on.tides || on.floods) {
    const cells = [];
    for (let z = 1; z < MD - 1; z++) for (let x = 1; x < MW - 1; x++) { const i = idx(x, z);
      if (on.tides ? GEOT[i] === 2 && HM[i] === 1 && inK('archipielago', i) : GEOT[i] === 13 && inK('afluentes', i)) cells.push(i); }
    if (cells.length) { const g = { cells, open: true, layer: waterLayer(cells), marks: gateMarks(cells) }; R.gates.push(g); R.cycle = { phase: 'open', t: on.tides ? 100 : 140 }; }
  }
  for (const b of bridgeSites) { const br = makeBridge(b); R.bridges.push(br); if (b.built) { br.built = true; br.group.visible = true; } }
  R.breaks = [];
  if (on.treasures) R.treasures = (geoR.treasures || []).map(([x, z]) => Object.assign(makeChest(x, z), { value: scen === 'bosque' || (geoR.mix && R.half.bosque?.(x, z)) ? 150 : 80 }));
  if (on.volcano) {   // lava en el cráter (brilla siempre) y humo constante
    const [x, z] = geoR.volcano, y = HM[idx(Math.floor(x), Math.floor(z))]; R.volcano = { x, z, y: y + 1, t: 150, phase: 'calm' };
    const lava = R.lava = new THREE.Mesh(new THREE.BoxGeometry(5.5, .3, 5.5), new THREE.MeshBasicMaterial({ color: 0xff7a1a })); lava.position.set(Math.floor(x) + .5, y + .12, Math.floor(z) + .5); lava.userData.own = true; world.add(lava); R.meshes.push(lava);
  }
}
// centro de cada paso (vado o bajío) para marcarlo con una X pequeña mientras está cortado
function gateMarks(cells) {
  const B = new Map();
  for (const i of cells) { const x = i % MW, z = (i / MW) | 0, k = ((x / 14) | 0) + ',' + ((z / 14) | 0); let b = B.get(k); if (!b) B.set(k, b = { x: 0, z: 0, n: 0 }); b.x += x + .5; b.z += z + .5; b.n++; }
  return [...B.values()].filter(b => b.n >= 6).map(b => ({ x: b.x / b.n, z: b.z / b.n }));
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
  const mt = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .92, depthWrite: false });
  mt.onBeforeCompile = sh => {   // donde no se ha explorado, el agua no se ve (la niebla la tapa)
    sh.uniforms.uFog = fogU.uFog;
    sh.vertexShader = 'varying vec2 vFogP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vFogP = (modelMatrix * vec4(transformed, 1.)).xz;');
    sh.fragmentShader = 'uniform sampler2D uFog; varying vec2 vFogP;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>\n  gl_FragColor.a *= smoothstep(.3, .47, texture2D(uFog, vFogP / vec2(${MW}., ${MD}.)).r);`);
  };
  const m = new THREE.Mesh(g, mt); m.visible = false; m.userData.own = true; m.renderOrder = 1;
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
    if (o < 0) { damage({ side: NEU, vis: u.vis, def: {} }, u, u.hp + 1); continue; }
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
  if (c.phase === 'warn') { g.layer.visible = true; g.layer.material.opacity = .25 + .25 * Math.sin(performance.now() / 160);   // el agua empieza a asomar
    if ((c.fx = (c.fx ?? 0) - dt) <= 0) { c.fx = .3; for (const m of g.marks || []) if (exploredAt(m.x, m.z)) burst(new THREE.Vector3(m.x + (Math.random() - .5) * 6, HM[idx(m.x | 0, m.z | 0)] + .4, m.z + (Math.random() - .5) * 6), [0xffffff, 0xbfe4f4, 0x5fb0d4], 3, 1.5, 2.5, .5, .18); } }   // espuma: el agua sube
  if (c.t > 0) return;
  if (c.phase === 'open') { c.phase = 'warn'; c.t = 10; toast(tx.warn, 'bad'); const m = g.marks?.find(q => exploredAt(q.x, q.z)) || g.marks?.[0]; if (m) scenEvent(m.x, m.z, false); }
  else if (c.phase === 'warn') { c.phase = 'closed'; c.t = R.on.tides ? 45 : 60; setGate(g, false); toast(tx.close, 'bad'); for (const m of g.marks || []) if (exploredAt(m.x, m.z)) { burst(new THREE.Vector3(m.x, HM[idx(m.x | 0, m.z | 0)] + .6, m.z), [0xffffff, 0xbfe4f4, 0x5fb0d4], 16, 3, 4, .8, .24); plume(new THREE.Vector3(m.x, 1, m.z), 0xe8f0f8, 1.2, 1.2, 1, -.3); } }
  else { c.phase = 'open'; c.t = (R.on.tides ? 100 : 130) + Math.random() * 40; setGate(g, true); toast(tx.open, 'good'); }
}

// ---------- puentes ----------
export const BRIDGE_COST = 120;
// tres estilos en el cañón: de piedra con arcos (aguanta mucho), fortificado con dos torres que disparan (se conquista) y colgante (cae antes y se balancea)
const BRIDGE_HP = { stone: 900, fort: 650, rope: 280, wood: 450 };
function makeBridge(site) {
  const xs = site.cells.map(c => c % MW), zs = site.cells.map(c => (c / MW) | 0), x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, z0 = Math.min(...zs), z1 = Math.max(...zs) + 1;
  const style = site.style || 'wood', hb = site.h ?? 1, b = { kind: 'bridge', style, x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: hb, hb, x0, x1, z0, z1, cells: site.cells, h0: site.cells.map(c => site.h0 ?? HM[c]), built: false, breakable: !!site.breakable,
    name: { stone: 'PUENTE DE PIEDRA', fort: 'PUENTE FORTIFICADO', rope: 'PUENTE COLGANTE', wood: 'PUENTE' }[style], hp: BRIDGE_HP[style], maxHp: BRIDGE_HP[style], owner: -1, cap: [0, 0, 0, 0, 0], towerCd: 0, roofs: [], group: new THREE.Group() };
  const g = b.group, L = site.axis === 'x' ? x1 - x0 + .4 : z1 - z0 + .4, W = site.axis === 'x' ? z1 - z0 : x1 - x0, wood = 0x8a5a34, wood2 = 0x6a4224, stone = 0xb0aca0, stone2 = 0x8e8a80, rope = 0xc8b080;
  const P = (w, h, d, c, x, y, z, hull = true) => site.axis === 'x' ? part(g, w, h, d, c, x, y, z, hull) : part(g, d, h, w, c, z, y, x, hull);
  const deep = 1.8 + hb;
  if (style === 'rope') {   // colgante: tablones con huecos, cuerdas y postes altos en cada extremo; se comba en el centro
    for (let k = 0; k < L; k += .7) { const t = k / L, sag = -Math.sin(t * Math.PI) * .45; P(.55, .14, W - .3, k % 1.4 < .7 ? wood : 0x9a6a3e, -L / 2 + k, .9 + sag, 0); }
    for (const sd of [-1, 1]) { for (let k = 0; k < L; k += .7) { const t = k / L, sag = -Math.sin(t * Math.PI) * .45; P(.7, .06, .06, rope, -L / 2 + k, 1.7 + sag * .8, sd * (W / 2 - .1), false); if (Math.round(k / .7) % 3 === 0) P(.05, .8, .05, rope, -L / 2 + k, 1.3 + sag, sd * (W / 2 - .1), false); }
      for (const e of [-1, 1]) P(.35, 3, .35, wood2, e * (L / 2 + .2), 1.4, sd * (W / 2 + .1)); }
  } else {   // piedra (o madera en el río): tablero ancho, pretiles y pilares con arcos hasta el agua
    const deck = style === 'wood' ? wood : stone;
    P(L, .35, W, deck, 0, .85, 0);
    if (style === 'wood') for (let k = 0; k < L; k += 1.1) P(.12, .04, W + .1, wood2, -L / 2 + k, 1.04, 0);
    else for (let k = 0; k < L; k += 1.6) P(.06, .03, W, stone2, -L / 2 + k, 1.04, 0);   // losas
    for (const sd of [-1, 1]) { P(L, .55, .35, style === 'wood' ? wood2 : stone2, 0, 1.3, sd * (W / 2 - .15)); if (style !== 'wood') for (let k = 0; k < L; k += 1.4) P(.5, .3, .4, stone2, -L / 2 + k, 1.7, sd * (W / 2 - .15)); }
    for (let k = 3; k < L - 2; k += 5) { P(1.2, deep, W - .2, style === 'wood' ? stone : stone2, -L / 2 + k, .7 - deep / 2, 0); if (style !== 'wood') { P(3.8, .5, W - .3, stone, -L / 2 + k + 2.5, .4, 0); P(2.2, .5, W - .3, stone, -L / 2 + k + 2.5, .05, 0); } }   // pilares y arcos
    for (const e of [-1, 1]) for (const sd of [-1, 1]) { P(.3, 1.4, .3, 0x3a3a44, e * (L / 2 - .3), 1.7, sd * (W / 2 - .15)); P(.4, .35, .4, 0xffd86a, e * (L / 2 - .3), 2.5, sd * (W / 2 - .15), false); }   // farolas
    if (style === 'fort') for (const sd of [-1, 1]) {   // dos torres en el centro, una a cada lado
      P(2, 4.6, 1.8, stone, 0, 2.9, sd * (W / 2 + .7)); P(2.4, .5, 2.2, stone2, 0, 5.3, sd * (W / 2 + .7));
      for (const q of [-1, 1]) P(.5, .5, .5, stone2, q * .8, 5.8, sd * (W / 2 + .7));
      b.roofs.push(P(1.4, .9, 1.3, 0xd8d4c4, 0, 6.2, sd * (W / 2 + .7), false)); b.roofs.push(P(.1, 1.4, .1, 0x5a3a24, 0, 7.3, sd * (W / 2 + .7), false));
      P(1.4, 2.2, .3, stone, 0, 2.2, sd * (W / 2 - .2));   // arco sobre el tablero
    }
  }
  bake(g, new Set(b.roofs)); g.position.set(b.x, hb - 1, b.z); g.visible = false; world.add(g); R.meshes.push(g);
  b.tower = new THREE.Vector3(b.x, hb + 5.5, b.z);
  return b;
}
export function setBridge(b, built) {
  b.built = built; b.group.visible = built; if (built) { b.hp = b.maxHp; b.group.position.y = b.hb - 1; b.group.rotation.set(0, 0, 0); }
  b.cells.forEach((c, k) => { HM[c] = built ? b.hb : b.h0[k]; if (b.breakable) blocked[c] = built ? 0 : 1; });   // en el cañón, sin puente no se pisa el fondo
  refreshCells(b.cells); if (!built) evict(b.cells, true);
  refreshFields();
}
export function buildBridge(side, b) {
  const st = sideState[side];
  if (b.built || st.gold < BRIDGE_COST) { if (side === 0) sfx('deny'); return false; }
  st.gold -= BRIDGE_COST; setBridge(b, true);
  burst(new THREE.Vector3(b.x, b.hb + .5, b.z), [0x8a5a34, 0xffffff, 0xe8c870], 24, 3, 5, 1, .25); ping(new THREE.Vector3(b.x, b.hb, b.z), '#e8c870');
  toast(side === 0 ? (b.breakable ? '¡PUENTE REPARADO!' : '¡PUENTE CONSTRUIDO!') : 'EL RIVAL HA CONSTRUIDO UN PUENTE', side === 0 ? 'good' : 'bad', b); sfx('build', side);
  return true;
}
// el último puente en pie del cañón no se puede derribar (si no, el mapa quedaría partido)
export const lastBridge = b => b.breakable && !R.bridges.some(o => o !== b && o.built);
// las tropas golpean el puente (clic derecho sobre él); al llegar a 0 se derrumba
export function hitBridge(u, b, dt) {
  if (!b.built) { u.order = null; return; }
  const ends = [[b.x0 - 1.2, b.z], [b.x1 + 1.2, b.z]], [ex, ez] = Math.hypot(u.pos.x - ends[0][0], u.pos.z - ends[0][1]) < Math.hypot(u.pos.x - ends[1][0], u.pos.z - ends[1][1]) ? ends[0] : ends[1];
  const onDeck = u.pos.x > b.x0 - 1 && u.pos.x < b.x1 + 1 && Math.abs(u.pos.z - b.z) < (b.z1 - b.z0) / 2 + 1.5, reach = RANGED(u.type) ? 7 : 2.2;
  if (!onDeck && Math.hypot(u.pos.x - ex, u.pos.z - ez) > reach) {
    if (!u.order.f || u.order.end !== ex) { u.order.end = ex; u.order.f = bfs([nearestOpen(ex, ez, 6)]); }
    if (!followField(u, u.order.f, dt)) stepToward(u, ex, ez, u.def.speed, dt); return;
  }
  u.fwd.set(b.x - u.pos.x, 0, b.z - u.pos.z).normalize();
  if (u.cd > 0) return;
  u.cd = u.def.cd; u.lunge = 1;
  if (lastBridge(b)) { if (u.side === 0 && !b.toldLast) { b.toldLast = true; toast('ES EL ÚLTIMO PUENTE: NO SE PUEDE DERRIBAR', 'bad', b); } u.order = null; return; }
  b.hitAt = performance.now(); if (b.hitAt - (b.warnAt || -1e9) > 10000 && exploredAt(b.x, b.z)) { b.warnAt = b.hitAt; scenEvent(b.x, b.z, true); }
  b.hp -= u.def.dmg * (RANGED(u.type) ? .35 : 1) * (u.type === 'hero' || u.type === 'god' || u.type === 'titan' ? 1.5 : 1);
  burst(new THREE.Vector3(ex + (b.x - ex) * .1, b.hb + .6, b.z + (Math.random() - .5) * 2), b.style === 'rope' ? [0x8a5a34, 0xc8b080] : [0xb0aca0, 0x8e8a80, 0x8a5a34], 3, 2, 3, .5, .16);
  if (b.hp <= 0) breakBridge(u.side, b);
}
export function breakBridge(side, b) {
  if (!b.built || lastBridge(b)) { if (side === 0) sfx('deny'); return false; }
  setBridge(b, false); b.group.visible = true; b.fallT = .7;   // se hunde y luego se esconde
  // derrumbe: trozos del puente caen al agua y salpican
  const cols = b.style === 'rope' ? [0x8a5a34, 0x6a4224, 0xc8b080] : b.style === 'wood' ? [0x8a5a34, 0x6a4224] : [0xb0aca0, 0x8e8a80, 0x9a968c];
  for (let k = 0; k < 34; k++) { const m = takeBox(cols[k % cols.length]), sz = .3 + Math.random() * .5; m.visible = exploredAt(b.x, b.z); m.scale.set(sz * (1 + Math.random()), sz * .6, sz); m.position.set(b.x0 + Math.random() * (b.x1 - b.x0), b.hb + .3, b.z + (Math.random() - .5) * (b.z1 - b.z0));
    R.debris.push({ m, v: new THREE.Vector3((Math.random() - .5) * 3, 1 + Math.random() * 3, (Math.random() - .5) * 3), r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), t: 3 }); }
  burst(new THREE.Vector3(b.x, b.hb, b.z), cols, 24, 4, 4, 1.2, .3, true); plume(new THREE.Vector3(b.x, b.hb, b.z), 0x8a8a86, 2.2, 2, 1.5, -.6, true);
  toast(side === 0 ? '¡HAS DERRIBADO EL PUENTE!' : side === 1 ? '¡EL RIVAL HA DERRIBADO UN PUENTE!' : 'UN PUENTE SE HA DERRUMBADO', side === 0 ? 'good' : 'bad', b); sfx('demolish', side);
  return true;
}
// puente fortificado: se conquista quedándose en el tablero sin enemigos; sus torres disparan a los enemigos de su dueño
function updateFortBridge(b, dt) {
  const here = players().map(() => 0);
  for (const u of UGRID.near(b.x, b.z, 6, _near)) if (u.side < NP && Math.hypot(u.pos.x - b.x, u.pos.z - b.z) < 6) here[u.side]++;
  const alone = here.filter(Boolean).length === 1;
  for (const sd of players()) if (here[sd] && alone && b.owner !== sd) { b.cap[sd] += dt / 5; if (b.cap[sd] >= 1) { b.cap = [0, 0, 0, 0, 0]; b.owner = sd; for (const m of b.roofs) m.material = mat(TEAM[sd].c);
      burst(b.tower, [TEAM[sd].c, 0xffffff], 20, 3, 4, 1, .22); toast(sd === 0 ? '¡EL PUENTE FORTIFICADO ES TUYO! SUS TORRES DISPARAN' : 'EL RIVAL HA TOMADO EL PUENTE FORTIFICADO', sd === 0 ? 'good' : 'bad', b); sfx(sd === 0 ? 'capture' : 'deny'); } }
    else if (!here[sd]) b.cap[sd] = Math.max(0, b.cap[sd] - dt / 10);
  if (b.owner < 0 || (b.towerCd -= dt) > 0) return;
  let best = null, bd = 13; for (const u of UGRID.near(b.x, b.z, 13, _near)) if (u.side !== b.owner) { const d = Math.hypot(u.pos.x - b.x, u.pos.z - b.z); if (d < bd) { bd = d; best = u; } }
  if (best) { b.towerCd = 1.2; shoot(b.tower, best.pos, 0); damage({ side: b.owner, vis: true, def: {} }, best, 10); }
}
// animación (cada fotograma): trozos que caen, puentes que se hunden y el colgante que se balancea
export function rulesFrame(dt) {
  for (let k = R.debris.length - 1; k >= 0; k--) { const d = R.debris[k]; d.t -= dt; d.v.y -= 9 * dt; d.m.position.addScaledVector(d.v, dt); d.m.rotation.x += d.r.x * dt; d.m.rotation.y += d.r.y * dt;
    if (d.m.position.y < -.2 || d.t <= 0) { if (d.t > 0) { burst(d.m.position.clone().setY(0), [0xffffff, 0xbfe4f4], 4, 1.5, 3, .5, .14, true); } dropBox(d.m); R.debris.splice(k, 1); } }
  const now = performance.now() / 1000;
  for (const b of R.bridges) {
    if (b.fallT > 0) { b.fallT -= dt; b.group.position.y -= dt * 4; b.group.rotation.z += dt * .5; if (b.fallT <= 0) { b.group.visible = false; b.group.position.y = b.hb - 1; b.group.rotation.set(0, 0, 0); } }
    else if (b.style === 'rope' && b.built) b.group.rotation.x = Math.sin(now * 1.3 + b.z) * .025;
  }
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
  if ((R.iceT = (R.iceT ?? 0) - dt) > 0) return; R.iceT = .5; R.iceRisk = [];
  for (const u of units) {
    if (u.dead || (GEOT[u.node] !== 6 && GEOT[u.node] !== 15) || R.breaks.some(b => Math.hypot(b.x - u.pos.x, b.z - u.pos.z) < 10)) continue;
    const on = UGRID.near(u.pos.x, u.pos.z, 5, _near).filter(o => (GEOT[o.node] === 6 || GEOT[o.node] === 15) && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 5), thr = GEOT[u.node] === 15 ? 5 : 10;
    if (on.length < thr) { if (on.length >= thr * .6 && !R.iceRisk.some(p => Math.hypot(p.x - u.pos.x, p.z - u.pos.z) < 6)) { R.iceRisk.push({ x: u.pos.x, z: u.pos.z }); if (performance.now() - (R.iceRiskAt || -1e9) > 10000 && exploredAt(u.pos.x, u.pos.z)) { R.iceRiskAt = performance.now(); scenEvent(u.pos.x, u.pos.z, false); } } continue; }   // cerca del límite: aviso amarillo
    // el hielo fino aguanta la mitad
    const cx = Math.floor(u.pos.x), cz = Math.floor(u.pos.z), cells = [];
    for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) { const x = cx + dx, z = cz + dz; if (x >= 0 && z >= 0 && x < MW && z < MD && dx * dx + dz * dz <= 36 && (GEOT[idx(x, z)] === 6 || GEOT[idx(x, z)] === 15)) cells.push(idx(x, z)); }
    R.breaks.push({ x: u.pos.x, z: u.pos.z, cells, t: 3, phase: 'crack' }); if (exploredAt(u.pos.x, u.pos.z)) { sfx('crack'); scenEvent(u.pos.x, u.pos.z, true); }
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
    const u = UGRID.near(t.x, t.z, 1.8, _near).find(o => o.side < NEU && Math.hypot(o.pos.x - t.x, o.pos.z - t.z) < 1.8); if (!u) continue;
    t.taken = true; t.g.visible = false; sideState[u.side].gold += t.value || TREASURE;
    burst(new THREE.Vector3(t.x, t.y + .5, t.z), [0xffd23f, 0xffffff, 0xe8c870], 24, 3, 5, 1, .22);
    toast(u.side === 0 ? `¡TESORO ENCONTRADO! +${t.value || TREASURE} ORO` : 'EL RIVAL HA ENCONTRADO UN TESORO', u.side === 0 ? 'good' : 'bad', t); if (u.side === 0) sfx('capture');
  }
}
export const TREASURE = 80;

// ---------- tala del bosque denso ----------
// clic derecho sobre el bosque con tropas: van al borde y, mientras alguna esté al lado, lo talan en unos segundos
export function startChop(x, z, list) {
  if (!R.on.chop || !list.length) return false;
  const cx = Math.floor(x), cz = Math.floor(z), cells = [];
  for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) { const nx = cx + dx, nz = cz + dz; if (nx < 1 || nz < 1 || nx >= MW - 1 || nz >= MD - 1 || dx * dx + dz * dz > 7) continue; const i = idx(nx, nz); if (GEOT[i] === 1 || GEOT[i] === 16) cells.push(i); }
  if (!cells.length) return false;
  const o = nearestOpen(x, z, 12); if (o < 0) return false;
  const side = list[0].side, job = R.jobs.find(j => Math.hypot(j.x - x, j.z - z) < 3) || (R.jobs.push({ x: cx + .5, z: cz + .5, y: HM[cells[0]], cells, t: 0, need: cells.every(c => GEOT[c] === 16) ? 3 : 6, side }), R.jobs[R.jobs.length - 1]);   // el bosque claro se tala en la mitad de tiempo
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
// multiplica el daño: cobertura contra flechas en el bosque
export function geoDmg(att, tgt) {
  let k = 1;
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
    const seen = [false, false, false, false, false];
    for (const o of UGRID.near(u.pos.x, u.pos.z, 7, _near)) if (o.side < NEU && o.side !== u.side && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 7) seen[o.side] = true;
    u.hid = seen.map((v, sd) => !v && u.side !== sd);
  }
}
function updateThirst() {
  for (const u of units) {
    if (u.dead || u.side >= NEU || u.type === 'god' || R.wet[u.node] || (roadCell && roadCell[u.node])) continue;
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
    const to = new THREE.Vector3(x, Math.max(0, HM[i]) + .3, z), T = 1.4, m = takeBox(Math.random() < .5 ? 0xff7a1a : 0xffc83a); m.visible = exploredAt(v.x, v.z);   // bomba de lava en arco (no se ve si el volcán no se ha explorado)
    m.scale.setScalar(.7); m.position.copy(top); R.bombs.push({ to, t: T, m, v: new THREE.Vector3((to.x - top.x) / T, (to.y - top.y + 4.5 * T * T) / T, (to.z - top.z) / T) });
  }
  for (let k = R.bombs.length - 1; k >= 0; k--) { const b = R.bombs[k];
    if (b.m) { b.v.y -= 9 * dt; b.m.position.addScaledVector(b.v, dt); b.m.rotation.x += dt * 6; if ((b.tr = (b.tr ?? 0) - dt) <= 0) { b.tr = .06; plume(b.m.position.clone(), 0x4a4448, .45, .8, .6, -.2, true); } }
    if ((b.t -= dt) > 0) continue; R.bombs.splice(k, 1); if (b.m) dropBox(b.m);
    burst(b.to, [0xff7a1a, 0xffc83a, 0x3a3034], 12, 4, 5, .8, .3, true); plume(b.to, 0x56565c, 1.4, 1.8, 1.4, -.6, true);
    for (const u of UGRID.near(b.to.x, b.to.z, 2.8, _near)) if (Math.hypot(u.pos.x - b.to.x, u.pos.z - b.to.z) < 2.8) damage({ side: NEU, vis: u.vis, def: {} }, u, 40);
  }
  if (v.t > 0) return;
  if (v.phase === 'calm') { v.phase = 'warn'; v.t = 8; toast('¡EL VOLCÁN RUGE! VA A ENTRAR EN ERUPCIÓN', 'bad', v); sfx('rumble'); scenEvent(v.x, v.z, true); }
  else if (v.phase === 'warn') { v.phase = 'erupt'; v.t = 7; toast('¡ERUPCIÓN! LEJOS DEL VOLCÁN', 'bad', v); sfx('rumble'); launchRock(top); }
  else { v.phase = 'calm'; v.t = 160 + Math.random() * 60; }
}

// roca gigante del volcán: sale del cráter al empezar la erupción y cae en un punto de tierra lejos de pueblos, fortalezas y puentes.
// Una marca roja en el suelo avisa de dónde caerá; al caer hiere mucho a todo el que pille (de cualquier bando) y se queda en el mapa
const ROCK_R = 6, ROCK_DMG = 150, ROCK_T = 3.6;
function launchRock(top) {
  let to = null;
  for (let k = 0; k < 400 && !to; k++) {
    const x = 4 + Math.random() * (MW - 8), z = 4 + Math.random() * (MD - 8), i = idx(x | 0, z | 0);
    if (HM[i] < 1 || [1, 5, 10, 16, 17, 18].includes(GEOT[i]) || Math.hypot(x - R.volcano.x, z - R.volcano.z) < 22) continue;
    if (spots.some(s => Math.hypot(s.x - x, s.z - z) < (s.kind === 'base' ? 26 : 13)) || R.bridges.some(b => Math.hypot(b.x - x, b.z - z) < 10)) continue;
    to = new THREE.Vector3(x, HM[i], z);
  }
  if (!to) return;
  const m = new THREE.Group(); part(m, 2.6, 2.2, 2.4, 0x3a3034, 0, 0, 0); part(m, 1.8, 1.6, 2.8, 0x4a4448, .4, .5, -.2); part(m, 2.2, 1.4, 1.6, 0x2e282c, -.5, -.4, .5);
  part(m, .5, .5, 2.9, 0xff7a1a, .9, .2, 0, false); part(m, 2.7, .4, .5, 0xffa03a, 0, -.3, 1.05, false); bake(m); m.position.copy(top); world.add(m); R.meshes.push(m);
  scenEvent(to.x, to.z, true);
  R.rock = { m, to, t: ROCK_T, v: new THREE.Vector3((to.x - top.x) / ROCK_T, (to.y - top.y + 4.5 * ROCK_T * ROCK_T) / ROCK_T, (to.z - top.z) / ROCK_T) };
}
function updateRock(dt) {
  const r = R.rock; r.t -= dt; r.v.y -= 9 * dt; r.m.position.addScaledVector(r.v, dt); r.m.rotation.x += dt * 1.5; r.m.rotation.z += dt;
  if ((r.tr = (r.tr ?? 0) - dt) <= 0) { r.tr = .04; plume(r.m.position.clone(), Math.random() < .5 ? 0x3a3438 : 0xff7a1a, 1.2, 1.2, .5, -.2, true); }
  if (r.t > 0) return;
  R.rock = null;
  const p = r.to; r.m.position.set(p.x, p.y + .9, p.z); r.m.rotation.set(.2, Math.random() * 6, -.15);   // se queda clavada donde cae
  burst(p.clone().setY(p.y + 1), [0xff7a1a, 0xffc83a, 0x3a3034, 0x6a6266], 60, 8, 9, 1.4, .45, true);
  for (let k = 0; k < 10; k++) { const a = k / 10 * 6.28; plume(p.clone().add(new THREE.Vector3(Math.cos(a) * 3, 1, Math.sin(a) * 3)), 0x56565c, 2.4, 2.4, 1.6, -.4, true); }
  sfx('rumble');
  for (const u of UGRID.near(p.x, p.z, ROCK_R, _near)) if (Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < ROCK_R) damage({ side: NEU, vis: u.vis, def: {} }, u, ROCK_DMG);
}
// ---------- tsunami (costa) ----------
// cada pocos minutos el mar se retira y llega una ola que cubre la mitad del mapa del lado del mar: quita el 90 % de la vida a quien pille
const TSU = { warn: 10, in: 4, hold: 1.2, out: 4 };
function tsunamiMesh() {
  if (R.tsuMesh) return R.tsuMesh;
  const g = new THREE.Group(), water = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x3f86c8, transparent: true, opacity: .62, depthWrite: false }));
  const foam = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xf4f8ff, transparent: true, opacity: .85, depthWrite: false }));
  g.add(water, foam); g.visible = false; world.add(g); R.meshes.push(g); R.tsuMesh = { g, water, foam }; return R.tsuMesh;
}
function setWave(front) {   // agua desde el borde del mar (z = MD) hasta front
  const w = tsunamiMesh(), d = Math.max(.1, MD + 8 - front);
  w.g.visible = true; w.water.scale.set(MW + 16, 6, d); w.water.position.set(MW / 2, 2, front + d / 2);
  w.foam.scale.set(MW + 16, 6.6, 1.6); w.foam.position.set(MW / 2, 2.3, front + .8);
}
function updateTsunami(dt) {
  const T = R.tsunami; T.t -= dt;
  if (T.phase === 'warn' && (T.fx = (T.fx ?? 0) - dt) <= 0) { T.fx = .25; for (let k = 0; k < 4; k++) plume(new THREE.Vector3(Math.random() * MW, 1, MD - 2 - Math.random() * 6), 0xe8f0f8, 1.4, 1.4, 1.2, -.3, true); }   // el mar se agita
  if (T.phase === 'wave') {
    const e = TSU.in + TSU.hold + TSU.out - T.t, mid = MD * .5, k = e < TSU.in ? 1 - Math.pow(1 - e / TSU.in, 2) : e < TSU.in + TSU.hold ? 1 : Math.max(0, 1 - (e - TSU.in - TSU.hold) / TSU.out);
    const front = MD + 6 - (MD + 6 - mid) * k; setWave(front);
    if (e < TSU.in + TSU.hold) for (const u of units) if (!u.dead && u.tsu !== T.n && u.pos.z > front) {   // la ola pasa por encima: 90 % de la vida
      u.tsu = T.n; damage({ side: NEU, vis: u.vis, def: {} }, u, u.hp * .9);
      if (u.vis) burst(u.pos.clone().setY(u.pos.y + 1), [0xf4f8ff, 0x8ac8f0], 6, 2.5, 3, .5, .2);
    }
    if ((T.fx = (T.fx ?? 0) - dt) <= 0 && e < TSU.in + TSU.hold) { T.fx = .08; for (let k = 0; k < 3; k++) burst(new THREE.Vector3(Math.random() * MW, 4.5, front), [0xffffff, 0xbfe4f4], 3, 2, 3, .6, .25, true); }
  }
  if (T.t > 0) return;
  if (T.phase === 'calm') { T.phase = 'warn'; T.t = TSU.warn; sfx('rumble'); scenEvent(MW / 2, MD * .7, true); }
  else if (T.phase === 'warn') { T.phase = 'wave'; T.t = TSU.in + TSU.hold + TSU.out; T.n++; sfx('rumble'); }
  else { T.phase = 'calm'; T.t = 220 + Math.random() * 100; if (R.tsuMesh) R.tsuMesh.g.visible = false; }
}

// un cambio del escenario empieza: sonido (sirena si es peligroso, campanilla si no) y ESPACIO lleva la cámara allí
function scenEvent(x, z, danger) { alarm.ev = { x, z, at: performance.now() }; sfx(danger ? 'danger' : 'notice'); }
// ---------- avisos en el terreno ----------
// Cada cambio del escenario que va a pasar (o está pasando) se marca en el suelo con una zona que late y un aviso con texto:
// rojo = peligro (hace daño o mata) · amarillo = cambia el terreno pero no hace daño. La capa 2D los dibuja (overlay.js)
// tipos: disc {x, z, r} · rect {x0, z0, x1, z1} · edge (solo el borde de un rect, para lo que se puede romper)
export function warnZones() {
  const W = [], s = t => `${Math.max(0, Math.ceil(t))} S`;
  const v = R.volcano; if (v && v.phase !== 'calm') W.push({ type: 'disc', x: v.x, z: v.z, r: 32, danger: true, label: v.phase === 'warn' ? `¡ERUPCIÓN EN ${s(v.t)}!` : '¡LLUEVE LAVA!' });
  if (R.rock) W.push({ type: 'disc', x: R.rock.to.x, z: R.rock.to.z, r: ROCK_R, danger: true, label: `¡CAE UNA ROCA! ${s(R.rock.t)}`, strong: true });
  const ts = R.tsunami; if (ts && ts.phase !== 'calm') W.push({ type: 'rect', x0: 0, z0: MD / 2, x1: MW, z1: MD, danger: true, label: ts.phase === 'warn' ? `¡TSUNAMI EN ${s(ts.t)}! SAL DE AQUÍ` : '¡TSUNAMI!', lx: MW / 2, lz: MD * .62, fixed: true });
  const c = R.cycle, g = R.gates[0];
  if (c && g?.marks && c.phase !== 'open') { const tide = R.on.tides, txt = c.phase === 'warn' ? `${tide ? 'LA MAREA CUBRE' : 'SE CIERRA'} EN ${s(c.t)}` : `${tide ? 'CUBIERTO' : 'CERRADO'} · ${s(c.t)}`;
    for (const m of g.marks) W.push({ type: 'disc', x: m.x, z: m.z, r: 4.5, danger: false, label: txt, cross: c.phase === 'closed' }); }
  for (const b of R.breaks || []) W.push(b.phase === 'crack' ? { type: 'disc', x: b.x, z: b.z, r: 6.5, danger: true, label: `¡EL HIELO SE ROMPE! ${s(b.t)}`, strong: true } : { type: 'disc', x: b.x, z: b.z, r: 6.5, danger: false, label: `HIELO ROTO · ${s(b.t)}` });
  for (const p of R.iceRisk || []) W.push({ type: 'disc', x: p.x, z: p.z, r: 5, danger: false, label: 'EL HIELO CRUJE: DEMASIADAS TROPAS' });
  for (const b of R.bridges) {
    const box = { x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, y: b.hb };
    if (!b.built) { if (b.breakable) W.push({ type: 'rect', ...box, danger: false, label: `PUENTE ROTO · REPARAR ${BRIDGE_COST}`, cross: true }); }
    else if (b.breakable && performance.now() - (b.hitAt || -1e9) < 2500) W.push({ type: 'rect', ...box, danger: true, label: `¡SE ROMPE! ${Math.max(0, Math.round(b.hp / b.maxHp * 100))} %`, strong: true });
    else if (b.breakable && !lastBridge(b)) W.push({ type: 'edge', ...box, danger: false });   // se puede derribar
  }
  return W;
}

// contador de la regla con tiempo de la geografía (marea, crecida, volcán), para la pantalla y la pausa
const mmss = t => { t = Math.max(0, Math.ceil(t)); return `${t / 60 | 0}:${String(t % 60).padStart(2, '0')}`; };
export function ruleTimer() {
  const c = R.cycle;
  if (c) { const tide = R.on.tides; return c.phase === 'open' ? `${tide ? 'MAREA ALTA' : 'CRECIDA'} EN ${mmss(c.t + 10)}` : c.phase === 'warn' ? `${tide ? '¡LA MAREA SUBE!' : '¡EL RÍO CRECE!'} ${mmss(c.t)}` : `${tide ? 'MAREA BAJA' : 'LOS VADOS SE ABREN'} EN ${mmss(c.t)}`; }
  const ts = R.tsunami; if (ts) return ts.phase === 'calm' ? `TSUNAMI EN ~${mmss(ts.t + TSU.warn)}` : ts.phase === 'warn' ? `¡TSUNAMI! SAL DE LA MITAD DEL MAR ${mmss(ts.t)}` : '¡TSUNAMI!';
  const v = R.volcano; if (v) return v.phase === 'calm' ? `ERUPCIÓN EN ~${mmss(v.t + 8)}` : v.phase === 'warn' ? '¡EL VOLCÁN RUGE!' : '¡ERUPCIÓN!';
  return '';
}
// avisos en el minimapa: los mismos que en el terreno, con los mismos colores (rojo peligro, amarillo cambio); parpadean
export function drawRulesMini(c) {
  const on = (performance.now() / 300 | 0) % 2;
  for (const w of warnZones()) {
    if (w.type === 'edge') continue;
    const col = w.danger ? '255,58,58' : '255,210,63', a = on ? .55 : .3;
    if (w.type === 'disc') { if (!exploredAt(w.x, w.z)) continue; c.fillStyle = `rgba(${col},${a})`; c.beginPath(); c.arc(w.x, w.z, Math.max(w.r, 5), 0, 7); c.fill(); c.strokeStyle = `rgb(${col})`; c.lineWidth = 2; c.stroke(); }
    else { if (!w.fixed && !exploredAt((w.x0 + w.x1) / 2, (w.z0 + w.z1) / 2)) continue; c.fillStyle = `rgba(${col},${a * .7})`; c.fillRect(w.x0, w.z0, Math.max(3, w.x1 - w.x0), Math.max(3, w.z1 - w.z0)); }
  }
}
export function updateRules(dt) {
  if (R.cycle) updateCycle(dt);
  if (R.jobs.length) updateJobs(dt);
  if (R.hide && (R.hideT = (R.hideT ?? 0) - dt) <= 0) { R.hideT = .3; updateHide(); }
  if (R.wet && (R.thirstT = (R.thirstT ?? 0) - dt) <= 0) { R.thirstT = 1; updateThirst(); }
  if (R.volcano) updateVolcano(dt);
  if (R.rock) updateRock(dt);
  if (R.tsunami) updateTsunami(dt);
  for (const b of R.bridges) if (b.style === 'fort' && b.built) updateFortBridge(b, dt);
  if (R.on.ice) updateIce(dt);
  if (R.treasures && (R.trT = (R.trT ?? 0) - dt) <= 0) { R.trT = .25; updateTreasures(); }
}
// para pruebas y para el panel: estado de las reglas
export const rulesInfo = () => ({ on: R.on, cycle: R.cycle && { ...R.cycle }, bridges: R.bridges.map(b => b.built), jobs: R.jobs.length, volcano: R.volcano && R.volcano.phase });
