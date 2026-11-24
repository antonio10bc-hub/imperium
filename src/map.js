// Datos del mapa (alturas, fortalezas, regiones) y su generación: terreno, pueblos, caminos y vóxeles.
import * as THREE from 'three';
import { civOf } from './civs.js';
import { BASE0, BASE1, GAME, MAP_SIZES, NP, players, MD, MW, N, TOWN_NAMES, setMapSize, TP, idx, mixHex } from './config.js';
import { GEO } from './geo.js';
import { buildMinimap, markMiniDirty } from './minimap.js';
import { NBO, bfs, buildNav, cellX, cellZ, inMain, mainList, nearestNode, stepMask, walk } from './nav.js';
import { hash, n2, plains, rngOf, seed, setSeed, smooth01 } from './noise.js';
import { fogU, grad, ocean, setGeoLight, world } from './render.js';
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
  const pk = key + MW; let p = previews.get(pk); if (p) return p;
  if (key === 'rio') { const el = new Float32Array(N); riverGround(rngOf(4242), el, new Float32Array(MD)); p = { HM: el, TT: new Uint8Array(N), F: [[MW * .15, MD / 2], [MW * .85, MD / 2]] }; }
  else { const g = GEO.build(key, 4242); p = { HM: g.HM, TT: g.TT, F: g.F, snow: g.snow }; }
  previews.set(pk, p); return p;
}
// ---------- Mapa de alturas ----------
let RIVX = new Float32Array(MD).fill(MW / 2);   // x del río en cada fila: separa las dos mitades del mapa
export let EL = null, G = null, HM = null, flats = [], forts = [];
export const FORT_K = 1.25;   // tamaño de las fortalezas de los jugadores (recinto y murallas) respecto al original
function groundXZ(x, z) {
  let g = EL[idx(x, z)]; const cx = x + .5, cz = z + .5;
  for (const f of flats) { const r = Math.hypot(cx - f.x, cz - f.z); if (r < f.r1 && (f.kind !== 'town' || EL[idx(x, z)] > .5)) g += (f.h - g) * (1 - smooth01((r - f.r0) / (f.r1 - f.r0))); }   // la explanada de un pueblo no rellena el agua (dejaba círculos en la costa)
  for (const f of forts) if (f.moat) { const p = polar(f, cx, cz); if (p) { const rw = wallR(f, p[1]); if (p[0] > rw + 2.2 && p[0] < rw + 4.6 && !f.gates.some(ga => angDiff(p[1], ga) * p[0] < 2.4)) g = -1.6; } }
  return g;
}
function computeHM() { for (let z = 0; z < MD; z++) for (let x = 0; x < MW; x++) { const i = idx(x, z), g = groundXZ(x, z); G[i] = g; HM[i] = g >= .5 ? Math.max(1, Math.round(g)) : 0; } }
export const cellOf = (x, z) => idx(THREE.MathUtils.clamp(Math.floor(x), 0, MW - 1), THREE.MathUtils.clamp(Math.floor(z), 0, MD - 1));
export const surfY = (x, z) => HM[cellOf(x, z)];
// ---------- Fortalezas ----------
function polar(f, x, z) { const dx = x - f.x, dz = z - f.z, r = Math.hypot(dx, dz); return r > 34 ? null : [r, Math.atan2(dz, dx)]; }
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
    if (r < rw * qi - .7) { const a = f.tb - Math.PI / 2, ic = M.inside ? M.inside(r * Math.cos(th - a), r * Math.sin(th - a)) : -1; return ic >= 0 ? ic : (Math.floor(x) + Math.floor(z)) % 2 ? M.plaza : mixHex(M.plaza, 0x10203a, .07); }   // losas del patio
    if (f.rings.length > 1 && r < rw - .7) return M.between;
    if (r < rw + 1.2) return M.wallbase;
    if (r < rw + 9 && f.gates.some(g => angDiff(th, g) * r < 1.2)) return M.path;
  }
  for (const f of flats) if (f.kind === 'town' && Math.hypot(x - f.x, z - f.z) < 3.6) return TP.path;
  return -1;
}
// color de la cara superior de una casilla: pocas manchas grandes (personalidad) sin ruido por vóxel
// mezcla suave entre los suelos de dos civilizaciones: peso del otro bioma en la franja de transición
function mixAt(x, z, side) {
  const w0 = (n2(x, z, .08, 2, 61) - .5) * 26;
  if (NP > 2 && forts.length === NP) { const ds = forts.map(f => Math.hypot(f.x - x, f.z - z) + w0 * (f.side % 2 ? 1 : -1)); let o = -1, bo = 1e9; ds.forEach((d, k) => { if (k !== side && d < bo) { bo = d; o = k; } }); const w = .45 * Math.max(0, 1 - (bo - ds[side]) / 18); return w > .02 ? { o, w } : null; }
  const t = THREE.MathUtils.clamp((x - RIVX[THREE.MathUtils.clamp(z | 0, 0, MD - 1)] + w0) / 24 + .5, 0, 1), w = .42 * (1 - Math.abs(2 * t - 1));
  return w > .02 ? { o: 1 - side, w } : null;
}
export function sideAt(x, z) {   // 0 = orilla oeste (tu civilización), 1 = orilla este; borde ruidoso de ~24 casillas
  if (NP > 2 && forts.length === NP) { let b = 0, bd = 1e9; const w = (n2(x, z, .08, 2, 61) - .5) * 26; for (const f of forts) { const d = Math.hypot(f.x - x, f.z - z) + w * (f.side % 2 ? 1 : -1); if (d < bd) { bd = d; b = f.side; } } return b; }   // con más jugadores: el suelo de la fortaleza más cercana
  const d = x - RIVX[THREE.MathUtils.clamp(z | 0, 0, MD - 1)] + (n2(x, z, .08, 2, 61) - .5) * 26, t = THREE.MathUtils.clamp(d / 24 + .5, 0, 1);
  return t <= 0 ? 0 : t >= 1 ? 1 : n2(x, z, .11, 2, 63) < t ? 1 : 0;   // manchas irregulares en la franja de mezcla, sin damero
}
// algunas geografías mandan sobre el suelo de cada civilización: el desierto es arena y el cañón, tierra ocre, en las dos mitades
const GEO_GROUND = {
  oasis: { ground: [0xe2ca96, 0xd9c08a, 0xe8d4a4, 0xcfb47a], lush: 0x9aa860, sand: 0xe6d29c, road: 0xc8a878, trees: ['palm', 'palm'], treeCol: 0x4f8a3a, dens: .35, feature: null },
  canon: { ground: [0xc8a070, 0xbc9464, 0xd0ac7c, 0xb48a5a], lush: 0x8a8a50, sand: 0xd8b888, road: 0xa8845a, trees: ['olive', 'pine'], treeCol: 0x5a7a3a, dens: .45, feature: null },
};
const bioCache = new Map();
export const bioOf = side => { const k = scen + side; let b = bioCache.get(k); if (!b) { const G = GEO_GROUND[scen]; b = G ? { ...civOf(side).map, ...G } : civOf(side).map; bioCache.set(k, b); } return b; };
export const biomeAt = (x, z) => bioOf(sideAt(x, z));
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
    case 'scrub': return f < .15 ? 0xd8d4c4 : 0x8a9a5a;   // Grecia: lajas de caliza entre matorral
    case 'heath': return f < .15 ? 0x8a6a8a : 0x6a7a5a;   // vikingos: brezal morado
    case 'garden': return x % 8 === 0 || z % 8 === 0 ? 0x5a9ab8 : x % 8 === 4 || z % 8 === 4 ? 0xd8c8a0 : 0x5a9a44;   // Persia: jardines cuadrados con canales, paseos de grava y parterres (flores y cipreses en buildVoxels)
    case 'steppe': return f < .14 ? 0xc8c08a : 0xa8b070;   // mongoles: hierba seca
    case 'tea': return z % 3 === 0 ? 0x8a7a5a : 0x4a8040;   // Japón: hileras de té
    case 'rocks': return f < .15 ? 0x8a8e88 : 0x6a9a48;
  }
  return -1;
}
export function terrainColor(x, z) {
  const i = idx(x, z), h = HM[i], cx = x + .5, cz = z + .5;
  const pc = groundPaint(cx, cz); if (pc >= 0) return pc;
  const side = sideAt(cx, cz), B = bioOf(side), gt = GEOT[i];
  if (roadCell && roadCell[i]) {   // camino sutil: unos tramos se marcan más y otros casi se pierden en la hierba; el borde, aún menos
    const rc0 = h <= 1 ? TP.ford : B.road, rc = hash(x, 31, z) < .16 ? mixHex(rc0, 0x5a4630, .14) : rc0, t2 = n2(cx, cz, .045, 3, 21 + side * 7), g2 = B.ground[THREE.MathUtils.clamp(Math.floor((t2 - .34) / .09), 0, 3)];
    const k = .22 + .42 * smooth01((n2(cx, cz, .018, 2, 95) - .3) / .45), c = mixHex(g2, rc, roadCell[i] === 1 ? k : k * .45);
    return geoR?.snow && (geoR.snowSide == null || (cx < geoR.seam(cz)) === (geoR.snowSide === 0)) ? mixHex(c, 0xeef2f6, .55) : c; }   // en la nieve, el camino también está nevado
  if (gt === 1) return B.lush;
  if (gt === 2) { const w = n2(cx, cz, .12, 2, 71) > .55; return h <= 1 ? (w ? 0xb8ccc0 : 0xd6cca0) : (w ? 0x6c9a92 : 0x6a8a5a); }   // bajío / pantano: manchas grandes, sin moteado
  if (gt === 3) return B.sand;
  if (gt === 4) return mixHex(B.ground[0], 0x4f9a3a, .45);
  if (gt === 6) return (x * 5 + z * 3) % 7 ? 0xd4e8f0 : 0xbcd8e8;   // hielo
  if (gt === 15) return (x * 3 + z * 5) % 6 ? 0xa8cce0 : 0x98c0d8;   // hielo fino (más oscuro)
  if (gt === 10) return (x + z * 3) % 4 ? 0xff7a1a : 0xffb03a;   // lava
  if (gt === 11) return n2(cx, cz, .3, 2, 81) > .5 ? 0xe8d29a : 0xdcc488;   // duna
  if (gt === 12) return 0x8a8a86;   // arrecife
  if (scen === 'canon' && gt === 0 && (GEOT[i + 1] === 17 || GEOT[i - 1] === 17 || GEOT[i + MW] === 17 || GEOT[i - MW] === 17)) return (x + z) % 2 ? 0x9a4a2a : 0xa85a34;   // borde marcado de la garganta
  if (gt === 17) return n2(cx, cz, .2, 2, 85) > .55 ? 0x8a5a40 : (x * 3 + z) % 5 ? 0x7a4a34 : 0x6a3e2c;   // fondo seco del cañón
  if (gt === 13) return (x + z) % 3 ? 0xd8c898 : 0xcdb98c;   // vado de arena
  if (gt === 14) return n2(cx, cz, .25, 2, 83) > .5 ? 0x6a9a48 : 0x5a8a40;   // ribera
  if (gt === 16) return 0x7aa858;   // suelo del bosque claro
  if (gt === 7) return h >= 4 ? ((x + z) % 3 ? 0xa8a49a : 0x9a968c) : 0x8e8a80;   // ruinas
  if (gt === 5) return h >= 8 ? 0x3a3034 : (x * 7 + z * 3) % 5 ? 0x4a4448 : 0x5a4a44;   // roca volcánica
  if (h <= 1) return B.sand;
  if (treeCell && treeCell[i]) return B.lush;
  const fc = geoR?.snow ? -1 : featureAt(x, z, side, B); if (fc >= 0) return fc;   // en la nieve no hay cultivos ni jardines
  const m = n2(cx, cz, .045, 3, 21 + side * 7) + (h - 2) * .05, tone = THREE.MathUtils.clamp(Math.floor((m - .34) / .09), 0, 3);
  let col = h >= 6 ? (h >= 9 ? 0xe4e2da : mixHex(B.ground[tone], 0x9a9488, Math.min(1, (h - 5) / 3))) : B.ground[tone];   // alturas: la hierba pasa a roca y, en las cumbres, a nieve
  if (h < 6) { const mx = mixAt(cx, cz, side); if (mx) col = mixHex(col, bioOf(mx.o).ground[tone], mx.w); }   // transición entre biomas
  if (roadCell && (roadCell[i + 1] === 1 || roadCell[i - 1] === 1 || roadCell[i + MW] === 1 || roadCell[i - MW] === 1)) col = mixHex(col, 0x3a4a2a, .05);   // cuneta junto al camino
  return geoR?.snow && (geoR.snowSide == null || (cx < geoR.seam(cz)) === (geoR.snowSide === 0)) ? mixHex(col, 0xeef2f6, .62) : col;   // valle helado: todo nevado
}
export let meshes = [], spots = [], bridgeSites = [], signs = [], gateList = [], gateCell = null;
const STRATA = [0xb85a3a, 0xd08a4a, 0xc87850, 0xa04a30, 0xd8a060];
// código de mapa para compartir: GEOGRAFÍA-SEMILLA (p. ej. RIO-48213). La misma geografía y semilla dan el mismo terreno y los mismos pueblos
export const mapCode = () => `${scen.toUpperCase()}-${seed}${sizeKey !== 'n' ? '-' + sizeKey.toUpperCase() : ''}${NP > 2 ? '-J' + NP : ''}`;   // -J3…-J5: jugadores   // -P o -G: tamaño pequeño o grande
export function parseCode(t) {
  const m = /^\s*([A-Za-z]+)\s*-\s*(\d{1,9})\s*(?:-\s*([PNGpng]))?\s*(?:-\s*[Jj]([2-5]))?\s*$/.exec(t || ''), key = m && m[1].toLowerCase();
  return m && GEO.NAME[key] ? { geo: key, seed: +m[2], size: (m[3] || 'n').toLowerCase(), players: +(m[4] || 2) } : null;
}
export let sizeKey = 'n';
export function generate(newSeed, tries = 0) {
  setSeed(newSeed); bioCache.clear(); sizeKey = MAP_SIZES[S.mapSize] ? S.mapSize : 'n'; setMapSize(sizeKey); RIVX = new Float32Array(MD).fill(MW / 2); ocean.position.set(MW / 2, -3, MD / 2);
  meshes.forEach(m => { m.parent.remove(m); m.geometry.dispose(); m.material.dispose(); }); meshes = [];
  EL = new Float32Array(N); G = new Float32Array(N); HM = new Int8Array(N);
  const rng = rngOf(seed);
  // tras muchas semillas fallidas se cae al río clásico, que siempre sale jugable (evita reintentar sin fin)
  const pickR = rng();   // se tira siempre, para que un código de mapa (geografía + semilla) dé el mismo mapa tanto si se eligió al azar como a mano
  scen = tries >= 20 ? 'rio' : S.wantScen === 'random' ? GEO.keys[pickR * GEO.keys.length | 0] : (GEO.LIST[S.wantScen] ? S.wantScen : 'canon');
  baseGround(rng); setGeoLight(scen);
  flats = []; forts = [];
  computeHM();
  if (buildNav() < .55 && tries < 40) return generate(newSeed + 7919, tries + 1);
  const plateau = (x, z, rad, hi = 4) => { let s = 0, n = 0; for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) { const cx = Math.floor(x) + dx, cz = Math.floor(z) + dz; if (cx < 0 || cz < 0 || cx >= MW || cz >= MD || dx * dx + dz * dz > rad * rad) continue; const g = G[idx(cx, cz)]; if (g > .5) { s += g; n++; } } return THREE.MathUtils.clamp(Math.round(n ? s / n : 2), 2, hi) + .2; };   // hi: los pueblos pueden estar en alto (la cima de la meseta) sin que su explanada la rebaje
  const pick = (x0, x1) => {   // sitio llano para la fortaleza en un extremo del mapa
    let best = -1, bs = -1e9;
    for (let t = 0; t < 500; t++) {
      const x = Math.floor(MW * (x0 + (x1 - x0) * rng())), z = Math.floor(MD * (.3 + .4 * rng())), i = idx(x, z);
      if (!inMain[i] || HM[i] > 5) continue;
      let sc = 0; for (let dz = -15; dz <= 15; dz += 3) for (let dx = -15; dx <= 15; dx += 3) { const cx = x + dx, cz = z + dz; if (cx < 0 || cz < 0 || cx >= MW || cz >= MD) { sc -= 3; continue; } const j = idx(cx, cz); sc += HM[j] >= 1 ? 1 - Math.abs(HM[j] - HM[i]) * .3 : -2; }
      if (sc > bs) { bs = sc; best = i; }
    }
    return best;
  };
  let A, B;
  if (geoR) { const fi = ([x, z]) => { const n = nearestNode(x, z); return Math.hypot(cellX(n) - x, cellZ(n) - z) < 12 ? n : -1; }; A = fi(geoR.F[0]); B = fi(geoR.F[1]); }
  else { A = pick(.1, .2); B = pick(.8, .9); }
  if ((A < 0 || B < 0) && tries < 45) return generate(newSeed + 104729, tries + 1);   // sin sitio para las fortalezas: otra semilla (y desde el intento 20, el río clásico, que siempre vale)
  const mkFort = (i, side) => {
    const x = cellX(i), z = cellZ(i), tb = Math.atan2(MD / 2 - z, MW / 2 - x), M = civOf(side).map, pts = M.shape();
    const maxR = Math.max(...pts.map(([a, b]) => Math.hypot(a, b))), k = 12.3 * FORT_K / maxR, n = 96;
    const rw = Array.from({ length: n }, (_, j) => shapeRadius(pts, j / n * Math.PI * 2 - tb + Math.PI / 2) * k);
    return { side, x, z, tb, rw, k, rings: M.rings || [1], moat: !!M.moat, gates: [tb, tb + 2.1, tb - 2.1], h: plateau(x, z, 16) };
  };
  // con 3 a 5 jugadores, las fortalezas se reparten alrededor del mapa (la tuya, al oeste)
  const at = [A, B];
  if (NP > 2) for (let k = 1; k < NP; k++) {
    const th = Math.PI + k * Math.PI * 2 / NP, tx = MW / 2 + Math.cos(th) * MW * .37, tz = MD / 2 + Math.sin(th) * MD * .34;
    let best = -1, bs = -1e9;
    for (let t = 0; t < 600; t++) { const x = Math.floor(tx + (rng() - .5) * 60), z = Math.floor(tz + (rng() - .5) * 50); if (x < 24 || z < 24 || x >= MW - 24 || z >= MD - 24) continue; const i = idx(x, z);
      if (!inMain[i] || HM[i] > 5 || at.slice(0, k).some(o => o >= 0 && Math.hypot(cellX(o) - x, cellZ(o) - z) < 70)) continue;
      let sc = -Math.hypot(x - tx, z - tz) * .2; for (let dz = -15; dz <= 15; dz += 3) for (let dx = -15; dx <= 15; dx += 3) { const cx = x + dx, cz = z + dz; if (cx < 0 || cz < 0 || cx >= MW || cz >= MD) { sc -= 3; continue; } const j = idx(cx, cz); sc += HM[j] >= 1 ? 1 - Math.abs(HM[j] - HM[i]) * .3 : -2; }
      if (sc > bs) { bs = sc; best = i; } }
    if (best < 0 && tries < 45) return generate(newSeed + 104729, tries + 1);
    at[k] = best;
  }
  forts = at.slice(0, NP).map((i, sd) => mkFort(i, sd));
  for (const f of forts) flats.push({ kind: 'fort', x: f.x, z: f.z, r0: 19, r1: 26, h: f.h });
  // cada civilización coloca castillo, cuartel y altar a su manera (coordenadas locales del recinto, +z hacia el centro del mapa)
  const lay = (sd, kind) => { const f = forts[sd], [lx0, lz0, ry, sc] = civOf(sd).map.layout[kind], lx = lx0 * FORT_K, lz = lz0 * FORT_K, a = f.tb - Math.PI / 2;   // recinto y edificios más grandes (el castillo, más todavía)
    return { kind: kind === 'castle' ? 'base' : kind, side: sd, x: f.x + lx * Math.cos(a) - lz * Math.sin(a), z: f.z + lx * Math.sin(a) + lz * Math.cos(a), ry, sc: sc * (kind === 'castle' ? 1.35 : 1.1) }; };
  spots = ['castle', 'barracks', 'altar', 'temple'].flatMap(k => players().map(sd => lay(sd, k)));   // mismo orden que BASE0, BARR0, ALT0 y TEMP0 en config (uno por jugador)
  const names = [...TOWN_NAMES].sort(() => rng() - .5);
  // pueblos lejos de los bordes del mapa (en las esquinas quedaban apartados del juego)
  const dry = i => { const x = i % MW, z = (i / MW) | 0; for (const [a, b] of [[6, 0], [-6, 0], [0, 6], [0, -6], [4, 4], [-4, 4], [4, -4], [-4, -4]]) { const xx = x + a, zz = z + b; if (xx < 0 || zz < 0 || xx >= MW || zz >= MD || EL[idx(xx, zz)] <= .5) return false; } return true; };   // sin agua cerca
  // sitio para un pueblo: la explanada (radio r) no puede tocar agua, ríos, rampas, puertos, vados, puentes, bosque, ruinas, hielo ni lava,
  // y todo el suelo que cubre está a la misma altura (±1): así un pueblo nunca rellena un río ni rompe el borde de la meseta o sube a ella por una rampa nueva
  const BAD = new Uint8Array(32); for (const t of [1, 2, 5, 6, 7, 9, 10, 12, 13, 14, 15, 16, 17]) BAD[t] = 1;
  const keyPts = [...(geoR?.passes || []), ...(geoR?.bridges || []).map(b => [b[0], b[1]]), ...(geoR?.lavaEnds || []), ...(geoR?.volcano ? [geoR.volcano] : [])];
  const siteOK = (x, z, r, key = true) => {
    x = Math.floor(x); z = Math.floor(z); if (x < 0 || z < 0 || x >= MW || z >= MD) return false; const h0 = HM[idx(x, z)]; if (h0 < 1) return false;
    if (key && keyPts.some(([px, pz]) => Math.hypot(px - x, pz - z) < r + 6)) return false;
    if (scen === 'rio' && Math.abs(x + .5 - RIVX[z]) < r + 6) return false;
    const R = Math.ceil(r);
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) { if (dx * dx + dz * dz > r * r) continue; const xx = x + dx, zz = z + dz;
      if (xx < 0 || zz < 0 || xx >= MW || zz >= MD) return false; const j = idx(xx, zz); if (HM[j] < 1 || Math.abs(HM[j] - h0) > 1 || BAD[GEOT[j]]) return false; }
    return true;
  };
  const inside = i => HM[i] <= 7 && ![6, 7, 9, 10, 11, 13, 15].includes(GEOT[i]) && dry(i) && cellX(i) > 26 && cellX(i) < MW - 26 && cellZ(i) > 22 && cellZ(i) < MD - 22;
  let pool = mainList.filter(i => inside(i) && siteOK(cellX(i), cellZ(i), 8.5));
  if (pool.length < GAME.towns * 40) pool = mainList.filter(i => inside(i) && siteOK(cellX(i), cellZ(i), 5));   // geografía muy accidentada: basta con que la plaza quede limpia
  const addTown = (x, z, extra = {}) => { const small = extra.watch || extra.keep && scen !== 'canon'; spots.push({ kind: 'town', x, z, name: names[spots.length % names.length], owner: -1, ...extra, ...(extra.keep && small ? { narrow: true } : {}) });
    flats.push({ kind: 'town', x, z, r0: small ? 3.5 : 4.8, r1: small ? 6 : 8.5, h: plateau(x, z, 4, small ? 4 : 8) }); };   // atalayas de los puertos y ciudadelas de los pasos: explanada pequeña para no ensanchar el paso
  // sitio propio de la geografía (ciudadela de la confluencia, atalaya de un puerto…): el punto más cercano donde el edificio cabe entero en tierra firme
  const findSite = (x, z, r, maxD) => { let best = -1, bd = 1e9; for (let dz = -maxD; dz <= maxD; dz++) for (let dx = -maxD; dx <= maxD; dx++) { const d = dx * dx + dz * dz, xx = Math.floor(x) + dx, zz = Math.floor(z) + dz; if (d >= bd || d > maxD * maxD || xx < 0 || zz < 0 || xx >= MW || zz >= MD) continue; const i = idx(xx, zz); if (inMain[i] && siteOK(xx, zz, r, false)) { bd = d; best = i; } } return best; };
  const nearSite = (x, z, r, maxD) => { const n = findSite(x, z, r, maxD); return n >= 0 ? n : nearestNode(x, z); };
  for (const [x, z] of geoR?.special || []) { const n = nearSite(x, z, geoR.oasis ? 4 : 6, 13); if (Math.hypot(cellX(n) - x, cellZ(n) - z) < 14) addTown(cellX(n), cellZ(n), geoR.goldTop || scen === 'lago' ? { special: true } : geoR.oasis ? { oasis: true } : {}); }
  // sitios propios de la geografía: una atalaya en cada puerto de la cordillera y la ciudadela en el paso del istmo
  const onLand = ([x, z], max = 8, r = 3.5) => { const n = nearSite(x, z, r, max); return Math.hypot(cellX(n) - x, cellZ(n) - z) < max && spots.every(o => Math.hypot(o.x - cellX(n), o.z - cellZ(n)) > 18) ? n : -1; };
  if (scen === 'cordillera') for (const p of geoR.passes) { const n = onLand(p); if (n >= 0) addTown(cellX(n), cellZ(n), { watch: true }); }
  if (geoR?.confluence) {   // la ciudadela en la confluencia (afluentes) o en el centro de la isla (cañón: siempre dentro de la isla)
    const n = scen === 'canon' ? nearestNode(geoR.confluence[0], geoR.confluence[1]) : onLand(geoR.confluence, 18, 6.5);
    if (n >= 0) addTown(cellX(n), cellZ(n), { keep: true }); }
  if (scen === 'istmo' && geoR.passes[0]) { const n = onLand(geoR.passes[0], 14, 5); if (n >= 0) addTown(cellX(n), cellZ(n), { keep: true }); }
  // el mismo número de pueblos en cada mitad (con más de dos jugadores, en la zona de cada fortaleza)
  const zoneOf = (x, z) => { if (NP === 2) return x >= MW / 2 ? 1 : 0; let b = 0, bd = 1e9; for (const f of forts) { const d = Math.hypot(f.x - x, f.z - z); if (d < bd) { bd = d; b = f.side; } } return b; };
  const halves = players().map(h => pool.filter(i => zoneOf(cellX(i), cellZ(i)) === h));
  while (spots.filter(s => s.kind === 'town').length < GAME.towns) {
    const cnt = players().map(h => spots.filter(s => s.kind === 'town' && zoneOf(s.x, s.z) === h).length), half = cnt.indexOf(Math.min(...cnt));
    let bi = -1, bs = -1;
    for (const i of halves[half]) { const x = cellX(i), z = cellZ(i); let m = 1e9; for (const s of spots) m = Math.min(m, (s.x - x) ** 2 + (s.z - z) ** 2); if (m > bs) { bs = m; bi = i; } }
    if (bi < 0) break;
    addTown(cellX(bi), cellZ(bi));
  }
  const plain = s => s.kind === 'town' && !s.camp && !s.keep && !s.watch && !s.fortified && !s.special;
  // el pueblo más céntrico del mapa es la ciudadela: guardada por colosos neutrales, da colosos a quien la conquiste
  if (!spots.some(s => s.keep)) { const cs = spots.filter(plain).sort((a, b) => Math.hypot(a.x - MW / 2, (a.z - MD / 2) * 1.2) - Math.hypot(b.x - MW / 2, (b.z - MD / 2) * 1.2)), c = cs.slice(0, 4).find(s => siteOK(s.x, s.z, 14)) || cs[0];
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
    const cand0 = spots.filter(s => plain(s) && (s.x >= MW / 2) === !!half && Math.hypot(s.x - f.x, s.z - f.z) > 55), big = cand0.filter(s => siteOK(s.x, s.z, 12)), cand = big.length ? big : cand0;   // los grandes, donde cabe su explanada
    const c = cand[(rng() * cand.length) | 0]; if (!c) continue;
    c.fortified = true;
  }
  for (const c of spots) if (c.kind === 'town' && (geoR?.fumaroles || []).some(([fx, fz]) => Math.hypot(fx - c.x, fz - c.z) < 26)) c.fumarole = true;   // caldera: los pueblos junto a una fumarola dan más oro
  for (const c of spots) if ((c.fortified || c.keep) && !(c.keep && (scen === 'istmo' || (geoR?.confluence && scen !== 'canon')))) { const fl = flats.find(q => q.kind === 'town' && q.x === c.x && q.z === c.z); if (fl) { fl.r0 = c.keep ? 10 : 8; fl.r1 = c.keep ? 14 : 12; } }   // los grandes, sobre una explanada mayor (salvo la ciudadela de un paso o de una confluencia, que no lo ensancha)
  computeHM(); buildNav();
  // puertas de las fortalezas: una por ángulo (sirve para todos los anillos de muralla). Solo dejan pasar a su dueño hasta que se derriban
  gateList = []; gateCell = new Int16Array(N).fill(-1);
  for (const f of forts) f.gates.forEach((ga, gi) => {
    const p = fortPt(f, wallR(f, ga), ga), g = { id: gateList.length, f, gi, x: p.x, z: p.z, hp: GAME.gateHp, max: GAME.gateHp, doors: [] }; gateList.push(g);
    for (const q of f.rings) { const c = fortPt(f, wallR(f, ga) * q, ga);
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) { const x = Math.floor(c.x) + dx, z = Math.floor(c.z) + dz; if (x < 0 || z < 0 || x >= MW || z >= MD) continue;
        const pp = polar(f, x + .5, z + .5); if (pp && Math.abs(pp[0] - wallR(f, pp[1]) * q) < 1.2 && angDiff(pp[1], ga) * pp[0] < 2.2) gateCell[idx(x, z)] = g.id; } }
  });
  for (const s of spots) s.node = nearestNode(s.x, s.z);
  // equilibrio: distancia por camino de cada fortaleza a sus 3 pueblos más cercanos de su mitad; si difiere más de un 18 %, otra semilla
  if (geoR && tries < 8 && NP === 2) {
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
  for (const [bx, bz, br] of geoR?.bridges || []) {   // cañón: puentes ya construidos sobre la garganta
    const cells = []; for (let dz = -4; dz <= 4; dz++) for (let dx = -Math.round(br); dx <= Math.round(br); dx++) { const x = Math.round(bx) + dx, z = Math.round(bz) + dz; if (x >= 0 && z >= 0 && x < MW && z < MD && GEOT[idx(x, z)] === 9) cells.push(idx(x, z)); }
    if (cells.length) bridgeSites.push({ x: bx, z: bz, cells, axis: 'x', built: true, h: 4, h0: 1, breakable: true, style: geoR.bridgeStyles[bridgeSites.length] || 'stone' });
  }
  regions = spots.filter(s => s.kind === 'base' || s.kind === 'town');
  regions.forEach((s, r) => { s.region = r; });
  if (!ocean.userData.fogged) {   // el mar de fondo también lleva niebla: si no, asomaba por las rendijas entre trozos del terreno
    ocean.userData.fogged = true; const m = ocean.material;
    m.onBeforeCompile = sh => { sh.uniforms.uFog = fogU.uFog;
      sh.vertexShader = 'varying vec2 vFogP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vFogP = (modelMatrix * vec4(transformed, 1.)).xz;');
      sh.fragmentShader = 'uniform sampler2D uFog; uniform vec2 uMap; varying vec2 vFogP;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  float fv = texture2D(uFog, clamp(vFogP / uMap, 0., 1.)).r; gl_FragColor.rgb = mix(vec3(.075, .09, .12), gl_FragColor.rgb * mix(.58, 1., smoothstep(.47, 1., fv)), smoothstep(.0, .47, fv));');
      sh.uniforms.uMap = ocean.userData.uMap = { value: new THREE.Vector2(MW, MD) }; };
    m.needsUpdate = true;   // recompilar con la niebla (el material ya se había usado en el menú)
  }
  if (ocean.userData.uMap) ocean.userData.uMap.value.set(MW, MD);
  ocean.material.color.setHex(geoR?.sea ? 0x2f6fa8 : TP.outside);
  regionCell = new Int8Array(N);
  for (let z = 0; z < MD; z++) for (let x = 0; x < MW; x++) regionCell[idx(x, z)] = regionAt(x + .5, z + .5);
  buildRoads();
  buildVoxels();
  buildMinimap();
}
// caminos: árbol de mínima distancia POR CAMINO (no en línea recta) entre fortalezas y pueblos, más algunos atajos que cierran bucles,
// para que no salgan caminos que rodean medio mapa (al otro lado de un cañón, un lago o un brazo de mar) ni ramales sueltos
// en el desierto la arena tapa casi todos los caminos: solo asoman algunos tramos sueltos
const sandHides = j => scen === 'oasis' && n2(j % MW, (j / MW) | 0, .03, 2, 93) < .66;
function buildRoads() {
  roadCell = new Uint8Array(N);
  // los caminos van por terreno bajo: nunca cruzan montañas (altura 8 o más; la cima de la meseta llega a 7)
  const low = i => HM[i] <= 7, q = new Int32Array(N);
  const lowBfs = src => { const f = new Int32Array(N).fill(1e9); let h = 0, t = 0; f[src] = 0; q[t++] = src;
    while (h < t) { const v = q[h++], dv = f[v] + 1, m = stepMask[v]; for (let k = 0; k < 8; k++) if (m >> k & 1) { const j = v + NBO[k]; if (f[j] > dv && low(j)) { f[j] = dv; q[t++] = j; } } } return f; };
  const Rg = regions, n = Rg.length, F = Rg.map(r => lowBfs(r.node)), D = (a, b) => F[a][Rg[b].node];
  const inT = [0], edges = [], adj = Rg.map(() => []);
  while (inT.length < n) {
    let best = null, bd = 1e9;
    for (const i of inT) for (let j = 0; j < n; j++) if (!inT.includes(j) && D(i, j) < bd) { bd = D(i, j); best = [i, j]; }
    if (!best) break;   // lo que no se alcanza por tierra se queda sin camino
    inT.push(best[1]); edges.push(best); adj[best[0]].push([best[1], bd]); adj[best[1]].push([best[0], bd]);
  }
  // atajos: si dos sitios cercanos por camino quedan muy lejos siguiendo el árbol, se unen directamente
  const treeDist = a => { const d = Array(n).fill(1e9), st = [a]; d[a] = 0; while (st.length) { const v = st.pop(); for (const [w, c] of adj[v]) if (d[w] > d[v] + c) { d[w] = d[v] + c; st.push(w); } } return d; };
  const extra = [];
  for (let a = 0; a < n; a++) { const td = treeDist(a); for (let b = a + 1; b < n; b++) { const d = D(a, b); if (d < 120 && td[b] > d * 2.2) extra.push([d, a, b]); } }
  extra.sort((p, q) => p[0] - q[0]).slice(0, Math.ceil(n / 4)).forEach(([, a, b]) => edges.push([a, b]));
  for (const [a, b] of edges) {
    const f = F[a], A = Rg[a]; let v = Rg[b].node;
    for (let guard = 0; f[v] > 0 && f[v] < 1e9 && guard < 5000; guard++) {
      const x = v % MW, z = (v / MW) | 0; let best = -1, bd = 1e9;
      // entre las casillas que acercan al destino, elige con un poco de ruido: el camino serpentea en vez de ir recto
      for (let k = 0, m = stepMask[v]; k < 8; k++) { if (!(m >> k & 1)) continue; const j = v + NBO[k]; if (f[j] !== f[v] - 1) continue; const d = Math.sqrt((cellX(j) - A.x) ** 2 + (cellZ(j) - A.z) ** 2) + (n2(cellX(j), cellZ(j), .06, 2, 91 + a) - .5) * 9; if (d < bd) { bd = d; best = j; } }
      if (best < 0) break;
      // ancho irregular: el centro casi siempre es camino; los bordes a veces se difuminan o desaparecen, y en algunos tramos se ensancha
      const w = n2(x, z, .09, 2, 97), mark = (j, faded) => { if (j >= 0 && j < N && HM[j] > 0 && low(j) && walk[j] && roadCell[j] !== 1 && GEOT[j] !== 6 && GEOT[j] !== 15 && !sandHides(j)) roadCell[j] = faded ? 2 : 1; };   // sobre el hielo no hay camino
      mark(v, hash(x, 17, z) < .08);
      if (x + 1 < MW) mark(v + 1, w < .45); mark(v + MW, w < .35 || hash(x, 19, z) < .2);
      if (w > .68 && x > 0) mark(v - 1, true); if (w > .74) mark(v - MW, true);
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
    case 'birch': L.box(cx, h + .45, cz, .14, .9, .14, 0xe8e4dc); L.box(cx, h + .3, cz, .15, .06, .15, 0x2a2a2a); L.box(cx, h + .95 + t * .2, cz, .62, .6 + t * .3, .62, 0x8ab060); break;
    case 'plane': L.box(cx, h + .3, cz, .2, .6, .2, 0xa8a090); L.box(cx, h + .75 + t * .2, cz, 1.2, .5 + t * .2, 1.2, 0x5a8a3a); L.box(cx + .1, h + 1.15 + t * .3, cz - .1, .7, .26, .7, 0x6a9a48); break;
    case 'shrub': L.box(cx, h + .18, cz, .7, .36, .7, 0x7a8a4a); L.box(cx + .1, h + .42, cz, .36, .18, .36, 0x8a9a5a); break;
    case 'sakura': L.box(cx, h + .3, cz, .16, .6, .16, 0x5a3a2a); L.box(cx, h + .72 + t * .15, cz, .95, .45 + t * .2, .95, 0xf0b8c8); L.box(cx + .12, h + 1.05 + t * .3, cz - .1, .5, .22, .5, 0xf8d0dc); break;
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
    if (GEOT[i] === 1 || GEOT[i] === 16) { if ((x + z) % 2 === 0 && !nearFlat(cx, cz, 1)) treeCell[i] = 2; continue; }
    if (GEOT[i] === 3 || GEOT[i] === 2 || GEOT[i] >= 5) continue;   // sin árboles en arena, pantano, bajío ni en los terrenos especiales (volcán, hielo, ruinas…)
    if (h < 2 || h > 4 || nearFlat(cx, cz, 3)) continue;
    let ok = true; for (let dz = -2; dz <= 2 && ok; dz++) for (let dx = -2; dx <= 2; dx++) { const j = idx(x + dx, z + dz); if (hAt(x + dx, z + dz) <= 1 || (Math.abs(dx) <= 1 && Math.abs(dz) <= 1 && roadCell[j])) { ok = false; break; } }
    if (!ok) continue;
    const f = n2(cx, cz, .055, 3, 22), side = sideAt(cx, cz), B = bioOf(side);
    if (B.feature === 'nile' && geoRiver && Math.abs(cx - RIVX[z]) > 22) continue;   // en Egipto, solo palmerales junto al río
    if (featureAt(x, z, side, B) >= 0 && B.feature !== 'nile') continue;
    if (f > .62 && hash(x * 3, 1, z * 11) < (.4 + (f - .62) * 2.5) * B.dens) treeCell[i] = 1;
  }
  // sombras cocinadas: el sol viene de -x/+z, así que árboles y desniveles oscurecen hacia +x/-z
  const shadow = new Float32Array(N);
  for (let z = 0; z < MD; z++) for (let x = 0; x < MW; x++) {
    const i = idx(x, z);
    if (treeCell[i]) for (const [dx, dz, k] of [[1, -1, .18], [2, -2, .1], [0, -1, .1], [1, 0, .08], [1, -2, .06]]) { const nx = x + dx, nz = z + dz; if (nx < MW && nz >= 0) shadow[idx(nx, nz)] = Math.max(shadow[idx(nx, nz)], k); }
    const h = HM[i]; if (h <= 0) continue;
    for (let k = 1; k <= 6; k++) { const d = hAt(x - k, z + k) - h - (k - 1) * .75; if (d > 0) shadow[i] = Math.max(shadow[i], Math.min(.26, .11 + d * .04)); }   // sombra larga de los desniveles
    let up = 0; for (const [a, b] of H4) if (hAt(x + a, z + b) > h) up++; if (up) shadow[i] = Math.max(shadow[i], .03 + up * .025);   // oclusión al pie de las laderas
  }
  const CH = 64, NCX = Math.ceil(MW / CH), NCZ = Math.ceil(MD / CH), landC = [], waterC = [];
  for (let k = 0; k < NCX * NCZ; k++) { landC.push(new Chunk()); waterC.push(new Chunk()); }
  for (let z = 0; z < MD; z++) for (let x = 0; x < MW; x++) {
    const i = idx(x, z), h = HM[i], cx = x + .5, cz = z + .5, ck = (z / CH | 0) * NCX + (x / CH | 0), L = landC[ck];
    if (GEOT[i] === 9) { L.quad(2, x, x + 1, 1, 1, z, z + 1, 0x7a4a34); continue; }   // bajo los puentes del cañón: el fondo seco (el puente se dibuja aparte)
    if (h <= 0) {   // agua
      const depth = -G[i], nearLand = H4.some(([a, b]) => hAt(x + a, z + b) > 0);
      waterC[ck].quad(2, x, x + 1, 0, 0, z, z + 1, nearLand ? TP.edge : mixHex(TP.shallow, TP.deep, THREE.MathUtils.clamp((depth - .8) / 2.2, 0, 1)));   // más oscuro cuanto más hondo
      if (x === 0 || z === 0 || x === MW - 1 || z === MD - 1) for (const [a, b, f] of H4) { const xx = x + a, zz = z + b; if (xx < 0 || zz < 0 || xx >= MW || zz >= MD) waterC[ck].quad(f, x, x + 1, -5, 0, z, z + 1, TP.deep); }
      continue;
    }
    let col = terrainColor(x, z); if (shadow[i]) col = mixHex(col, 0x10203a, shadow[i]);
    { const j = hash(x, 23, z); if (j < .18) col = mixHex(col, 0x10203a, .045); else if (j > .88) col = mixHex(col, 0xffffff, .045); }   // un poco de grano en el suelo
    L.quad(2, x, x + 1, h, h, z, z + 1, col);
    const sc = h <= 1 ? TP.cliffS : TP.cliff, lip = mixHex(col, 0x10203a, .14);   // escalón de 1: color del suelo; más hondo: ladera
    for (const [a, b, f] of H4) { const xx = x + a, zz = z + b; if (xx < 0 || zz < 0 || xx >= MW || zz >= MD) L.quad(f, x, x + 1, -5, 0, z, z + 1, (h + x + z) % 2 ? 0x6a5038 : 0x5a4230);   // borde del mapa: corte de tierra
      const hn = Math.max(0, hAt(xx, zz)); if (hn >= h) continue;
      if (scen === 'canon' && h >= 3) { for (let y = hn; y < h; y++) L.quad(f, x, x + 1, y, y + 1, z, z + 1, STRATA[(y + (hash(x, 3, z) < .2 ? 1 : 0)) % STRATA.length]); continue; }   // estratos de colores en las paredes del cañón
      L.quad(f, x, x + 1, h - 1, h, z, z + 1, h <= 1 ? sc : lip); if (hn < h - 1) L.quad(f, x, x + 1, hn, h - 1, z, z + 1, sc); }
    if (treeCell[i] === 2) { const v0 = L.nv; treeV.set(i, [ck, v0]); const B = biomeAt(cx, cz), r2 = hash(x * 5, 7, z * 3); const lt = GEOT[i] === 16, tc = lt ? mixHex(B.treeCol, 0xd8e890, .55) : B.treeCol;   // bosque claro: árboles más bajos y claros
      L.box(cx, h + (lt ? .35 : .5) + r2 * .15, cz, lt ? 1.2 : 1.6, (lt ? .6 : .9) + r2 * .3, lt ? 1.2 : 1.6, tc); L.box(cx + .2, h + (lt ? .8 : 1.1) + r2 * .3, cz - .2, .8, .4, .8, mixHex(tc, 0x9ad86a, .18)); treeV.get(i).push(L.nv); }
    else if (treeCell[i]) { const B = biomeAt(cx, cz), r2 = hash(x * 5, 7, z * 3); treeBoxes(L, B.trees[r2 > .55 ? 1 : 0], cx, h, cz, r2); }
    else if (GEOT[i] === 14 && hash(x, 11, z) < .35) { for (let k = 0; k < 3; k++) L.box(cx + (k - 1) * .25, h + .35 + k * .05, cz + (k % 2) * .2 - .1, .08, .7 + k * .1, .08, k % 2 ? 0x6a8a3a : 0x8aa04a); L.box(cx, h + .78, cz, .1, .16, .1, 0x7a5a34); }   // juncos
    else if (!nearFlat(cx, cz, 1) && !roadCell[i] && h > 1 && GEOT[i] < 5) {   // piezas pequeñas del paisaje
      const side = sideAt(cx, cz), B = bioOf(side);
      if (B.feature === 'rocks' && featureAt(x, z, side, B) === 0x8a8e88 && hash(x, 9, z) < .18) { L.box(cx, h + .18, cz, .62, .36, .5, 0x8a8a86); L.box(cx + .15, h + .42, cz + .05, .34, .2, .3, 0x9a9a96); }
      else if (B.feature === 'garden' && !geoR?.snow && featureAt(x, z, side, B) === 0x5a9a44 && hash(x, 13, z) < .3) { if (hash(x, 5, z) < .25) { L.box(cx, h + .7, cz, .4, 1.4, .4, 0x2f5a35); L.box(cx, h + 1.5, cz, .24, .3, .24, 0x2f5a35); } else L.box(cx, h + .12, cz, .3, .24, .3, [0xd84a6a, 0xe8c050, 0xf0f0f0][(x * 7 + z) % 3]); }   // flores y cipreses del jardín
      else if (B.feature === 'scrub' && featureAt(x, z, side, B) === 0xd8d4c4 && hash(x, 9, z) < .14) { L.box(cx, h + .16, cz, .6, .32, .5, 0xe0dccc); L.box(cx - .12, h + .38, cz + .05, .3, .16, .26, 0xd0ccbc); }
      else if (B.feature === 'heath' && featureAt(x, z, side, B) === 0x8a6a8a && hash(x, 9, z) < .12) { L.box(cx, h + .2, cz, .66, .4, .54, 0x8a8a86); L.box(cx + .14, h + .46, cz, .3, .18, .3, 0x9a9a96); }
      else if (B.feature === 'tea' && featureAt(x, z, side, B) === 0x4a8040 && x % 2) L.box(cx, h + .2, cz, .9, .4, .7, 0x3f7a3a);
      else if (B.feature === 'maize' && featureAt(x, z, side, B) >= 0 && x % 2 === 0 && z % 2) { L.box(cx, h + .3, cz, .1, .6, .1, 0x8ab04a); L.box(cx, h + .6, cz, .12, .14, .12, 0xe0c050); }
      else if (GEOT[i] !== 2) {   // matas, flores y piedras sueltas por todo el campo
        const r = hash(x, 41, z), snow = geoR?.snow, dry = scen === 'oasis' || scen === 'canon' || scen === 'lago', ox = (hash(x, 43, z) - .5) * .5, oz = (hash(x, 47, z) - .5) * .5;
        if (r < .028 && !snow) { const tc = dry ? 0xa89a5a : mixHex(B.ground[0], 0x2a4a1a, .35); for (let k = 0; k < 3; k++) L.box(cx + ox + (k - 1) * .16, h + .14 + (k % 2) * .05, cz + oz + (k % 2) * .12, .08, .28 + (k % 2) * .1, .08, tc); }
        else if (r < .04 && !snow && !dry) { L.box(cx + ox, h + .1, cz + oz, .06, .2, .06, 0x4a7a30); L.box(cx + ox, h + .24, cz + oz, .16, .1, .16, [0xe85a6a, 0xf0d050, 0xf4f4f4, 0xa87ad8][(x * 3 + z * 7) % 4]); }
        else if (r < .05) { L.box(cx + ox, h + .12, cz + oz, .42, .24, .34, dry ? 0xb89a70 : 0x8a8a86); if (snow) L.box(cx + ox, h + .26, cz + oz, .36, .06, .3, 0xf4f8fa); }
      }
    }
  }
  // postes indicadores: a la salida de cada pueblo, junto a cada camino, con su nombre (la capa 2D lo escribe al acercar la cámara)
  signs = [];
  for (const s of spots) {
    if (s.kind !== 'town') continue; const dirs = [];
    for (let dz = -11; dz <= 11; dz++) for (let dx = -11; dx <= 11; dx++) { const d = Math.hypot(dx, dz); if (d < 9 || d > 10.5) continue; const x = Math.floor(s.x) + dx, z = Math.floor(s.z) + dz; if (x < 1 || z < 1 || x >= MW - 1 || z >= MD - 1 || roadCell[idx(x, z)] !== 1) continue;
      const a = Math.atan2(dz, dx); if (dirs.some(b => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < .9)) continue;
      const side = [[-dz, dx], [dz, -dx]].map(([u, v]) => [x + Math.sign(u) * 2, z + Math.sign(v) * 2]).find(([u, v]) => u > 0 && v > 0 && u < MW && v < MD && !roadCell[idx(u, v)] && walk[idx(u, v)] && !treeCell[idx(u, v)]);
      if (!side) continue; dirs.push(a); const [u, v] = side, h = HM[idx(u, v)], L = landC[(v / CH | 0) * NCX + (u / CH | 0)];
      L.box(u + .5, h + .7, v + .5, .14, 1.4, .14, 0x6a4a2e); L.box(u + .5 + Math.cos(a) * .3, h + 1.2, v + .5 + Math.sin(a) * .3, .7 * Math.abs(Math.cos(a)) + .1, .26, .7 * Math.abs(Math.sin(a)) + .1, 0xd8b884);
      signs.push({ x: u + .5, y: h + 1.6, z: v + .5, name: s.name });
      if (dirs.length >= 3) break; }
  }
  buildOutside();
  const lmat = terrainMat(false), wmat = terrainMat(true);
  chunkMesh = landC.map(L => { if (!L.nv) return null; const m = L.build(lmat); meshes.push(m); return m; });
  waterC.forEach(W => { if (W.nv) meshes.push(W.build(wmat)); });
}

// alrededores del mapa: lomas y montes (o islotes en el mar) que siguen el terreno del borde y se pierden en la bruma; no se juegan
function buildOutside() {
  const L = new Chunk(), M = 44, S2 = 2, sea = geoR?.sea;
  for (let z = -M; z < MD + M; z += S2) for (let x = -M; x < MW + M; x += S2) {
    if (x >= 0 && z >= 0 && x < MW && z < MD) continue;
    const ex = THREE.MathUtils.clamp(x, 0, MW - 1), ez = THREE.MathUtils.clamp(z, 0, MD - 1), d = Math.max(Math.abs(x - ex), Math.abs(z - ez)), eh = Math.max(0, HM[idx(ex, ez)]);
    const hill = 2 + n2(x, z, .03, 3, 73) * 10, k = smooth01(d / 14);
    let h = sea ? (d < 8 ? eh * (1 - d / 8) : 0) + (n2(x, z, .035, 2, 77) > .7 ? 1 + (n2(x, z, .035, 2, 77) - .7) * 20 : 0) : eh * (1 - k) + hill * k;
    h = Math.round(h); if (h <= 0) continue;
    const B = bioOf(sideAt(ex + .5, ez + .5)), c0 = h >= 8 ? (geoR?.snow || h >= 10 ? 0xe4e2da : 0x9a9488) : B.ground[(hash(x, 5, z) * 4) | 0];
    const col = mixHex(geoR?.snow ? mixHex(c0, 0xeef2f6, .6) : c0, 0x20304a, .12 + Math.min(.3, d / M * .3));
    L.box(x + S2 / 2, (h - 6) / 2, z + S2 / 2, S2, h + 6, S2, col);
  }
  if (!L.nv) return;
  meshes.push(L.build(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad })));
  ocean.position.y = sea ? -.06 : -5;
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
    if (t === 9) { L.quad(2, x, x + 1, 4, 4, z, z + 1, (x % 2) ? 0xb0aca0 : 0x9a968c); for (const [a, b2, f] of H4) if (p.TT[idx(Math.min(MW - 1, Math.max(0, x + a)), Math.min(MD - 1, Math.max(0, z + b2)))] !== 9) L.quad(f, x, x + 1, 1, 4, z, z + 1, 0x8e8a80); continue; }   // tablero del puente (vista previa), con su costado
    if (h <= 0) { const nearLand = H4.some(([a, b]) => H(x + a, z + b) > 0); W.quad(2, x, x + 1, 0, 0, z, z + 1, nearLand ? TP.edge : -p.HM[i] < 2.2 ? TP.shallow : TP.deep); continue; }
    const tree = t === 1 || t === 16 ? ((x + z) % 2 === 0 ? 2 : 0) : (t === 0 && h >= 2 && h <= 7 && n2(cx, cz, .055, 3, 22) > .6 && hash(x * 3, 1, z * 11) < .45) ? 1 : 0;
    let col;
    if (t === 1 || tree) col = TP.lush;
    else if (t === 2) { const w = n2(cx, cz, .12, 2, 71) > .55; col = h <= 1 ? (w ? 0xb8ccc0 : 0xd6cca0) : (w ? 0x6c9a92 : 0x6a8a5a); }
    else if (t === 17) col = (x * 3 + z) % 5 ? 0x7a4a34 : 0x8a5a40;   // fondo seco del cañón
    else if (t === 3 || h <= 1) col = TP.sand;
    else if (t === 4) col = mixHex(PREV_GROUND[0], 0x4f9a3a, .45);
    else if (t === 5) col = h >= 8 ? 0x3a3034 : 0x4a4448;
    else if (t === 6) col = 0xd4e8f0; else if (t === 7) col = 0xa8a49a; else if (t === 15) col = 0xa8cce0; else if (t === 10) col = 0xff7a1a; else if (t === 11) col = 0xe4cc90; else if (t === 12) col = 0x8a8a86; else if (t === 13) col = 0xd8c898; else if (t === 14) col = 0x5f9044; else if (t === 16) col = 0x4a8a44; else if (t === 17) col = 0x7a4a34;
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
