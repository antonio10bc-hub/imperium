// Unidades: plantillas de modelos, miniaturas, aparición, movimiento y rejilla espacial.
import * as THREE from 'three';
import { orderMove } from './behavior.js';
import { CIV_SLOT, civOf, defOf } from './civs.js';
import { ALT0, BARR0, GAME, MD, MW, NEU, RANKS, TEAM, TEMP0, TYPES, mixHex } from './config.js';
import { GEOT, HM, cellOf, roadCell, spots } from './map.js';
import { NBO, cellX, cellZ, inMain, nearestNode, stepMask, walk } from './nav.js';
import { BOX, FLASH, HULLMAT, VCMAT, basic, collectParts, discGeo, mergeBoxes, part, ring, ringGeo, world } from './render.js';
import { S } from './state.js';
import { geoSlow, swampMounted } from './rules.js';

// ---------- Unidades ----------
// Cada combinación civilización + tipo + bando se construye una sola vez con cajas y se funde en una plantilla
// (geometría con color por vértice + contorno). Cada tropa reutiliza esas geometrías: 2 mallas en lugar de ~50.
const UNIT_TPL = new Map();
function unitModel(type, side, body, civ = side) {   // construye las piezas del modelo en body; devuelve la altura de la cresta de rango
  if (side < NEU && type in CIV_SLOT) {   // tropa de civilización
    civOf(civ)[type](body, TEAM[side].c);
    body.updateMatrixWorld(true); return new THREE.Box3().setFromObject(body).max.y + .16;
  }
  // modelo genérico: jinetes arqueros y guardianes neutrales
  const T = TEAM[side], skin = 0xffd2a0, steel = 0xd8dcf0, P = (...a) => part(body, ...a, true);
  let crestY = 1.36;
  if (type === 'titan') {   // coloso: gigante acorazado y lento, con maza de piedra y escudo; no es de ninguna civilización
    const iron = 0x6a6e7a, iron2 = 0x8a8e9a, stone = 0x9a9488, dark = 0x2a2a34;
    for (const x of [-.2, .2]) { P(.26, .5, .3, dark, x, .25, 0); P(.32, .14, .4, iron, x, .05, .04); }
    P(.8, .5, .5, iron, 0, .72, 0); P(.92, .5, .56, iron2, 0, 1.18, 0); P(.62, .5, .08, T.c, 0, .86, .3);   // coraza y faldón del bando
    for (const x of [-1, 1]) { P(.36, .26, .44, iron2, x * .6, 1.42, 0); P(.24, .56, .26, iron, x * .6, 1.02, .02); }   // hombreras y brazos
    P(.46, .44, .44, iron2, 0, 1.68, .02); P(.36, .08, .06, 0xffc83a, 0, 1.7, .26); P(.12, .2, .5, T.c, 0, 1.98, -.02);   // yelmo con visera y cresta
    P(.12, 1.1, .12, 0x5a3a24, .62, .95, .28); P(.4, .4, .44, stone, .62, 1.5, .34); P(.2, .2, .2, stone, .62, 1.78, .34);   // maza
    P(.12, .8, .66, iron, -.76, 1, .1); P(.06, .3, .3, T.c, -.83, 1.02, .1);   // escudo
    crestY = 2.2;
  } else if (type === 'cart') {   // carro de caravana: buey, carreta entoldada con mercancía y cofre de oro
    const wood = 0x8a5a34, wood2 = 0x6a4224, ox = 0x8a6a4a, canvas = 0xe8dcc0;
    P(.6, .55, 1, ox, 0, .75, 1.35); P(.4, .4, .4, 0x7a5a3a, 0, .95, 1.98); P(.5, .08, .08, 0xe8e0c8, 0, 1.16, 1.98);   // buey y cuernos
    for (const [a, b] of [[-.2, .98], [.2, .98], [-.2, 1.72], [.2, 1.72]]) P(.14, .48, .14, 0x5a4024, a, .24, b);
    P(.1, .1, 1, wood2, 0, .62, .66); P(.9, .1, .1, wood2, 0, .9, .86);   // lanza y yugo
    P(1.2, .18, 1.8, wood, 0, .62, -.4); P(1.24, .32, .08, wood2, 0, .86, .48); P(1.24, .32, .08, wood2, 0, .86, -1.28);   // caja
    for (const z of [.2, -1]) for (const x of [-.66, .66]) { P(.1, .62, .62, wood2, x, .32, z); P(.12, .18, .18, 0x3a2a1a, x, .32, z); }   // ruedas
    P(1.1, .6, 1.3, canvas, 0, 1.28, -.55); P(.9, .2, 1.32, canvas, 0, 1.66, -.55); P(.05, .6, 1.32, 0xc8b896, 0, 1.3, -.55);   // toldo
    P(.5, .4, .4, 0x7a4a24, -.25, .94, -1.15); P(.44, .12, .34, 0xffc83a, -.25, 1.18, -1.15); P(.34, .3, .34, 0xa87a4a, .3, .9, -1.1);   // cofre de oro y fardos
    P(.3, .36, .26, 0x5a7a9a, 0, 1.04, .26); P(.22, .22, .22, 0xffd2a0, 0, 1.36, .26); P(.32, .08, .32, 0xd8c89a, 0, 1.5, .26);   // carretero
    crestY = 2;
  } else if (type === 'horse' || type === 'hero' || type === 'harcher') {
    const hero = type === 'hero', hc = hero ? 0xffffff : 0x8a5a34, hc2 = hero ? 0xf0ecff : 0x7a4824;
    P(.5, .45, 1.05, hc, 0, .72, 0); P(.3, .42, .38, hc2, 0, 1.02, .58); P(.16, .18, .2, hero ? 0xd8d0e8 : 0x2a1a10, 0, 1.2, .38);
    for (const [a, b] of [[-.16, -.36], [.16, -.36], [-.16, .36], [.16, .36]]) P(.13, .5, .13, hero ? 0xe8e4f4 : 0x5a3a24, a, .25, b);
    P(.6, .12, .55, hero ? 0xffd23f : T.c, 0, .98, -.05);
    P(.4, .44, .3, T.c, 0, 1.26, -.05); P(.26, .26, .26, skin, 0, 1.62, -.05);
    if (hero) {
      P(.34, .12, .34, 0xffd23f, 0, 1.8, -.05); for (const [a, b] of [[-.12, -.12], [.12, -.12], [-.12, .12], [.12, .12]]) P(.08, .12, .08, 0xffd23f, a, 1.92, b - .05);
      P(.5, .55, .08, T.d, 0, 1.1, -.25); P(.06, .06, .9, steel, .3, 1.35, .3); P(.18, .06, .06, 0xffd23f, .3, 1.35, -.1);
      P(.12, .3, .3, 0xffd23f, -.28, 1.25, 0); crestY = 2.1;
    } else if (type === 'harcher') { P(.34, .2, .34, T.d, 0, 1.78, -.05); P(.06, .9, .06, 0x8a5a34, -.32, 1.32, .08); part(body, .03, .8, .03, 0xffffff, -.29, 1.32, .02, false); P(.14, .4, .14, 0x7a4824, .16, 1.3, -.28); crestY = 2; }
    else { P(.32, .14, .32, T.l, 0, 1.79, -.05); P(.06, .06, 1.4, steel, .27, 1.28, .4); P(.3, .22, .06, T.c, .27, 1.45, .95); crestY = 1.98; }
  } else {
    P(.16, .34, .16, 0x3a2a4a, -.11, .17, 0); P(.16, .34, .16, 0x3a2a4a, .11, .17, 0);
    P(.46, .48, .32, T.c, 0, .58, 0); P(.3, .3, .3, skin, 0, .97, 0);
    if (type === 'sword') {
      P(.38, .16, .38, steel, 0, 1.15, 0); P(.1, .1, .1, T.c, 0, 1.28, 0);
      P(.07, .6, .07, steel, .31, .64, .14); P(.2, .06, .08, 0xffd23f, .31, .4, .14);
      P(.08, .5, .42, T.d, -.3, .6, .02); P(.09, .2, .2, 0xffe03a, -.35, .62, .02);
    } else {
      P(.38, .22, .38, T.l, 0, 1.1, -.03); P(.2, .1, .2, T.l, 0, 1.25, -.12);
      P(.06, .82, .06, 0x8a5a34, -.3, .64, .12); part(body, .03, .74, .03, 0xffffff, -.27, .64, .04, false);
      P(.16, .42, .14, 0x7a4824, .1, .64, -.22); crestY = 1.42;
    }
  }
  return crestY;
}
function unitTemplate(type, side, cv = side) {
  const civ = side < NEU && type in CIV_SLOT ? civOf(cv).id : '-', key = civ + '|' + type + '|' + side;
  let t = UNIT_TPL.get(key); if (t) return t;
  const body = new THREE.Group(), crestY = unitModel(type, side, body, cv), { fill, hull } = collectParts(body);
  t = { crestY, team: TEAM[side].c, base: fill.map(m => m.material.color.getHex()), geo: [mergeBoxes(fill, body, true)], hull: mergeBoxes(hull, body, false) };
  UNIT_TPL.set(key, t); return t;
}
const METAL = [0, 0xb87333, 0xd4d8e2, 0xf2c23a];
// variante de color por rango: las piezas se tiñen del metal (bronce, plata, oro) salvo las del color del bando, para seguir sabiendo de quién es
export function unitGeo(t, rank) {
  if (t.geo[rank]) return t.geo[rank];
  const g0 = t.geo[0], col = new Uint8Array(g0.attributes.color.array), nv = BOX.attributes.position.count;
  t.base.forEach((c, k) => { if (c === t.team) return; const m = mixHex(c, METAL[rank], .58); for (let v = 0; v < nv; v++) { const o = (k * nv + v) * 3; col[o] = m >> 16 & 255; col[o + 1] = m >> 8 & 255; col[o + 2] = m & 255; } });
  const g = new THREE.BufferGeometry(); g.setIndex(g0.index); g.setAttribute('position', g0.attributes.position); g.setAttribute('normal', g0.attributes.normal);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3, true)); g.boundingSphere = g0.boundingSphere;
  return (t.geo[rank] = g);
}
function buildUnit(type, side, parent = world, civ = side) {
  const t = unitTemplate(type, side, civ), g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const mesh = new THREE.Mesh(t.geo[0], VCMAT); body.add(mesh, new THREE.Mesh(t.hull, HULLMAT));
  const crest = new THREE.Group(); part(crest, .18, .18, .18, 0xffffff, 0, t.crestY, 0); crest.visible = false; body.add(crest);
  const sh = new THREE.Mesh(discGeo(.62, 20), basic(0x0f0f1b, .28)); sh.rotation.x = -Math.PI / 2; sh.position.y = .03; g.add(sh);
  const team = ring(g, .46, .66, TEAM[side].c, .05), selR = ring(g, .7, .86, 0xffe03a, .07); selR.visible = false;
  // estandarte: el héroe lleva uno grande y una de cada cuatro tropas de su escolta, uno pequeño (color del bando con una franja del color de su civilización)
  let banner = null;
  if (side < NEU && (type === 'hero' || TYPES.includes(type))) {
    const big = type === 'hero', H = big ? 3.4 : 2.3, fy = H - (big ? .45 : .3), fw = big ? 1 : .6, own = civOf(civ).own ?? TEAM[side].l;
    banner = new THREE.Group(); part(banner, .06, H, .06, 0x5a3a24, 0, H / 2, 0, false); part(banner, .05, big ? .7 : .45, fw, TEAM[side].c, 0, fy, fw / 2, false); part(banner, .056, big ? .22 : .14, fw, own, 0, fy - (big ? .12 : .08), fw / 2, false);
    banner.position.set(-.26, 0, -.24); banner.visible = big; body.add(banner);
  }
  let halo = null, aura = null, wave = null;
  if (type === 'god') {   // el dios: halo dorado tras la cabeza, aura de luz en el suelo y una onda que se expande al curar
    halo = new THREE.Mesh(ringGeo(.3, .4), basic(0xffe9a0, .9)); halo.position.set(0, t.crestY - .2, -.24); body.add(halo);
    aura = ring(g, .2, 1.15, 0xffe9a0, .04, .3);
    wave = new THREE.Mesh(ringGeo(.9, 1), new THREE.MeshBasicMaterial({ color: 0xb8f07a, transparent: true, opacity: 0, depthWrite: false })); wave.rotation.x = -Math.PI / 2; wave.position.y = .08; wave.visible = false; g.add(wave);
  }
  g.scale.setScalar({ god: 2.1, titan: 1.7, cart: 1.25 }[type] ?? (type === 'hero' ? (side < NEU ? 1.8 : 1.95) : 1.3)); parent.add(g);
  return { g, body, mesh, tpl: t, team, selR, crest, sh, halo, aura, wave, banner };
}
export const THUMB = {};
// un solo renderer fuera de pantalla para miniaturas y retratos del menú (crear contextos WebGL en cada partida agota el límite del navegador)
let offR = null;
export function offscreen() { if (!offR) { offR = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true }); offR.setPixelRatio(1); offR.outputColorSpace = THREE.LinearSRGBColorSpace; } return offR; }
export function palettize(src) {   // miniaturas limpias: solo recorta el alfa
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const x = c.getContext('2d'); x.drawImage(src, 0, 0);
  const im = x.getImageData(0, 0, c.width, c.height), d = im.data;
  for (let i = 0; i < d.length; i += 4) d[i + 3] = d[i + 3] < 128 ? 0 : 255;
  x.putImageData(im, 0, 0); return c.toDataURL();
}
export function makeThumbs() {
  for (const k in THUMB) delete THUMB[k];
  try {
    const r = offscreen(); r.setSize(72, 72, false);
    const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, .1, 50);
    const l = new THREE.DirectionalLight(0xfff6e8, 2.2); l.position.set(3, 5, 4); sc.add(l, new THREE.HemisphereLight(0xe6eeff, 0x5a4aa8, 1.25));
    for (const t of [...TYPES, 'hero', 'harcher', 'god', 'titan']) {
      const u = buildUnit(t, 0, sc); u.team.visible = false; u.sh.visible = false;
      const box = new THREE.Box3().setFromObject(u.g), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()).length();
      cam.position.copy(c).add(new THREE.Vector3(1.1, .6, 1.2).normalize().multiplyScalar(s * 1.25)); cam.lookAt(c);
      r.render(sc, cam); THUMB[t] = palettize(r.domElement); sc.remove(u.g);
    }
  } catch (e) {}
  document.querySelectorAll('img[data-t]').forEach(i => { if (THUMB[i.dataset.t]) i.src = THUMB[i.dataset.t]; });
}
export const units = [], arrows = [], puffs = [], floats = [], pings = [];
// ---------- Rejilla espacial ----------
// Las unidades se reparten en celdas de 4×4 casillas una vez por paso de simulación; las búsquedas de vecinos
// (separación, enemigo más cercano, conquista, torres) miran solo las celdas cercanas en vez de todas las unidades.
const byId = (a, b) => a.id - b.id;
export const UGRID = (() => {
  const S = 4; let W = 0, D = 0, mw = 0, md = 0, cells = []; const used = [];
  const resize = () => { mw = MW; md = MD; W = Math.ceil(MW / S); D = Math.ceil(MD / S); cells = Array.from({ length: W * D }, () => []); used.length = 0; }; resize();
  const cx = x => Math.min(W - 1, Math.max(0, Math.floor(x / S))), cz = z => Math.min(D - 1, Math.max(0, Math.floor(z / S)));
  return {
    resize,   // al cambiar el tamaño del mapa
    rebuild() { if (mw !== MW || md !== MD) resize(); for (const k of used) cells[k].length = 0; used.length = 0; for (const u of units) { const k = cz(u.pos.z) * W + cx(u.pos.x); if (!cells[k].length) used.push(k); cells[k].push(u); } },
    // unidades vivas de las celdas que tocan el círculo (x, z, r), en out (se reutiliza; no anidar llamadas con el mismo out).
    // Margen de 1 casilla: dentro de un paso las unidades se mueven un poco respecto a la celda en la que se apuntaron.
    // Se devuelven por id, que es el orden de la lista units: los desempates salen igual que recorriendo todas las unidades
    // Solo entran las que están dentro del cuadrado del radio (+1) según su posición actual, así la lista a ordenar es corta
    near(x, z, r, out) {
      out.length = 0; const R = r + 1, x0 = cx(x - R - 1), x1 = cx(x + R + 1), z0 = cz(z - R - 1), z1 = cz(z + R + 1);
      for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) { const c = cells[j * W + i]; for (let k = 0; k < c.length; k++) { const o = c[k]; if (!o.dead && Math.abs(o.pos.x - x) <= R && Math.abs(o.pos.z - z) <= R) out.push(o); } }
      return out.length > 1 ? out.sort(byId) : out;
    },
  };
})();
export const _nearSep = [], _nearEn = [], _nearTown = [], _nearWall = [];
export const sideState = [{ queue: [], hero: null }, { queue: [], hero: null }];
export const sel = new Set();
let uid = 0;
const maxHpOf = u => Math.round(u.def.hp * (u.leader ? GAME.escortBonus : 1) * RANKS[u.rank].mul);
export function setMax(u) { const old = u.maxHp; u.maxHp = maxHpOf(u); if (u.maxHp > old) u.hp += u.maxHp - old; else u.hp = Math.min(u.hp, u.maxHp); }
// edificio que produce cada tipo de sitio: su punto de reunión está en S.rally[edificio]
export const RALLY_OF = { [BARR0]: 'barracks', [ALT0]: 'altar', [TEMP0]: 'temple' };
export function spawnUnit(side, type, at = BARR0, city = side) {
  const b = spots[at + city], k = spots[city], ang = Math.atan2(k.z - b.z, k.x - b.x) + (Math.random() - .5) * 1.6;
  const u = spawnAt(side, type, b.x + Math.cos(ang) * 2.8, b.z + Math.sin(ang) * 2.8, ang, city);
  const r = S.rally[RALLY_OF[at] + city];
  if (side === 0 && r) orderMove([u], r.x, r.z, false);   // punto de reunión del edificio (si tu bando lo lleva la IA, ella decide luego)
  return u;
}
export function spawnAt(side, type, x, z, ang = Math.random() * 6.28, civ = side) {   // civ: civilización de la tropa (la de la ciudad que la produce)
  const def = defOf(civ, type), n = nearestNode(x, z);
  const parts = buildUnit(type, side, world, civ);
  const u = { id: ++uid, side, civ, type, def, hp: def.hp, maxHp: def.hp, node: n, pos: new THREE.Vector3(cellX(n), HM[n], cellZ(n)), fwd: new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)),
    cd: 0, think: 0, enemy: null, bob: Math.random() * 6, lunge: 0, flash: 0, block: 0, order: null, leader: null, escort: [], combatT: 0, lastHit: -9, healT: 0,
    chargeT: 0, chargeCd: 6, kills: 0, rank: 0, ...parts };
  units.push(u); place(u);
  return u;
}
export function place(u, dt = 0) {
  u.g.position.copy(u.pos); u.g.rotation.y = Math.atan2(u.fwd.x, u.fwd.z);
  u.body.position.set(0, u.moving ? Math.abs(Math.sin(u.bob)) * .12 : 0, u.lunge * .35);
  if (u.type === 'god') u.body.position.y += .55 + Math.sin(performance.now() / 520 + u.id) * .12;   // flota sobre el suelo
  u.hitT = Math.max(0, (u.hitT || 0) - dt); u.body.rotation.x = u.lunge * .45 - u.hitT * 2.2;   // se inclina al golpear y retrocede al recibir
  if (u.capT > 0) { u.capT -= dt; u.body.position.y += Math.abs(Math.sin(performance.now() / 120 + u.id * 1.7)) * .5; }   // salto de conquista
  const fl = u.flash > 0; if (fl !== u.flashOn) { u.flashOn = fl; u.mesh.material = fl ? FLASH : VCMAT; }   // destello blanco al recibir daño
  if (u.banner) { u.banner.visible = u.type === 'hero' || (!!u.leader && u.id % 4 === 0); if (u.banner.visible) u.banner.rotation.y = Math.sin(performance.now() / 400 + u.id) * .25; }   // estandartes de la escolta
  const s = sel.has(u); u.selR.visible = s; if (s) u.selR.scale.setScalar(1 + Math.sin(performance.now() / 120) * .06);
}
export const charging = u => (u.type === 'hero' ? u : u.leader)?.chargeT > 0;
export const roadK = u => roadCell && roadCell[u.node] ? 1.35 : 1;   // los caminos dan velocidad
const FOOT_HERO = new Set(['mexica', 'vikingos']);   // civilizaciones cuyo héroe va a pie
const MOUNTED = u => u.type === 'horse' || u.type === 'harcher' || (u.type === 'hero' && u.side < NEU && !FOOT_HERO.has(civOf(u.civ ?? u.side).id));
export const slowK = u => (GEOT && GEOT[u.node] === 2 ? (MOUNTED(u) ? swampMounted() : .6) : GEOT && GEOT[u.node] === 11 ? .8 : 1) * geoSlow(u);   // las dunas también frenan   // pantano y bajío: más lentos, sobre todo a caballo
export const spd = u => (u.leader ? Math.max(u.def.speed, u.leader.def.speed) : u.def.speed) * (charging(u) ? 1.6 : 1) * roadK(u) * slowK(u);
export function stepToward(u, tx, tz, s, dt) {
  const dx = tx - u.pos.x, dz = tz - u.pos.z, L = Math.hypot(dx, dz); if (L < 1e-4) return false;
  const st = Math.min(s * dt, L), nx = u.pos.x + dx / L * st, nz = u.pos.z + dz / L * st, b = cellOf(nx, nz), a = u.node;
  if (b !== a && !(walk[b] && inMain[b] && Math.abs(HM[a] - HM[b]) <= 1)) { u.block = 1; return false; }
  u.pos.x = nx; u.pos.z = nz; u.node = b;
  u.fwd.x += (dx / L - u.fwd.x) * .35; u.fwd.z += (dz / L - u.fwd.z) * .35; u.fwd.normalize(); u.moving = true; return true;
}
export function followField(u, f, dt, s = spd(u)) {
  const v = u.node, m = stepMask[v]; let best = v, bv = f[v];
  for (let k = 0; k < 8; k++) if (m >> k & 1) { const j = v + NBO[k]; if (f[j] < bv) { bv = f[j]; best = j; } }
  if (best === u.node) return false;
  return stepToward(u, cellX(best), cellZ(best), s, dt) || stepToward(u, cellX(u.node), cellZ(u.node), s, dt);
}
// un puesto de formación vale si es transitable y se llega a él por un camino que no rodee demasiado (no está al otro lado de un acantilado)
export const slotOk = (f, c, maxF) => walk[c] && inMain[c] && f[c] < 1e9 && f[c] <= maxF;
export const alive = u => u && !u.dead;
