// Comportamiento de las tropas: formaciones, órdenes, escolta, guardianes e IA de cada tropa.
import * as THREE from 'three';
import { sfx } from './audio.js';
import { spotPos } from './buildings.js';
import { nearestEnemy, siege, strike } from './combat.js';
import { BASE1, GAME, MD, MW, idx } from './config.js';
import { burst, floatText, ping, plume, streak } from './effects.js';
import { aiUnit } from './ai.js';
import { bonusOf } from './civs.js';
import { caravanUnit, raiderUnit } from './events.js';
import { capR, elapsed, fields } from './game.js';
import { HM, cellOf, regionCell, regionOwner, spots } from './map.js';
import { bfs, cellX, cellZ, inMain, nearestNode, walk } from './nav.js';
import { _h } from './overlay.js';
import { S } from './state.js';
import { UGRID, _nearSep, alive, sideState, followField, place, roadK, slotOk, slowK, spd, stepToward } from './units.js';

// ---------- Órdenes ----------
// Disposición de una tropa en formación. Coordenadas locales: x a la derecha, z hacia delante.
// bloque: arcos detrás, espadas al frente, jinetes en los flancos · línea: lo mismo pero ancho · cuña: punta de espadas, arcos detrás, jinetes en las alas
export const SHAPES = { block: 'BLOQUE', line: 'LÍNEA', wedge: 'CUÑA' };
const FS = 1.75;   // separación entre puestos
export function layout(list, shape, z0) {
  const by = t => list.filter(u => u.type === t), sw = by('sword'), bw = by('bow'), hr = list.filter(u => u.type === 'horse' || u.type === 'harcher'), heroes = by('hero'), gods = by('god'), slots = new Map();
  let depth, rowW;
  if (shape === 'wedge') {
    const seq = [...sw, ...bw], rows = [];
    for (let r = 0, i = 0; i < seq.length; r++) { rows.push(seq.slice(i, i + 2 * r + 1)); i += 2 * r + 1; }
    depth = Math.max(1, rows.length);
    rows.forEach((row, r) => row.forEach((u, k) => slots.set(u, [(k - (row.length - 1) / 2) * FS, z0 + (depth - 1 - r) * FS])));
    rowW = r => (rows[r] ? rows[r].length : 0);
    hr.forEach((u, k) => { const sd = k % 2 ? 1 : -1, j = k >> 1, r = depth - 1 - (j % depth), col = Math.floor(j / depth) + 1; slots.set(u, [sd * ((Math.max(1, rowW(r)) - 1) / 2 + col) * FS, z0 + (depth - 1 - r) * FS]); });
  } else {
    const inf = sw.length + bw.length;
    const cols = shape === 'line' ? THREE.MathUtils.clamp(Math.max(sw.length, bw.length), 2, 24) : THREE.MathUtils.clamp(Math.ceil(Math.sqrt(inf * 2)), 2, 10);
    const rowsOf = l => { const r = []; for (let i = 0; i < l.length; i += cols) r.push(l.slice(i, i + cols)); return r; };
    let z = z0;
    const put = row => { row.forEach((u, k) => slots.set(u, [(k - (row.length - 1) / 2) * FS, z])); z += FS; };
    rowsOf(bw).forEach(put); rowsOf(sw).forEach(put);
    depth = Math.max(1, Math.round((z - z0) / FS));
    const zf = Math.max(z0, z - FS), half = (Math.min(cols, Math.max(1, inf)) - 1) / 2 * FS + FS * 1.25;
    hr.forEach((u, k) => { const sd = k % 2 ? 1 : -1, j = k >> 1, col = Math.floor(j / depth), row = j % depth; slots.set(u, [sd * (half + col * FS), zf - row * FS]); });
  }
  heroes.forEach((u, k) => slots.set(u, [(k - (heroes.length - 1) / 2) * FS * 1.5, z0 - FS * 1.3]));
  gods.forEach((u, k) => slots.set(u, [(k - (gods.length - 1) / 2) * FS * 1.8, z0 - FS * 2.9]));   // el dios va detrás del héroe; el resto, delante
  return slots;
}
// Órdenes de movimiento en grupo: cada tropa recibe su puesto en un bloque orientado hacia el destino y el grupo avanza al paso del más lento
export function orderMove(list, x, z, show = true, attack = false) {
  const node = nearestNode(x, z), f = bfs([node]), tx = cellX(node), tz = cellZ(node);
  let cx = 0, cz = 0; for (const u of list) { cx += u.pos.x; cz += u.pos.z; } cx /= list.length; cz /= list.length;
  let fx = tx - cx, fz = tz - cz; const L = Math.hypot(fx, fz); if (L < .5) { fx = 0; fz = -1; } else { fx /= L; fz /= L; }
  const pace = Math.min(...list.map(u => u.def.speed));
  const sl = list.length > 1 ? layout(list, 'block', 0) : new Map([[list[0], [0, 0]]]);
  let mz = 0; for (const [, p] of sl) mz += p[1]; mz /= Math.max(1, sl.size);
  for (const u of list) {
    const [ox, oz0] = sl.get(u) || [0, 0], oz = oz0 - mz;
    let px = tx + fz * ox + fx * oz, pz = tz - fx * ox + fz * oz, c = cellOf(px, pz);
    const lim = Math.hypot(ox, oz) * 1.6 + 3;
    if (!slotOk(f, c, lim)) {
      let best = -1, bd = 1e9; const x0 = Math.floor(px), z0 = Math.floor(pz);
      for (let dz = -7; dz <= 7; dz++) for (let dx = -7; dx <= 7; dx++) { const xx = x0 + dx, zz = z0 + dz; if (xx < 0 || zz < 0 || xx >= MW || zz >= MD) continue; const j = idx(xx, zz), dd = dx * dx + dz * dz; if (dd < bd && slotOk(f, j, lim + Math.sqrt(dd))) { bd = dd; best = j; } }
      c = best >= 0 ? best : node; px = cellX(c); pz = cellZ(c);
    }
    u.order = { type: 'move', f, tx: px, tz: pz, slot: c, slotF: f[c], fx, fz, pace: list.length > 1 ? pace : 99, attack, stuck: 0, bestD: 1e9, noProg: 0 };
  }
  if (show) ping(new THREE.Vector3(tx, HM[node] + .1, tz), attack ? '#d83a4a' : '#9ad86a');
}
// Formación del héroe: el bloque va DELANTE de él (z0 = 2) con la forma elegida
// se recalcula solo al cambiar la forma o la escolta (assign/unassign borran formKey)
function formation(h) {
  const key = h.formShape || 'block';
  if (h.formKey === key) return h.form;
  h.formKey = key; h.form = layout(h.escort, key, 2); return h.form;
}
export function escortUnit(u, dt) {
  const h = u.leader;
  if ((u.think -= dt) <= 0) { u.think = .3; u.enemy = nearestEnemy(u, h.combatT > 0 ? u.def.aggro + 2 : 3.5); }
  if (alive(u.enemy) && strike(u, u.enemy, dt)) return;
  const foe = spots[1 - u.side];
  if (h.combatT > 0 && h.pos.distanceTo(spotPos(foe)) < 10) { siege(u, foe, dt); return; }
  const [ox, oz] = formation(h).get(u) || [0, -2], fx = h.fwd.x, fz = h.fwd.z;
  const tx = h.pos.x + fz * ox + fx * oz, tz = h.pos.z - fx * ox + fz * oz, dist = Math.hypot(tx - u.pos.x, tz - u.pos.z);
  if (h.field && !slotOk(h.field, cellOf(tx, tz), Math.hypot(ox, oz) * 1.6 + 3)) {   // puesto inalcanzable: junto al héroe
    if (h.field[u.node] > 3) followField(u, h.field, dt, spd(u) * 1.2);
    return;
  }
  if (dist > .5) {
    const s = spd(u) * (dist > 5 ? 1.4 : dist < 1.5 ? .7 : 1), sc = h.field ? h.field[cellOf(tx, tz)] : 0;
    // lejos (por el camino) del héroe: sigue el camino hasta él; cerca: va directa a su puesto, y si algo la bloquea, vuelve al camino
    if (h.field && h.field[u.node] > sc + 3) followField(u, h.field, dt, s);
    else if (!stepToward(u, tx, tz, s, dt) && h.field) followField(u, h.field, dt, s);
  } else { u.fwd.lerp(h.fwd, .15).normalize(); }
}
function playerUnit(u, dt) {
  if (u.leader) return escortUnit(u, dt);
  const o = u.order;
  if (o?.type === 'move') {
    if (o.attack) {   // ataque-mover: pelea con lo que encuentre y luego sigue
      if ((u.think -= dt) <= 0) { u.think = .3; u.enemy = nearestEnemy(u, u.def.aggro); }
      if (alive(u.enemy) && strike(u, u.enemy, dt)) return;
    }
    const d = Math.hypot(o.tx - u.pos.x, o.tz - u.pos.z), sp = Math.min(spd(u), o.pace * roadK(u) * slowK(u)), near = d < 2 ? Math.max(1.5, sp * d / 2) : sp;
    if (d < .3) { u.order = null; u.fwd.set(o.fx, 0, o.fz); return; }
    let ok;
    if (o.own) ok = (o.own[u.node] > 0 && followField(u, o.own, dt, sp)) || stepToward(u, o.tx, o.tz, near, dt);
    else if (d > 3 && o.f[u.node] > o.slotF + 2) ok = followField(u, o.f, dt, sp);
    else {
      ok = stepToward(u, o.tx, o.tz, near, dt);
      if (!ok && S.bfsBudget > 0) { S.bfsBudget--; o.own = bfs([o.slot]); ok = true; }
      else if (!ok) ok = followField(u, o.f, dt, sp);
    }
    // sin avanzar por el camino durante unos segundos (empujones, bloqueos): se da por llegada. El avance se mide por el campo, no en línea recta
    const prog = o.own ? o.own[u.node] + d * .01 : o.f[u.node] > o.slotF + 2 ? o.f[u.node] : d, ph = o.own ? 2 : o.f[u.node] > o.slotF + 2 ? 0 : 1;
    if (ph !== o.ph) { o.ph = ph; o.bestD = 1e9; }
    if (prog < o.bestD - .25) { o.bestD = prog; o.noProg = 0; } else o.noProg += dt;
    if (!ok) { o.stuck += dt; if (o.stuck > 1.5) u.order = null; } else o.stuck = 0;
    if (o.noProg > (ph === 0 ? 25 : 6)) u.order = null;   // en el camino común hay más paciencia: en rampas y vados estrechos se forman colas
    return;
  }
  if (o?.type === 'attack') { if (strike(u, o.target, dt)) return; u.order = null; }
  if ((u.think -= dt) <= 0) { u.think = .3; u.enemy = nearestEnemy(u, u.def.aggro); }
  if (alive(u.enemy) && strike(u, u.enemy, dt)) return;
  if (o?.type === 'capture') {
    const s = spots[o.k]; if (s.owner === 0) { u.order = null; return; }
    spreadTo(u, s.x, s.z, fields[o.k], 0, 0, dt, capR(s) - .8);   // repartidas, pero siempre dentro del círculo de conquista
  } else if (o?.type === 'siege') siege(u, spots[BASE1], dt);
}
// guardianes de los campamentos: defienden su zona y vuelven a ella
function guardUnit(u, dt) {
  const s = u.home, post = u.post || [s.x, s.z];
  if ((u.think -= dt) <= 0) { u.think = .4; const e = nearestEnemy(u, u.def.aggro + 2); u.enemy = e && Math.hypot(e.pos.x - s.x, e.pos.z - s.z) < (s.fortified ? 15 : 17) ? e : null; }
  if (alive(u.enemy) && strike(u, u.enemy, dt)) return;
  const d = Math.hypot(u.pos.x - post[0], u.pos.z - post[1]);   // sin enemigos: de vuelta a su puesto
  if (d > .4 && (d > 6 || !stepToward(u, post[0], post[1], spd(u) * .8, dt))) followField(u, fields[spots.indexOf(s)], dt);
  else if (d <= .4) u.fwd.lerp(_h.set(u.pos.x - s.x, 0, u.pos.z - s.z).normalize(), .05).normalize();   // mirando hacia fuera
}
// cada tropa ociosa ocupa su propio sitio en un girasol alrededor del punto (ángulo áureo y radio según la raíz de su índice): repartidas, sin montones
export function spreadTo(u, cx, cz, field, r0, k, dt, disc = 0) {
  const key = cx + ',' + cz + ',' + disc;
  if (u.spreadKey !== key) {   // el sitio se calcula una vez por destino; si cae en una casilla bloqueada o tras un muro, el más cercano que sí valga
    const i = u.id % 36, a = i * 2.39996, r = disc ? disc * Math.sqrt(.06 + ((u.id * .618034) % 1) * .94) : r0 + k * Math.sqrt(i); let tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r, c = cellOf(tx, tz);
    if (!slotOk(field, c, r * 1.6 + 3)) { let best = -1, bd = 1e9; const x0 = Math.floor(tx), z0 = Math.floor(tz);
      for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) { const xx = x0 + dx, zz = z0 + dz; if (xx < 0 || zz < 0 || xx >= MW || zz >= MD) continue; const j = idx(xx, zz), dd = dx * dx + dz * dz; if (dd < bd && slotOk(field, j, r * 1.6 + 3 + Math.sqrt(dd))) { bd = dd; best = j; } }
      if (best >= 0) { tx = cellX(best) + (tx % 1 - .5) * .6; tz = cellZ(best) + (tz % 1 - .5) * .6; } }
    u.spreadKey = key; u.spread = [tx, tz, r];
  }
  const [tx, tz, r] = u.spread;
  if (field[u.node] > r + 5) return followField(u, field, dt);
  const d = Math.hypot(tx - u.pos.x, tz - u.pos.z); if (d < .4) return false;
  return stepToward(u, tx, tz, spd(u) * (d < 2 ? .6 : 1), dt) || (field[u.node] > 1 && followField(u, field, dt));
}
// dios: destellos a su alrededor y, si escolta a un héroe, cura poco a poco al héroe y a su escolta cercana
function godTick(u, dt) {
  if ((u.fxT = (u.fxT ?? 0) - dt) <= 0) { u.fxT = .22; const p = u.pos.clone(); p.x += (Math.sin(u.id + elapsed * 7)) * .9; p.z += Math.cos(u.id * 3 + elapsed * 5) * .9; p.y += 1.4; plume(p, (u.id + elapsed * 10 | 0) % 2 ? 0xffe9a0 : 0xffffff, .16, .9, 1.6, -.5); }
  const h = u.leader;
  let healed = 0;
  if (h) for (const o of [h, ...h.escort]) if (o !== u && !o.dead && o.hp < o.maxHp && o.pos.distanceTo(u.pos) < GAME.godHealR) {
    o.hp = Math.min(o.maxHp, o.hp + GAME.godHeal * dt);
    if (healed++ < 10 && (o.godFx = (o.godFx ?? 0) - dt) <= 0) {   // en cada tropa curada: un rayo de luz desde el dios y chispas verdes que suben
      o.godFx = .55 + (o.id % 5) * .08;
      const from = u.pos.clone().setY(u.pos.y + 2.6), to = o.pos.clone().setY(o.pos.y + 1);
      for (let k = 0; k < 5; k++) streak(from.clone().lerp(to, k * .1), to, k % 2 ? 0xffe9a0 : 0xb8f07a, .3 + k * .06, .3 - k * .03);
      plume(to, 0x9ad86a, .4, 1.1, 1.8, -.6); plume(to.clone().setY(to.y + .5), 0xe8ffc0, .26, .9, 2.4, -.8); burst(to, [0xb8f07a, 0xffffff], 4, 1.2, 2.5, .5, .16);
    }
  }
  // mientras cura: el halo gira y brilla, el aura del suelo late y una onda verde se expande hasta el alcance de la curación
  u.healing = healed > 0 ? Math.min(1, (u.healing || 0) + dt * 3) : Math.max(0, (u.healing || 0) - dt * 2);
  const k = u.healing, t = elapsed;
  if (u.halo) { u.halo.rotation.z += dt * (1 + k * 5); u.halo.scale.setScalar(1 + k * (.25 + Math.sin(t * 8) * .1)); }
  if (u.aura) u.aura.scale.setScalar(1 + k * (.6 + Math.sin(t * 5) * .25));
  if (u.wave) {
    if (k > .5 && !u.wave.visible) { u.wave.visible = true; u.waveT = 0; }
    if (u.wave.visible) {
      u.waveT += dt; const p = u.waveT / 1.1, R = GAME.godHealR / u.g.scale.x;
      u.wave.scale.setScalar(.3 + p * R); u.wave.material.opacity = .8 * (1 - p);
      if (p >= 1) { if (k > .5) u.waveT = 0; else u.wave.visible = false; }
    }
  }
  if (k > .5 && (u.burstT = (u.burstT ?? 0) - dt) <= 0) { u.burstT = .07; const p = u.pos.clone(); const a = t * 9 + u.id; p.x += Math.cos(a) * 1.6; p.z += Math.sin(a) * 1.6; p.y += .4; plume(p, (t * 20 | 0) % 2 ? 0xb8f07a : 0xffe9a0, .3, 1.2, 2.8, -1); }   // remolino de luz alrededor
}
export function updateUnit(u, dt) {
  u.cd -= dt; u.block -= dt; u.moving = false; u.lunge = Math.max(0, u.lunge - dt * 4); u.flash -= dt; u.combatT -= dt;
  if (u.type === 'god') godTick(u, dt);
  if (u.type === 'hero') {
    u.chargeCd -= dt; u.chargeT -= dt;
    if (u.escort.length && ((u.fieldT = (u.fieldT || 0) - dt) <= 0)) { u.fieldT = .6; u.field = bfs([u.node]); }
    if (u.chargeCd <= 0 && nearestEnemy(u, 8)) {
      u.chargeCd = bonusOf(u.side).chargeCd ?? GAME.chargeCd; u.chargeT = GAME.chargeTime;
      burst(u.pos, [0xe6d6b0, 0xffffff, 0xffd23f], 16, 3, 2, .6, .25);
      for (const e of u.escort) burst(e.pos, [0xe6d6b0], 4, 2, 1.5, .4, .18);
      if (u.vis) { floatText(u.pos.clone().setY(u.pos.y + 4.4), '¡CARGA!', '#e8c870', 11); sfx('charge', u.side); }
    }
  }
  if (u.side < 2 && sideState[u.side].ai) aiUnit(u, dt); else if (u.side === 0) playerUnit(u, dt);
  else if (u.raid != null) raiderUnit(u, dt); else if (u.caravan) { caravanUnit(u, dt); if (u.dead) return; } else guardUnit(u, dt);
  for (const o of UGRID.near(u.pos.x, u.pos.z, 1.7, _nearSep)) if (o !== u) {   // separación: solo vecinos cercanos
    const dx = u.pos.x - o.pos.x, dz = u.pos.z - o.pos.z, d = Math.hypot(dx, dz), min = (u.type === 'hero' || o.type === 'hero') ? 1.7 : 1.05;
    if (d < min && d > 1e-4) { const k = (u.moving ? .8 : 1.4) * dt / d, nx = u.pos.x + dx * k, nz = u.pos.z + dz * k, b = cellOf(nx, nz); if (b === u.node || (walk[b] && inMain[b] && Math.abs(HM[b] - HM[u.node]) <= 1)) { u.pos.x = nx; u.pos.z = nz; u.node = b; } }
  }
  if (u.hp < u.maxHp && elapsed - u.lastHit > 3 && (regionOwner(regionCell[u.node]) === u.side || (u.side === 2 && elapsed - u.lastHit > 6))) {
    u.hp = Math.min(u.maxHp, u.hp + GAME.regen * (u.type === 'hero' ? 3 : 1) * dt);
    if ((u.healT -= dt) <= 0) { u.healT = 1.2; if (u.vis) floatText(u.pos.clone().setY(u.pos.y + 2), '+', '#9ad86a', 9); }
  }
  if (u.moving) u.bob += dt * spd(u) * 4;
  u.pos.y += (HM[u.node] - u.pos.y) * Math.min(1, dt * 10);
  place(u, dt);
}
