// Edificios: castillo, cuartel, altar, pueblos, campamentos, murallas y cambio de dueño.
import * as THREE from 'three';
import { sfx } from './audio.js';
import { CIV, civOf } from './civs.js';
import { GAME, NEU, TEAM, mixHex } from './config.js';
import { burst, floatText, fxRand, ping, plume, seenAt } from './effects.js';
import { visibleAt } from './fog.js';
import { campSpawn, keepSpawn, toast, townIncNow } from './game.js';
import { sideState, wallArcher } from './units.js';
import { fortPt, forts, gateList, inGate, paintRegion, sideAt, spots, surfY, wallR } from './map.js';
import { hash } from './noise.js';
import { BOX, bake, basic, discGeo, mat, part, ring, world } from './render.js';
import { S, track } from './state.js';
import { addMoment, statCapture } from './stats.js';

// ---------- Edificios ----------
export const spotPos = (s, lift = 0) => new THREE.Vector3(s.x, s.y + lift, s.z);
function placeSpot(s, g, face) {
  let m = 1; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) m = Math.max(m, surfY(s.x + dx, s.z + dz));
  s.y = m; g.position.set(s.x, s.y, s.z); g.rotation.y = face; world.add(g); s.group = g; s.base = g.position.clone(); g.updateMatrixWorld();
  const r = ({ base: 4.4, barracks: 2.9, altar: 2.9, temple: 3, town: 3.3 }[s.kind] || 3) * (s.kind !== 'town' ? s.sc || 1 : 1) * (s.keep ? (s.narrow ? 1.8 : 2.3) : s.fortified ? 1.5 : 1);   // sombra suave desplazada hacia donde cae la luz
  const sh = new THREE.Mesh(discGeo(r), basic(0x0f1a2a, .22)); sh.rotation.x = -Math.PI / 2; sh.position.set(s.x + r * .18, s.y + .04, s.z - r * .22); world.add(sh); decos.push(sh); s.shadow = sh;
  s.flags = [];
}
// banderas que ondean: se estiran y encogen desde el mástil
function addFlag(s, m, dir = 1) { s.flags.push({ m, w: m.scale.x, px: m.position.x - dir * m.scale.x / 2, dir, ph: Math.random() * 6 }); }
// la cámara mira siempre al norte: los edificios ponen el frente hacia ella (+z) con un giro pequeño para que no queden en fila
const camFace = (s, spread) => (hash(s.x | 0, 3, s.z | 0) - .5) * spread;
const facing = (s, tx, tz) => Math.atan2(tx - s.x, tz - s.z);
const local = (s, x, y, z) => s.group.localToWorld(new THREE.Vector3(x, y, z));
export function buildCastle(s) {
  const g = new THREE.Group(), f = forts[s.side];
  civOf(s.side).castle(CIV.grp(g, 0, 0, 0, s.sc), TEAM[s.side].c); bake(g);
  placeSpot(s, g, camFace(s, .25)); s.hp = s.hp ?? GAME.baseHp;
}
export function buildBarracks(s) {
  const g = new THREE.Group();
  civOf(s.side).barracks(CIV.grp(g, 0, 0, 0, s.sc), TEAM[s.side].c); bake(g);
  s.sel = ring(g, 3, 3.3, 0xffe03a, .2); s.sel.visible = S.selBld === 'barracks' && s.side === 0;
  placeSpot(s, g, camFace(s, .4));
}
// salón de héroes: un cuartel especial (el cuartel de la civilización, con estandartes del bando y una corona dorada encima)
export function buildAltar(s) {
  const g = new THREE.Group(), inner = CIV.grp(g, 0, 0, 0, s.sc * .62), T = TEAM[s.side].c;
  civOf(s.side).barracks(inner, T);
  inner.updateMatrixWorld(true); const top = new THREE.Box3().setFromObject(inner).max.y;
  for (const sx of [-1.5, 1.5]) { part(g, .1, top + .9, .1, 0x5a3a24, sx, (top + .9) / 2, 1.3); part(g, .55, .8, .06, T, sx + .3, top + .2, 1.3); part(g, .2, .2, .2, 0xe8c050, sx, top + 1, 1.3); }
  part(g, .8, .2, .5, 0xe8c050, 0, top + .2, 0); for (const sx of [-.3, 0, .3]) part(g, .14, .3, .14, 0xe8c050, sx, top + .45, 0);   // corona
  bake(g);
  s.sel = ring(g, 2.6, 2.9, 0xffe03a, .2); s.sel.visible = false;
  placeSpot(s, g, camFace(s, .4));
}
// templo de la civilización: tras el ritual se invoca en él al dios. Durante el ritual se alza una columna de luz
export function buildTemple(s) {
  const g = new THREE.Group(); civOf(s.side).map.altar(CIV.grp(g, 0, 0, 0, s.sc), TEAM[s.side].c); bake(g);
  s.sel = ring(g, 2.9, 3.2, 0xffe03a, .2); s.sel.visible = false;
  s.beamMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  s.beam = new THREE.Mesh(BOX, s.beamMat); s.beam.scale.set(1.3, 40, 1.3); s.beam.position.y = 20; s.beam.visible = false; g.add(s.beam);
  placeSpot(s, g, camFace(s, .4));
}
// efectos del templo en cada fotograma: columna que late y chispas doradas mientras dura el ritual; un brillo suave cuando ya está consagrado
export function templeFx(dt, now) {
  for (const s of spots) {
    if (s.kind !== 'temple' || !s.beam || !s.group?.visible) continue;
    const r = sideState[s.side].ritual, on = r?.state === 'ritual';
    s.beam.visible = on || r?.state === 'done';
    if (!s.beam.visible) continue;
    s.beamMat.opacity = on ? .22 + Math.sin(now / 180) * .1 : .07 + Math.sin(now / 600) * .03;
    s.beam.scale.x = s.beam.scale.z = on ? 1.3 + Math.sin(now / 250) * .2 : .8;
    if (on && (s.fxT = (s.fxT ?? 0) - dt) <= 0) {
      s.fxT = .08; const p = spotPos(s, .5 + fxRand() * 2); p.x += (fxRand() - .5) * 4; p.z += (fxRand() - .5) * 4;
      plume(p, fxRand() < .5 ? 0xffe9a0 : 0xffffff, .22, 1.6, 2.4, -1.2);
    }
  }
}
function buildCamp(s) {
  const g = new THREE.Group(), roofs = [], canvas = 0xd8c89a;
  const tent = (x, z, w, d, h) => { roofs.push(part(g, w, h * .45, d, canvas, x, h * .22, z), part(g, w * .7, h * .35, d * .9, canvas, x, h * .62, z), part(g, w * .35, h * .3, d * .8, canvas, x, h * .92, z)); part(g, .3, .45, .06, 0x3a2a1a, x, .22, z + d / 2 + .03, false); };
  tent(-1.1, .7, 1.4, 1.2, 1.6); tent(1.1, .9, 1.2, 1.1, 1.4); tent(.6, -1.1, 1.3, 1.2, 1.5);
  part(g, .5, .15, .5, 0x5a4a3a, -.4, .05, -.4); part(g, .25, .35, .25, 0xffa03a, -.4, .3, -.4, false);   // hoguera
  for (const [a, b] of [[1.6, -.2], [1.8, .3]]) part(g, .12, 1.1, .12, 0x8a5a34, a, .5, b, false);   // armero
  part(g, .1, 2.8, .1, 0x5a3a24, -1.6, 1.4, -1.4); s.flag = part(g, .8, .5, .08, TEAM[NEU].c, -1.2, 2.5, -1.4, false);
  for (let k = 0; k < 26; k++) { const a = k / 26 * Math.PI * 2; if (Math.abs(Math.sin(a)) < .2 && Math.cos(a) > 0) continue; part(g, .16, 1 + (k % 2) * .25, .16, 0x7a5a34, Math.cos(a) * 3, .4, Math.sin(a) * 3); }   // empalizada
  s.zone = ring(g, 3.5, 3.8, 0xfff4d6, .12, .85);
  s.beacon = new THREE.Mesh(BOX, basic(0xffffff, .28)); s.beacon.visible = false; g.add(s.beacon);
  s.roofs = roofs; bake(g, new Set([...roofs, s.flag])); placeSpot(s, g, camFace(s, .5)); s.owner = -1; s.known = -1; s.prog = [0, 0, 0, 0, 0]; s.lose = 0; s.towerCd = 0; s.lvl = 1; s.genT = GAME.campGen; addFlag(s, s.flag);
  s.tower = local(s, -1.6, 2.6, -1.4);
}
// final común de los sitios conquistables: funde el modelo (menos tejados y bandera, que cambian de color) y deja el sitio neutral
function finishSite(s, g, roofs, towerAt, beam = 14) {
  s.zone = ring(g, s.keep ? 5.3 / g.scale.x * keepR(s) / 5.7 : 3.5, s.keep ? 5.6 / g.scale.x * keepR(s) / 5.7 : 3.8, 0xfff4d6, .12, .85);
  s.beacon = new THREE.Mesh(BOX, basic(0xffffff, .28)); s.beacon.scale.set(.5, beam, .5); s.beacon.position.y = beam / 2 + 2; s.beacon.visible = false; g.add(s.beacon);
  s.roofs = roofs; bake(g, new Set([...roofs, s.flag])); placeSpot(s, g, camFace(s, .5));
  s.owner = -1; s.known = -1; s.prog = [0, 0, 0, 0, 0]; s.lose = 0; s.towerCd = 0; s.lvl = 1; s.genT = GAME.keepGen; addFlag(s, s.flag);
  s.tower = local(s, ...towerAt);
}
// atalaya: torre alta de piedra con plataforma de madera y brasero; da visión lejana y dispara más lejos que un pueblo
function buildWatch(s) {
  const g = new THREE.Group(), roofs = [], cv = civOf(sideAt(s.x, s.z)), [wc, wc2] = cv.wall, wood = 0x7a5a34;
  part(g, 2.4, .6, 2.4, wc2, 0, .3, 0); part(g, 1.9, 3.2, 1.9, wc, 0, 2.2, 0); part(g, 1.6, 3, 1.6, wc, 0, 5.2, 0);   // basa y fuste
  for (const y of [1.4, 3.8]) part(g, .34, .5, .1, 0x1a1a24, 0, y, .96, false);   // saeteras
  part(g, 2.8, .25, 2.8, wood, 0, 6.8, 0);   // plataforma
  for (const [a, b] of [[-1.25, -1.25], [1.25, -1.25], [-1.25, 1.25], [1.25, 1.25]]) part(g, .16, 1.5, .16, wood, a, 7.6, b);
  for (let k = 0; k < 4; k++) { const r = k * Math.PI / 2; part(g, 2.7, .45, .12, wood, Math.sin(r) * 1.3, 7.2, Math.cos(r) * 1.3).rotation.y = r; }   // barandilla
  roofs.push(part(g, 3.2, .3, 3.2, wc2, 0, 8.45, 0), part(g, 2.2, .35, 2.2, wc2, 0, 8.75, 0), part(g, 1.1, .35, 1.1, wc2, 0, 9.05, 0));   // tejado (color del dueño)
  part(g, .7, .3, .7, 0x3a3a3a, .6, 7.1, -.6); part(g, .4, .35, .4, 0xff9a2a, .6, 7.35, -.6, false); part(g, .22, .3, .22, 0xffe06a, .6, 7.55, -.6, false);   // brasero
  part(g, .1, 1.6, .1, 0x5a3a24, 0, 10, 0); s.flag = part(g, .9, .55, .08, 0xffffff, .45, 10.5, 0, false);
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; if (Math.abs(Math.sin(a)) < .3 && Math.cos(a) > 0) continue; part(g, .14, 1, .14, cv.id === 'galos' ? wood : wc2, Math.cos(a) * 2.8, .1, Math.sin(a) * 2.8, false); }
  finishSite(s, g, roofs, [0, 7.6, 0], 18);
}
// radio del círculo de conquista de la ciudadela (mayor que el de un pueblo fortificado)
export const keepR = s => s.narrow ? 6.6 : 8.2;
// ciudadela: torreón neutral (sin civilización) con cuatro torres y muralla; quien la conquista recibe colosos
function buildKeep(s) {
  const g = new THREE.Group(), roofs = [], st = 0x8c8a92, st2 = 0x6c6a74, dark = 0x2a2a34;
  part(g, 4.6, .5, 4.6, st2, 0, .25, 0); part(g, 3.8, 5, 3.8, st, 0, 2.6, 0);   // torreón
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; part(g, .7, .55, .7, st2, Math.cos(a) * 1.6, 5.35, Math.sin(a) * 1.6); }   // almenas
  roofs.push(part(g, 2.6, .5, 2.6, 0x7a6a9a, 0, 5.4, 0), part(g, 1.6, .55, 1.6, 0x7a6a9a, 0, 5.9, 0));
  part(g, 1.2, 1.8, .2, dark, 0, 1, 1.92, false); part(g, .5, .7, .2, dark, -1, 3.3, 1.92, false); part(g, .5, .7, .2, dark, 1, 3.3, 1.92, false);
  for (const [x, z] of [[-3.3, -3.3], [3.3, -3.3], [-3.3, 3.3], [3.3, 3.3]]) {   // torres de las esquinas
    part(g, 1.5, 3.6, 1.5, st, x, 1.8, z); part(g, 1.8, .4, 1.8, st2, x, 3.7, z); roofs.push(part(g, 1.3, .7, 1.3, 0x7a6a9a, x, 4.2, z), part(g, .7, .5, .7, 0x7a6a9a, x, 4.75, z));
  }
  for (const [x, z, w, d] of [[0, -3.3, 5.1, .6], [-3.3, 0, .6, 5.1], [3.3, 0, .6, 5.1], [-2.1, 3.3, 1.9, .6], [2.1, 3.3, 1.9, .6]]) { part(g, w, 2, d, st, x, 1, z); part(g, w + .1, .3, d + .1, st2, x, 2.1, z); }   // muralla con puerta al frente
  part(g, .14, 2.2, .14, 0x5a3a24, 0, 7.2, 0); s.flag = part(g, 1.2, .7, .08, 0x7a6a9a, .6, 7.9, 0, false);
  part(g, .5, 1.6, .5, 0x9a9488, 1.6, .8, 4.4); part(g, .8, .7, .5, 0x9a9488, 1.6, 1.9, 4.4); part(g, .4, .4, .4, 0x9a9488, 1.6, 2.45, 4.4);   // estatua del coloso
  for (const sx of [-1, 1]) { part(g, 1, .8, 1, st2, sx * 1.8, .4, 3.4); part(g, .5, .6, .5, 0x9a9488, sx * 1.8, 1.1, 3.4); }   // pedestales a los lados de la puerta
  g.scale.setScalar(s.narrow ? 1.2 : 1.55);   // la ciudadela es grande (algo menos en un paso estrecho, para no taparlo)
  finishSite(s, g, roofs, [0, 6, 0], 20);
}
export function buildTown(s) {
  if (s.camp) return buildCamp(s);
  if (s.watch) return buildWatch(s);
  if (s.keep) return buildKeep(s);
  const big = s.fortified ? 1.5 : 1, g0 = new THREE.Group(), g = CIV.grp(g0, 0, 0, 0, big), roofs = [], cv = civOf(sideAt(s.x, s.z)), [wc, wc2] = cv.wall;
  if (s.fortified) {   // dos casas más, muralla baja con puerta al frente y dos torres
    cv.house(CIV.grp(g, -2.5, 0, 1.3, .5, .35)); cv.house(CIV.grp(g, 2.4, 0, 1.4, .5, -.35));
    for (let k = 0; k < 22; k++) { const a = k / 22 * Math.PI * 2; if (Math.abs(a - Math.PI / 2) < .3) continue; part(g, 1, .75, .38, cv.id === 'galos' ? 0x7a5a34 : wc, Math.cos(a) * 3.45, .28, Math.sin(a) * 3.45, false).rotation.y = -a + Math.PI / 2; }
    for (const sx of [-1, 1]) { part(g, .8, 1.8, .8, wc, sx * 1.3, .8, 3.35); part(g, 1, .25, 1, wc2, sx * 1.3, 1.8, 3.35); }
  }
  cv.house(CIV.grp(g, -1.25, 0, -.6, .68, .12)); cv.house(CIV.grp(g, 1.35, 0, -.8, .64, -.14)); cv.house(CIV.grp(g, .1, 0, 1.45, .62, .06));
  part(g, .9, 4, .9, wc, -1.5, 1.2, -1.5); roofs.push(part(g, 1.2, .45, 1.2, wc2, -1.5, 3.4, -1.5));
  part(g, .1, 1.4, .1, 0x8a5a34, -1.5, 4.3, -1.5); s.flag = part(g, .8, .5, .08, 0xffffff, -1.1, 4.7, -1.5, false);
  for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; if (Math.abs(Math.sin(a)) < .25 && Math.cos(a) > 0) continue; part(g, .12, .9, .12, cv.id === 'galos' ? 0x7a5a34 : wc2, Math.cos(a) * 2.9, .05, Math.sin(a) * 2.9, false); }
  s.zone = ring(g, 3.5, 3.8, 0xfff4d6, .12, .85);
  s.beacon = new THREE.Mesh(BOX, basic(0xffffff, .28)); s.beacon.scale.set(.5, 14, .5); s.beacon.position.y = 9; s.beacon.visible = false; g.add(s.beacon);
  s.roofs = roofs; s.townG = g; s.townCiv = cv; s.lvlG = null; bake(g0, new Set([...roofs, s.flag])); placeSpot(s, g0, camFace(s, .5)); s.owner = -1; s.known = -1; s.prog = [0, 0, 0, 0, 0]; s.lose = 0; s.towerCd = 0; s.lvl = 1; addFlag(s, s.flag);
  s.tower = local(s, -1.5 * big, 3.6 * big, -1.5 * big);
}
// cada nivel de mejora se ve en el pueblo: nivel 2, una casa más; nivel 3, otra casa y remates dorados en la torre
export function townLevelLook(s) {
  if (s.camp || s.watch || s.keep || !s.townG) return;
  if (s.lvlG) { s.townG.remove(s.lvlG); for (const c of s.lvlG.children) c.geometry?.dispose(); s.lvlG = null; }
  if (s.lvl < 2) return;
  const g = new THREE.Group(), lots = s.fortified ? [[1.7, -2.2, .5, -.2], [-.2, -2.5, .5, .15]] : [[1.75, .95, .55, -.3], [-1.85, .85, .55, .3]];   // x, z, escala, giro
  for (let k = 0; k < s.lvl - 1; k++) { const [x, z, sc, ry] = lots[k]; s.townCiv.house(CIV.grp(g, x, 0, z, sc, ry)); }
  if (s.lvl >= 3) for (const [dx, dz] of [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]]) part(g, .22, .3, .22, 0xe8c050, -1.5 + dx, 3.8, -1.5 + dz);
  s.townG.add(g); bake(g); s.lvlG = g;
}
// fortaleza dañada: humo por debajo del 75 % de vida; por debajo del 50 %, también fuego, y más cuanto menos vida le queda
export function damageFx(dt) {
  for (const s of spots) {
    if (s.kind !== 'base' || !s.group?.visible) continue;
    const k = s.hp / GAME.baseHp; if (k >= .75) continue;
    const heavy = k < .25 ? 2 : k < .5 ? 1 : 0;
    if ((s.fxT = (s.fxT ?? 0) - dt) > 0) continue;
    s.fxT = [.35, .16, .07][heavy];
    const p = spotPos(s, 2.2 + fxRand() * 2.6), r = 2 * (s.sc || 1); p.x += (fxRand() - .5) * 2 * r; p.z += (fxRand() - .5) * 2 * r;
    plume(p, fxRand() < .5 ? 0x34343a : 0x56565c, .8 + heavy * .25, 2.2 + fxRand(), 1.1);
    if (heavy) plume(p, fxRand() < .5 ? 0xff7a1a : 0xffc83a, .55 + heavy * .15, .45 + fxRand() * .3, 1.8, -1.5);
  }
}
export const decos = [];
export function buildWalls(f) {
  const cv = civOf(f.side), S = cv.map.wall, T = TEAM[f.side], [stone, stone2] = cv.wall, NS = 80, ARC = 8, hr = Math.round(f.h);
  const add = g => { bake(g); world.add(g); decos.push(g); };
  // los tramos se agrupan en arcos de ARC y cada arco se funde en dos mallas; la niebla los oculta por arcos
  let arc = [];
  const closeArc = () => { if (!arc.length) return; const g = new THREE.Group(); g.position.set(arc.reduce((a, s) => a + s.position.x, 0) / arc.length, hr, arc.reduce((a, s) => a + s.position.z, 0) / arc.length);
    for (const sg of arc) { sg.position.sub(g.position); g.add(sg); } arc = []; add(g); };
  f.rings.forEach((q, ri) => {
    const A = []; for (let k = 0; k < NS; k++) { const th = k / NS * Math.PI * 2; A.push({ th, r: wallR(f, th) * q }); }
    const gateAt = k => { const a = A[((k % NS) + NS) % NS]; return inGate(f, a.th, a.r); };
    const H = S.h * (ri ? .75 : 1), t = (S.t || .9) * (ri ? .8 : 1);
    for (let k = 0; k < NS; k++) {
      if (gateAt(k) || gateAt(k + 1)) continue;
      const a = A[k], b = A[(k + 1) % NS], pa = fortPt(f, a.r, a.th), pb = fortPt(f, b.r, b.th), dx = pb.x - pa.x, dz = pb.z - pa.z, L = Math.hypot(dx, dz);
      const g = new THREE.Group(); g.position.set((pa.x + pb.x) / 2, hr, (pa.z + pb.z) / 2); g.rotation.y = Math.atan2(-dz, dx);
      if (S.palisade) { const n = Math.max(2, Math.round(L / .42)); for (let j = 0; j < n; j++) { const hh = H + (j % 2) * .35; part(g, .34, hh, .34, stone, -L / 2 + (j + .5) * L / n, hh / 2 - 1.05, 0, false); } }
      else if (S.rampart) {   // terraplén de tierra con césped y una empalizada encima (fortalezas circulares vikingas)
        const eh = H * .5; part(g, L + .25, eh, t + 1.2, stone2, 0, eh / 2 - 1.05, 0); part(g, L + .25, .1, t + 1.22, S.turf, 0, eh - 1.05 + .05, 0, false);
        const n = Math.max(2, Math.round(L / .42)); for (let j = 0; j < n; j++) { const hh = H * .55 + (j % 2) * .25; part(g, .3, hh, .3, stone, -L / 2 + (j + .5) * L / n, eh + hh / 2 - 1.05, 0, false); }
      } else if (S.carts) {   // círculo de carros: caja, ruedas a los dos lados y, uno sí y otro no, una cubierta de fieltro
        part(g, L * .9, .6, t, stone, 0, -.25, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(g, .14, .66, .66, stone2, sx * L * .28, -.72, sz * (t / 2 + .05));
        if (k % 2) part(g, L * .8, .5, t * .9, S.cover, 0, .3, 0);
      } else if (S.ishigaki) {   // muro japonés: base de piedra en talud, muro enlucido de blanco y caballete de tejas
        const sh = H * .55, wh = H - sh; part(g, L + .25, sh * .5, t + .8, stone2, 0, sh * .25 - 1.05, 0); part(g, L + .25, sh * .5, t + .4, stone2, 0, sh * .75 - 1.05, 0);
        part(g, L + .25, wh, t * .6, stone, 0, sh + wh / 2 - 1.05, 0); part(g, L + .3, .2, t * .6 + .4, S.cap, 0, H - 1.05 + .1, 0);
      }
      else { part(g, L + .25, H, t, stone, 0, H / 2 - 1.05, 0); if (S.cren && k % 2) part(g, .55, .45, t + .1, S.merlon ?? stone2, 0, H - 1.05 + .22, 0); }
      if (S.butt && k % 2 === 0) part(g, .7, H * .85, t + .9, stone2, 0, H * .42 - 1.05, 0);   // contrafuertes de adobe
      if (!ri && S.tower && k % S.every === (S.every >> 1)) { part(g, 1.7, H + .8, 1.7, stone, 0, (H + .8) / 2 - 1.05, 0); part(g, 2, .45, 2, stone2, 0, H - .25 + .22, 0); part(g, .6, .6, .6, T.c, 0, H + .4, 0); }
      arc.push(g); if (arc.length >= ARC) closeArc();
    }
    closeArc();
    if (S.gate) f.gates.forEach((ga, gi) => {   // puertas: torres, pilono, puerta de madera… según la civilización
      const p = fortPt(f, wallR(f, ga) * q, ga), g = new THREE.Group(); g.position.set(p.x, hr, p.z); g.rotation.y = Math.atan2(-Math.cos(ga), -Math.sin(ga));
      S.gate(g, T.c, gi === 0 && !ri); if (ri) g.scale.setScalar(.8); add(g);
    });
    f.gates.forEach((ga, gi) => {   // hojas de la puerta (se derriban): madera con herrajes y el color del bando
      const p = fortPt(f, wallR(f, ga) * q, ga), d = new THREE.Group(), hd = Math.min(H * .85, 2.4); d.position.set(p.x, hr, p.z); d.rotation.y = Math.atan2(-Math.cos(ga), -Math.sin(ga));
      part(d, 3.5, hd, .3, 0x6a4224, 0, hd / 2 - 1.05, 0); for (const y of [.3, .7]) part(d, 3.56, .14, .36, 0x3a3a44, 0, hd * y - 1.05, 0); part(d, .08, hd, .34, 0x3a2414, 0, hd / 2 - 1.05, 0); part(d, .7, .5, .36, T.c, 0, hd * .5 - 1.05, 0);
      add(d); const gt = gateList.find(o => o.f === f && o.gi === gi); if (gt) gt.doors.push(d);
    });
  });
}
// arqueros de las almenas: uno por cada tirador de la muralla, de pie sobre ella; con el nivel de la muralla se tiñen de bronce, plata u oro
export function buildWallArchers(f) {
  const S = civOf(f.side).map.wall, top = Math.round(f.h) + (S.h || 2) * (S.rampart ? .5 : S.carts ? .2 : 1) - 1.05 + (S.palisade ? -.35 : 0);
  f.shooters = [];
  for (let k = 0; k < GAME.wallShooters; k++) {
    let th = k / GAME.wallShooters * Math.PI * 2 + .13; if (inGate(f, th, wallR(f, th))) th += .3;
    const p = fortPt(f, wallR(f, th) - .05, th), a = wallArcher(f.side); a.g.position.set(p.x, top, p.z); a.g.rotation.y = Math.atan2(Math.cos(th), Math.sin(th));
    world.add(a.g); decos.push(a.g); f.shooters.push({ x: p.x, z: p.z, cd: Math.random() * GAME.wallCd, arch: a, th });
  }
}
// muralla de un bando al nivel lv: tiñe a los arqueros y endurece las puertas
export function wallLevelLook(f, lv) {
  for (const sh of f.shooters || []) sh.arch.setRank(lv);
  for (const g of gateList) if (g.f === f) { const m = GAME.gateHp + GAME.gateLvlHp * lv, add = m - g.max; g.max = m; if (g.hp > 0) g.hp += add; }
}
// vida en el patio de la fortaleza: pozo, carros, cajas y toneles, almiar, estafermo de prácticas y estandartes del bando.
// Van en los huecos libres (lejos de los edificios, de la muralla y del paso de las puertas); solo decoran, no estorban
const PROPS = {
  well(g, T) { for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; part(g, .5, .6, .5, 0x9a968c, Math.cos(a) * .55, .3, Math.sin(a) * .55); } part(g, .7, .05, .7, 0x3a6a9a, 0, .5, 0, false); for (const x of [-.6, .6]) part(g, .1, 1.3, .1, 0x6a4a2e, x, .9, 0); part(g, 1.5, .14, .8, 0x8a5a34, 0, 1.6, 0); },
  cart(g, T) { part(g, 1.2, .3, .8, 0x8a5a34, 0, .55, 0); for (const x of [-.4, .4]) for (const z of [-.45, .45]) part(g, .36, .36, .08, 0x5a3a24, x, .22, z); part(g, .9, .3, .6, 0xd8c060, 0, .85, 0); part(g, .08, .08, .8, 0x6a4a2e, .85, .5, 0); },
  crates(g, T) { part(g, .6, .6, .6, 0xa87a4a, 0, .3, 0); part(g, .5, .5, .5, 0x9a6a3a, .55, .25, .2); part(g, .45, .45, .45, 0xa87a4a, .2, .82, .05); for (const [x, z] of [[-.6, .3], [-.65, -.35]]) { part(g, .4, .55, .4, 0x7a4a2a, x, .27, z); part(g, .44, .06, .44, 0x3a3a3a, x, .4, z, false); } },
  hay(g, T) { part(g, 1.1, .7, 1.1, 0xd8c060, 0, .35, 0); part(g, .75, .4, .75, 0xe0c870, 0, .9, 0); part(g, .35, .25, .35, 0xe0c870, 0, 1.2, 0); },
  dummy(g, T) { part(g, .12, 1.6, .12, 0x6a4a2e, 0, .8, 0); part(g, .9, .1, .1, 0x6a4a2e, 0, 1.2, 0); part(g, .44, .6, .3, 0xc8b070, 0, 1.15, 0); part(g, .3, .3, .3, 0xc8b070, 0, 1.6, 0); part(g, .4, .4, .06, T, -.45, 1.1, .1); },
  banner(g, T) { part(g, .12, 3.2, .12, 0x5a3a24, 0, 1.6, 0); part(g, .06, 1.1, .7, T, 0, 2.5, .36, false); part(g, .2, .2, .2, 0xe8c050, 0, 3.25, 0); },
  firepit(g, T) { for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; part(g, .3, .22, .3, 0x6a6266, Math.cos(a) * .45, .11, Math.sin(a) * .45); } part(g, .35, .3, .35, 0xff9a2a, 0, .2, 0, false); part(g, .18, .25, .18, 0xffe06a, 0, .4, 0, false); },
};
export function buildFortDeco(f) {
  const T = TEAM[f.side].c, q = f.rings[f.rings.length - 1], blds = spots.filter(s => s.side === f.side && s.kind !== 'town'), kinds = Object.keys(PROPS), put = [];
  for (let t = 0; t < 160 && put.length < 9; t++) {
    const th = hash(f.side, t, 7) * Math.PI * 2, r = 2.5 + hash(t, f.side, 9) * (wallR(f, th) * q - 4.2), p = fortPt(f, r, th);
    if (f.gates.some(ga => Math.abs(Math.atan2(Math.sin(th - ga), Math.cos(th - ga))) * r < 2.2)) continue;   // el paso de las puertas queda libre
    if (blds.some(b => Math.hypot(b.x - p.x, b.z - p.z) < (b.kind === 'base' ? 5.6 : 3.9) * (b.sc || 1)) || put.some(o => Math.hypot(o.x - p.x, o.z - p.z) < 2.6)) continue;
    const kind = put.length < 2 ? 'banner' : kinds[(hash(t, 3, f.side) * kinds.length) | 0], g = new THREE.Group(); PROPS[kind](g, T); bake(g);
    g.position.set(p.x, surfY(p.x, p.z), p.z); g.rotation.y = hash(t, 5, 1) * 6.28; world.add(g); decos.push(g); put.push(p);
  }
}
// aspecto del pueblo según su dueño conocido
function townLook(s) {
  const sd = s.known, col = sd < 0 ? null : TEAM[sd];
  for (const m of s.roofs) m.material = mat(col ? (s.camp ? mixHex(0xd8c89a, col.c, .55) : col.c) : s.camp ? 0xd8c89a : s.keep ? 0x7a6a9a : civOf(sideAt(s.x, s.z)).wall[1]);
  s.flag.material = mat(col ? col.c : s.camp ? TEAM[NEU].c : s.keep ? 0x7a6a9a : 0xffffff);
  s.zone.material = basic(col ? col.c : 0xfff4d6, .85);
  s.beacon.visible = false;
  paintRegion(s.region);
}
// al verlo de nuevo, el pueblo muestra su dueño real
export function refreshKnownTowns(all) { for (const s of spots) if (s.kind === 'town' && s.known !== s.owner && (all || visibleAt(s.x, s.z))) { s.known = s.owner; townLook(s); } }
export function setOwner(s, sd) {
  const prev = s.owner; s.owner = sd; if (sd >= 0 && sd < NEU) statCapture(sd, s); else if (prev === 0) addMoment(`PIERDES ${s.name}`); if (sd < 0 && s.lvl > 1) { s.lvl = 1; townLevelLook(s); }
  const p = spotPos(s), col = sd < 0 ? null : TEAM[sd];
  if (sd >= 0 && s.camp) { s.genT = GAME.campGen; for (let k = 0; k < 3; k++) campSpawn(s); }   // el campamento da tropas aunque no se vea
  if (sd >= 0 && s.keep) { s.genT = GAME.keepGen; for (let k = 0; k < 2; k++) keepSpawn(s); }
  if (!seenAt(p) && prev !== 0) return;   // en la niebla no te enteras (salvo que pierdas un pueblo tuyo)
  s.known = sd; s.anim = 1.4; townLook(s);
  if (sd >= 0) {
    burst(spotPos(s, 1), [0xffd23f, 0xffe98a, col.c], 22, 3, 7, 1.1, .26); burst(spotPos(s, 4), [col.c, col.l, 0xffffff], 34, 4, 6, 1.6, .18); ping(p, '#e8c870'); ping(p, col.css);
    const gain = s.camp ? 'JINETES ARQUEROS' : s.keep ? 'COLOSOS' : s.watch ? 'VISIÓN Y TORRE' : `+${String(Math.round(townIncNow(s) * 10) / 10).replace('.', ',')} ORO/S`;
    floatText(spotPos(s, s.watch ? 11 : 5.5), sd === 0 ? gain : 'PUEBLO PERDIDO', sd === 0 ? '#e8c870' : '#d83a4a', 10);
    if (sd === 0) floatText(spotPos(s, 3.4), `+${GAME.capTown} TROPAS`, '#8ad8f0', 9);
    toast(sd === 0 ? `¡${s.name} ES TUYO! ${gain} · +${GAME.capTown} TROPAS` : `EL RIVAL HA TOMADO ${s.name}`, sd === 0 ? 'good' : 'bad', s);
    sfx(sd === 0 ? 'capture' : 'deny'); if (sd === 0) track('town_captured');
  } else {
    burst(spotPos(s, 1), [0xffffff, TEAM[prev].c], 14, 3, 4, .8, .22); ping(p, '#ffffff');
    toast(prev === 0 ? `HAS PERDIDO ${s.name}` : `${s.name} YA NO ES DEL RIVAL`, prev === 0 ? 'bad' : 'good', s);
    sfx(prev === 0 ? 'lost' : 'ready');
  }
}
