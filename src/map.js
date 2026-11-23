// Datos del mapa (alturas, fortalezas, regiones) y su generación: terreno, pueblos, caminos y vóxeles.
import * as THREE from 'three';
import { civOf } from './civs.js';
import { BASE0, BASE1, GAME, MD, MW, N, TOWN_NAMES, TP, idx, mixHex } from './config.js';
import { GEO } from './geo.js';
import { buildMinimap, markMiniDirty } from './minimap.js';
import { NBO, bfs, buildNav, cellX, cellZ, inMain, mainList, nearestNode, stepMask } from './nav.js';
import { hash, n2, plains, rngOf, seed, setSeed, smooth01 } from './noise.js';
import { fogU, grad, ocean, world } from './render.js';
import { S } from './state.js';

export let scen = 'rio', geoR = null, geoRiver = true, GEOT = null;
// relieve base: las diez geografías salen de GEO; el río clásico se genera aquí
function baseGround(rng) {
  GEOT = new Uint8Array(N); geoR = null; geoRiver = scen === 'rio'; RIVX.fill(MW / 2);
  if (scen !== 'rio') {
    geoR = GEO.build(scen, (rng() * 1e9 | 0) + 1); EL.set(geoR.HM); GEOT = geoR.TT; geoRiver = geoR.river;
    for (let z = 0; z < MD; z++) RIVX[z] = geoR.div ? geoR.div(z + .5) : MW / 2;   // divisoria del reparto 50/50
    return;
  }
  riverGround(rng, EL, RIVX);
}
// río con vados entre dos llanuras: rellena las alturas y la x del río en cada fila
function riverGround(rng, el, rivx) {
  const ph = rng() * 6.28; rng();   // la segunda tirada se conserva para que cada semilla siga dando el mismo mapa
  const fords = [.1, .27, .43, .58, .74, .9].map(k => MD * k + (rng() - .5) * 10);
  for (let z = 0; z < MD; z++) {
    const cz = z + .5, xr = MW / 2 + Math.sin(cz * .03 + ph) * 22 + (n2(0, cz, .02, 3, 12) - .5) * 26, ford = fords.some(f => Math.abs(cz - f) < 3); rivx[z] = xr;
    for (let x = 0; x < MW; x++) {
      const cx = x + .5, dr = Math.abs(cx - xr); let g = plains(cx, cz);
      if (dr < 4) g = ford ? 1 : -1.2 - (4 - dr) * .6;
      else if (dr < 5.5) g = Math.min(g, 1.2);
      else if (dr < 9) g = Math.min(g, 2.2);
      el[idx(x, z)] = g;
    }
  }
}
// vista previa de una geografía para el menú: un ejemplo con semilla fija (alturas, tipos de casilla y sitio de las fortalezas)
const previews = new Map();
export function previewMap(key) {
  let p = previews.get(key); if (p) return p;
  if (key === 'rio') { const el = new Float32Array(N); riverGround(rngOf(4242), el, new Float32Array(MD)); p = { HM: el, TT: new Uint8Array(N), F: [[MW * .15, MD / 2], [MW * .85, MD / 2]] }; }
  else { const g = GEO.build(key, 4242); p = { HM: g.HM, TT: g.TT, F: g.F, snow: g.snow }; }
  previews.set(key, p); return p;
}
// ---------- Mapa de alturas ----------
const RIVX = new Float32Array(MD).fill(MW / 2);   // x del río en cada fila: separa las dos mitades del mapa
export let EL = null, G = null, HM = null, flats = [], forts = [];
function groundXZ(x, z) {
  let g = EL[idx(x, z)]; const cx = x + .5, cz = z + .5;
  for (const f of flats) { const r = Math.hypot(cx - f.x, cz - f.z); if (r < f.r1) g += (f.h - g) * (1 - smooth01((r - f.r0) / (f.r1 - f.r0))); }
  for (const f of forts) if (f.moat) { const p = polar(f, cx, cz); if (p) { const rw = wallR(f, p[1]); if (p[0] > rw + 2.2 && p[0] < rw + 4.6 && !f.gates.some(ga => angDiff(p[1], ga) * p[0] < 2.4)) g = -1.6; } }
  return g;
}
function computeHM() { for (let z = 0; z < MD; z++) for (let x = 0; x < MW; x++) { const i = idx(x, z), g = groundXZ(x, z); G[i] = g; HM[i] = g >= .5 ? Math.max(1, Math.round(g)) : 0; } }
export const cellOf = (x, z) => idx(THREE.MathUtils.clamp(Math.floor(x), 0, MW - 1), THREE.MathUtils.clamp(Math.floor(z), 0, MD - 1));
export const surfY = (x, z) => HM[cellOf(x, z)];
// ---------- Fortalezas ----------
function polar(f, x, z) { const dx = x - f.x, dz = z - f.z, r = Math.hypot(dx, dz); return r > 26 ? null : [r, Math.atan2(dz, dx)]; }
const angDiff = (a, b) => { let d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; };
// distancia desde el centro hasta el borde de un polígono (coordenadas locales: +z = frente) en el ángulo dado
function shapeRadius(pts, ang) {
  const dx = Math.cos(ang), dz = Math.sin(ang); let best = 0;
  for (let i = 0; i < pts.length; i++) { const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length], ex = bx - ax, ez = bz - az, det = -dx * ez + ex * dz; if (Math.abs(det) < 1e-9) continue;
    const t = (-ax * ez + ex * az) / det, u = (dx * az - dz * ax) / det; if (u >= -1e-6 && u <= 1 + 1e-6 && t > best) best = t; }
  return best || 6;
}
export function wallR(f, th) { const n = f.rw.length, t = (((th / (Math.PI * 2)) % 1) + 1) % 1 * n, i = Math.floor(t), k = t - i; return f.rw[i % n] * (1 - k) + f.rw[(i + 1) % n] * k; }
export const inGate = (f, th, r) => f.gates.some(g => angDiff(th, g) * r < 1.8);
export const fortPt = (f, r, th) => ({ x: f.x + Math.cos(th) * r, z: f.z + Math.sin(th) * r });
export function wallHit(x, z) { for (const f of forts) { const p = polar(f, x, z); if (!p) continue; for (const q of f.rings) if (Math.abs(p[0] - wallR(f, p[1]) * q) < .85 && !inGate(f, p[1], p[0])) return true; } return false; }
// ---------- Regiones ----------
export let regions = [], regionCell = null;
function regionAt(x, z) { let b = 0, bd = 1e9; for (let r = 0; r < regions.length; r++) { const s = regions[r], d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; b = r; } } return b; }
export const regionOwner = r => { const s = regions[r]; return s.kind === 'base' ? s.side : s.owner; };
export const regionShown = r => { const s = regions[r]; return s.kind === 'base' ? s.side : (s.known ?? s.owner); };   // lo que sabes de quién es
export let treeCell = null, roadCell = null;
// el terreno no se tiñe con el dueño de cada región (ni líneas de frontera ni sombra de color: daban demasiadas pistas);
// el dueño se ve en el pueblo, en su bandera y en el minimapa, que es lo único que hay que repintar
export function paintRegion() { markMiniDirty(); }
// ---------- Terreno fusionado: una malla por trozo de 64×64, solo caras visibles ----------
// Material del terreno: colores por vértice + niebla de guerra (textura por posición) + brillo del agua
function terrainMat(water) {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad });
  m.onBeforeCompile = sh => {
    sh.uniforms.uFog = fogU.uFog; sh.uniforms.uTime = fogU.uTime;
    sh.vertexShader = 'varying vec2 vFogP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vFogP = (modelMatrix * vec4(transformed, 1.)).xz;');
    sh.fragmentShader = 'uniform sampler2D uFog; uniform float uTime; varying vec2 vFogP;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      float fv = texture2D(uFog, vFogP / vec2(${MW}., ${MD}.)).r;
      ${water ? 'float w = sin(vFogP.x * .35 + vFogP.y * .22 + uTime * .9) * sin(vFogP.y * .41 - vFogP.x * .15 - uTime * .7); gl_FragColor.rgb += smoothstep(.35, .95, w) * .07 * smoothstep(.6, 1., fv);' : ''} vec3 fc = vec3(.075, .09, .12), dim = gl_FragColor.rgb * .58;
      gl_FragColor.rgb = fv < .47 ? mix(fc, dim, smoothstep(.0, .47, fv)) : mix(dim, gl_FragColor.rgb, (fv - .47) / .53);`);
  };
  return m;
}
const FACES = [[1, 0, 0, [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]], [-1, 0, 0, [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
  [0, 1, 0, [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]], [0, -1, 0, [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
  [0, 0, 1, [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]], [0, 0, -1, [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]]];
class Chunk {
  constructor() { this.p = []; this.n = []; this.c = []; this.nv = 0; }
  quad(f, x0, x1, y0, y1, z0, z1, col) {
    const [nx, ny, nz, cs] = FACES[f], v = this.nv;
    for (const [a, b, c] of cs) { this.p.push(a < 0 ? x0 : x1, b < 0 ? y0 : y1, c < 0 ? z0 : z1); this.n.push(nx, ny, nz); this.c.push(col >> 16 & 255, col >> 8 & 255, col & 255); }
    this.nv += 4; return v;
  }
  box(cx, cy, cz, sx, sy, sz, col) { for (let f = 0; f < 6; f++) if (f !== 3) this.quad(f, cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, cz - sz / 2, cz + sz / 2, col); }
  build(mat, parent = world) {
    const g = new THREE.BufferGeometry(), ix = new Uint32Array(this.nv / 4 * 6);
    for (let q = 0, v = 0; v < this.nv; v += 4) { ix[q++] = v; ix[q++] = v + 1; ix[q++] = v + 2; ix[q++] = v; ix[q++] = v + 2; ix[q++] = v + 3; }
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.BufferAttribute(Uint8Array.from(this.c), 3, true)); g.setIndex(new THREE.BufferAttribute(ix, 1));
    g.computeBoundingSphere(); this.p = this.n = this.c = null;
    const m = new THREE.Mesh(g, mat); parent.add(m); return m;
  }
}
// ---------- Generación del mapa ----------
function groundPaint(x, z) {   // patio de la fortaleza, pie de muralla, caminos de las puertas y plaza de los pueblos
  for (const f of forts) {
    const p = polar(f, x, z); if (!p) continue;
    const [r, th] = p, rw = wallR(f, th), M = civOf(f.side).map, qi = f.rings[f.rings.length - 1];
    if (r < rw * qi - .7) { const a = f.tb - Math.PI / 2, ic = M.inside ? M.inside(r * Math.cos(th - a), r * Math.sin(th - a)) : -1; return ic >= 0 ? ic : M.plaza; }
    if (f.rings.length > 1 && r < rw - .7) return M.between;
    if (r < rw + 1.2) return M.wallbase;
    if (r < rw + 9 && f.gates.some(g => angDiff(th, g) * r < 1.2)) return M.path;
  }
  for (const f of flats) if (f.kind === 'town' && Math.hypot(x - f.x, z - f.z) < 3.6) return TP.path;
  return -1;
}
// color de la cara superior de una casilla: pocas manchas grandes (personalidad) sin ruido por vóxel
export function sideAt(x, z) {   // 0 = orilla oeste (tu civilización), 1 = orilla este; borde ruidoso de ~24 casillas
  const d = x - RIVX[THREE.MathUtils.clamp(z | 0, 0, MD - 1)] + (n2(x, z, .08, 2, 61) - .5) * 26, t = THREE.MathUtils.clamp(d / 24 + .5, 0, 1);
  return t <= 0 ? 0 : t >= 1 ? 1 : n2(x, z, .11, 2, 63) < t ? 1 : 0;   // manchas irregulares en la franja de mezcla, sin damero
}
export const biomeAt = (x, z) => civOf(sideAt(x, z)).map;
// rasgo de paisaje de cada bioma (solo color de suelo; Galos y mexicas añaden piezas en buildVoxels)
function featureAt(x, z, side, B) {
  const cx = x + .5, cz = z + .5, f = n2(cx, cz, .055, 3, 33 + side * 8);
  if (B.feature === 'nile') { if (geoRiver && Math.abs(cx - RIVX[z]) < 17) return z % 4 ? 0x86ac58 : 0x76a04c; return f < .3 ? 0xecdaa6 : -1; }
  if (f >= .22) return -1;
  switch (B.feature) {
    case 'vine': return z % 3 === 0 ? 0x4f7a3a : 0x9ab868;
    case 'salt': return f < .17 ? 0xece6d6 : 0xd8d0b4;
    case 'paddy': return x % 6 === 0 || z % 6 === 0 ? 0x7a9a5a : 0x7ab8c8;
    case 'maize': return z % 2 ? 0xa8b44c : 0x7a9a40;
    case 'rocks': return f < .15 ? 0x8a8e88 : 0x6a9a48;
  }
  return -1;
}
export function terrainColor(x, z) {
  const i = idx(x, z), h = HM[i], cx = x + .5, cz = z + .5;
  const pc = groundPaint(cx, cz); if (pc >= 0) return pc;
  const side = sideAt(cx, cz), B = civOf(side).map, gt = GEOT[i];
  if (roadCell && roadCell[i]) return h <= 1 ? TP.ford : B.road;
  if (gt === 1) return B.lush;
  if (gt === 2) { const w = n2(cx, cz, .12, 2, 71) > .55; return h <= 1 ? (w ? 0xb8ccc0 : 0xd6cca0) : (w ? 0x6c9a92 : 0x6a8a5a); }   // bajío / pantano: manchas grandes, sin moteado
  if (gt === 3) return B.sand;
  if (gt === 4) return mixHex(B.ground[0], 0x4f9a3a, .45);
  if (gt === 6) return (x * 5 + z * 3) % 7 ? 0xd4e8f0 : 0xbcd8e8;   // hielo
  if (gt === 7) return h >= 4 ? ((x + z) % 3 ? 0xa8a49a : 0x9a968c) : 0x8e8a80;   // ruinas
  if (gt === 5) return h >= 8 ? 0x3a3034 : (x * 7 + z * 3) % 5 ? 0x4a4448 : 0x5a4a44;   // roca volcánica
  if (h <= 1) return B.sand;
  if (treeCell && treeCell[i]) return B.lush;
  const fc = featureAt(x, z, side, B); if (fc >= 0) return fc;
  const m = n2(cx, cz, .045, 3, 21 + side * 7) + (h - 2) * .05, tone = THREE.MathUtils.clamp(Math.floor((m - .34) / .09), 0, 3);
  const col = h >= 6 ? (h >= 9 ? 0xe4e2da : mixHex(B.ground[tone], 0x9a9488, Math.min(1, (h - 5) / 3))) : B.ground[tone];   // alturas: la hierba pasa a roca y, en las cumbres, a nieve
  return geoR?.snow ? mixHex(col, 0xeef2f6, .62) : col;   // valle helado: todo nevado
}
export let meshes = [], spots = [], bridgeSites = [];
// código de mapa para compartir: GEOGRAFÍA-SEMILLA (p. ej. RIO-48213). La misma geografía y semilla dan el mismo terreno y los mismos pueblos
export const mapCode = () => `${scen.toUpperCase()}-${seed}`;
export function parseCode(t) {
  const m = /^\s*([A-Za-z]+)\s*-\s*(\d{1,9})\s*$/.exec(t || ''), key = m && m[1].toLowerCase();
  return m && GEO.LIST[key] ? { geo: key, seed: +m[2] } : null;
}
export function generate(newSeed, tries = 0) {
  setSeed(newSeed);
  meshes.forEach(m => { m.parent.remove(m); m.geometry.dispose(); m.material.dispose(); }); meshes = [];
  EL = new Float32Array(N); G = new Float32Array(N); HM = new Int8Array(N);
  const rng = rngOf(seed);
  // tras muchas semillas fallidas se cae al río clásico, que siempre sale jugable (evita reintentar sin fin)
  const pickR = rng();   // se tira siempre, para que un código de mapa (geografía + semilla) dé el mismo mapa tanto si se eligió al azar como a mano
  scen = tries >= 20 ? 'rio' : S.wantScen === 'random' ? GEO.keys[pickR * GEO.keys.length | 0] : (GEO.LIST[S.wantScen] ? S.wantScen : 'rio');
  baseGround(rng);
  flats = []; forts = [];
  computeHM();
  if (buildNav() < .55 && tries < 40) return generate(newSeed + 7919, tries + 1);
  const plateau = (x, z, rad) => { let s = 0, n = 0; for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) { const cx = Math.floor(x) + dx, cz = Math.floor(z) + dz; if (cx < 0 || cz < 0 || cx >= MW || cz >= MD || dx * dx + dz * dz > rad * rad) continue; const g = G[idx(cx, cz)]; if (g > .5) { s += g; n++; } } return THREE.MathUtils.clamp(Math.round(n ? s / n : 2), 2, 4) + .2; };
  const pick = (x0, x1) => {   // sitio llano para la fortaleza en un extremo del mapa
    let best = -1, bs = -1e9;
    for (let t = 0; t < 500; t++) {
      const x = Math.floor(MW * (x0 + (x1 - x0) * rng())), z = Math.floor(MD * (.3 + .4 * rng())), i = idx(x, z);
      if (!inMain[i] || HM[i] > 5) continue;
      let sc = 0; for (let dz = -12; dz <= 12; dz += 3) for (let dx = -12; dx <= 12; dx += 3) { const cx = x + dx, cz = z + dz; if (cx < 0 || cz < 0 || cx >= MW || cz >= MD) { sc -= 3; continue; } const j = idx(cx, cz); sc += HM[j] >= 1 ? 1 - Math.abs(HM[j] - HM[i]) * .3 : -2; }
      if (sc > bs) { bs = sc; best = i; }
    }
    return best;
  };
  let A, B;
  if (geoR) { const fi = ([x, z]) => { const n = nearestNode(x, z); return Math.hypot(cellX(n) - x, cellZ(n) - z) < 12 ? n : -1; }; A = fi(geoR.F[0]); B = fi(geoR.F[1]); }
  else { A = pick(.1, .2); B = pick(.8, .9); }
  if ((A < 0 || B < 0) && tries < 40) return generate(newSeed + 104729, tries + 1);
  const mkFort = (i, side) => {
    const x = cellX(i), z = cellZ(i), tb = Math.atan2(MD / 2 - z, MW / 2 - x), M = civOf(side).map, pts = M.shape();
    const maxR = Math.max(...pts.map(([a, b]) => Math.hypot(a, b))), k = 12.3 / maxR, n = 96;
    const rw = Array.from({ length: n }, (_, j) => shapeRadius(pts, j / n * Math.PI * 2 - tb + Math.PI / 2) * k);
    return { side, x, z, tb, rw, k, rings: M.rings || [1], moat: !!M.moat, gates: [tb, tb + 2.1, tb - 2.1], h: plateau(x, z, 13) };
  };
  forts = [mkFort(A, 0), mkFort(B, 1)];
  for (const f of forts) flats.push({ kind: 'fort', x: f.x, z: f.z, r0: 15, r1: 21, h: f.h });
  // cada civilización coloca castillo, cuartel y altar a su manera (coordenadas locales del recinto, +z hacia el centro del mapa)
  const lay = (sd, kind) => { const f = forts[sd], [lx, lz, ry, sc] = civOf(sd).map.layout[kind], a = f.tb - Math.PI / 2;
    return { kind: kind === 'castle' ? 'base' : kind, side: sd, x: f.x + lx * Math.cos(a) - lz * Math.sin(a), z: f.z + lx * Math.sin(a) + lz * Math.cos(a), ry, sc }; };
  spots = [lay(0, 'castle'), lay(1, 'castle'), lay(0, 'barracks'), lay(1, 'barracks'), lay(0, 'altar'), lay(1, 'altar'), lay(0, 'temple'), lay(1, 'temple')];   // mismo orden que BASE0…TEMP1 en config
  const names = [...TOWN_NAMES].sort(() => rng() - .5);
  // pueblos lejos de los bordes del mapa (en las esquinas quedaban apartados del juego)
  let pool = mainList.filter(i => HM[i] <= 7 && GEOT[i] !== 6 && GEOT[i] !== 7 && GEOT[i] !== 9 && cellX(i) > 26 && cellX(i) < MW - 26 && cellZ(i) > 22 && cellZ(i) < MD - 22);
  if (geoR?.oasis) pool = pool.filter(i => GEOT[i] === 4);   // en el desierto, los pueblos están en los oasis
  const addTown = (x, z, extra = {}) => { spots.push({ kind: 'town', x, z, name: names[spots.length % names.length], owner: -1, ...extra }); flats.push({ kind: 'town', x, z, r0: 4.8, r1: 8.5, h: plateau(x, z, 4) }); };
  for (const [x, z] of geoR?.special || []) { const n = nearestNode(x, z); if (Math.hypot(cellX(n) - x, cellZ(n) - z) < 8) addTown(cellX(n), cellZ(n), geoR.goldTop || scen === 'lago' ? { special: true } : geoR.oasis ? { oasis: true } : {}); }
  // sitios propios de la geografía: una atalaya en cada puerto de la cordillera y la ciudadela en el paso del istmo
  const onLand = ([x, z], max = 8) => { const n = nearestNode(x, z); return Math.hypot(cellX(n) - x, cellZ(n) - z) < max && spots.every(o => Math.hypot(o.x - cellX(n), o.z - cellZ(n)) > 18) ? n : -1; };
  if (scen === 'cordillera') for (const p of geoR.passes) { const n = onLand(p); if (n >= 0) addTown(cellX(n), cellZ(n), { watch: true }); }
  if (scen === 'istmo' && geoR.passes[0]) { const n = onLand(geoR.passes[0], 14); if (n >= 0) addTown(cellX(n), cellZ(n), { keep: true }); }
  const halves = [pool.filter(i => cellX(i) < MW / 2), pool.filter(i => cellX(i) >= MW / 2)];
  while (spots.filter(s => s.kind === 'town').length < GAME.towns) {   // mismo número de pueblos en cada mitad
    const cnt = [0, 1].map(h => spots.filter(s => s.kind === 'town' && (s.x >= MW / 2) === !!h).length), half = cnt[0] <= cnt[1] ? 0 : 1;
    let bi = -1, bs = -1;
    for (const i of halves[half]) { const x = cellX(i), z = cellZ(i); let m = 1e9; for (const s of spots) m = Math.min(m, (s.x - x) ** 2 + (s.z - z) ** 2); if (m > bs) { bs = m; bi = i; } }
    if (bi < 0) break;
    addTown(cellX(bi), cellZ(bi));
  }
  const plain = s => s.kind === 'town' && !s.camp && !s.keep && !s.watch && !s.fortified && !s.special;
  // el pueblo más céntrico del mapa es la ciudadela: guardada por colosos neutrales, da colosos a quien la conquiste
  if (!spots.some(s => s.keep)) { const c = spots.filter(plain).sort((a, b) => Math.hypot(a.x - MW / 2, (a.z - MD / 2) * 1.2) - Math.hypot(b.x - MW / 2, (b.z - MD / 2) * 1.2))[0];
    if (c) c.keep = true; }
  for (const c of spots) if (c.keep && !c.name.startsWith('CIUDADELA')) c.name = 'CIUDADELA DE ' + c.name;
  // dos pueblos (uno a cada lado del río, cerca del centro) son campamentos con guardianes neutrales
  for (const half of [0, 1]) {
    const c = spots.filter(s => plain(s) && (s.x < MW / 2) === !half).sort((a, b) => (Math.abs(a.x - MW / 2) + Math.abs(a.z - MD / 2) * .5) - (Math.abs(b.x - MW / 2) + Math.abs(b.z - MD / 2) * .5))[0];
    if (c) { c.camp = true; c.name = 'CAMPAMENTO ' + c.name; }
  }
  // en cada mitad, una atalaya: el pueblo pequeño más metido en la franja central (lejos de los bordes de arriba y abajo y de las fortalezas)
  for (const half of spots.some(s => s.watch) ? [] : [0, 1]) {
    const f = forts[half], score = s => Math.abs(s.z - MD / 2) * 1.6 + Math.abs(s.x - MW / 2) * .6 - Math.min(60, Math.hypot(s.x - f.x, s.z - f.z)) * .5;
    const c = spots.filter(s => plain(s) && (s.x < MW / 2) === !half && s.z > MD * .2 && s.z < MD * .8).sort((a, b) => score(a) - score(b))[0];
    if (c) c.watch = true;
  }
  for (const c of spots) if (c.watch && !c.name.startsWith('ATALAYA')) c.name = 'ATALAYA DE ' + c.name;
  // un 25 % de los pueblos neutrales son fortificados: más grandes, con muchos defensores y el doble de oro
  const nFort = Math.round(spots.filter(plain).length * .25);
  for (let k = 0; k < nFort; k++) {
    const half = k % 2, f = forts[half];
    const cand = spots.filter(s => plain(s) && (s.x >= MW / 2) === !!half && Math.hypot(s.x - f.x, s.z - f.z) > 55);
    const c = cand[(rng() * cand.length) | 0]; if (!c) continue;
    c.fortified = true;
  }
  for (const c of spots) if (c.fortified || c.keep) { const fl = flats.find(q => q.kind === 'town' && q.x === c.x && q.z === c.z); if (fl) { fl.r0 = 8; fl.r1 = 12; } }   // los grandes, sobre una explanada mayor
  computeHM(); buildNav();
  for (const s of spots) s.node = nearestNode(s.x, s.z);
  // equilibrio: distancia por camino de cada fortaleza a sus 3 pueblos más cercanos de su mitad; si difiere más de un 18 %, otra semilla
  if (geoR && tries < 8) {
    const near = sd => { const f = bfs([spots[sd].node]), d = spots.filter(s => s.kind === 'town' && !s.camp && !s.keep && !s.watch && (s.x >= MW / 2) === !!sd).map(s => f[s.node]).sort((a, b) => a - b).slice(0, 3); return d.length ? d.reduce((a, b) => a + b, 0) / d.length : 1e9; };
    const a = near(0), b = near(1), reach = bfs([spots[BASE0].node])[spots[BASE1].node];
    if (reach >= 1e9 || a >= 1e8 || b >= 1e8 || Math.abs(a - b) / Math.max(a, b) > .18) return generate(newSeed + 15485863, tries + 1);
  }
  // río clásico: dos sitios donde se puede construir un puente (lejos de los vados y de los pueblos)
  bridgeSites = [];
  if (scen === 'rio') for (const want of [.3, .7]) {
    let best = -1, bd = 1e9;
    for (let z = Math.floor(MD * .15); z < MD * .85; z++) {
      const xr = Math.round(RIVX[z]); if (HM[idx(xr, z)] > 0) continue;
      const ford = [-12, -6, 0, 6, 12].some(dz => z + dz >= 0 && z + dz < MD && HM[idx(Math.round(RIVX[z + dz]), z + dz)] > 0);
      const d = Math.abs(z - MD * want); if (!ford && d < bd && spots.every(o => Math.hypot(o.x - xr, o.z - z) > 16)) { bd = d; best = z; }
    }
    if (best >= 0) { const xr = RIVX[best], cells = []; for (let dz = -1; dz <= 1; dz++) for (let dx = -7; dx <= 7; dx++) { const c = idx(Math.round(xr + dx), best + dz); if (HM[c] <= 0) cells.push(c); } bridgeSites.push({ x: xr, z: best + .5, cells, axis: 'x', built: false }); }
  }
  for (const [bx, bz] of geoR?.bridges || []) {   // cañón: puentes ya construidos sobre la garganta
    const cells = []; for (let dz = -3; dz <= 3; dz++) for (let dx = -16; dx <= 16; dx++) { const x = Math.round(bx) + dx, z = Math.round(bz) + dz; if (x >= 0 && z >= 0 && x < MW && z < MD && GEOT[idx(x, z)] === 9) cells.push(idx(x, z)); }
    if (cells.length) bridgeSites.push({ x: bx, z: bz, cells, axis: 'x', built: true, h: 4, h0: 0, breakable: true });
  }
  regions = spots.filter(s => s.kind === 'base' || s.kind === 'town');
  regions.forEach((s, r) => { s.region = r; });
  ocean.material.color.setHex(geoR?.sea ? 0x2f6fa8 : TP.outside);
  regionCell = new Int8Array(N);
  for (let z = 0; z < MD; z++) for (let x = 0; x < MW; x++) regionCell[idx(x, z)] = regionAt(x + .5, z + .5);
  buildRoads();
  buildVoxels();
  buildMinimap();
}
function buildRoads() {
  roadCell = new Uint8Array(N);
  const Rg = regions, inT = [0], edges = [];
  while (inT.length < Rg.length) {
    let best = null, bd = 1e9;
    for (const i of inT) for (let j = 0; j < Rg.length; j++) if (!inT.includes(j)) { const d = Math.hypot(Rg[i].x - Rg[j].x, Rg[i].z - Rg[j].z); if (d < bd) { bd = d; best = [i, j]; } }
    inT.push(best[1]); edges.push(best);
  }
  for (const [a, b] of edges) {
    const f = bfs([Rg[a].node]), A = Rg[a]; let v = Rg[b].node;
    for (let guard = 0; f[v] > 0 && f[v] < 1e9 && guard < 5000; guard++) {
      const x = v % MW, z = (v / MW) | 0; let best = -1, bd = 1e9;
      for (let k = 0, m = stepMask[v]; k < 8; k++) { if (!(m >> k & 1)) continue; const j = v + NBO[k]; if (f[j] !== f[v] - 1) continue; const d = (cellX(j) - A.x) ** 2 + (cellZ(j) - A.z) ** 2; if (d < bd) { bd = d; best = j; } }
      if (best < 0) break;
      roadCell[v] = 1; if (x + 1 < MW && HM[v + 1] > 0) roadCell[v + 1] = 1;
      v = best;
    }
  }
}
// árboles de cada bioma: bajos para que las tropas sobresalgan por encima
function treeBoxes(L, type, cx, h, cz, r2) {
  const t = .5 + r2 * .25;
  switch (type) {
    case 'cypress': L.box(cx, h + .15, cz, .16, .3, .16, 0x5a3a24); L.box(cx, h + .75, cz, .42, .9, .42, 0x2f5a35); L.box(cx, h + 1.3, cz, .24, .3, .24, 0x2f5a35); break;
    case 'olive': L.box(cx, h + .2, cz, .16, .4, .16, 0x6a5a44); L.box(cx, h + .62, cz, .9, .45, .8, 0x8a9a6a); break;
    case 'palm': L.box(cx, h + .6, cz, .14, 1.2, .14, 0x8a6a3a); L.box(cx, h + 1.24, cz, 1.1, .08, .26, 0x4f8a3a); L.box(cx, h + 1.26, cz, .26, .08, 1.1, 0x5a9a40); break;
    case 'bamboo': for (let k = 0; k < 3; k++) L.box(cx + (k - 1) * .22, h + .6 + k * .05, cz + (k % 2) * .16 - .08, .08, 1.2 + k * .1, .08, 0x7ab04a); L.box(cx, h + 1.15, cz, .5, .1, .3, 0x5f9a3e); break;
    case 'ceiba': L.box(cx, h + .5, cz, .2, 1, .2, 0x8a7a5a); L.box(cx, h + 1.1, cz, 1.3, .28, 1.3, 0x2f6a35); L.box(cx, h + 1.3, cz, .8, .2, .8, 0x3a7a3e); break;
    case 'jungle': L.box(cx, h + .28, cz, .95, .56, .95, 0x2f6a35); L.box(cx + .15, h + .66, cz - .1, .5, .3, .5, 0x3a8a45); break;
    case 'oak': L.box(cx, h + .2, cz, .2, .4, .2, 0x5a3a24); L.box(cx, h + .3 + t * .5, cz, .95, t, .95, 0x2f5a30); L.box(cx, h + .35 + t, cz, .6, .3, .6, 0x3a6a38); break;
    default: L.box(cx, h + .15, cz, .2, .3, .2, TP.trunk); L.box(cx, h + .3 + t * .35, cz, .78, t * .7, .78, TP.pine); L.box(cx, h + .3 + t * .9, cz, .42, t * .4, .42, TP.pine);   // pino
  }
}
// bosque denso: vértices de los árboles de cada casilla (para talarlos) y malla de cada trozo de terreno
let treeV = new Map(), chunkMesh = [];
export function removeTrees(cells) {
  const dirty = new Set();
  for (const c of cells) { GEOT[c] = 0; treeCell[c] = 0; const t = treeV.get(c); if (!t) continue; const [ck, v0, v1] = t, m = chunkMesh[ck], a = m.geometry.attributes.position.array;
    for (let v = v0; v < v1; v++) a[v * 3 + 1] = -30; treeV.delete(c); dirty.add(m); }
  for (const m of dirty) m.geometry.attributes.position.needsUpdate = true;
}
function buildVoxels() {
  treeV = new Map();
  const H4 = [[1, 0, 0], [-1, 0, 1], [0, 1, 4], [0, -1, 5]];   // dx, dz, cara
  const hAt = (x, z) => (x < 0 || z < 0 || x >= MW || z >= MD) ? 0 : HM[idx(x, z)];
  const nearFlat = (x, z, m = 1) => flats.some(f => Math.hypot(x - f.x, z - f.z) < f.r1 + m);
  // bosques: solo en manchas compactas, lejos del río, los caminos, las fortalezas y los pueblos
  treeCell = new Uint8Array(N);
  for (let z = 1; z < MD - 1; z++) for (let x = 1; x < MW - 1; x++) {
    const i = idx(x, z), h = HM[i], cx = x + .5, cz = z + .5;
    if (GEOT[i] === 1) { if ((x + z) % 2 === 0 && !nearFlat(cx, cz, 1)) treeCell[i] = 2; continue; }
    if (GEOT[i] === 3 || GEOT[i] === 2) continue;   // sin árboles en arena, pantano ni bajío
    if (h < 2 || h > 4 || nearFlat(cx, cz, 3)) continue;
    let ok = true; for (let dz = -2; dz <= 2 && ok; dz++) for (let dx = -2; dx <= 2; dx++) { const j = idx(x + dx, z + dz); if (hAt(x + dx, z + dz) <= 1 || (Math.abs(dx) <= 1 && Math.abs(dz) <= 1 && roadCell[j])) { ok = false; break; } }
    if (!ok) continue;
    const f = n2(cx, cz, .055, 3, 22), side = sideAt(cx, cz), B = civOf(side).map;
    if (B.feature === 'nile' && geoRiver && Math.abs(cx - RIVX[z]) > 22) continue;   // en Egipto, solo palmerales junto al río
    if (featureAt(x, z, side, B) >= 0 && B.feature !== 'nile') continue;
    if (f > .62 && hash(x * 3, 1, z * 11) < (.4 + (f - .62) * 2.5) * B.dens) treeCell[i] = 1;
  }
  // sombras cocinadas: el sol viene de -x/+z, así que árboles y desniveles oscurecen hacia +x/-z
  const shadow = new Float32Array(N);
  for (let z = 0; z < MD; z++) for (let x = 0; x < MW; x++) {
    const i = idx(x, z);
    if (treeCell[i]) for (const [dx, dz, k] of [[1, -1, .16], [0, -1, .1], [1, 0, .08]]) { const nx = x + dx, nz = z + dz; if (nx < MW && nz >= 0) shadow[idx(nx, nz)] = Math.max(shadow[idx(nx, nz)], k); }
    if (hAt(x - 1, z + 1) > HM[i] && HM[i] > 0) shadow[i] = Math.max(shadow[i], .12);
  }
  const CH = 64, NCX = Math.ceil(MW / CH), NCZ = Math.ceil(MD / CH), landC = [], waterC = [];
  for (let k = 0; k < NCX * NCZ; k++) { landC.push(new Chunk()); waterC.push(new Chunk()); }
  for (let z = 0; z < MD; z++) for (let x = 0; x < MW; x++) {
    const i = idx(x, z), h = HM[i], cx = x + .5, cz = z + .5, ck = (z / CH | 0) * NCX + (x / CH | 0), L = landC[ck];
    if (h <= 0 || GEOT[i] === 9) {   // agua (y bajo los puentes del cañón, que se dibujan aparte)
      const depth = -G[i], nearLand = H4.some(([a, b]) => hAt(x + a, z + b) > 0);
      waterC[ck].quad(2, x, x + 1, 0, 0, z, z + 1, nearLand ? TP.edge : depth < 2.2 ? TP.shallow : TP.deep);
      continue;
    }
    let col = terrainColor(x, z); if (shadow[i]) col = mixHex(col, 0x10203a, shadow[i]);
    L.quad(2, x, x + 1, h, h, z, z + 1, col);
    const sc = h <= 1 ? TP.cliffS : TP.cliff, lip = mixHex(col, 0x10203a, .14);   // escalón de 1: color del suelo; más hondo: ladera
    for (const [a, b, f] of H4) { const hn = Math.max(0, hAt(x + a, z + b)); if (hn >= h) continue; L.quad(f, x, x + 1, h - 1, h, z, z + 1, h <= 1 ? sc : lip); if (hn < h - 1) L.quad(f, x, x + 1, hn, h - 1, z, z + 1, sc); }
    if (treeCell[i] === 2) { const v0 = L.nv; treeV.set(i, [ck, v0]); const B = biomeAt(cx, cz), r2 = hash(x * 5, 7, z * 3); L.box(cx, h + .5 + r2 * .15, cz, 1.6, .9 + r2 * .3, 1.6, B.treeCol); L.box(cx + .2, h + 1.1 + r2 * .3, cz - .2, .8, .4, .8, mixHex(B.treeCol, 0x9ad86a, .18)); treeV.get(i).push(L.nv); }
    else if (treeCell[i]) { const B = biomeAt(cx, cz), r2 = hash(x * 5, 7, z * 3); treeBoxes(L, B.trees[r2 > .55 ? 1 : 0], cx, h, cz, r2); }
    else if (!nearFlat(cx, cz, 1) && !roadCell[i] && h > 1) {   // piezas pequeñas del paisaje
      const side = sideAt(cx, cz), B = civOf(side).map;
      if (B.feature === 'rocks' && featureAt(x, z, side, B) === 0x8a8e88 && hash(x, 9, z) < .18) { L.box(cx, h + .18, cz, .62, .36, .5, 0x8a8a86); L.box(cx + .15, h + .42, cz + .05, .34, .2, .3, 0x9a9a96); }
      else if (B.feature === 'maize' && featureAt(x, z, side, B) >= 0 && x % 2 === 0 && z % 2) { L.box(cx, h + .3, cz, .1, .6, .1, 0x8ab04a); L.box(cx, h + .6, cz, .12, .14, .12, 0xe0c050); }
    }
  }
  const lmat = terrainMat(false), wmat = terrainMat(true);
  chunkMesh = landC.map(L => { if (!L.nv) return null; const m = L.build(lmat); meshes.push(m); return m; });
  waterC.forEach(W => { if (W.nv) meshes.push(W.build(wmat)); });
}

// ---------- Vista de una geografía para el menú ----------
// Terreno vóxel como el de la partida (alturas, laderas, agua, bosque y arboledas) de la geografía de ejemplo,
// sin edificios ni pueblos, con colores de hierba neutros. Construye solo la ventana [x0,x1)×[z0,z1).
const PREV_GROUND = [0x6ea653, 0x7db45b, 0x8bbd61, 0x9fc56c];
export function geoTerrain(key, x0, z0, x1, z1) {
  const p = previewMap(key), grp = new THREE.Group(), L = new Chunk(), W = new Chunk();
  const H = (x, z) => { if (x < 0 || z < 0 || x >= MW || z >= MD) return 0; const g = p.HM[idx(x, z)]; return g >= .5 ? Math.max(1, Math.round(g)) : 0; };
  const H4 = [[1, 0, 0], [-1, 0, 1], [0, 1, 4], [0, -1, 5]];
  for (let z = Math.max(0, z0); z < Math.min(MD, z1); z++) for (let x = Math.max(0, x0); x < Math.min(MW, x1); x++) {
    const i = idx(x, z), h = H(x, z), cx = x + .5, cz = z + .5, t = p.TT[i];
    if (h <= 0 || t === 9) { const nearLand = H4.some(([a, b]) => H(x + a, z + b) > 0); W.quad(2, x, x + 1, 0, 0, z, z + 1, nearLand ? TP.edge : -p.HM[i] < 2.2 ? TP.shallow : TP.deep); continue; }
    const tree = t === 1 ? ((x + z) % 2 === 0 ? 2 : 0) : (t === 0 && h >= 2 && h <= 7 && n2(cx, cz, .055, 3, 22) > .6 && hash(x * 3, 1, z * 11) < .45) ? 1 : 0;
    let col;
    if (t === 1 || tree) col = TP.lush;
    else if (t === 2) { const w = n2(cx, cz, .12, 2, 71) > .55; col = h <= 1 ? (w ? 0xb8ccc0 : 0xd6cca0) : (w ? 0x6c9a92 : 0x6a8a5a); }
    else if (t === 3 || h <= 1) col = TP.sand;
    else if (t === 4) col = mixHex(PREV_GROUND[0], 0x4f9a3a, .45);
    else if (t === 5) col = h >= 8 ? 0x3a3034 : 0x4a4448;
    else if (t === 6) col = 0xd4e8f0; else if (t === 7) col = 0xa8a49a;
    else { const m = n2(cx, cz, .045, 3, 21) + (h - 2) * .05, tone = THREE.MathUtils.clamp(Math.floor((m - .34) / .09), 0, 3); col = h >= 6 ? (h >= 9 ? 0xe4e2da : mixHex(PREV_GROUND[tone], 0x9a9488, Math.min(1, (h - 5) / 3))) : PREV_GROUND[tone]; }
    if (p.snow && t !== 6 && t !== 3) col = mixHex(col, 0xeef2f6, .62);
    if (H(x - 1, z + 1) > h) col = mixHex(col, 0x10203a, .12);
    L.quad(2, x, x + 1, h, h, z, z + 1, col);
    const lip = mixHex(col, 0x10203a, .14);
    for (const [a, b, f] of H4) { const hn = H(x + a, z + b); if (hn >= h) continue; L.quad(f, x, x + 1, h - 1, h, z, z + 1, h <= 1 ? TP.cliffS : lip); if (hn < h - 1) L.quad(f, x, x + 1, hn, h - 1, z, z + 1, TP.cliff); }
    const r2 = hash(x * 5, 7, z * 3);
    if (tree === 2) { L.box(cx, h + .5 + r2 * .15, cz, 1.6, .9 + r2 * .3, 1.6, TP.canopy); L.box(cx + .2, h + 1.1 + r2 * .3, cz - .2, .8, .4, .8, TP.canopy2); }
    else if (tree) treeBoxes(L, r2 > .55 ? 'oak' : 'pine', cx, h, cz, r2);
  }
  const lm = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad }), wm = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad });
  if (L.nv) L.build(lm, grp); if (W.nv) W.build(wm, grp);
  return grp;
}
