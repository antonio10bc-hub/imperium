// Ambiente de cada geografía:
// · Clima: tormentas de arena en el desierto, nieve en la cordillera y el valle helado, ceniza en la caldera y, en los afluentes, lluvia
//   mientras dura la crecida (la lluvia es la que corta los vados). Sin niebla. Mientras dura, las tropas ven un poco menos (también las del rival).
// · Vida: pájaros, humo en los pueblos, espuma en la costa y peces que saltan (solo cerca de la cámara).
// · Elementos propios: faros, barcas, molinos, menhires, pirámides, estatuas… colocados al generar el mapa.
import * as THREE from 'three';
import { decos } from './buildings.js';
import { MD, MW, idx } from './config.js';
import { burst, fxRand, plume } from './effects.js';
import { state } from './game.js';
import { camT } from './input.js';
import { GEOT, HM, forts, geoR, roadCell, scen, spots } from './map.js';
import { blocked, refreshCells, walk } from './nav.js';
import { rngOf, seed } from './noise.js';
import { bake, basic, part, world } from './render.js';
import { visibleAt } from './fog.js';
import { R } from './rules.js';
import { setAmbience } from './audio.js';

// ---------- clima ----------
const KIND = { oasis: 'sand', cordillera: 'snow', helado: 'snow', lago: 'ash' };
const WX = {
  sand: { vis: .62, on: '¡TORMENTA DE ARENA! SE VE MUCHO MENOS', off: 'LA TORMENTA DE ARENA AMAINA' },
  snow: { vis: .82, on: 'NIEVA: SE VE MENOS', off: 'DEJA DE NEVAR' },
  rain: { vis: .92 },
  ash: { vis: .8, on: 'CAE CENIZA DEL VOLCÁN: SE VE MENOS', off: 'LA CENIZA SE DISIPA' },
};
export const WEA = { kind: null, on: false, t: 60, k: 0 };   // kind null: esta geografía no tiene clima
const kindFor = () => { const k = geoR?.mix ? geoR.mix[Math.random() < .5 ? 0 : 1] : scen; return KIND[k] || null; };
export function resetWeather() { WEA.kind = kindFor(); WEA.on = false; WEA.t = 70 + Math.random() * 60; WEA.k = 0; }
// cuánto ven las tropas ahora (1 = normal)
export const weatherVis = () => WEA.kind ? 1 - (1 - WX[WEA.kind].vis) * Math.min(1, WEA.k) : 1;
// paso de simulación: el clima empieza y acaba (afecta a la visión, así que va con la partida)
export function updateWeather(dt) {
  if (R.on.floods && R.cycle) { WEA.kind = 'rain'; WEA.on = R.cycle.phase !== 'open'; }   // afluentes: llueve justo durante la crecida
  WEA.k += ((WEA.on ? 1 : 0) - WEA.k) * Math.min(1, dt * .5);
  if (R.on.floods && R.cycle) return;
  if ((WEA.t -= dt) > 0) return;
  WEA.on = !WEA.on; WEA.t = WEA.on ? 45 + Math.random() * 35 : 90 + Math.random() * 70;
  if (WEA.on) { const k = kindFor(); if (!k) { WEA.on = false; return; } WEA.kind = k; }
}
// partículas del clima en pantalla (capa 2D)
const P = [];
export function drawWeather(c, w, h, dt) {
  const k = Math.min(1, WEA.k); if (k < .02 || state === 'menu') return;
  const kind = WEA.kind, n = { rain: 120, snow: 130, sand: 170, ash: 110 }[kind]; if (!n) return;
  while (P.length < n) P.push({ x: fxRand() * w, y: fxRand() * h, s: .5 + fxRand(), p: fxRand() * 6 });
  c.save();
  if (kind === 'sand') { c.fillStyle = `rgba(214,178,118,${.3 * k})`; c.fillRect(0, 0, w, h); }
  if (kind === 'ash') { c.fillStyle = `rgba(60,56,60,${.14 * k})`; c.fillRect(0, 0, w, h); }
  c.strokeStyle = kind === 'rain' ? `rgba(190,210,235,${.4 * k})` : `rgba(240,220,170,${.6 * k})`; c.lineWidth = kind === 'rain' ? 1.2 : 2;
  c.fillStyle = kind === 'snow' ? `rgba(255,255,255,${.85 * k})` : `rgba(120,116,120,${.8 * k})`;
  c.beginPath();
  for (let i = 0; i < n; i++) { const p = P[i];
    if (kind === 'rain') { p.x += -100 * dt * p.s; p.y += 560 * dt * p.s; c.moveTo(p.x, p.y); c.lineTo(p.x + 4, p.y - 13 * p.s); }
    else if (kind === 'sand') { p.x += 700 * dt * p.s; p.y += 40 * dt * Math.sin(p.p += dt * 3); c.moveTo(p.x, p.y); c.lineTo(p.x - 18 * p.s, p.y); }
    else { p.y += (kind === 'snow' ? 50 : 35) * dt * p.s; p.x += Math.sin(p.p += dt * 1.6) * 20 * dt; c.fillRect(p.x, p.y, 2 + p.s * 1.5, 2 + p.s * 1.5); }
    if (p.y > h + 20) { p.y = -10; p.x = fxRand() * (w + 200); } if (p.x < -40) p.x = w + 20; if (p.x > w + 40) p.x = -20; }
  c.stroke();
  c.restore();
}

