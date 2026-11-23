// Civilizaciones: modelos de tropas y edificios, murallas, biomas y elección de civilización.
import * as THREE from 'three';
import { NEU, NP, UNITS } from './config.js';
import { BOX, HULLMAT, mat, part } from './render.js';

// ---------- Civilizaciones ----------
// Mismas reglas para todas; cambian los modelos de tropas y edificios, las murallas y los nombres. El color del bando va en escudos, estandartes y penachos.
export const CIV = (() => {
  function P(g, w, h, d, c, x, y, z, o = true, ry = 0) {
    const m = new THREE.Mesh(BOX, mat(c)); m.scale.set(w, h, d); m.position.set(x, y, z); m.rotation.y = ry; g.add(m);
    if (o) { const k = new THREE.Mesh(BOX, HULLMAT); k.scale.set(w + .09, h + .09, d + .09); k.position.copy(m.position); k.rotation.y = ry; g.add(k); }
    return m;
  }
const grp = (parent, x = 0, y = 0, z = 0, s = 1, ry = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); g.rotation.y = ry; parent.add(g); return g; };
// pirámide escalonada / tejado a cuatro aguas: cajas que encogen
function steps(g, n, w, h, d, k, c, x, y, z, c2) { for (let i = 0; i < n; i++) P(g, w - i * k, h, d - i * k * (d / w), i % 2 && c2 ? c2 : c, x, y + h / 2 + i * h, z); return y + n * h; }
// tejado chino: cubierta oscura con aleros que se levantan en las esquinas
function eaveRoof(g, w, d, y, c, gold) { P(g, w, .22, d, c, 0, y, 0); P(g, w - .5, .3, d - .5, c, 0, y + .25, 0); P(g, w - 1.2, .3, d - 1.2, c, 0, y + .5, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(g, .25, .25, .25, c, sx * (w / 2 - .05), y + .18, sz * (d / 2 - .05)); if (gold) P(g, .2, .4, .2, gold, 0, y + .85, 0); }
// palmera
function palm(g, x, z, h = 2.4) { for (let i = 0; i < 5; i++) P(g, .22, h / 5, .22, 0x8a6a3a, x + i * .05, h / 10 + i * h / 5, z, false); for (let a = 0; a < 6; a++) { const r = a / 6 * Math.PI * 2; P(g, .9, .1, .28, 0x4f8a3a, x + .25 + Math.cos(r) * .5, h + .05 - (a % 2) * .1, z + Math.sin(r) * .5, false, -r); } }
function cypress(g, x, z) { P(g, .16, .4, .16, 0x5a3a24, x, .2, z, false); P(g, .5, 1.3, .5, 0x2f5a35, x, 1.05, z); P(g, .32, .6, .32, 0x2f5a35, x, 1.95, z); }
function bush(g, x, z, c = 0x3f7a45) { P(g, .7, .5, .7, c, x, .25, z); }

// ---- piezas de tropa ----
function legs(g, c, c2) { P(g, .16, .34, .16, c, -.11, .17, 0); P(g, .16, .34, .16, c2 ?? c, .11, .17, 0); }
function torso(g, c) { P(g, .46, .48, .32, c, 0, .58, 0); }
function head(g, c) { P(g, .3, .3, .3, c, 0, .97, 0); }
function horse(g, c, c2, leg, cloth) {
  P(g, .5, .45, 1.05, c, 0, .72, 0); P(g, .3, .42, .38, c2, 0, 1.02, .58); P(g, .2, .2, .28, c2, 0, 1.12, .82);
  for (const [a, b] of [[-.16, -.36], [.16, -.36], [-.16, .36], [.16, .36]]) P(g, .13, .5, .13, leg, a, .25, b);
  P(g, .12, .3, .12, leg, 0, .78, -.58); if (cloth) P(g, .6, .14, .58, cloth, 0, .98, -.05);
}
// dioses: túnica que se estrecha hacia abajo (flotan, sin piernas), brazos, cabeza y faja del color del bando
function godBody(g, robe, robe2, skin, T) { P(g, .3, .3, .26, robe, 0, .18, 0); P(g, .46, .4, .34, robe, 0, .5, 0); P(g, .56, .5, .38, robe2, 0, .9, 0); for (const s of [-1, 1]) { P(g, .16, .5, .16, robe2, s * .36, .92, 0); P(g, .14, .14, .14, skin, s * .36, .62, .04); } P(g, .34, .34, .34, skin, 0, 1.33, 0); P(g, .58, .1, .4, T, 0, .76, 0); }
function rider(g, top, skin) { P(g, .4, .44, .3, top, 0, 1.26, -.05); P(g, .26, .26, .26, skin, 0, 1.62, -.05); }
const SK = { light: 0xf0c49a, tan: 0xd59a68, brown: 0xa86a42, dark: 0x7a4a2a };
const STEEL = 0xd8dcf0, BRONZE = 0xc8913c, GOLD = 0xe8c050, WOOD = 0x8a5a34, WHITE = 0xf2eee2;

// ================= CIVILIZACIONES =================
const CIVS = [
{ id: 'roma', name: 'ROMA', era: 'República tardía · s. I a. C.', own: 0xa8282a,
  tag: 'Mármol, teja roja y legiones en bloque. La civilización de referencia: ordenada, simétrica y metálica.',
  biome: 0x7db45b, plaza: 0xd8d0bc, sw: [0xe8e2d4, 0xb5562f, 0xd8dcf0, 0xc8a040],
  names: ['LEGIONARIO', 'SAGITARIO', 'ÉQUITE', 'GENERAL', 'JÚPITER'],
  notes: ['<b>Escudo:</b> scutum rectangular y alto, con umbo dorado', '<b>Casco:</b> galea con cresta transversal', '<b>Héroe:</b> capa del color del bando y el águila de la legión'],
  castle(g, T) { P(g, 6.4, .9, 4.6, 0xd8d0bc, 0, .45, 0); P(g, 5.8, .3, 4, 0xe8e2d4, 0, 1.05, 0);
    for (let i = 0; i < 6; i++) P(g, .38, 2.4, .38, WHITE, -2.3 + i * .92, 2.4, 1.6);
    P(g, 4.6, 2.4, 2.6, 0xe8e2d4, 0, 2.4, -.5); P(g, 5.9, .3, 4.1, 0xd8d0bc, 0, 3.75, 0);
    steps(g, 4, 6, .3, 4.2, 1.3, 0xb5562f, 0, 3.9, 0); P(g, 1.2, .9, .2, T, 0, 2.6, 1.82);
    P(g, .1, 1.6, .1, WOOD, 2.6, 5, 0); P(g, .9, .7, .08, T, 2.6, 5.3, .1); P(g, .5, .3, .3, GOLD, 0, 5.4, 0); P(g, .9, .14, .2, GOLD, 0, 5.6, 0); },
  barracks(g, T) { P(g, 3.6, 1.6, 2.4, 0xe8e2d4, 0, .8, 0); steps(g, 3, 3.9, .3, 2.7, 1, 0xb5562f, 0, 1.6, 0); P(g, 1, 1.1, .2, 0x5a3a24, 0, .55, 1.25); for (const x of [-1.3, 1.3]) { P(g, .08, 2.6, .08, WOOD, x, 1.3, 1.6); P(g, .5, .6, .06, T, x + .28, 2.2, 1.6); } },
  house(g) { P(g, 2, 1.2, 1.6, WHITE, 0, .6, 0); steps(g, 2, 2.2, .3, 1.8, .9, 0xb5562f, 0, 1.2, 0); cypress(g, 1.6, .4); },
  sword(g, T) { legs(g, 0x7a4a2a); torso(g, T); P(g, .5, .3, .34, STEEL, 0, .68, 0); head(g, SK.light);
    P(g, .36, .16, .36, STEEL, 0, 1.15, 0); P(g, .5, .1, .08, T, 0, 1.28, 0); P(g, .1, .72, .5, T, -.33, .6, .04); P(g, .12, .2, .2, GOLD, -.39, .6, .04); P(g, .06, .4, .06, STEEL, .31, .6, .16); },
  bow(g, T) { legs(g, 0x7a4a2a); torso(g, 0xd8c8a0); head(g, SK.light); P(g, .34, .2, .34, STEEL, 0, 1.14, 0); P(g, .12, .12, .12, STEEL, 0, 1.3, 0); P(g, .48, .14, .34, T, 0, .78, 0); P(g, .06, .82, .06, WOOD, -.3, .64, .12); P(g, .16, .42, .14, 0x7a4824, .1, .64, -.22); },
  horse(g, T) { horse(g, 0x8a5a34, 0x7a4824, 0x5a3a24, T); rider(g, STEEL, SK.light); P(g, .32, .14, .32, STEEL, 0, 1.79, -.05); P(g, .08, .22, .3, T, 0, 1.95, -.05); P(g, .1, .5, .5, T, -.28, 1.25, 0); P(g, .06, .06, 1.4, STEEL, .27, 1.3, .4); },
  hero(g, T) { horse(g, WHITE, 0xeae6f2, 0xd8d4e4, GOLD); rider(g, GOLD, SK.light); P(g, .5, .6, .08, T, 0, 1.15, -.24); P(g, .34, .14, .34, GOLD, 0, 1.8, -.05); P(g, .08, .26, .38, T, 0, 1.97, -.05);
    P(g, .06, 1.7, .06, WOOD, .32, 1.7, .1); P(g, .34, .2, .14, GOLD, .32, 2.6, .1); P(g, .14, .14, .14, GOLD, .32, 2.75, .1); P(g, .38, .3, .05, T, .32, 2.3, .1); },
  god(g, T) { godBody(g, 0xf2eee2, 0xe8e2d4, SK.light, T); P(g, .4, .08, .4, GOLD, 0, 1.52, 0); P(g, .3, .18, .12, WHITE, 0, 1.18, .16); P(g, .34, .1, .3, WHITE, 0, 1.52, -.02);
    P(g, .1, .26, .1, 0xffe060, .42, 1.12, .1); P(g, .1, .22, .1, 0xffe060, .5, .92, .1); P(g, .1, .24, .1, 0xffe060, .42, .72, .1); P(g, .7, .5, .06, T, 0, .95, -.24); } },

{ id: 'cartago', name: 'CARTAGO', era: 'Guerras púnicas · s. III a. C.', own: 0x6a2a7a,
  tag: 'Ciudad comercial de adobe ocre, toldos púrpura y palmeras. Su héroe va a lomos de un elefante de guerra.',
  biome: 0xa9b066, plaza: 0xe0c896, sw: [0xd9b27a, 0x6a2a7a, 0xc8913c, 0x4f8a3a],
  names: ['INFANTE LIBIO', 'HONDERO', 'JINETE NÚMIDA', 'ELEFANTE', 'BAAL HAMMÓN'],
  notes: ['<b>Escudo:</b> redondo de bronce con el borde del bando', '<b>Montura:</b> caballo númida sin silla, jinete sin casco', '<b>Héroe:</b> elefante con torre del color del bando'],
  castle(g, T) { P(g, 6.2, 2.4, 4.2, 0xd9b27a, 0, 1.2, -.3); for (let i = 0; i < 9; i++) P(g, .4, .4, .4, 0xc9a26a, -2.9 + i * .72, 2.6, 1.8);
    for (const x of [-3, 3]) { P(g, 1.6, 3.6, 1.6, 0xd9b27a, x, 1.8, 1.4); P(g, 1.6, 3.6, 1.6, 0xd9b27a, x, 1.8, 1.4, true, Math.PI / 4); P(g, 1.9, .3, 1.9, 0xc9a26a, x, 3.7, 1.4); P(g, .9, .6, .9, T, x, 4.1, 1.4); }
    P(g, 2.4, 2, 1.8, 0xe8cfa0, 0, 3.4, -.8); P(g, 2.8, .3, 2.2, 0x6a2a7a, 0, 4.5, -.8);
    P(g, 1.2, 1.6, .2, 0x4a2a14, 0, .8, 1.82); P(g, .6, .2, .1, T, 0, 2, 1.9); P(g, .2, .2, .1, T, 0, 2.3, 1.9); P(g, .5, .5, .1, T, 0, 1.75, 1.9, false, Math.PI / 4); },
  barracks(g, T) { P(g, 3.4, 1.6, 2.4, 0xd9b27a, 0, .8, 0); P(g, 3.6, .2, 2.6, 0xc9a26a, 0, 1.7, 0); P(g, 3.6, .1, 1.1, 0x6a2a7a, 0, 1.35, 1.6); for (const x of [-1.6, 1.6]) P(g, .08, 1.3, .08, WOOD, x, .65, 2.1); P(g, 1, 1.1, .2, 0x4a2a14, 0, .55, 1.25); P(g, .7, .4, .06, T, 0, 2.1, 0); palm(g, -2.3, -.6, 2.2); },
  house(g) { P(g, 1.6, 1.3, 1.4, 0xe8cfa0, -.2, .65, 0); P(g, 1, 1, 1, 0xe0c090, .5, 1.8, -.2); P(g, 1.8, .14, 1.6, 0xc9a26a, -.2, 1.35, 0); palm(g, 1.3, .6, 2.6); },
  sword(g, T) { legs(g, SK.tan); torso(g, WHITE); P(g, .5, .14, .34, T, 0, .66, 0); head(g, SK.tan); P(g, .34, .2, .34, BRONZE, 0, 1.15, 0); P(g, .1, .16, .1, BRONZE, 0, 1.33, 0);
    P(g, .1, .6, .6, BRONZE, -.34, .6, .04); P(g, .12, .66, .66, T, -.3, .6, .04); P(g, .14, .58, .58, BRONZE, -.36, .6, .04); P(g, .06, .7, .06, STEEL, .31, .7, .16); },
  bow(g, T) { legs(g, SK.brown); torso(g, 0xe8dcc0); head(g, SK.brown); P(g, .36, .1, .36, T, 0, 1.1, 0); P(g, .3, .12, .3, 0x2a1a10, 0, 1.18, -.02); P(g, .06, .6, .06, 0xb08a5a, .3, .9, .1); P(g, .14, .14, .14, 0x9a9a9a, .3, 1.24, .1); P(g, .2, .3, .14, T, -.1, .62, -.22); },
  horse(g, T) { horse(g, 0x6a4024, 0x5a3418, 0x3a2414, null); rider(g, 0xe8dcc0, SK.dark); P(g, .3, .12, .3, 0x1a1008, 0, 1.78, -.05); P(g, .08, .44, .44, T, -.26, 1.25, 0); for (const d of [0, .12]) P(g, .04, .04, 1.1, 0xb08a5a, .26 + d, 1.35, .3); },
  hero(g, T) { // elefante de guerra
    P(g, 1.1, 1, 1.7, 0x8a8a96, 0, 1.1, 0); for (const [a, b] of [[-.36, -.55], [.36, -.55], [-.36, .55], [.36, .55]]) P(g, .32, .7, .32, 0x7a7a86, a, .35, b);
    P(g, .8, .8, .7, 0x8a8a96, 0, 1.35, 1.05); P(g, .3, .7, .3, 0x7a7a86, 0, .9, 1.45); P(g, .3, .3, .3, 0x7a7a86, 0, .55, 1.55); for (const s of [-1, 1]) { P(g, .5, .6, .14, 0x7a7a86, s * .55, 1.45, .95); P(g, .08, .08, .55, 0xf4ecd8, s * .2, 1.0, 1.55); }
    P(g, 1, .14, 1.1, T, 0, 1.68, -.1); P(g, .8, .6, .8, 0xd9b27a, 0, 2.05, -.1); for (const [a, b] of [[-.36, -.46], [.36, -.46], [-.36, .26], [.36, .26]]) P(g, .1, .3, .1, 0xd9b27a, a, 2.5, b); P(g, .9, .1, .9, T, 0, 2.7, -.1);
    P(g, .3, .3, .24, 0x6a2a7a, 0, 2.55, -.1); P(g, .2, .2, .2, SK.tan, 0, 2.82, -.1); P(g, .26, .1, .26, GOLD, 0, 2.95, -.1); },
  god(g, T) { godBody(g, 0x6a2a7a, 0x8a4a9a, SK.tan, T); P(g, .3, .22, .12, 0x2a1a10, 0, 1.2, .16); steps(g, 3, .34, .16, .34, .06, GOLD, 0, 1.46, 0);
    for (const s of [-1, 1]) { P(g, .12, .12, .24, GOLD, s * .22, 1.4, .06); P(g, .1, .14, .1, GOLD, s * .3, 1.3, .14); } P(g, .07, 1.5, .07, GOLD, .42, .9, .12); P(g, .2, .2, .2, T, .42, 1.7, .12); } },

{ id: 'china', name: 'HAN', era: 'Dinastía Han · s. II a. C.', own: 0xd8a020,
  tag: 'Laca roja, tejas oscuras con aleros curvos y estandartes verticales. Armaduras de láminas y ballestas.',
  biome: 0x6e9a50, plaza: 0xb8b0a0, sw: [0xb02a20, 0x3a3a44, 0xe8c050, 0xc8b89a],
  names: ['ESPADACHÍN', 'BALLESTERO', 'LANCERO MONTADO', 'GENERAL', 'EMPERADOR DE JADE'],
  notes: ['<b>Silueta:</b> pagoda de varios pisos y aleros levantados', '<b>Arma:</b> ballesta horizontal en lugar de arco', '<b>Héroe:</b> dos plumas largas de faisán en el casco'],
  castle(g, T) { P(g, 6, .8, 5, 0x9a9488, 0, .4, 0); P(g, 4.4, 1.6, 3.6, 0xb02a20, 0, 1.6, 0); for (const x of [-2, -1, 0, 1, 2]) P(g, .26, 1.6, .26, 0x7a1a14, x, 1.6, 1.85); eaveRoof(g, 5.4, 4.4, 2.5, 0x3a3a44);
    P(g, 3, 1.2, 2.4, 0xb02a20, 0, 3.6, 0); eaveRoof(g, 4, 3.2, 4.25, 0x3a3a44); P(g, 1.8, 1, 1.4, 0xb02a20, 0, 5.2, 0); eaveRoof(g, 2.8, 2.2, 5.75, 0x3a3a44, GOLD);
    P(g, 1, 1.1, .1, 0x2a1a10, 0, 1.35, 1.82); for (const x of [-3.4, 3.4]) { P(g, .08, 3.4, .08, WOOD, x, 1.7, 1.8); P(g, .5, 1.6, .06, T, x + .26, 2.5, 1.8); } },
  barracks(g, T) { P(g, 3.4, 1.4, 2.2, 0xb02a20, 0, .7, 0); eaveRoof(g, 4.2, 3, 1.5, 0x3a3a44); P(g, 1, 1, .1, 0x2a1a10, 0, .5, 1.12); for (const x of [-2.2, 2.2]) { P(g, .08, 2.8, .08, WOOD, x, 1.4, .6); P(g, .45, 1.3, .06, T, x + .24, 2, .6); } },
  house(g) { P(g, 1.8, 1.1, 1.4, 0xd8cdb8, 0, .55, 0); eaveRoof(g, 2.4, 2, 1.2, 0x4a4a54); P(g, .4, .7, .08, 0xb02a20, 0, .35, .72); P(g, .22, .3, .22, 0xe84a2a, .9, 1.1, .75, false); bush(g, -1.3, .5, 0x4f8a3a); },
  sword(g, T) { legs(g, 0x3a3a44); torso(g, 0x3a3a44); P(g, .5, .1, .34, T, 0, .78, 0); P(g, .5, .1, .34, 0xb02a20, 0, .42, 0); head(g, SK.tan); P(g, .36, .14, .36, 0x3a3a44, 0, 1.15, 0); P(g, .14, .26, .14, 0x3a3a44, 0, 1.33, 0); P(g, .1, .2, .1, T, 0, 1.52, 0);
    P(g, .06, .62, .1, STEEL, .32, .72, .16); P(g, .08, .5, .4, 0xb02a20, -.31, .6, .02); },
  bow(g, T) { legs(g, 0x3a3a44); torso(g, 0xc8b89a); P(g, .5, .12, .34, T, 0, .7, 0); head(g, SK.tan); P(g, .62, .08, .62, 0xd8c08a, 0, 1.14, 0); P(g, .26, .14, .26, 0xd8c08a, 0, 1.22, 0); P(g, .08, .08, .7, WOOD, -.05, .82, .32); P(g, .7, .06, .08, WOOD, -.05, .82, .6); },
  horse(g, T) { horse(g, 0x5a4a3a, 0x4a3a2a, 0x2a2018, 0x3a3a44); P(g, .56, .2, .5, 0x3a3a44, 0, .92, .35); rider(g, 0x3a3a44, SK.tan); P(g, .3, .14, .3, 0x3a3a44, 0, 1.79, -.05); P(g, .1, .24, .1, T, 0, 1.96, -.05); P(g, .05, .05, 1.8, WOOD, .27, 1.3, .5); P(g, .05, .3, .4, T, .27, 1.5, 1.25); },
  hero(g, T) { horse(g, 0xe8e2d4, 0xd8d2c4, 0x9a9488, 0xb02a20); rider(g, 0x3a3a44, SK.tan); P(g, .44, .1, .32, GOLD, 0, 1.36, -.05); P(g, .5, .6, .08, T, 0, 1.15, -.24); P(g, .32, .16, .32, GOLD, 0, 1.8, -.05);
    for (const s of [-1, 1]) { P(g, .05, .9, .05, 0x8a6a3a, s * .1, 2.25, -.12); P(g, .05, .5, .05, WHITE, s * .14, 2.9, -.22); }
    P(g, .06, 1.5, .06, WOOD, .3, 1.5, .2); P(g, .1, .36, .18, STEEL, .3, 2.3, .26); },
  god(g, T) { godBody(g, 0xd8a020, 0xe8c050, SK.light, T); P(g, .3, .26, .1, 0x1a1a1a, 0, 1.12, .16); P(g, .56, .05, .4, 0x1a1a1a, 0, 1.55, 0);
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) P(g, .04, .14, .04, 0xd83a4a, s * .26, 1.47, -.12 + k * .12, false); P(g, .12, .5, .05, 0x3a9a6a, .4, 1, .16); P(g, .9, .16, .5, T, 0, .66, 0); } },

{ id: 'mexica', name: 'MEXICAS', era: 'Triple Alianza · s. XV', own: 0x2aa8a0,
  tag: 'Pirámides escalonadas de piedra caliza, jade y plumas. Sin caballos: su caballería son los guerreros águila, igual de rápidos.',
  biome: 0x4f8a3e, plaza: 0xd8d0b8, sw: [0xd8d0b8, 0x2aa8a0, 0xe0a83a, 0x2a9a5a],
  names: ['GUERRERO JAGUAR', 'ARQUERO', 'GUERRERO ÁGUILA', 'TLATOANI', 'QUETZALCÓATL'],
  notes: ['<b>Silueta:</b> traje de jaguar con manchas y macuáhuitl de obsidiana', '<b>Jinete:</b> guerrero águila a pie, con casco de pico y alas', '<b>Héroe:</b> gran penacho de plumas de quetzal'],
  castle(g, T) { const top = steps(g, 4, 6, .8, 6, 1.2, 0xd8d0b8, 0, 0, -.6, 0xc8c0a8); P(g, 1.3, 3.2, 1.6, 0xb8b098, 0, 1.6, 2.1); for (let i = 0; i < 5; i++) P(g, 1.3, .1, .2, 0x9a9278, 0, .3 + i * .64, 2.92, false);
    P(g, 2, 1.3, 1.8, 0xd8d0b8, 0, top + .65, -.6); P(g, 2.2, .3, 2, T, 0, top + 1.45, -.6); P(g, 1.6, .5, 1.4, 0x2aa8a0, 0, top + 1.85, -.6); P(g, .6, .8, .1, 0x2a1a10, 0, top + .4, .32);
    for (const s of [-1, 1]) { P(g, .3, .3, .3, 0x2aa8a0, s * 2.7, 1.1, 2.1); P(g, .08, 1.6, .08, WOOD, s * 2.6, 2, 2.4); P(g, .4, .6, .06, T, s * 2.6 + .22, 2.5, 2.4); } },
  barracks(g, T) { P(g, 3.4, .5, 2.6, 0xc8c0a8, 0, .25, 0); P(g, 2.8, 1.2, 2, 0xd8d0b8, 0, 1.1, 0); steps(g, 3, 3.2, .35, 2.4, .9, 0xc8a85a, 0, 1.7, 0); P(g, .8, .9, .1, 0x2a1a10, 0, .95, 1.02); P(g, .6, .3, .06, T, 0, 1.5, 1.04); bush(g, -2.2, .4, 0x2f6a35); },
  house(g) { P(g, 1.6, 1, 1.4, 0xe0d4b8, 0, .5, 0); steps(g, 3, 1.9, .35, 1.7, .55, 0xc8a85a, 0, 1, 0); for (let i = 0; i < 3; i++) { P(g, .1, .9, .1, 0x6a9a3a, 1.3 + i * .3, .45, .5, false); P(g, .12, .22, .12, 0xe8c050, 1.3 + i * .3, .85, .5, false); } },
  sword(g, T) { legs(g, 0xe0a83a); torso(g, 0xe0a83a); for (const [a, b, c] of [[-.12, .66, .17], [.13, .5, .17], [0, .8, .17], [-.2, .35, .1], [.16, .2, .1]]) P(g, .07, .07, .03, 0x2a1a10, a, b, c, false); P(g, .34, .34, .34, 0xe0a83a, 0, 1, 0); P(g, .3, .14, .1, 0x2a1a10, 0, .98, .18); P(g, .3, .1, .1, WHITE, 0, .88, .18); head(g, SK.brown);
    P(g, .1, .55, .55, T, -.33, .6, .02); for (let i = 0; i < 4; i++) P(g, .06, .12, .1, 0x2a9a5a, -.36, .3 - i * .02, -.2 + i * .14, false); P(g, .08, .62, .14, WOOD, .32, .72, .16); P(g, .02, .5, .2, 0x1a1a1a, .32, .76, .16, false); },
  bow(g, T) { legs(g, SK.brown); torso(g, SK.brown); P(g, .48, .2, .34, WHITE, 0, .42, 0); head(g, SK.brown); P(g, .34, .1, .34, T, 0, 1.1, 0); for (const s of [-.1, 0, .1]) P(g, .05, .3, .05, 0x2a9a5a, s, 1.3, -.14); P(g, .06, .82, .06, WOOD, -.3, .64, .12); P(g, .16, .42, .14, 0x7a4824, .1, .64, -.22); },
  horse(g, T) { // guerrero águila, a pie y con alas
    legs(g, 0x5a3a24); torso(g, 0x6a4a2a); P(g, .5, .16, .34, T, 0, .62, 0); P(g, .36, .36, .36, 0x5a3a24, 0, 1, 0); P(g, .16, .12, .2, 0xe8c050, 0, .96, .26); P(g, .28, .12, .1, WHITE, 0, 1.2, .1);
    for (const s of [-1, 1]) { P(g, .1, .5, .5, 0x6a4a2a, s * .32, .72, -.05); P(g, .08, .34, .4, WHITE, s * .38, .5, -.1); } P(g, .1, .55, .55, T, -.4, .6, .1); P(g, .08, .62, .14, WOOD, .36, .72, .2); },
  hero(g, T) { legs(g, SK.brown); torso(g, T); P(g, .5, .14, .34, 0x2aa8a0, 0, .78, 0); P(g, .5, .5, .1, GOLD, 0, .6, .17); head(g, SK.brown); P(g, .34, .12, .34, GOLD, 0, 1.15, 0);
    for (let i = -4; i <= 4; i++) P(g, .1, .9 - Math.abs(i) * .07, .06, i % 2 ? 0x2a9a5a : 0x3ab0a0, i * .1, 1.6 - Math.abs(i) * .03, -.14, false, 0); P(g, 1, .12, .08, T, 0, 1.22, -.12);
    P(g, .5, .8, .08, T, 0, .7, -.22); P(g, .08, .7, .16, WOOD, .32, .72, .16); P(g, .14, .14, .14, GOLD, .32, 1.1, .16); },
  god(g, T) { godBody(g, 0x2aa8a0, 0x3ab8b0, SK.brown, T); for (let k = 0; k < 7; k++) { const a = (k - 3) * .32; P(g, .14, .8, .08, k % 2 ? 0x3aa04a : 0x2a8a5a, Math.sin(a) * .36, 1.8 + Math.cos(a) * .1, -.1, true, -a * .3); }
    P(g, .4, .14, .36, GOLD, 0, 1.5, 0); for (const s of [-1, 1]) P(g, .1, .14, .1, 0x3a9a6a, s * .2, 1.33, .05); P(g, .08, 1.3, .08, 0x2a8a5a, .42, .95, .12); P(g, .22, .16, .26, 0x2a8a5a, .42, 1.62, .2); P(g, .56, .12, .4, T, 0, .78, 0); } },

{ id: 'egipto', name: 'EGIPTO', era: 'Imperio Nuevo · s. XIII a. C.', own: 0x2a4ab0,
  tag: 'Pilonos de arenisca, obeliscos y lino blanco. Su caballería son carros de guerra, como el del faraón.',
  biome: 0xc8b47a, plaza: 0xe8d4a0, sw: [0xe0c48a, 0xf2eee2, 0x2a4ab0, 0xe8c050],
  names: ['INFANTE', 'ARQUERO', 'CARRO', 'FARAÓN', 'HORUS'],
  notes: ['<b>Silueta:</b> pilono de dos torres trapezoidales y obelisco', '<b>Casco:</b> nemes a rayas del color del bando y oro', '<b>Jinete y héroe:</b> carros de guerra tirados por dos caballos'],
  castle(g, T) { for (const s of [-1, 1]) steps(g, 6, 2.6, .6, 1.8, .14, 0xe0c48a, s * 1.9, 0, 0);
    P(g, 1.4, 2.6, 1.2, 0xd0b47a, 0, 1.3, 0); P(g, 1.6, .3, 1.4, 0xe8c050, 0, 2.75, 0); P(g, .9, 1.8, .1, 0x3a2a14, 0, .9, .62);
    for (const s of [-1, 1]) { P(g, 1.6, .2, .1, 0x2a4ab0, s * 1.9, 2.8, .92, false); P(g, .08, 4.6, .08, WOOD, s * 1.1, 2.3, 1); P(g, .5, .3, .06, T, s * 1.1 + .27, 4.3, 1); }
    P(g, .5, 3, .5, 0xe0c48a, -3.6, 1.5, 1.2); P(g, .3, .4, .3, GOLD, -3.6, 3.2, 1.2); P(g, 3.4, 1.6, 2.6, 0xe8d4a0, 0, .8, -2.4); P(g, .9, .5, .9, T, 0, 1.85, -2.4); },
  barracks(g, T) { P(g, 3.4, 1.5, 2.4, 0xd8c08a, 0, .75, 0); P(g, 3.6, .2, 2.6, 0xe8d4a0, 0, 1.6, 0); P(g, 3.6, .14, .1, 0x2a4ab0, 0, 1.35, 1.25, false); P(g, 3.6, .1, .1, GOLD, 0, 1.2, 1.25, false); P(g, 1, 1.1, .2, 0x3a2a14, 0, .55, 1.25); P(g, .7, .4, .06, T, 0, 2.05, 0); palm(g, 2.3, -.6, 2.2); },
  house(g) { P(g, 1.6, 1.2, 1.4, WHITE, 0, .6, 0); P(g, .6, .5, .6, WHITE, .4, 1.45, -.3); for (let i = 0; i < 4; i++) P(g, .06, .8 + i % 2 * .2, .06, 0x5a8a3a, -1.2 + i * .12, .45, .6, false); palm(g, 1.3, .7, 2.3); },
  sword(g, T) { legs(g, SK.brown); torso(g, SK.brown); P(g, .48, .26, .34, WHITE, 0, .44, 0); P(g, .5, .1, .34, GOLD, 0, .76, 0); head(g, SK.brown);
    P(g, .38, .16, .36, T, 0, 1.15, 0); P(g, .38, .05, .36, GOLD, 0, 1.08, 0); for (const s of [-1, 1]) P(g, .1, .34, .2, T, s * .18, .92, -.06);
    P(g, .1, .6, .42, T, -.32, .6, .04); P(g, .12, .2, .3, WHITE, -.33, .82, .04); P(g, .06, .36, .06, STEEL, .31, .62, .16); P(g, .06, .06, .24, STEEL, .31, .82, .26); },
  bow(g, T) { legs(g, SK.brown); torso(g, SK.brown); P(g, .48, .26, .34, WHITE, 0, .44, 0); head(g, SK.brown); P(g, .34, .24, .36, 0x1a1a1a, 0, 1.06, -.03); P(g, .36, .06, .36, T, 0, 1.15, 0); P(g, .06, .82, .06, WOOD, -.3, .64, .12); P(g, .16, .42, .14, T, .1, .64, -.22); },
  horse(g, T) { chariot(g, T, 0x8a5a34, false); },
  hero(g, T) { chariot(g, T, WHITE, true); },
  god(g, T) { godBody(g, 0xf2eee2, 0xe0d8c0, 0x3a4a7a, T); P(g, .1, .1, .16, GOLD, 0, 1.28, .22); P(g, .32, .1, .3, WHITE, 0, 1.24, .04); P(g, .36, .36, .08, 0xd8402a, 0, 1.76, -.04); P(g, .3, .12, .3, 0x3a4a7a, 0, 1.52, 0);
    P(g, .58, .12, .42, GOLD, 0, 1.12, 0); P(g, .07, 1.6, .07, GOLD, .42, .9, .12); P(g, .2, .1, .1, GOLD, .48, 1.72, .12); P(g, .56, .14, .4, T, 0, .7, 0); } },

{ id: 'galos', name: 'GALOS', era: 'Galia independiente · s. I a. C.', own: 0x2f8a3a,
  tag: 'Castros de empalizada, chozas redondas de paja y guerreros sin armadura con escudos ovalados. Madera y tierra.',
  biome: 0x5a8a3e, plaza: 0xa88a5a, sw: [0x8a6a3a, 0xc8a85a, 0x2f8a3a, 0xc8913c],
  names: ['GUERRERO', 'CAZADOR', 'JINETE NOBLE', 'CAUDILLO', 'CERNUNNOS'],
  notes: ['<b>Escudo:</b> ovalado y largo con umbo de bronce', '<b>Silueta:</b> pelo largo y bigote, torso descubierto con capa', '<b>Héroe:</b> casco alado y estandarte del jabalí'],
  castle(g, T) { for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; if (Math.abs(a - Math.PI / 2) < .35) continue; P(g, .3, 1.5 + (i % 2) * .3, .3, 0x7a5a34, Math.cos(a) * 3.2, .8, Math.sin(a) * 2.6); }
    P(g, 3, 1.4, 3, 0xb8a080, 0, .7, -.3); P(g, 3, 1.4, 3, 0xb8a080, 0, .7, -.3, true, Math.PI / 4); steps(g, 5, 4.2, .4, 4.2, .8, 0xc8a85a, 0, 1.4, -.3, 0xb89848); P(g, .8, 1, .1, 0x3a2a14, 0, .5, 1.85);
    P(g, .1, 4, .1, BRONZE, 2.4, 2, 1.2); P(g, .6, .36, .26, BRONZE, 2.4, 4.1, 1.2); P(g, .16, .16, .26, BRONZE, 2.75, 4.05, 1.2); P(g, .7, .6, .06, T, 2.4, 3.4, 1.2); },
  barracks(g, T) { P(g, 3.6, 1.1, 2, 0x9a7a4a, 0, .55, 0); steps(g, 3, 3.9, .4, 2.3, .7, 0xc8a85a, 0, 1.1, 0); P(g, .8, .9, .1, 0x3a2a14, 0, .45, 1.02); P(g, .08, 2.6, .08, WOOD, 2.2, 1.3, .8); P(g, .5, .7, .06, T, 2.46, 2.1, .8); },
  house(g) { P(g, 1.6, .9, 1.6, 0xb8a080, 0, .45, 0); P(g, 1.6, .9, 1.6, 0xb8a080, 0, .45, 0, true, Math.PI / 4); steps(g, 4, 2.2, .35, 2.2, .5, 0xc8a85a, 0, .9, 0); P(g, 1, .5, .6, 0x8a6a3a, 1.5, .25, .4); bush(g, -1.4, .5); },
  sword(g, T) { legs(g, 0x6a8a3a, 0x8a3a2a); torso(g, SK.light); P(g, .5, .5, .1, T, 0, .66, -.2); P(g, .2, .06, .06, GOLD, 0, .8, .18); head(g, SK.light); P(g, .36, .2, .36, 0xe0b050, 0, 1.08, -.03); P(g, .3, .3, .1, 0xe0b050, 0, .9, -.18); P(g, .24, .06, .06, 0xc89a40, 0, .9, .17);
    P(g, .1, .9, .48, T, -.33, .62, .04); P(g, .14, .2, .2, BRONZE, -.39, .62, .04); P(g, .06, .82, .08, STEEL, .32, .76, .16); },
  bow(g, T) { legs(g, 0x6a5a3a); torso(g, 0x4a6a3a); head(g, SK.light); P(g, .38, .3, .38, 0x3a5a2a, 0, 1.06, -.02); P(g, .14, .2, .14, 0x3a5a2a, 0, 1.24, -.14); P(g, .5, .12, .34, T, 0, .76, 0); P(g, .06, .9, .06, WOOD, -.3, .66, .12); P(g, .16, .42, .14, 0x7a4824, .1, .64, -.22); },
  horse(g, T) { horse(g, 0x9a7a5a, 0x8a6a4a, 0x4a3a24, T); rider(g, 0x8a6a3a, SK.light); P(g, .5, .5, .08, T, 0, 1.2, -.24); P(g, .32, .16, .32, BRONZE, 0, 1.8, -.05); for (const s of [-1, 1]) P(g, .08, .22, .08, BRONZE, s * .18, 1.95, -.05); P(g, .08, .7, .38, T, -.28, 1.2, 0); P(g, .05, .05, 1.5, WOOD, .27, 1.3, .4); },
  hero(g, T) { horse(g, 0x3a2a1a, 0x2a1e12, 0x1a120a, T); rider(g, 0x8a6a3a, SK.light); P(g, .22, .06, .06, GOLD, 0, 1.47, .12); P(g, .6, .7, .08, T, 0, 1.15, -.26); P(g, .32, .16, .32, STEEL, 0, 1.8, -.05);
    for (const s of [-1, 1]) { P(g, .06, .36, .3, WHITE, s * .2, 2, -.12); P(g, .06, .2, .2, WHITE, s * .26, 2.2, -.2); }
    P(g, .08, 2.1, .08, BRONZE, .32, 1.9, .1); P(g, .34, .2, .44, BRONZE, .32, 3, .14); P(g, .14, .14, .14, BRONZE, .32, 3.02, .42); P(g, .36, .3, .06, T, .32, 2.55, .1); },
  god(g, T) { godBody(g, 0x2f6a35, 0x3f7a45, SK.tan, T); P(g, .36, .06, .3, GOLD, 0, 1.13, 0); for (const s of [-1, 1]) { P(g, .07, .5, .07, 0x8a6a44, s * .2, 1.68, 0); P(g, .26, .07, .07, 0x8a6a44, s * .32, 1.82, 0); P(g, .07, .26, .07, 0x8a6a44, s * .42, 1.98, 0); P(g, .07, .2, .07, 0x8a6a44, s * .28, 2.04, 0); }
    P(g, .3, .2, .12, 0x7a5a34, 0, 1.2, .16); P(g, .7, .5, .06, T, 0, .95, -.24); P(g, .12, .3, .12, 0x9a9a9a, .42, .82, .12); } },
{ id: 'grecia', name: 'GRECIA', era: 'Época clásica · s. V a. C.', own: 0xc8913c,
  tag: 'Acrópolis de mármol, frisos pintados y tejas de terracota. Hoplitas con escudo redondo y lanza: falanges lentas pero muy duras.',
  biome: 0x9ab860, plaza: 0xd8d0bc, sw: [0xece6d8, 0x4a6a9a, 0xc8913c, 0xb8422a],
  names: ['HOPLITA', 'TOXOTA', 'CABALLERO', 'ESTRATEGO', 'ATENEA'],
  notes: ['<b>Escudo:</b> aspis redondo y grande de bronce con el emblema del bando', '<b>Casco:</b> corintio que tapa la cara, con cresta a lo largo', '<b>Héroe:</b> estratego en caballo negro con lanza larga y aspis'],
  castle(g, T) { const R = 0xb8ae96, M = 0xe8e2d4; P(g, 7, 1.1, 5.2, R, 0, .55, 0); P(g, 6.4, .3, 4.6, 0xd8d0bc, 0, 1.25, 0); P(g, 2, .55, 1, 0xd8d0bc, 0, .28, 3.1); P(g, 2, .55, .6, 0xd8d0bc, 0, .83, 2.85);
    for (let i = 0; i < 7; i++) for (const z of [-1.8, 1.8]) P(g, .38, 2.4, .38, WHITE, -2.7 + i * .9, 2.6, z);
    for (let j = 1; j < 4; j++) for (const x of [-2.7, 2.7]) P(g, .38, 2.4, .38, WHITE, x, 2.6, -1.8 + j * .9);
    P(g, 4.2, 2.2, 2.4, 0xe0d8c4, 0, 2.5, 0); P(g, 1, 1.5, .1, 0x3a2a14, 0, 2.15, 1.22); P(g, 6.2, .35, 4.2, M, 0, 3.97, 0); P(g, 6.3, .26, 4.3, 0x4a6a9a, 0, 4.27, 0);
    for (let i = 0; i < 4; i++) { const w = 6.2 - i * 1.55; P(g, w, .3, 4.5, 0xb8422a, 0, 4.55 + i * .3, 0); P(g, w - .2, .28, .1, M, 0, 4.55 + i * .3, 2.26, false); }
    P(g, .5, .4, .3, T, 0, 5.85, 2.1); P(g, .1, 2, .1, WOOD, 3.3, 2.1, 2.3); P(g, .8, .6, .06, T, 3.72, 2.7, 2.3); },
  barracks(g, T) { P(g, 3.8, .3, 2.6, 0xd8d0bc, 0, .15, 0); P(g, 3.4, 1.4, 1.2, 0xe0d8c4, 0, 1, -.5); for (let i = 0; i < 5; i++) P(g, .24, 1.4, .24, WHITE, -1.5 + i * .75, 1, .95);
    P(g, 3.8, .25, 2.6, 0xe8e2d4, 0, 1.82, 0); for (let i = 0; i < 3; i++) P(g, 3.8 - i * 1.1, .25, 2.7, 0xb8422a, 0, 2.07 + i * .25, 0);
    for (const x of [-1, 0, 1]) { P(g, .5, .5, .08, BRONZE, x, 1.1, .14); P(g, .2, .2, .06, T, x, 1.1, .19, false); } P(g, .08, 2.6, .08, WOOD, 2.3, 1.3, 1.2); P(g, .5, .5, .06, T, 2.56, 2.2, 1.2); },
  house(g) { P(g, 1.8, 1.1, 1.5, WHITE, 0, .55, 0); P(g, 1.82, .12, 1.52, 0x4a6a9a, 0, 1.04, 0, false); for (let i = 0; i < 2; i++) P(g, 2 - i * .8, .25, 1.7, 0xb8422a, 0, 1.22 + i * .25, 0);
    P(g, .16, .4, .16, 0x6a5a44, 1.4, .2, .5); P(g, .8, .45, .7, 0x8a9a6a, 1.4, .6, .5); },
  sword(g, T) { legs(g, BRONZE); torso(g, 0xe8dcc0); P(g, .5, .3, .34, BRONZE, 0, .68, 0); P(g, .5, .12, .34, T, 0, .4, 0); head(g, SK.tan);
    P(g, .36, .36, .36, BRONZE, 0, 1, 0); P(g, .24, .06, .06, 0x1a1a1a, 0, 1.02, .18, false); P(g, .08, .2, .5, T, 0, 1.28, -.02);
    P(g, .1, .74, .74, BRONZE, -.34, .62, .04); P(g, .06, .3, .3, T, -.41, .62, .04); P(g, .05, 1.4, .05, WOOD, .31, .85, .16); P(g, .08, .18, .08, STEEL, .31, 1.62, .16); },
  bow(g, T) { legs(g, 0x8a6a3a); torso(g, 0xd8c8a0); P(g, .5, .12, .34, T, 0, .76, 0); head(g, SK.tan); P(g, .34, .2, .34, T, 0, 1.15, 0); P(g, .2, .18, .2, T, 0, 1.31, .06);
    P(g, .06, .82, .06, WOOD, -.3, .64, .12); P(g, .16, .42, .14, 0x7a4824, .1, .64, -.22); },
  horse(g, T) { horse(g, 0x9a6a44, 0x8a5a34, 0x5a3a24, null); rider(g, 0xe8dcc0, SK.tan); P(g, .46, .42, .06, T, 0, 1.24, -.22); P(g, .44, .06, .44, BRONZE, 0, 1.76, -.05); P(g, .24, .14, .24, BRONZE, 0, 1.84, -.05);
    for (const d of [0, .1]) P(g, .04, .04, 1.2, WOOD, .26 + d, 1.32, .35); },
  hero(g, T) { horse(g, 0x2a2a2e, 0x1e1e22, 0x141418, T); rider(g, BRONZE, SK.tan); P(g, .5, .6, .08, T, 0, 1.15, -.24); P(g, .3, .3, .3, GOLD, 0, 1.64, -.05); P(g, .08, .34, .62, T, 0, 1.94, -.05);
    P(g, .05, .05, 2, WOOD, .27, 1.45, .5); P(g, .08, .08, .22, STEEL, .27, 1.45, 1.6); P(g, .08, .62, .62, BRONZE, -.28, 1.25, 0); P(g, .06, .26, .26, T, -.33, 1.25, 0); },
  god(g, T) { godBody(g, WHITE, 0xe8e2d4, SK.light, T); P(g, .38, .2, .38, GOLD, 0, 1.53, 0); P(g, .08, .26, .52, T, 0, 1.76, 0); P(g, .3, .22, .06, GOLD, 0, 1.0, .2);
    P(g, .07, 1.8, .07, WOOD, .42, 1, .12); P(g, .1, .22, .1, GOLD, .42, 1.98, .12); P(g, .08, .62, .62, GOLD, -.42, .85, .05); P(g, .06, .24, .24, T, -.47, .85, .05); P(g, .14, .16, .12, 0x8a7a6a, -.3, 1.24, 0); } },

{ id: 'vikingos', name: 'VIKINGOS', era: 'Era vikinga · s. IX', own: 0x4a6a7a,
  tag: 'Casas largas de madera con tejado de hierba, escudos redondos pintados y hachas danesas. Saqueadores que toman pueblos muy deprisa.',
  biome: 0x5f8a5a, plaza: 0x9a8a6a, sw: [0x6a4a2e, 0x5a7a3a, 0x9aa0a8, 0xc8b898],
  names: ['HACHERO', 'ARQUERO', 'JINETE', 'JARL', 'ODÍN'],
  notes: ['<b>Escudo:</b> redondo de madera pintado del color del bando, con umbo de hierro', '<b>Arma:</b> hacha danesa y casco de hierro con nasal (sin cuernos)', '<b>Héroe:</b> el jarl, a pie, con hacha de dos manos y capa de piel'],
  castle(g, T) { const W = 0x6a4a2e, TU = 0x5a7a3a; P(g, 6.6, .4, 3.8, 0x8a8a86, 0, .2, 0); P(g, 6.2, 1.7, 3.2, W, 0, 1.25, 0);
    for (let i = 0; i < 4; i++) P(g, 6.6, .36, 3.7 - i * .95, i % 2 ? 0x6a8a46 : TU, 0, 2.28 + i * .36, 0);
    for (const s of [-1, 1]) { P(g, .2, .7, .2, W, s * 3.2, 3.6, 0); P(g, .44, .2, .2, W, s * 3.38, 3.95, 0); }
    P(g, 1, 1.3, .1, 0x2a1a10, 0, .85, 1.62); for (const [x, c] of [[-2.3, T], [-1.4, 0xc8b898], [1.4, T], [2.3, 0xc8b898]]) { P(g, .55, .55, .08, c, x, 1.55, 1.64); P(g, .16, .16, .06, 0x9aa0a8, x, 1.55, 1.7, false); }
    P(g, .5, 1.4, .3, 0x8a8a86, 3.6, .7, 2.1); P(g, .1, 3, .1, WOOD, -3.6, 1.5, 1.9); P(g, .8, .6, .06, T, -3.18, 2.6, 1.9); },
  barracks(g, T) { P(g, 3.6, 1.2, 2, 0x6a4a2e, 0, .6, 0); for (let i = 0; i < 3; i++) P(g, 3.9, .32, 2.3 - i * .7, i % 2 ? 0x6a8a46 : 0x5a7a3a, 0, 1.36 + i * .32, 0); P(g, .8, .9, .1, 0x2a1a10, 0, .45, 1.02);
    P(g, 1.2, .1, .1, WOOD, 2.6, .9, .4); for (const z of [.1, .4, .7]) P(g, .06, .9, .06, WOOD, 2.6, .5, z); P(g, .5, .5, .08, T, 2.6, .6, .9); },
  house(g) { P(g, 1.9, .9, 1.2, 0x6a4a2e, 0, .45, 0); for (let i = 0; i < 3; i++) P(g, 2.1, .3, 1.4 - i * .45, 0x5a7a3a, 0, 1.05 + i * .3, 0); P(g, .4, .6, .06, 0x2a1a10, 0, .3, .62); P(g, .6, .4, .4, 0x8a6a4a, 1.4, .2, .4); },
  sword(g, T) { legs(g, 0x6a5a44); torso(g, 0xc8b898); P(g, .52, .14, .36, 0x8a7a6a, 0, .86, 0); P(g, .5, .08, .34, 0x4a3a24, 0, .5, 0); head(g, SK.light); P(g, .26, .16, .08, 0xc8803a, 0, .88, .17);
    P(g, .34, .16, .34, 0x9aa0a8, 0, 1.15, 0); P(g, .06, .18, .06, 0x9aa0a8, 0, 1.02, .18);
    P(g, .1, .64, .64, T, -.33, .62, .04); P(g, .12, .18, .18, 0x9aa0a8, -.39, .62, .04); P(g, .06, .8, .06, WOOD, .31, .72, .16); P(g, .06, .28, .22, STEEL, .31, 1.02, .27); },
  bow(g, T) { legs(g, 0x6a5a44); torso(g, 0x5a6a4a); P(g, .5, .12, .34, T, 0, .76, 0); head(g, SK.light); P(g, .26, .14, .08, 0xc8803a, 0, .9, .17); P(g, .38, .18, .38, 0x8a7a6a, 0, 1.15, 0);
    P(g, .06, .9, .06, WOOD, -.3, .66, .12); P(g, .16, .42, .14, 0x7a4824, .1, .64, -.22); },
  horse(g, T) { horse(g, 0xb8a888, 0xa89878, 0x6a5a44, T); rider(g, 0x9aa0a8, SK.light); P(g, .22, .12, .08, 0xc8803a, 0, 1.5, .1); P(g, .3, .16, .3, 0x9aa0a8, 0, 1.79, -.05); P(g, .06, .14, .06, 0x9aa0a8, 0, 1.68, .12);
    P(g, .08, .52, .52, T, -.28, 1.25, -.05); P(g, .05, .05, 1.5, WOOD, .27, 1.3, .4); P(g, .07, .07, .2, STEEL, .27, 1.3, 1.2); },
  hero(g, T) { legs(g, 0x4a3a2a); torso(g, 0x9aa0a8); P(g, .5, .08, .34, GOLD, 0, .5, 0); P(g, .58, .7, .08, 0x8a7a6a, 0, .64, -.2); P(g, .6, .16, .4, 0x8a7a6a, 0, .88, 0); P(g, .6, .08, .1, T, 0, .98, -.2);
    head(g, SK.light); P(g, .28, .3, .08, 0xd8a050, 0, .82, .17); P(g, .36, .18, .36, 0x9aa0a8, 0, 1.15, 0); P(g, .38, .05, .38, GOLD, 0, 1.08, 0); P(g, .3, .08, .06, 0x9aa0a8, 0, 1.02, .17);
    P(g, .07, 1.3, .07, WOOD, .32, .85, .18); P(g, .06, .38, .32, STEEL, .32, 1.4, .33); P(g, .1, .66, .66, T, -.34, .62, .04); P(g, .12, .2, .2, GOLD, -.4, .62, .04); },
  god(g, T) { godBody(g, 0x4a4a5a, 0x5a5a6a, SK.light, T); P(g, .62, .06, .62, 0x3a3a44, 0, 1.52, 0); P(g, .3, .22, .3, 0x3a3a44, 0, 1.65, 0); P(g, .3, .4, .1, 0xe8e8e8, 0, 1.12, .18); P(g, .08, .08, .04, 0x1a1a1a, .08, 1.36, .18, false);
    P(g, .07, 1.8, .07, 0x6a4a2e, .42, 1, .12); P(g, .1, .24, .1, GOLD, .42, 1.98, .12); for (const s of [-1, 1]) P(g, .16, .14, .26, 0x1a1a22, s * .32, 1.24, 0); } },

{ id: 'persia', name: 'PERSIA', era: 'Imperio aqueménida · s. V a. C.', own: 0xd8782a,
  tag: 'Palacios de columnas con capiteles de toro, ladrillo vidriado azul y jardines con canales. Inmortales y arqueros que aguantan más que nadie.',
  biome: 0xb8b07a, plaza: 0xd8c8a8, sw: [0xd8c8a8, 0x2a8a8a, 0xe8c050, 0x7a2a5a],
  names: ['INMORTAL', 'ARQUERO', 'CATAFRACTO', 'GRAN REY', 'AHURA MAZDA'],
  notes: ['<b>Escudo:</b> de mimbre (spara) en forma de ocho', '<b>Silueta:</b> tiara de tela y túnica larga hasta los pies', '<b>Héroe:</b> el Gran Rey con corona almenada bajo la sombrilla real'],
  castle(g, T) { const L = 0xd8c8a8, BL = 0x2a8a8a; P(g, 6.6, .8, 5, 0xc8b898, 0, .4, 0); for (let i = 0; i < 2; i++) P(g, 2.6, .4, .5, L, 0, .2 + i * .4, 2.75 - i * .4);
    P(g, 5.4, 2.8, .4, L, 0, 2.2, -2); for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { const x = -2.1 + i * 1.4, z = -1.2 + j * 1.3; P(g, .3, 2.8, .3, 0xe0d4b8, x, 2.2, z); P(g, .7, .3, .3, 0x8a6a4a, x, 3.75, z); }
    P(g, 5.6, .4, 4.4, L, 0, 4.1, -.1); P(g, 5.7, .3, 4.5, BL, 0, 4.45, -.1); for (let i = 0; i < 7; i++) { P(g, .36, .4, .2, L, -2.4 + i * .8, 4.8, 2.05); P(g, .18, .2, .2, L, -2.4 + i * .8, 5.1, 2.05); }
    P(g, 1, .18, .1, GOLD, 0, 4.45, 2.16, false); P(g, .3, .3, .1, GOLD, 0, 4.62, 2.16, false);
    for (const x of [-3.5, 3.5]) { P(g, .08, 3.4, .08, WOOD, x, 1.7, 2.2); P(g, .55, .6, .06, T, x + .3, 3, 2.2); } },
  barracks(g, T) { P(g, 3.4, 1.6, 2.4, 0xd8c8a8, 0, .8, 0); P(g, 3.45, .3, 2.45, 0x2a8a8a, 0, 1.1, 0); for (let i = 0; i < 4; i++) P(g, .2, .2, .06, 0xe8c050, -1.2 + i * .8, 1.1, 1.24, false);
    for (let i = 0; i < 5; i++) { P(g, .32, .3, .2, 0xd8c8a8, -1.4 + i * .7, 1.75, 1.1); P(g, .16, .16, .2, 0xd8c8a8, -1.4 + i * .7, 1.98, 1.1); }
    P(g, 1, 1.1, .1, 0x3a2a14, 0, .55, 1.22); P(g, .08, 2.6, .08, WOOD, 2.1, 1.3, 1.3); P(g, .5, .5, .06, T, 2.36, 2.2, 1.3); },
  house(g) { P(g, 1.6, 1.1, 1.4, 0xe0d0b0, 0, .55, 0); P(g, 1.7, .12, 1.5, 0xc8b898, 0, 1.15, 0); P(g, .4, .7, .4, 0xe0d0b0, .5, 1.5, -.4); P(g, .44, .1, .44, 0xc8b898, .5, 1.88, -.4);
    P(g, .4, .6, .06, 0x2a8a8a, -.3, .3, .72); cypress(g, 1.4, .5); },
  sword(g, T) { P(g, .42, .34, .3, 0xd8c09a, 0, .17, 0); torso(g, 0xd8c09a); P(g, .48, .08, .34, 0x2a8a8a, 0, .58, 0); head(g, SK.tan); P(g, .26, .14, .08, 0x1a1a1a, 0, .88, .17);
    P(g, .34, .22, .34, 0xe8dcc0, 0, 1.18, 0); P(g, .28, .14, .28, 0xe8dcc0, 0, 1.36, 0);
    P(g, .08, .3, .42, 0xb89a5a, -.33, .82, .04); P(g, .08, .3, .42, 0xb89a5a, -.33, .42, .04); P(g, .1, .14, .3, T, -.34, .62, .04);
    P(g, .06, 1.2, .06, WOOD, .31, .8, .16); P(g, .1, .1, .1, GOLD, .31, .22, .16); P(g, .08, .14, .08, STEEL, .31, 1.45, .16); },
  bow(g, T) { legs(g, 0x6a3a2a); torso(g, 0xc8b898); P(g, .5, .12, .34, T, 0, .7, 0); head(g, SK.tan); P(g, .26, .14, .08, 0x1a1a1a, 0, .88, .17); P(g, .36, .3, .36, 0xd8c09a, 0, 1.08, -.02); P(g, .14, .16, .14, 0xd8c09a, 0, 1.28, .08);
    P(g, .06, .7, .06, 0x5a3a24, -.3, .64, .12); P(g, .18, .46, .16, 0x8a5a2a, .12, .62, -.22); },
  horse(g, T) { horse(g, 0xb89a6a, 0xa88a5a, 0x6a4a2a, 0x2a8a8a); P(g, .56, .2, .5, 0x9aa0a8, 0, .92, .35); rider(g, 0x9aa0a8, SK.tan); P(g, .3, .24, .3, 0xe8dcc0, 0, 1.82, -.05); P(g, .12, .12, .12, 0xe8dcc0, 0, 1.98, .02);
    P(g, .08, .44, .36, T, -.26, 1.25, 0); P(g, .05, .05, 1.6, WOOD, .27, 1.3, .45); },
  hero(g, T) { horse(g, WHITE, 0xeae6f2, 0xd8d4e4, 0x2a8a8a); P(g, .62, .08, .6, GOLD, 0, 1.07, -.05); rider(g, 0x7a2a5a, SK.tan); P(g, .5, .6, .08, T, 0, 1.15, -.24); P(g, .22, .22, .08, 0x1a1a1a, 0, 1.46, .09);
    P(g, .3, .2, .3, GOLD, 0, 1.82, -.05); for (const [a, b] of [[-.1, -.1], [.1, -.1], [-.1, .1], [.1, .1]]) P(g, .08, .1, .08, GOLD, a, 1.97, b - .05);
    P(g, .05, 1.5, .05, GOLD, -.3, 2, -.3); P(g, 1.1, .1, 1.1, T, -.3, 2.75, -.3); P(g, .7, .12, .7, GOLD, -.3, 2.86, -.3); },
  god(g, T) { godBody(g, WHITE, 0xe8dcc0, SK.tan, T); P(g, .32, .2, .32, GOLD, 0, 1.58, 0); P(g, .28, .22, .08, 0x3a3a3a, 0, 1.2, .18);
    for (const s of [-1, 1]) { P(g, .5, .14, .1, GOLD, s * .55, 1.02, -.12); P(g, .42, .12, .1, GOLD, s * .5, .88, -.12); P(g, .34, .1, .1, GOLD, s * .46, .76, -.12); } P(g, .22, .22, .05, GOLD, .36, .62, .12); } },

{ id: 'mongoles', name: 'MONGOLES', era: 'Imperio mongol · s. XIII', own: 0x8a4a2a,
  tag: 'Campamento de yurtas de fieltro blanco tras un círculo de carros, en la estepa abierta. Estandartes de crin y la caballería más rápida.',
  biome: 0x9ab06a, plaza: 0xb8a878, sw: [0xece6d6, 0x8a4a2a, 0x9aa0a8, 0xc8913c],
  names: ['GUERRERO', 'ARQUERO', 'JINETE', 'KAN', 'TENGRI'],
  notes: ['<b>Silueta:</b> casco cónico de hierro con orejeras de piel', '<b>Arma:</b> arco compuesto corto y sable curvo', '<b>Héroe:</b> el kan con el estandarte de colas de caballo (sulde)'],
  castle(g, T) { const F = 0xece6d6, F2 = 0xe0d8c4; P(g, 6.6, .2, 4.8, 0x8a4a2a, 0, .1, 0);
    P(g, 3.4, 1.6, 3.4, F, 0, 1, -.3); P(g, 3.4, 1.6, 3.4, F, 0, 1, -.3, true, Math.PI / 4); P(g, 3.5, .14, 3.5, T, 0, 1.6, -.3); P(g, 3.5, .14, 3.5, T, 0, 1.6, -.3, false, Math.PI / 4);
    steps(g, 4, 3.8, .35, 3.8, .8, F2, 0, 1.8, -.3); P(g, .5, .3, .5, 0x8a4a2a, 0, 3.35, -.3); P(g, .8, 1.1, .1, 0xc8402a, 0, .75, 1.42);
    for (const s of [-1, 1]) { P(g, 1.4, .8, 1.4, F, s * 2.7, .5, 1.3); P(g, 1.4, .8, 1.4, F, s * 2.7, .5, 1.3, true, Math.PI / 4); steps(g, 2, 1.6, .3, 1.6, .6, F2, s * 2.7, .9, 1.3); }
    P(g, .1, 3.6, .1, WOOD, 2.8, 1.8, -1.8); P(g, .44, .9, .44, 0x2a2a2a, 2.8, 3.1, -1.8); P(g, .26, .26, .26, GOLD, 2.8, 3.7, -1.8);
    P(g, .1, 3, .1, WOOD, -3, 1.5, -1.6); P(g, .7, .5, .06, T, -2.62, 2.6, -1.6); },
  barracks(g, T) { P(g, 1.8, 1, 1.8, 0xece6d6, -.6, .5, -.2); P(g, 1.8, 1, 1.8, 0xece6d6, -.6, .5, -.2, true, Math.PI / 4); P(g, 1.9, .12, 1.9, T, -.6, .9, -.2); steps(g, 3, 2.1, .3, 2.1, .6, 0xe0d8c4, -.6, 1, -.2);
    for (const z of [-.8, .2, 1.2]) P(g, .1, .7, .1, WOOD, 1.7, .35, z); for (const y of [.35, .6]) P(g, .06, .06, 2.1, WOOD, 1.7, y, .2); P(g, .8, .5, .06, 0xc8402a, -.6, .3, .72); },
  house(g) { P(g, 1.4, .8, 1.4, 0xece6d6, 0, .4, 0); P(g, 1.4, .8, 1.4, 0xece6d6, 0, .4, 0, true, Math.PI / 4); steps(g, 2, 1.6, .3, 1.6, .6, 0xe0d8c4, 0, .8, 0); P(g, .2, .2, .2, 0x8a4a2a, 0, 1.5, 0);
    P(g, .4, .6, .06, 0xc8402a, 0, .3, .72); P(g, 1, .4, .6, WOOD, 1.4, .4, .5); for (const s of [-1, 1]) P(g, .1, .5, .5, 0x5a3a24, 1.4 + s * .45, .25, .5); },
  sword(g, T) { legs(g, 0x5a3a24); torso(g, 0x8a4a2a); P(g, .5, .1, .34, T, 0, .5, 0); head(g, SK.tan);
    P(g, .34, .16, .34, 0x9aa0a8, 0, 1.15, 0); P(g, .18, .16, .18, 0x9aa0a8, 0, 1.3, 0); P(g, .06, .14, .06, 0x9aa0a8, 0, 1.44, 0); for (const s of [-1, 1]) P(g, .06, .2, .22, 0x6a5a44, s * .18, .98, 0);
    P(g, .08, .44, .44, T, -.31, .62, .04); P(g, .06, .5, .08, STEEL, .31, .66, .18); P(g, .06, .16, .08, STEEL, .31, .96, .24); },
  bow(g, T) { legs(g, 0x5a3a24); torso(g, 0x5a6a8a); P(g, .5, .1, .34, T, 0, .5, 0); head(g, SK.tan); P(g, .38, .16, .38, 0x8a7a5a, 0, 1.12, 0); P(g, .24, .14, .24, 0xc84a2a, 0, 1.26, 0);
    P(g, .06, .66, .06, 0x5a3a24, -.3, .66, .12); P(g, .06, .1, .1, 0x5a3a24, -.3, 1.02, .18); P(g, .06, .1, .1, 0x5a3a24, -.3, .3, .18); P(g, .16, .42, .14, 0x8a4a2a, .1, .64, -.22); },
  horse(g, T) { horse(g, 0x7a5a3a, 0x6a4a2a, 0x3a2a1a, T); rider(g, 0x8a4a2a, SK.tan); P(g, .3, .14, .3, 0x9aa0a8, 0, 1.78, -.05); P(g, .14, .18, .14, 0x9aa0a8, 0, 1.92, -.05); P(g, .06, .12, .06, 0xc84a2a, 0, 2.06, -.05);
    P(g, .05, .05, 1.6, WOOD, .27, 1.3, .4); P(g, .06, .5, .06, 0x5a3a24, -.2, 1.3, -.25); },
  hero(g, T) { horse(g, WHITE, 0xeae6f2, 0xd8d4e4, T); rider(g, 0x3a5a8a, SK.tan); P(g, .44, .08, .32, GOLD, 0, 1.2, -.05); P(g, .5, .6, .08, T, 0, 1.15, -.24);
    P(g, .36, .14, .36, 0x8a6a44, 0, 1.78, -.05); P(g, .24, .18, .24, GOLD, 0, 1.9, -.05); P(g, .06, .14, .06, GOLD, 0, 2.06, -.05);
    P(g, .06, 2.2, .06, WOOD, .32, 2, .1); P(g, .14, .26, .14, GOLD, .32, 3.2, .1); P(g, .38, .6, .38, WHITE, .32, 2.8, .1); P(g, .32, .26, .05, T, .32, 2.3, .14); },
  god(g, T) { godBody(g, 0x8ab8e0, 0xa8c8e8, SK.tan, T); P(g, .5, .14, .5, WHITE, 0, 1.56, 0); P(g, .28, .32, .08, 0xe8e8e8, 0, 1.12, .18);
    P(g, .24, .24, .06, GOLD, .44, 1.22, .1); P(g, .2, .2, .06, 0xe8e8f0, -.44, 1.22, .1); } },

{ id: 'japon', name: 'JAPÓN', era: 'Período Sengoku · s. XVI', own: 0x2a2a2a,
  tag: 'Castillo blanco de tejados superpuestos sobre muros de piedra, torii rojos y cerezos. Samuráis con armadura lacada y sashimono a la espalda.',
  biome: 0x6a9a58, plaza: 0xc8c0a8, sw: [0xf2eee2, 0x3a4a5a, 0xb8302a, 0x8a8a8a],
  names: ['ASHIGARU', 'YUMI', 'SAMURÁI', 'DAIMIO', 'AMATERASU'],
  notes: ['<b>Silueta:</b> sashimono, la banderita del color del bando a la espalda', '<b>Arco:</b> yumi largo y asimétrico, más alto que el arquero', '<b>Héroe:</b> daimio con kabuto de cuernos dorados y horo inflado a la espalda'],
  castle(g, T) { const RF = 0x3a4a5a; P(g, 5.6, 1.2, 4.6, 0x8a8a8a, 0, .6, 0); P(g, 5.2, .2, 4.2, 0x7a7a7a, 0, 1.3, 0);
    P(g, 4.4, 1.3, 3.6, WHITE, 0, 2.05, 0); eaveRoof(g, 5.2, 4.4, 2.8, RF); P(g, 3.2, 1.1, 2.6, WHITE, 0, 3.85, 0); eaveRoof(g, 4, 3.4, 4.45, RF); P(g, 2.2, .9, 1.8, WHITE, 0, 5.4, 0); eaveRoof(g, 2.9, 2.5, 5.9, RF, GOLD);
    for (const s of [-1, 1]) { P(g, .2, .3, .2, GOLD, s * .9, 6.55, 0); P(g, .3, .3, .06, 0x1a1a1a, s * 1.1, 2.1, 1.82, false); P(g, .26, .26, .06, 0x1a1a1a, s * .7, 3.9, 1.32, false); }
    P(g, 1, .9, .1, 0x2a1a10, 0, 1.85, 1.82); for (const x of [-3.2, 3.2]) { P(g, .08, 3.4, .08, WOOD, x, 1.7, 2); P(g, .45, 1.6, .06, T, x + .24, 2.4, 2); } },
  barracks(g, T) { P(g, 3.4, .4, 2.4, 0x8a8a8a, 0, .2, 0); P(g, 3.2, .7, 2.2, 0x5a3a24, 0, .75, 0); P(g, 3.2, .6, 2.2, WHITE, 0, 1.4, 0); eaveRoof(g, 3.9, 2.9, 1.8, 0x3a4a5a);
    P(g, 1, .9, .1, 0x2a1a10, 0, .85, 1.12); P(g, .08, 2.8, .08, WOOD, 2.1, 1.4, .9); P(g, .4, 1.3, .06, T, 2.32, 2, .9); },
  house(g) { P(g, 1.8, .6, 1.4, 0x5a3a24, 0, .3, 0); P(g, 1.8, .5, 1.4, 0xece6d8, 0, .85, 0); eaveRoof(g, 2.4, 2, 1.15, 0x4a5a6a);
    P(g, .16, .6, .16, 0x5a3a2a, 1.4, .3, .5); P(g, .9, .5, .9, 0xf0b8c8, 1.4, .85, .5); P(g, .5, .26, .5, 0xf8d0dc, 1.5, 1.2, .4); },
  sword(g, T) { legs(g, 0x3a3a44); torso(g, 0x5a3a2a); P(g, .5, .16, .34, 0x2a2a2a, 0, .42, 0); head(g, SK.tan); P(g, .58, .06, .58, 0x2a2a2a, 0, 1.14, 0); P(g, .3, .1, .3, 0x2a2a2a, 0, 1.2, 0);
    P(g, .04, .8, .04, WOOD, 0, 1, -.2); P(g, .3, .5, .04, T, 0, 1.2, -.22); P(g, .05, 1.5, .05, WOOD, .31, .85, .16); P(g, .07, .2, .07, STEEL, .31, 1.68, .16); },
  bow(g, T) { legs(g, 0x3a3a44); torso(g, 0x3a4a5a); head(g, SK.tan); P(g, .32, .06, .32, WHITE, 0, 1.06, 0); P(g, .1, .1, .16, 0x1a1a1a, 0, 1.16, -.04);
    P(g, .04, .8, .04, WOOD, 0, 1, -.2); P(g, .3, .46, .04, T, 0, 1.2, -.22); P(g, .05, 1.4, .05, 0x3a2418, -.3, .78, .12); P(g, .16, .4, .14, 0x2a2a2a, .14, .62, -.18); },
  horse(g, T) { horse(g, 0x5a3a24, 0x4a3018, 0x2a1a10, 0xb8302a); rider(g, 0xb8302a, SK.tan); P(g, .32, .14, .32, 0x2a2a2a, 0, 1.79, -.05); P(g, .4, .06, .36, 0x2a2a2a, 0, 1.72, -.08);
    P(g, .04, .7, .04, WOOD, 0, 1.8, -.24); P(g, .3, .4, .04, T, 0, 2.02, -.26); P(g, .05, .05, 1.6, WOOD, .27, 1.3, .4); P(g, .06, .06, .26, STEEL, .27, 1.3, 1.3); },
  hero(g, T) { horse(g, 0x1a1a1a, 0x141414, 0x0a0a0a, GOLD); rider(g, 0x2a2a2a, SK.tan); P(g, .34, .16, .34, 0x2a2a2a, 0, 1.8, -.05); P(g, .42, .06, .38, 0x2a2a2a, 0, 1.72, -.08);
    for (const s of [-1, 1]) { P(g, .05, .3, .05, GOLD, s * .1, 1.98, .1); P(g, .05, .24, .05, GOLD, s * .18, 2.2, .12); } P(g, .14, .14, .04, GOLD, 0, 1.9, .12);
    P(g, .62, .6, .4, T, 0, 1.42, -.42); P(g, .04, .5, .04, STEEL, .27, 1.3, .25); },
  god(g, T) { godBody(g, 0xc8302a, WHITE, SK.light, T); P(g, .38, .5, .12, 0x1a1a1a, 0, 1.2, -.14); P(g, .38, .12, .38, 0x1a1a1a, 0, 1.52, 0); P(g, .3, .06, .06, GOLD, 0, 1.55, .12);
    P(g, .24, .24, .04, 0xe8e8f0, .42, .9, .16); P(g, .3, .3, .04, GOLD, .42, .9, .14); } },
];
// carro egipcio: dos caballos, caja del color del bando y conductor-arquero; el del faraón es dorado con corona azul
function chariot(g, T, hc, king) {
  for (const s of [-.3, .3]) { const h = new THREE.Group(); h.position.set(s, 0, .55); h.scale.setScalar(.85); g.add(h); horse(h, hc, hc === WHITE ? 0xeae6f2 : 0x7a4824, hc === WHITE ? 0xd8d4e4 : 0x5a3a24, T); }
  P(g, .05, .05, 1.1, WOOD, 0, .75, .1); P(g, .9, .5, .5, king ? GOLD : T, 0, .7, -.55); P(g, .92, .08, .52, king ? T : GOLD, 0, .97, -.55);
  for (const s of [-1, 1]) { P(g, .08, .5, .5, WOOD, s * .55, .3, -.6); P(g, .1, .14, .14, GOLD, s * .6, .3, -.6); }
  P(g, .36, .4, .26, WHITE, 0, 1.18, -.6); P(g, .24, .24, .24, SK.brown, 0, 1.5, -.6);
  if (king) { P(g, .28, .24, .28, 0x2a4ab0, 0, 1.72, -.6); P(g, .2, .12, .2, 0x2a4ab0, 0, 1.88, -.64); P(g, .06, .1, .06, GOLD, 0, 1.68, -.44); P(g, .42, .5, .06, T, 0, 1.2, -.75); }
  else { P(g, .34, .16, .34, T, 0, 1.66, -.6); }
  P(g, .05, .7, .05, WOOD, -.28, 1.2, -.5);
}


  const WALLS = { roma: [0xe2dccc, 0xc8c0ae], cartago: [0xd9b27a, 0xc49a62], china: [0x8a8a92, 0x6a6a74], mexica: [0xd8d0b8, 0xbab29a], egipto: [0xe0c48a, 0xc8aa70], galos: [0x8a6a3e, 0x6a4e2a],
    grecia: [0xd8ceb0, 0xbab092], vikingos: [0x7a5a34, 0x6a5a3a], persia: [0xd8c8a8, 0x2a8a8a], mongoles: [0x8a6a44, 0x5a3a24], japon: [0xf2eee2, 0x8a8a8a] };
  for (const c of CIVS) c.wall = WALLS[c.id];
  // ---- mapa de cada civilización: bioma, paisaje, muralla, distribución del recinto, altar ----
  const hsh = (x, z, k = 0) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(k, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  const rrect = (w, d, r, n = 3) => { const p = [], hw = w / 2 - r, hd = d / 2 - r; for (const [cx, cz, a0] of [[hw, hd, 0], [-hw, hd, Math.PI / 2], [-hw, -hd, Math.PI], [hw, -hd, Math.PI * 1.5]]) for (let i = 0; i <= n; i++) { const a = a0 + i / n * Math.PI / 2; p.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } return p; };
  const rect = (w, d) => [[w / 2, d / 2], [-w / 2, d / 2], [-w / 2, -d / 2], [w / 2, -d / 2]];
  const blob = (rx, rz, n, jit, seed) => { let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; return Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2, k = 1 + (r() - .5) * jit; return [Math.cos(a) * rx * k, Math.sin(a) * rz * k]; }); };
  // puertas comunes: frente (hacia el centro del mapa) y a ±120°. Las piezas de puerta van en coordenadas locales: x a lo largo de la muralla (hueco de 3,6), z hacia fuera
  const gateTowers = (c, c2, h) => (g, T) => { for (const s of [-1, 1]) { part(g, 1.7, h + 1, 1.7, c, s * 2.5, (h + 1) / 2 - 1.05, 0); part(g, 2, .45, 2, c2, s * 2.5, h - .05 + .22, 0); part(g, .6, .6, .6, T, s * 2.5, h + .7, 0); } };
  const MAPS = {
    roma: { ground: [0x86b85e, 0x7aae56, 0x93c068, 0xa2c470], lush: 0x6e9e4c, sand: 0xdccb95, road: 0xd2c29a, trees: ['cypress', 'olive'], treeCol: 0x2f5a35, dens: .85, feature: 'vine',
      plaza: 0xc4bca6, wallbase: 0xb3aa92, path: 0xd8d0bc, inside: (x, z) => Math.abs(x) < 1.3 || Math.abs(z) < 1.3 ? 0xd8d0bc : -1,
      shape: () => rrect(13, 10, 1.6), wall: { h: 2.6, t: .9, cren: true, tower: true, every: 8, gate: gateTowers(0xe2dccc, 0xc8c0ae, 2.6) },
      layout: { castle: [0, 0, 0, 1.05], barracks: [-6.2, -4, 0, 1], altar: [5.4, 4, 0, 1.4], temple: [5.6, -4.4, 0, 1.5] },
      altar(g, T) { P(g, 2, .3, 2, 0xd8d0bc, 0, .15, 0); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; P(g, .2, 1.2, .2, WHITE, Math.cos(a) * .75, .9, Math.sin(a) * .75); } P(g, 1.9, .2, 1.9, 0xd8d0bc, 0, 1.6, 0); steps(g, 3, 1.6, .2, 1.6, .5, 0xb5562f, 0, 1.7, 0); P(g, .3, .4, .3, T, 0, .5, 0); } },
    cartago: { ground: [0xb9b06a, 0xc4b878, 0xa9a45e, 0xd0c08a], lush: 0x9a9a58, sand: 0xe6d29c, road: 0xd8c496, trees: ['palm', 'olive'], treeCol: 0x4f8a3a, dens: .6, feature: 'salt',
      plaza: 0xe0c896, wallbase: 0xc8ae7c, path: 0xd8c08a, between: 0xd0b480,
      shape: () => blob(7, 5.6, 14, .28, 7), rings: [1, .74], wall: { h: 2.8, t: .9, cren: true, tower: true, every: 4, gate: gateTowers(0xd9b27a, 0xc49a62, 2.8) },
      layout: { castle: [0, -1.2, 0, .95], barracks: [-4.6, 3.4, .4, .95], altar: [4.6, -3.4, 0, 1.3], temple: [2.2, 2.8, 0, 1.3] },
      altar(g, T) { P(g, 2, .2, 1.6, 0xc9a26a, 0, .1, 0); for (let i = 0; i < 5; i++) { const h = .6 + hsh(i, 5) * .5; P(g, .25, h, .14, 0xe0cfa8, -.7 + i * .35, h / 2 + .2, (i % 2) * .4 - .2); } P(g, .5, .2, .1, T, 0, 1.3, -.2); P(g, .2, .2, .1, T, 0, 1.5, -.2); } },
    china: { ground: [0x6e9a50, 0x7aa858, 0x5f8c48, 0x88b060], lush: 0x5a8a44, sand: 0xd2c69a, road: 0xb8b0a0, trees: ['bamboo', 'pine'], treeCol: 0x3a7a3a, dens: .9, feature: 'paddy',
      plaza: 0xb8b0a0, wallbase: 0x9a9488, path: 0xa8a090, inside: (x, z) => Math.abs(x) < 1.4 ? 0xa8a090 : -1, moat: true,
      shape: () => rect(12, 12), wall: { h: 3, t: 1, cren: true, tower: true, every: 12,
        gate(g, T) { for (const s of [-1, 1]) part(g, 1.5, 4, 1.5, 0x8a8a92, s * 2.5, .95, 0); part(g, 6.6, .8, 1.6, 0x8a8a92, 0, 2.6, 0); part(g, 4.4, 1.2, 1.2, 0xb02a20, 0, 3.6, 0); const q = new THREE.Group(); q.position.y = 0; g.add(q); eaveRoof(q, 5.4, 2.2, 4.3, 0x3a3a44, GOLD); part(g, .5, 1.2, .06, T, 1.3, 3.6, .66, false); } },
      layout: { castle: [0, -5, 0, 1], barracks: [6.2, 1.2, -Math.PI / 2, .95], altar: [0, 2.6, 0, 1.4], temple: [-6.2, 1.4, 0, 1.5] },
      altar(g, T) { P(g, 2.2, .4, 2.2, 0x9a9488, 0, .2, 0); P(g, 1.1, .7, 1.1, 0x5a7a5a, 0, .75, 0); for (const [a, b] of [[-.4, -.4], [.4, -.4], [-.4, .4], [.4, .4]]) P(g, .14, .4, .14, 0x5a7a5a, a, .3, b); for (const s of [-1, 1]) P(g, .14, .3, .3, 0x5a7a5a, s * .6, 1.2, 0); P(g, .4, .4, .4, 0xff8a3a, 0, 1.2, 0, false); P(g, .08, 1.6, .08, WOOD, 1, .8, .8); P(g, .3, .9, .05, T, 1.16, 1.1, .8); } },
    mexica: { ground: [0x4f8a3e, 0x5a9646, 0x447a36, 0x66a050], lush: 0x3e7432, sand: 0xc8bc8a, road: 0xc8bea0, trees: ['ceiba', 'jungle'], treeCol: 0x2f6a35, dens: 1.35, feature: 'maize',
      plaza: 0xb8ac90, wallbase: 0xa89c80, path: 0xc8bea0,
      shape: () => rect(13, 11), wall: { h: 1.6, t: .8, cren: true, merlon: 0x2aa8a0, gate(g, T) { for (const s of [-1, 1]) { part(g, .8, 2.6, .8, 0x2aa8a0, s * 2.2, .25, 0); part(g, .5, .5, .5, T, s * 2.2, 1.8, 0); } } },
      layout: { castle: [0, -2.4, 0, 1], barracks: [-6, -4.2, .4, .95], altar: [5.8, 4.2, -.5, 1.4], temple: [-6, 4, 0, 1.5] },
      altar(g, T) { steps(g, 2, 1.6, .3, 1.6, .5, 0xd8d0b8, 0, 0, 0); P(g, .9, .4, .6, 0x8a8a8a, 0, .8, 0); P(g, .5, .3, .5, 0xff8a3a, 0, 1.1, 0, false); for (const s of [-1, 1]) { P(g, .2, .9, .2, 0x2aa8a0, s * .7, 1, -.5); P(g, .3, .2, .3, T, s * .7, 1.5, -.5); } } },
    egipto: { ground: [0xd9c08a, 0xe2ca96, 0xcfb47a, 0xc8b070], lush: 0x9aa860, sand: 0xe6d29c, road: 0xe8d8b0, trees: ['palm', 'palm'], treeCol: 0x4f8a3a, dens: .5, feature: 'nile',
      plaza: 0xc8ae78, wallbase: 0xb89e68, path: 0xe8d8b0, inside: (x, z) => Math.abs(x) < 1.6 && z > -2 ? 0xe8d8b0 : -1,
      shape: () => rect(14, 10), wall: { h: 3, t: 1.1, butt: true,
        gate(g, T, main) { const c = 0xe0c48a; for (const s of [-1, 1]) { if (main) steps(g, 5, 2.4, .8, 1.8, .22, c, s * 3, -1.05, 0); else part(g, 1.6, 3.6, 1.8, c, s * 2.6, .75, 0); } if (main) for (const s of [-1, 1]) { part(g, .1, 5.6, .1, WOOD, s * 1.9, 1.7, .9, false); part(g, .5, .4, .06, T, s * 1.9 + .28, 4.2, .9, false); } } },
      layout: { castle: [0, -2.6, 0, 1], barracks: [-6.4, -1.2, Math.PI / 2, .95], altar: [5.2, 2.8, 0, 1.4], temple: [-5.6, 3.6, 0, 1.5] },
      altar(g, T) { P(g, 2, .25, 1.4, 0xe0c48a, 0, .12, 0); for (const s of [-1, 1]) { P(g, .3, 2, .3, 0xe0c48a, s * .7, 1.1, 0); P(g, .2, .3, .2, GOLD, s * .7, 2.25, 0); } P(g, .6, .5, 1, 0xe0c48a, 0, .5, 0); P(g, .4, .4, .4, 0xe0c48a, 0, .9, .3); P(g, .44, .1, .44, T, 0, 1.15, .3); } },
    galos: { ground: [0x5a8a3e, 0x4e7e36, 0x6a9a48, 0x7aa858], lush: 0x467232, sand: 0xc8bc8a, road: 0xa88a5a, trees: ['oak', 'pine'], treeCol: 0x2f5a30, dens: 1.3, feature: 'rocks',
      plaza: 0xa88a5a, wallbase: 0x7a6a44, path: 0x9a7a4a, between: 0x3e5a2a,
      shape: () => blob(7.2, 5.8, 22, .22, 11), rings: [1, .82], wall: { h: 2.2, palisade: true, gate(g, T) { for (const s of [-1, 1]) part(g, .6, 3.4, .6, 0x6a4e2a, s * 2.1, .65, 0); part(g, 4.8, .5, .7, 0x6a4e2a, 0, 2.4, 0); steps(g, 2, 5, .3, 1.2, 1.4, 0xc8a85a, 0, 2.65, 0); part(g, .6, .5, .06, T, 0, 1.8, .4, false); } },
      layout: { castle: [-2, -.6, .3, 1], barracks: [2.4, 5.2, -.3, .95], altar: [4.2, -1.6, 0, 1.4], temple: [-4.6, 4.6, 0, 1.5] },
      altar(g, T) { for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; P(g, .3, .9 + (i % 2) * .3, .3, 0x8a8a8a, Math.cos(a) * .9, .5, Math.sin(a) * .9); } P(g, 1, .2, .5, 0x9a9a98, 0, .7, 0); P(g, .2, .7, .2, 0x8a8a8a, -.3, .35, 0); P(g, .2, .7, .2, 0x8a8a8a, .3, .35, 0); P(g, .3, .3, .06, T, 0, 1.1, .3); } },
    grecia: { ground: [0x9ab860, 0x8aac58, 0xa6be6c, 0xb4c27a], lush: 0x7a9a50, sand: 0xe2d4a4, road: 0xd8ccaa, trees: ['olive', 'cypress'], treeCol: 0x6a8a5a, dens: .7, feature: 'scrub',
      plaza: 0xd8d0bc, wallbase: 0xb8ae96, path: 0xe0d8c4, inside: (x, z) => Math.abs(x) < 1.3 ? 0xe0d8c4 : -1,
      shape: () => blob(7, 5.6, 9, .16, 17), wall: { h: 2.4, t: .9, cren: true, tower: true, every: 10, gate: gateTowers(0xd8ceb0, 0xbab092, 2.4) },
      layout: { castle: [0, -1.2, 0, .95], barracks: [-4.6, 3.4, .4, .95], altar: [4.6, -3.4, 0, 1.3], temple: [2.2, 2.8, 0, 1.3] },
      altar(g, T) { P(g, 2, .3, 1.6, 0xd8d0bc, 0, .15, 0); P(g, 1.2, .6, .8, 0xe8e2d4, 0, .6, 0); P(g, .5, .3, .4, 0xff8a3a, 0, 1.05, 0, false); P(g, .26, .2, .2, 0xffd04a, 0, 1.25, 0, false);
        for (const s of [-1, 1]) { P(g, .22, 1.8, .22, WHITE, s * .8, 1.2, -.55); P(g, .42, .14, .3, WHITE, s * .8, 2.15, -.55); } P(g, 1.9, .2, .34, 0x4a6a9a, 0, 2.3, -.55); P(g, .5, .3, .06, T, 0, .6, .42); } },
    vikingos: { ground: [0x5f8a5a, 0x557e52, 0x6a9462, 0x789e6a], lush: 0x4a7448, sand: 0xb8b49a, road: 0x9a8a6a, trees: ['pine', 'birch'], treeCol: 0x31683f, dens: 1.1, feature: 'heath',
      plaza: 0x9a8a6a, wallbase: 0x6a7a4a, path: 0x8a7a5a, inside: (x, z) => Math.abs(x) < 1.2 || Math.abs(z) < 1.2 ? 0x8a7a5a : -1,
      shape: () => blob(6.5, 6.5, 28, .04, 3), wall: { h: 2.2, t: 1, rampart: true, turf: 0x5a7a3a,
        gate(g, T) { for (const s of [-1, 1]) { part(g, .7, 3.2, .7, 0x6a4a2e, s * 2.1, .55, 0); part(g, .6, .6, .08, T, s * 1.2, 1.7, .45, false); } part(g, 4.8, .5, .8, 0x6a4a2e, 0, 2.2, 0); part(g, 5.2, .3, 1.2, 0x5a7a3a, 0, 2.55, 0); } },
      layout: { castle: [-1, -1.2, .2, 1], barracks: [2.6, 5.2, -.3, .95], altar: [4.6, -1.6, 0, 1.4], temple: [-4.8, 4.6, 0, 1.5] },
      altar(g, T) { P(g, 2, .2, 1.8, 0x8a8a86, 0, .1, 0); P(g, 1.4, 1.1, 1.2, 0x6a4a2e, 0, .75, 0); for (let i = 0; i < 3; i++) P(g, 1.7 - i * .45, .35, 1.5 - i * .4, 0x3a2a1a, 0, 1.45 + i * .35, 0);
        P(g, .14, .14, .4, GOLD, 0, 2.45, .5); P(g, .14, .14, .4, GOLD, 0, 2.45, -.5); P(g, .4, .6, .06, T, 0, .55, .62); for (let i = 0; i < 3; i++) P(g, .26, .7 + i * .15, .18, 0x8a8a86, -1.3 + i * .2, .4, .9 - i * .6); } },
    persia: { ground: [0xb8b07a, 0xc4b888, 0xa8a46c, 0xccbe90], lush: 0x8aa060, sand: 0xe0d0a0, road: 0xd8c8a0, trees: ['cypress', 'plane'], treeCol: 0x4a7a3a, dens: .55, feature: 'garden',
      plaza: 0xd8c8a8, wallbase: 0xb8a888, path: 0xe0d4b8, inside: (x, z) => Math.abs(x) < .5 && z > -1 ? 0x5a9ab8 : Math.abs(x) < 1.3 && z > -1 ? 0xe0d4b8 : -1,
      shape: () => rect(13, 11), wall: { h: 3, t: 1, cren: true, merlon: 0x2a8a8a, tower: true, every: 6,
        gate(g, T) { for (const s of [-1, 1]) { part(g, 1.6, 4.2, 1.8, 0x2a8a8a, s * 2.5, 1.05, 0); part(g, 1.9, .4, 2, 0xd8c8a8, s * 2.5, 3.35, 0); part(g, .5, .4, .1, GOLD, s * 2.5, 1.4, .92, false); } part(g, 6.6, .9, 1.6, 0x2a8a8a, 0, 2.7, 0); part(g, .5, .5, .06, T, 0, 2.7, .82, false); } },
      layout: { castle: [0, -2.4, 0, 1], barracks: [-6, -4.2, .4, .95], altar: [5.8, 4.2, -.5, 1.4], temple: [-6, 4, 0, 1.5] },
      altar(g, T) { P(g, 2, .3, 2, 0xd8c8a8, 0, .15, 0); steps(g, 3, 1.2, .25, 1.2, .25, 0xd8c8a8, 0, .3, 0); P(g, .5, .4, .5, 0xff8a3a, 0, 1.25, 0, false); P(g, .3, .3, .3, 0xffd04a, 0, 1.5, 0, false);
        for (const s of [-1, 1]) { P(g, .26, 1.8, .26, 0xe0d4b8, s * .8, 1.2, -.6); P(g, .44, .2, .3, 0x8a6a4a, s * .8, 2.2, -.6); } P(g, .4, .2, .06, T, 0, .45, .63); } },
    mongoles: { ground: [0x9ab06a, 0xa6b878, 0x8ea460, 0xb4c084], lush: 0x7a9a58, sand: 0xd4c89a, road: 0xb8a878, trees: ['shrub', 'pine'], treeCol: 0x6a8a4a, dens: .35, feature: 'steppe',
      plaza: 0xb8a878, wallbase: 0x9a8a5a, path: 0xa89868,
      shape: () => blob(7.2, 5.8, 18, .12, 23), wall: { h: 1.5, t: 1, carts: true, cover: 0xece6d6,
        gate(g, T) { for (const s of [-1, 1]) { part(g, .2, 3.6, .2, WOOD, s * 2, .75, 0); part(g, .5, .8, .5, 0x2a2a2a, s * 2, 2.2, 0); part(g, .26, .26, .26, GOLD, s * 2, 2.65, 0); part(g, .6, .5, .06, T, s * 2 - s * .4, 1.5, 0, false); } } },
      layout: { castle: [-1.6, -.8, .2, 1], barracks: [2.6, 5, -.3, .95], altar: [4.4, -1.8, 0, 1.4], temple: [-4.6, 4.4, 0, 1.5] },
      altar(g, T) { steps(g, 3, 1.8, .4, 1.8, .5, 0x8a8a86, 0, 0, 0); P(g, .12, 2, .12, WOOD, 0, 2, 0); for (const [a, c] of [[0, T], [1.6, WHITE], [3.2, T], [4.7, WHITE]]) P(g, .5, .1, .06, c, Math.cos(a) * .3, 1.6 + a * .05, Math.sin(a) * .3, false, a);
        P(g, .3, .4, .3, 0x2a2a2a, 0, 2.9, 0); P(g, .2, .2, .2, GOLD, 0, 3.2, 0); } },
    japon: { ground: [0x6a9a58, 0x5e8e50, 0x78a664, 0x86b070], lush: 0x4f8044, sand: 0xd8ccaa, road: 0xb8ac90, trees: ['sakura', 'pine'], treeCol: 0x3a6a3a, dens: .9, feature: 'tea',
      plaza: 0xc8c0a8, wallbase: 0x8a8a8a, path: 0xb8b0a0, moat: true,
      shape: () => rect(12, 12), wall: { h: 2.8, t: 1.1, ishigaki: true, cap: 0x3a4a5a, tower: true, every: 10,
        gate(g, T) { for (const s of [-1, 1]) part(g, 1.4, 3, 1.4, 0x8a8a8a, s * 2.5, .45, 0); part(g, 6.4, 1.2, 1.6, WHITE, 0, 2.5, 0); const q = new THREE.Group(); g.add(q); eaveRoof(q, 7, 2.2, 3.2, 0x3a4a5a); part(g, .5, .5, .06, T, 0, 2.5, .82, false); } },
      layout: { castle: [0, -5, 0, 1], barracks: [6.2, 1.2, -Math.PI / 2, .95], altar: [0, 2.6, 0, 1.4], temple: [-6.2, 1.4, 0, 1.5] },
      altar(g, T) { P(g, 1.6, .3, 1.4, 0x8a8a8a, 0, .15, -.3); P(g, 1, .8, .8, 0x8a5a34, 0, .7, -.3); for (let i = 0; i < 2; i++) P(g, 1.4 - i * .4, .2, 1.2, 0x3a3a2a, 0, 1.2 + i * .2, -.3);
        for (const s of [-1, 1]) { P(g, .18, 1.8, .18, 0xc8302a, s * .8, .9, .8); P(g, .06, .4, .06, 0x8a5a34, s * .25, 1.7, -.3); }
        P(g, 2.1, .16, .24, 0x1a1a1a, 0, 1.88, .8); P(g, 1.8, .12, .14, 0xc8302a, 0, 1.55, .8); P(g, .06, 1.6, .06, WOOD, -1.1, .8, -.2); P(g, .3, .8, .04, T, -.95, 1.1, -.2); } },
  };
  for (const c of CIVS) c.map = MAPS[c.id];
  return { list: CIVS, grp };
})();
export const CIVS = CIV.list;
// Ventaja propia de cada civilización (el resto de reglas es común). unit: por tipo de tropa, mul multiplica y add suma estadísticas;
// income multiplica el oro de sus pueblos, capture la velocidad de conquista y chargeCd son los segundos entre cargas del héroe
export const BONUS = {
  roma: { name: 'LEGIONES', text: 'espadas con +20 % de vida', unit: { sword: { mul: { hp: 1.2 } } } },
  cartago: { name: 'COMERCIO', text: 'sus pueblos dan +30 % de oro', income: 1.3 },
  china: { name: 'BALLESTAS', text: 'arqueros con +1,5 de alcance', unit: { bow: { add: { range: 1.5 } } } },
  mexica: { name: 'GUERRA FLORIDA', text: 'conquistan pueblos un 40 % más rápido', capture: 1.4 },
  egipto: { name: 'CARROS', text: 'jinetes un 15 % más rápidos y con +15 % de daño', unit: { horse: { mul: { speed: 1.15, dmg: 1.15 } } } },
  galos: { name: 'FURIA', text: 'espadas con +15 % de daño y carga del héroe cada 14 s', unit: { sword: { mul: { dmg: 1.15 } } }, chargeCd: 14 },
  grecia: { name: 'FALANGE', text: 'espadas con +25 % de vida, pero un 10 % más lentas', unit: { sword: { mul: { hp: 1.25, speed: .9 } } } },
  vikingos: { name: 'SAQUEO', text: 'espadas con +10 % de daño y conquistan pueblos un 25 % más rápido', unit: { sword: { mul: { dmg: 1.1 } } }, capture: 1.25 },
  persia: { name: 'INMORTALES', text: 'espadas y arqueros con +15 % de vida', unit: { sword: { mul: { hp: 1.15 } }, bow: { mul: { hp: 1.15 } } } },
  mongoles: { name: 'ESTEPA', text: 'jinetes un 25 % más rápidos', unit: { horse: { mul: { speed: 1.25 } } } },
  japon: { name: 'BUSHIDO', text: 'jinetes con +20 % de vida', unit: { horse: { mul: { hp: 1.2 } } } },
};
export const bonusOf = side => (side === 0 || side === 1) ? BONUS[civOf(side).id] || {} : {};
// estadísticas de una tropa con la ventaja de su civilización (los neutrales usan las comunes)
const defCache = new Map();
export function defOf(side, type) {
  const m = bonusOf(side).unit?.[type]; if (!m) return UNITS[type];
  const k = civOf(side).id + ':' + type; let d = defCache.get(k);
  if (!d) { d = { ...UNITS[type] }; for (const [s, v] of Object.entries(m.mul || {})) d[s] *= v; for (const [s, v] of Object.entries(m.add || {})) d[s] += v; defCache.set(k, d); }
  return d;
}
export let civPick = ['random', 'random'], civIdx = [0, 1];
try { civPick = JSON.parse(localStorage.getItem('imperium-civs')) || civPick; } catch (e) {}
export const civOf = side => CIVS[civIdx[side] ?? 0];
export const CIV_SLOT = { sword: 0, bow: 1, horse: 2, hero: 3, god: 4 };
export const uname = (side, type) => side < NEU && type in CIV_SLOT ? civOf(side).names[CIV_SLOT[type]] : UNITS[type].name;
// elige las civilizaciones de cada jugador: las fijadas en el menú (tú y el primer rival) y, el resto, al azar sin repetir si se puede
export function resolveCivs(final) {
  const fixed = Array.from({ length: NP }, (_, sd) => { const v = civPick[sd] ?? 'random'; return v === 'random' ? -1 : CIVS.findIndex(c => c.id === v); });
  civIdx.length = Math.max(civIdx.length, NP); const used = new Set(fixed.filter(i => i >= 0));
  for (let sd = 0; sd < NP; sd++) {
    if (fixed[sd] >= 0) { civIdx[sd] = fixed[sd]; continue; }
    if (!final) { civIdx[sd] = civIdx[sd] ?? sd % CIVS.length; continue; }
    const pool = CIVS.map((_, i) => i).filter(i => !used.has(i)), pick = pool.length ? pool[Math.random() * pool.length | 0] : Math.random() * CIVS.length | 0;
    civIdx[sd] = pick; used.add(pick);
  }
}
