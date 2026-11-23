// Edificios: castillo, cuartel, altar, pueblos, campamentos, murallas y cambio de dueño.
import * as THREE from 'three';
import { sfx } from './audio.js';
import { CIV, civOf } from './civs.js';
import { GAME, TEAM, mixHex } from './config.js';
import { burst, floatText, fxRand, ping, plume, seenAt } from './effects.js';
import { visibleAt } from './fog.js';
import { campSpawn, toast } from './game.js';
import { sideState } from './units.js';
import { fortPt, forts, inGate, paintRegion, sideAt, spots, surfY, wallR } from './map.js';
import { hash } from './noise.js';
import { BOX, bake, basic, discGeo, mat, part, ring, world } from './render.js';
import { S, track } from './state.js';

// ---------- Edificios ----------
export const spotPos = (s, lift = 0) => new THREE.Vector3(s.x, s.y + lift, s.z);
function placeSpot(s, g, face) {
  let m = 1; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) m = Math.max(m, surfY(s.x + dx, s.z + dz));
  s.y = m; g.position.set(s.x, s.y, s.z); g.rotation.y = face; world.add(g); s.group = g; s.base = g.position.clone(); g.updateMatrixWorld();
  const r = ({ base: 4.4, barracks: 2.9, altar: 2.9, temple: 3, town: 3.3 }[s.kind] || 3) * (s.fortified ? 1.5 : 1);   // sombra suave desplazada hacia donde cae la luz
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
  part(g, .1, 2.8, .1, 0x5a3a24, -1.6, 1.4, -1.4); s.flag = part(g, .8, .5, .08, TEAM[2].c, -1.2, 2.5, -1.4, false);
  for (let k = 0; k < 26; k++) { const a = k / 26 * Math.PI * 2; if (Math.abs(Math.sin(a)) < .2 && Math.cos(a) > 0) continue; part(g, .16, 1 + (k % 2) * .25, .16, 0x7a5a34, Math.cos(a) * 3, .4, Math.sin(a) * 3); }   // empalizada
  s.zone = ring(g, 3.5, 3.8, 0xfff4d6, .12, .85);
  s.beacon = new THREE.Mesh(BOX, basic(0xffffff, .28)); s.beacon.visible = false; g.add(s.beacon);
  s.roofs = roofs; bake(g, new Set([...roofs, s.flag])); placeSpot(s, g, camFace(s, .5)); s.owner = -1; s.known = -1; s.prog = [0, 0]; s.lose = 0; s.towerCd = 0; s.lvl = 1; s.genT = GAME.campGen; addFlag(s, s.flag);
  s.tower = local(s, -1.6, 2.6, -1.4);
}
export function buildTown(s) {
  if (s.camp) return buildCamp(s);
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
  s.roofs = roofs; s.townG = g; s.townCiv = cv; s.lvlG = null; bake(g0, new Set([...roofs, s.flag])); placeSpot(s, g0, camFace(s, .5)); s.owner = -1; s.known = -1; s.prog = [0, 0]; s.lose = 0; s.towerCd = 0; s.lvl = 1; addFlag(s, s.flag);
  s.tower = local(s, -1.5 * big, 3.6 * big, -1.5 * big);
}
// cada nivel de mejora se ve en el pueblo: nivel 2, una casa más; nivel 3, otra casa y remates dorados en la torre
export function townLevelLook(s) {
  if (s.camp || !s.townG) return;
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
  });
}
// aspecto del pueblo según su dueño conocido
function townLook(s) {
  const sd = s.known, col = sd < 0 ? null : TEAM[sd];
  for (const m of s.roofs) m.material = mat(col ? (s.camp ? mixHex(0xd8c89a, col.c, .55) : col.c) : s.camp ? 0xd8c89a : civOf(sideAt(s.x, s.z)).wall[1]);
  s.flag.material = mat(col ? col.c : s.camp ? TEAM[2].c : 0xffffff);
  s.zone.material = basic(col ? col.c : 0xfff4d6, .85);
  s.beacon.visible = false;
  paintRegion(s.region);
}
// al verlo de nuevo, el pueblo muestra su dueño real
export function refreshKnownTowns(all) { for (const s of spots) if (s.kind === 'town' && s.known !== s.owner && (all || visibleAt(s.x, s.z))) { s.known = s.owner; townLook(s); } }
export function setOwner(s, sd) {
  const prev = s.owner; s.owner = sd; if (sd < 0 && s.lvl > 1) { s.lvl = 1; townLevelLook(s); }
  const p = spotPos(s), col = sd < 0 ? null : TEAM[sd];
  if (sd >= 0 && s.camp) { s.genT = GAME.campGen; for (let k = 0; k < 3; k++) campSpawn(s); }   // el campamento da tropas aunque no se vea
  if (!seenAt(p) && prev !== 0) return;   // en la niebla no te enteras (salvo que pierdas un pueblo tuyo)
  s.known = sd; s.anim = 1.4; townLook(s);
  if (sd >= 0) {
    burst(spotPos(s, 1), [0xffd23f, 0xffe98a, col.c], 22, 3, 7, 1.1, .26); burst(spotPos(s, 4), [col.c, col.l, 0xffffff], 34, 4, 6, 1.6, .18); ping(p, '#e8c870'); ping(p, col.css);
    floatText(spotPos(s, 5.5), sd === 0 ? (s.camp ? 'JINETES ARQUEROS' : '+1,5 ORO/S') : 'PUEBLO PERDIDO', sd === 0 ? '#e8c870' : '#d83a4a', 10);
    if (sd === 0) floatText(spotPos(s, 3.4), `+${GAME.capTown} TROPAS`, '#8ad8f0', 9);
    toast(sd === 0 ? (s.camp ? `¡${s.name} ES TUYO! JINETES ARQUEROS · +${GAME.capTown} TROPAS` : `¡${s.name} ES TUYO! +1,5 ORO/S · +${GAME.capTown} TROPAS`) : `EL RIVAL HA TOMADO ${s.name}`, sd === 0 ? 'good' : 'bad', s);
    sfx(sd === 0 ? 'capture' : 'deny'); if (sd === 0) track('town_captured');
  } else {
    burst(spotPos(s, 1), [0xffffff, TEAM[prev].c], 14, 3, 4, .8, .22); ping(p, '#ffffff');
    toast(prev === 0 ? `HAS PERDIDO ${s.name}` : `${s.name} YA NO ES DEL RIVAL`, prev === 0 ? 'bad' : 'good', s);
    sfx(prev === 0 ? 'lost' : 'ready');
  }
}