// ---------- vida en el paisaje (cerca de la cámara) ----------
let shore = [], deep = [], vents = [], flock = null, lifeT = { smoke: 0, wave: 0, fish: 0, bird: 8, steam: 0 };   // vents: vapor donde la lava toca el agua y fumarolas
const nearCam = (x, z, r) => Math.abs(x - camT.x) < r && Math.abs(z - camT.z) < r * .8;
function makeFlock() {
  const g = new THREE.Group(), n = 5 + (fxRand() * 4 | 0), birds = [], m = basic(0x2a2a34);
  for (let i = 0; i < n; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(.9, .12, .35), m); b.userData.own = true; b.position.set(-Math.ceil(i / 2) * .9, fxRand() * .6, (i % 2 ? 1 : -1) * Math.ceil(i / 2) * .9); g.add(b); birds.push(b); }
  const a = fxRand() * 6.28; g.position.set(camT.x - Math.cos(a) * 70, 15 + fxRand() * 5, camT.z - Math.sin(a) * 50); g.rotation.y = -a; world.add(g);
  return { g, birds, v: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(7 + fxRand() * 3), t: 0 };
}
const BED = { cordillera: ['wind', .6], helado: ['wind', .8], costa: ['waves', .8], archipielago: ['waves', 1], istmo: ['waves', .7], oasis: ['sand', .45], lago: ['wind', .35] };
const WX_BED = { rain: 'rain', sand: 'sand', snow: 'wind', ash: 'wind' };
let bedT = 0;
export function updateLife(dt) {
  if ((bedT -= dt) <= 0) { bedT = 1; if (state !== 'play') setAmbience(null); else if (WEA.k > .4 && WX_BED[WEA.kind]) setAmbience(WX_BED[WEA.kind], .6 + WEA.k * .6); else { const b = BED[scen]; setAmbience(b?.[0], b?.[1]); } }
  if (!HM || dt <= 0) return;
  if (flock) { flock.t += dt; flock.g.position.addScaledVector(flock.v, dt); flock.g.visible = visibleAt(flock.g.position.x, flock.g.position.z);   // los pájaros no se ven sobre la niebla
    flock.birds.forEach((b, i) => { b.scale.y = 1 + Math.sin(flock.t * 12 + i) * .8; b.scale.x = .75 + Math.abs(Math.sin(flock.t * 12 + i)) * .5; });
    if (flock.t > 22) { world.remove(flock.g); flock.g.children.forEach(b => b.geometry.dispose()); flock = null; } }
  else if ((lifeT.bird -= dt) <= 0) { lifeT.bird = 18 + fxRand() * 25; flock = makeFlock(); }
  if (vents.length && (lifeT.steam -= dt) <= 0) { lifeT.steam = .18; const [x, z, y, lava] = vents[fxRand() * vents.length | 0]; plume(new THREE.Vector3(x + fxRand() - .5, y, z + fxRand() - .5), fxRand() < .6 ? 0xf4f4f0 : 0xd8d8d4, lava ? 1.1 : .7, 2.4, lava ? 2.2 : 1.6, -.3); }
  if ((lifeT.smoke -= dt) <= 0) { lifeT.smoke = .5;   // humo de las chimeneas de los pueblos
    for (const s of spots) if (s.kind === 'town' && !s.camp && s.group?.visible && nearCam(s.x, s.z, 70) && fxRand() < .5) plume(new THREE.Vector3(s.x + .9 + fxRand() * .4, s.y + 2.6, s.z + .6), fxRand() < .5 ? 0xd8d4cc : 0xbab6ae, .45, 2.6, .9, -.15); }
  if (shore.length && (lifeT.wave -= dt) <= 0) { lifeT.wave = .12;   // espuma en la orilla
    for (let t = 0; t < 12; t++) { const c = shore[fxRand() * shore.length | 0], x = c % MW + .5, z = ((c / MW) | 0) + .5; if (!nearCam(x, z, 55)) continue; plume(new THREE.Vector3(x + fxRand() - .5, .12, z + fxRand() - .5), 0xf4f8fa, .5, 1.3, .15, 0); break; } }
  if (deep.length && (lifeT.fish -= dt) <= 0) { lifeT.fish = 1.2 + fxRand() * 2;   // un pez salta
    for (let t = 0; t < 12; t++) { const c = deep[fxRand() * deep.length | 0], x = c % MW + .5, z = ((c / MW) | 0) + .5; if (!nearCam(x, z, 50)) continue; burst(new THREE.Vector3(x, -.4, z), [0xc8d8e8], 1, .8, 5.5, .9, .2); burst(new THREE.Vector3(x, -.3, z), [0xf4f8fa], 3, 1.2, 1.5, .4, .12); break; } }
}

// ---------- elementos propios de cada geografía ----------
const LM = {
  lighthouse(g) { part(g, 2.4, .8, 2.4, 0x9a968c, 0, .4, 0); for (let k = 0; k < 4; k++) part(g, 1.5 - k * .12, 1.5, 1.5 - k * .12, k % 2 ? 0xd83a4a : 0xf4f4e8, 0, 1.55 + k * 1.5, 0); part(g, 1.1, .9, 1.1, 0xffe06a, 0, 7.4, 0, false); part(g, 1.4, .4, 1.4, 0x3a3a44, 0, 8.05, 0); },
  boat(g) { part(g, 1.1, .4, 2.6, 0x7a4a24, 0, .1, 0); part(g, .9, .2, 2.2, 0x5a3418, 0, .35, 0); part(g, .1, 2.2, .1, 0x5a3a24, 0, 1.4, .2); part(g, .08, 1.4, 1.1, 0xf0ece0, 0, 1.6, .5); },
  mill(g) { part(g, 2.4, 2, 2.2, 0xc8b896, 0, 1, 0); part(g, 2.8, .5, 2.6, 0x8a5a34, 0, 2.2, 0); part(g, 1.8, .4, 1.8, 0x8a5a34, 0, 2.6, 0); const w = new THREE.Group(); w.position.set(1.5, 1.2, 0); g.add(w); for (let k = 0; k < 4; k++) part(w, .2, 2.6, .3, 0x6a4224, 0, 0, 0).rotation.x = k * Math.PI / 4; },
  windmill(g) { part(g, 1.8, 3.6, 1.8, 0xe8e0c8, 0, 1.8, 0); part(g, 2, .8, 2, 0x8a5a34, 0, 4, 0); part(g, .5, .5, .4, 0x5a3a24, 0, 3.6, 1.05); for (let k = 0; k < 4; k++) { const b = part(g, .4, 3.2, .1, 0xf0ece0, 0, 3.6, 1.25); b.rotation.z = k * Math.PI / 2 + .4; b.position.x = Math.sin(k * Math.PI / 2 + .4) * 1.6; b.position.y = 3.6 + Math.cos(k * Math.PI / 2 + .4) * 1.6; } },
  menhirs(g) { for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28; part(g, .6, 1.8 + (k % 3) * .4, .5, 0x8a8a86, Math.cos(a) * 2.6, .9, Math.sin(a) * 2.6); } part(g, 1.6, .3, .7, 0x7a7a76, 0, .15, 0); },
  shrine(g) { part(g, 2, .4, 2, 0x9a968c, 0, .2, 0); for (const [x, z] of [[-.7, -.7], [.7, -.7], [-.7, .7], [.7, .7]]) part(g, .25, 1.6, .25, 0xc8c4b8, x, 1.2, z); part(g, 2.2, .3, 2.2, 0xa83a2a, 0, 2.1, 0); part(g, 1.2, .3, 1.2, 0xa83a2a, 0, 2.4, 0); part(g, .5, .5, .5, 0xe8c050, 0, .7, 0); },
  pyramid(g) { for (let k = 0; k < 5; k++) part(g, 6 - k * 1.2, 1, 6 - k * 1.2, k % 2 ? 0xd8c08a : 0xe2ca96, 0, .5 + k, 0); part(g, .5, .4, .5, 0xe8c050, 0, 5.2, 0); },
  columns(g) { for (let k = 0; k < 5; k++) { const h = [3, 1.2, 2.6, .6, 2][k]; part(g, .6, h, .6, 0xe8e4d8, -2.4 + k * 1.2, h / 2, 0); if (h > 2) part(g, .8, .25, .8, 0xd8d4c8, -2.4 + k * 1.2, h + .1, 0); } part(g, 2.4, .5, .7, 0xd8d4c8, 1, .25, 1.2); part(g, 6, .25, 1.4, 0xc8c4b8, 0, .1, 0); },
  statue(g) { part(g, 1.6, 1, 1.6, 0x8a8680, 0, .5, 0); part(g, .5, 1.4, .5, 0xa8a49a, -.25, 1.7, 0); part(g, .5, 1.4, .5, 0xa8a49a, .25, 1.7, 0); part(g, 1.2, 1.6, .7, 0xa8a49a, 0, 3.2, 0); part(g, .6, .6, .6, 0xa8a49a, 0, 4.3, 0); part(g, .3, 1.6, .3, 0xa8a49a, .8, 3.6, .2); part(g, .1, 2.6, .1, 0x8a8680, .8, 4.4, .2); },
  hut(g) { for (const [x, z] of [[-.8, -.8], [.8, -.8], [-.8, .8], [.8, .8]]) part(g, .15, 1.4, .15, 0x6a4224, x, .5, z); part(g, 2, .2, 2, 0x8a5a34, 0, 1.2, 0); part(g, 1.6, 1, 1.6, 0xb8a070, 0, 1.8, 0); part(g, 2, .4, 2, 0xc8b070, 0, 2.5, 0); part(g, 1.2, .35, 1.2, 0xc8b070, 0, 2.85, 0); },
  totem(g) { part(g, .7, 3.4, .7, 0x8a5a34, 0, 1.7, 0); for (let k = 0; k < 3; k++) { part(g, .8, .5, .8, [0xd83a4a, 0x3a6ad8, 0xe8c050][k], 0, .9 + k * 1.1, 0); part(g, .2, .2, .1, 0x1a1a1a, 0, 1 + k * 1.1, .42); } part(g, 2, .3, .4, 0x6a4224, 0, 3.2, 0); },
  wreck(g) { part(g, 1.6, .7, 4, 0x6a4224, 0, .2, 0).rotation.z = .35; part(g, .12, 2.6, .12, 0x5a3a24, .4, 1.3, .6).rotation.z = .6; for (let k = -1; k <= 1; k++) part(g, 1.8, .15, .15, 0x5a3418, .2, .7, k * 1.2); },
  haystack(g) { part(g, 1.4, .9, 1.4, 0xd8c060, 0, .45, 0); part(g, 1, .5, 1, 0xe0c870, 0, 1.1, 0); part(g, .5, .3, .5, 0xe0c870, 0, 1.45, 0); },
  fishhut(g) { part(g, 1.6, 1.2, 1.4, 0x8a5a34, 0, .6, 0); part(g, 1.9, .3, 1.7, 0xf0f4f8, 0, 1.35, 0); part(g, 1.2, .3, 1.1, 0xf0f4f8, 0, 1.6, 0); part(g, .5, .05, .5, 0x2a5a7a, 1.4, .05, .4); part(g, .06, 1, .06, 0x6a4224, 1.4, .5, .4).rotation.z = .4; },
};
// hito único de cada geografía: grande, reconocible desde lejos y que no se atraviesa
const GRAND_LM = {
  cascade(g) { part(g, 4, 7, 3, 0x8a8680, 0, 3.5, -1); part(g, 3, 2, 2.4, 0x9a968c, -.4, 7.6, -1.2); part(g, 1.4, 7.4, .3, 0x6ab0e0, 0, 3.7, .6, false); part(g, .5, 7.4, .32, 0xd8f0fa, -.3, 3.7, .62, false); part(g, 3.6, .2, 2.4, 0x5aa0d0, 0, .1, 1.8, false); for (let k = 0; k < 5; k++) part(g, .5, .4, .5, 0xf4f8fa, -1.2 + k * .6, .3, 1 + (k % 2) * .4, false); },
  colossus(g) { const b = 0xb87a3a, b2 = 0x9a6a30; part(g, 4, 1.2, 4, 0x9a968c, 0, .6, 0); for (const x of [-.8, .8]) { part(g, .9, 4, .9, b, x, 3.2, 0); } part(g, 2.6, 3.4, 1.4, b, 0, 6.8, 0); part(g, 1.2, 1.2, 1.2, b2, 0, 9.1, 0); for (let k = 0; k < 5; k++) part(g, .2, .7, .2, 0xe8c050, -.6 + k * .3, 10, 0); part(g, .7, 3.2, .7, b, 1.7, 8, 0); part(g, .7, .9, .7, 0xffc040, 1.7, 10, 0, false); part(g, .7, 3, .7, b2, -1.7, 5.8, .2); },
  seaarch(g) { for (const x of [-2.4, 2.4]) part(g, 1.8, 6, 2, 0x8a8478, x, 2.5, 0); part(g, 6.6, 1.8, 2.2, 0x9a9488, 0, 6.2, 0); part(g, 4, .8, 1.8, 0x8a8478, 0, 7.4, 0); part(g, 2, .4, 1.6, 0x6a9a48, -1, 7.9, 0); },
  rockarch(g) { for (const x of [-2.6, 2.6]) part(g, 1.6, 5, 1.8, 0xb86a44, x, 2.5, 0); part(g, 7, 1.5, 2, 0xc87a50, 0, 5.6, 0); part(g, 4, .8, 1.6, 0xa85a3a, 0, 6.6, 0); part(g, 1.2, .6, 1.4, 0xd08a5a, -2.6, .3, 1.4); },
  henge(g) { for (let k = 0; k < 10; k++) { const a = k / 10 * 6.28; part(g, .9, 3.2, .7, 0x8a8a86, Math.cos(a) * 4, 1.6, Math.sin(a) * 4).rotation.y = -a; if (k % 2 === 0) part(g, 2.6, .6, .8, 0x7a7a76, Math.cos(a + .31) * 4, 3.5, Math.sin(a + .31) * 4).rotation.y = -a - 1.57 - .31; } part(g, 1.8, .6, 1, 0x7a7a76, 0, .3, 0); },
  aqueduct(g) { for (let k = 0; k < 5; k++) { part(g, .9, 4.5, 1.2, 0xd8cdb4, -4.8 + k * 2.4, 2.25, 0); if (k < 4) part(g, 1.6, .9, 1.2, 0xd8cdb4, -3.6 + k * 2.4, 4.05, 0); } part(g, 10.5, .8, 1.4, 0xc8bca4, 0, 4.9, 0); part(g, 10.5, .2, .8, 0x5aa0d0, 0, 5.35, 0, false); },
  ziggurat(g) { for (let k = 0; k < 4; k++) part(g, 7 - k * 1.6, 1.2, 7 - k * 1.6, k % 2 ? 0x6a7a5a : 0x7a8a6a, 0, .6 + k * 1.2, 0); part(g, 1.2, 3.6, 1.2, 0x5a6a4a, 0, 2.4, 3.2); part(g, 1.6, 1.4, 1.6, 0x8a9a7a, 0, 5.5, 0); for (let k = 0; k < 6; k++) part(g, .3, .8, .3, 0x3f7a45, -2.6 + k, 1.6 + (k % 3) * .4, -3.2); },
  greattree(g) { part(g, 1.6, 6, 1.6, 0x5a3a24, 0, 3, 0); for (const [x, z] of [[-1.2, 0], [1.2, .3], [0, -1.2]]) part(g, .7, 1, .7, 0x5a3a24, x, .4, z); part(g, 9, 2.2, 9, 0x2f5a30, 0, 7, 0); part(g, 6.5, 2, 6.5, 0x3a6a38, .4, 8.8, -.3); part(g, 3.6, 1.4, 3.6, 0x4a7a40, -.2, 10.3, .2); },
  bones(g) { for (let k = 0; k < 7; k++) { const x = -4.2 + k * 1.4, h = 3.6 - Math.abs(k - 3) * .4; for (const sz of [-1, 1]) { part(g, .35, h, .35, 0xf0e8d8, x, h / 2, sz * 1.6).rotation.x = sz * .3; } } part(g, 9, .6, .6, 0xe8e0d0, 0, .3, 0); part(g, 2.2, 1.6, 2, 0xf0e8d8, 5.6, .8, 0); part(g, .5, .5, .3, 0x3a3030, 6.3, 1.1, .6, false); },
  obelisk(g) { part(g, 3, .8, 3, 0x3a3034, 0, .4, 0); part(g, 1.6, 8, 1.6, 0x2a2228, 0, 4.8, 0); part(g, 1, 1.2, 1, 0x2a2228, 0, 9.4, 0); part(g, .5, .7, .5, 0xff7a1a, 0, 10.3, 0, false); for (const y of [3, 5.5, 8]) part(g, 1.64, .14, 1.64, 0xff9a3a, 0, y, 0, false); },
  icespire(g) { for (const [x, z, h, w] of [[0, 0, 9, 1.8], [1.6, .8, 6, 1.2], [-1.4, .6, 5, 1.1], [.6, -1.5, 4, 1], [-.9, -1.1, 3, .8]]) { part(g, w, h, w, 0xbce4f4, x, h / 2, z).rotation.y = x; part(g, w * .5, h * .25, w * .5, 0xf0fafe, x, h + h * .1, z); } },
  face(g) { part(g, 4.4, 5.6, 2.4, 0xa89a88, 0, 2.8, 0); part(g, 5, 1.2, 2.8, 0x8a7a68, 0, 5.8, 0); for (const x of [-1, 1]) part(g, 1, .5, .3, 0x3a3030, x, 3.8, 1.25, false); part(g, .8, 1.4, .6, 0x9a8a78, 0, 2.8, 1.4); part(g, 2.2, .4, .3, 0x5a4a40, 0, 1.6, 1.25, false); },
  galleon(g) { const w = 0x6a4224; part(g, 3, 1.8, 9, w, 0, .9, 0).rotation.z = .3; part(g, 3, 1.6, 2.4, 0x5a3418, .3, 2.4, -3.4).rotation.z = .3; for (const [z, h] of [[-1.5, 6], [1.8, 5]]) { part(g, .25, h, .25, 0x4a2a14, .9, h / 2 + .6, z).rotation.z = .5; } part(g, .1, 2, 2.6, 0xe8e0cc, 2.2, 4, -1.5).rotation.z = .5; },
  head(g) { part(g, 4.6, 4.2, 4.2, 0xc8c4b8, 0, 2.1, 0).rotation.z = .25; part(g, 4.8, 1, 4.4, 0xb8b4a8, -.6, 4.1, 0).rotation.z = .25; for (const z of [-.9, .9]) part(g, .3, .7, .8, 0x4a4a4a, 2.3, 2.8, z, false); part(g, 1, 1.2, .9, 0xb8b4a8, 2.5, 1.7, 0); part(g, 2.6, 1, 1.4, 0xc8c4b8, -1, .5, 3.6); for (let k = 0; k < 4; k++) part(g, .4, .4, 1.4, 0xc8c4b8, -2.4 + k * .5, .5, 4.6); },
};
const GRAND = { rio: ['aqueduct', 'land'], cordillera: ['cascade', 'high'], istmo: ['colossus', 'coast'], archipielago: ['seaarch', 'water'], barrancos: ['rockarch', 'plateau'], meseta: ['henge', 'top'],
  afluentes: ['aqueduct', 'land'], delta: ['ziggurat', 'bank'], bosque: ['greattree', 'clearing'], oasis: ['bones', 'sand'], lago: ['obelisk', 'land'], helado: ['icespire', 'ice'], canon: ['face', 'gorge'], costa: ['galleon', 'beach'], ruinas: ['head', 'land'] };
const PLACES = {
  rio: [['boat', 'water', 3], ['mill', 'bank', 1], ['windmill', 'land', 1]], cordillera: [['shrine', 'peak', 2], ['menhirs', 'high', 1]],
  istmo: [['lighthouse', 'coast', 2], ['boat', 'water', 2]], archipielago: [['boat', 'water', 4], ['lighthouse', 'coast', 1]],
  barrancos: [['columns', 'plateau', 2], ['statue', 'plateau', 1]], meseta: [['menhirs', 'top', 1], ['shrine', 'land', 1]],
  afluentes: [['mill', 'bank', 2], ['boat', 'water', 2]], delta: [['hut', 'bank', 3], ['boat', 'water', 3]], bosque: [['totem', 'clearing', 3]],
  oasis: [['pyramid', 'sand', 2], ['columns', 'sand', 2]], lago: [['boat', 'water', 2], ['shrine', 'land', 1]], helado: [['fishhut', 'ice', 3]],
  canon: [['statue', 'edge', 3]], costa: [['lighthouse', 'coast', 1], ['wreck', 'beach', 2], ['boat', 'water', 2]],
  ruinas: [['statue', 'land', 2], ['columns', 'land', 3]],
};
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const hAt = (x, z) => x < 0 || z < 0 || x >= MW || z >= MD ? 0 : HM[idx(x, z)];
const nearWater = (x, z, r) => { for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (hAt(x + dx, z + dz) <= 0) return true; return false; };
const flat = (x, z) => N4.every(([a, b]) => hAt(x + a, z + b) === hAt(x, z));
const WHERE = {
  water: (x, z, i) => HM[i] <= 0 && GEOT[i] !== 9 && N4.some(([a, b]) => hAt(x + a * 3, z + b * 3) > 0) && !N4.some(([a, b]) => hAt(x + a, z + b) > 0),
  coast: (x, z, i) => HM[i] >= 1 && HM[i] <= 4 && flat(x, z) && nearWater(x, z, 2),
  bank: (x, z, i) => HM[i] >= 1 && HM[i] <= 3 && flat(x, z) && nearWater(x, z, 2) && GEOT[i] !== 9,
  beach: (x, z, i) => GEOT[i] === 3 && HM[i] >= 1 && nearWater(x, z, 3),
  land: (x, z, i) => HM[i] >= 2 && HM[i] <= 5 && GEOT[i] === 0 && flat(x, z) && !nearWater(x, z, 3),
  peak: (x, z, i) => HM[i] >= 8 && flat(x, z), high: (x, z, i) => HM[i] >= 6 && flat(x, z), top: (x, z, i) => HM[i] >= 6 && flat(x, z),
  plateau: (x, z, i) => HM[i] >= 4 && GEOT[i] === 0 && flat(x, z), sand: (x, z, i) => GEOT[i] === 3 && HM[i] >= 2 && flat(x, z) && !nearWater(x, z, 4),
  clearing: (x, z, i) => GEOT[i] === 0 && HM[i] >= 2 && flat(x, z) && [[4, 0], [-4, 0], [0, 4], [0, -4]].some(([a, b]) => GEOT[idx(Math.min(MW - 1, Math.max(0, x + a)), Math.min(MD - 1, Math.max(0, z + b)))] === 1),
  ice: (x, z, i) => GEOT[i] === 6 && N4.every(([a, b]) => GEOT[idx(Math.min(MW - 1, Math.max(0, x + a * 2)), Math.min(MD - 1, Math.max(0, z + b * 2)))] === 6),
  edge: (x, z, i) => HM[i] >= 3 && flat(x, z) && nearWater(x, z, 3) && GEOT[i] !== 9,
  gorge: (x, z, i) => HM[i] >= 3 && flat(x, z) && GEOT[i] === 0 && [[4, 0], [-4, 0], [0, 4], [0, -4]].some(([a, b]) => GEOT[idx(Math.min(MW - 1, Math.max(0, x + a)), Math.min(MD - 1, Math.max(0, z + b)))] === 17),   // asomado a la garganta del cañón
};
export function setupAmbient() {
  resetWeather(); P.length = 0;
  if (flock) { world.remove(flock.g); flock = null; }
  shore = []; deep = []; vents = [];
  for (const [x, z] of geoR?.lavaEnds || []) vents.push([x, z, .3, true]);
  for (const [x, z] of geoR?.fumaroles || []) {   // fumarola: grieta humeante entre rocas en la orilla
    const i = idx(Math.max(0, Math.min(MW - 1, x | 0)), Math.max(0, Math.min(MD - 1, z | 0))), y = Math.max(1, HM[i]), g = new THREE.Group();
    for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; part(g, .7, .5 + (k % 2) * .4, .6, 0x6a6266, Math.cos(a) * 1.2, .3, Math.sin(a) * 1.2); } part(g, 1.2, .1, 1.2, 0xe8d050, 0, .05, 0, false);
    bake(g); g.position.set(x, y, z); world.add(g); decos.push(g); vents.push([x, z, y + .4, false]);
  }
  for (let z = 1; z < MD - 1; z++) for (let x = 1; x < MW - 1; x++) { const i = idx(x, z); if (HM[i] > 0) continue; if (N4.some(([a, b]) => hAt(x + a, z + b) > 0)) shore.push(i); else if (!N4.some(([a, b]) => hAt(x + a * 3, z + b * 3) > 0)) deep.push(i); }
  // elementos propios: lejos de las fortalezas, los pueblos, los caminos y entre sí
  const r = rngOf(seed * 3 + 7), placed = [], keys = geoR?.mix || [scen], blockCells = [];
  for (const key of keys) for (const [model, where, n] of PLACES[key] || []) {
    for (let k = 0, tries = 0; k < n && tries < 2500; tries++) {
      const x = 2 + (r() * (MW - 4) | 0), z = 2 + (r() * (MD - 4) | 0), i = idx(x, z);
      if (geoR?.mix && (x < geoR.seam(z)) !== (key === geoR.mix[0])) continue;
      if (!WHERE[where](x, z, i) || (roadCell && roadCell[i])) continue;
      if (forts.some(f => Math.hypot(f.x - x, f.z - z) < 34) || spots.some(s => Math.hypot(s.x - x, s.z - z) < 13) || placed.some(p => Math.hypot(p[0] - x, p[1] - z) < 18)) continue;
      const g = new THREE.Group(); LM[model](g); bake(g);
      g.position.set(x + .5, where === 'water' ? -.15 : HM[i], z + .5); g.rotation.y = r() * 6.28; if (model === 'pyramid') g.rotation.y = 0;
      world.add(g); decos.push(g); placed.push([x, z, model]); k++;
      if (where !== 'water') for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const j = idx(x + dx, z + dz); if (walk[j]) { blocked[j] = 1; blockCells.push(j); } }   // no se atraviesan
    }
  }
  { const [model, where] = GRAND[keys[0]] || GRAND.rio, wide = (x, z) => [[-3, -3], [3, -3], [-3, 3], [3, 3], [0, 0]].filter(([a, b]) => { const j = idx(Math.min(MW - 1, Math.max(0, x + a)), Math.min(MD - 1, Math.max(0, z + b))); return where === 'water' ? HM[j] <= 0 : Math.abs(HM[j] - HM[idx(x, z)]) <= 1 && HM[j] > 0; }).length >= (['coast', 'beach', 'bank', 'edge', 'gorge'].includes(where) ? 3 : 5);   // en la orilla basta con que casi todo sea tierra
    for (let tries = 0; tries < 6000; tries++) {   // el gran hito: en el centro del mapa si puede ser, para que se vea en la partida
      const x = 6 + (r() * (MW - 12) | 0), z = 6 + (r() * (MD - 12) | 0), i = idx(x, z);
      if (Math.abs(x - MW / 2) > MW * (.2 + tries / 12000) || !WHERE[where](x, z, i) || !wide(x, z)) continue;
      let road = false; for (let dz = -4; dz <= 4 && !road; dz++) for (let dx = -4; dx <= 4; dx++) if (roadCell?.[idx(x + dx, z + dz)]) { road = true; break; } if (road) continue;
      if (forts.some(f => Math.hypot(f.x - x, f.z - z) < 36) || spots.some(s => Math.hypot(s.x - x, s.z - z) < 15) || placed.some(p => Math.hypot(p[0] - x, p[1] - z) < 12)) continue;
      const g = new THREE.Group(); GRAND_LM[model](g); bake(g); g.position.set(x + .5, where === 'water' ? -.6 : HM[i], z + .5); g.rotation.y = (r() * 4 | 0) * Math.PI / 2; world.add(g); decos.push(g); placed.push([x, z, model]);
      if (where !== 'water') for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) { const j = idx(x + dx, z + dz); if (walk[j]) { blocked[j] = 1; blockCells.push(j); } }
      break;
    } }
  if (blockCells.length) refreshCells(blockCells);
  landmarks = placed;
}
let landmarks = [];
export const ambientInfo = () => ({ weather: { ...WEA }, shore: shore.length, deep: deep.length, flock: !!flock, landmarks });
