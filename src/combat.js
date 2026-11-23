// Combate: daño, rangos, muertes, disparos y asedio.
import { sfx } from './audio.js';
import { spotPos } from './buildings.js';
import { GAME, RANGED, RANKS, TEAM } from './config.js';
import { burst, floatText, ping, seenAt, takeBox } from './effects.js';
import { elapsed, fields, toast } from './game.js';
import { updateCtx } from './hud.js';
import { HM } from './map.js';
import { bfs } from './nav.js';
import { VCMAT, mat } from './render.js';
import { $ } from './state.js';
import { UGRID, _nearEn, alive, arrows, charging, followField, sel, setMax, sideState, spd, stepToward, unitGeo, units } from './units.js';

// ---------- Combate ----------
export const alarm = { t: 0, pos: null, cool: 0 }; export let lastCombat = -99;
export const corpses = [];
export function raiseAlarm(loc, msg) {
  if (alarm.cool > 0) return;
  Object.assign(alarm, { t: 3, pos: loc.clone(), cool: 10 });
  toast(msg + ' · ESPACIO', 'bad', loc); sfx('alarm');
  const a = $('alarm'); a.classList.remove('on'); void a.offsetWidth; a.classList.add('on');
}
// tiñe la tropa del metal de su rango (variante de color de su plantilla) y le pone la cresta
export function applyRank(u) {
  if (!u.rank) return;
  u.mesh.geometry = unitGeo(u.tpl, u.rank);
  u.crest.children[0].material = mat(RANKS[u.rank].hex); u.crest.visible = true;
}
export function promote(u) {   // veteranía: bronce, plata y oro
  while (u.rank < 3 && u.kills >= RANKS[u.rank + 1].kills) {
    u.rank++; const R1 = RANKS[u.rank];
    setMax(u); u.hp = Math.min(u.maxHp, u.hp + u.maxHp * .25);
    applyRank(u);
    burst(u.pos, [R1.hex, 0xffffff], 14, 2.5, 4, .8, .2);
    if (u.vis) { floatText(u.pos.clone().setY(u.pos.y + (u.type === 'hero' ? 4.8 : 3)), '¡' + R1.name + '!', R1.css, 10); if (u.side === 0) sfx('rank'); }
  }
}
export function damage(att, tgt, dmg) {
  dmg = Math.round(dmg);
  tgt.hp -= dmg; tgt.flash = .09; tgt.lastHit = elapsed; tgt.hitT = .14;
  if (tgt.side === 0 || att.side === 0) lastCombat = elapsed;
  if (tgt.vis) floatText(tgt.pos.clone().setY(tgt.pos.y + (tgt.type === 'hero' ? 3.6 : 2.3)), '-' + dmg, tgt.side === 0 ? '#d83a4a' : '#ffffff', 8);
  if (tgt.side === 0 && !tgt.vis) raiseAlarm(tgt.pos, tgt.type === 'hero' ? '¡ATACAN A TU HÉROE!' : '¡ATACAN A TUS TROPAS!');
  if (att.vis || tgt.vis) sfx('hit');
  if (tgt.hp <= 0 && !tgt.dead) kill(tgt, att);
}
export function unassign(u) {
  const h = u.leader; if (!h) return;
  h.escort.splice(h.escort.indexOf(u), 1); h.formKey = null; u.leader = null; setMax(u);
}
export function assign(u, h) {
  if (u === h || u.type === 'hero' || u.leader === h) return false;
  if (h.escort.length >= GAME.escortMax) return false;
  unassign(u); u.leader = h; h.escort.push(u); h.formKey = null; u.order = null; setMax(u);
  return true;
}
function kill(u, by) {
  u.dead = true; units.splice(units.indexOf(u), 1); sel.delete(u);
  // el caído se queda en el suelo un rato y luego se hunde
  u.mesh.material = VCMAT; u.team.visible = false; u.selR.visible = false; u.crest.visible = false;
  corpses.push({ g: u.g, body: u.body, t: 0, side: Math.random() < .5 ? 1 : -1 });
  unassign(u);
  if (u.home) u.home.guards--;
  if (u.type === 'hero') {
    for (const e of [...u.escort]) unassign(e);
    sideState[u.side].heroQ.push({ state: 'dead', t: GAME.heroRespawn });
    toast(u.side === 0 ? 'TU HÉROE HA CAÍDO' : '¡EL HÉROE RIVAL HA CAÍDO!', u.side === 0 ? 'bad' : 'good', u.pos);
    burst(u.pos, [0xffd23f, 0xffffff, TEAM[u.side].c], 26, 5, 5, 1, .3);
  }
  burst(u.pos, [TEAM[u.side].c, 0xffffff, TEAM[u.side].d], 12, 3, 3);
  ping(u.pos, TEAM[u.side].css);
  if (by?.side != null) {
    const b = u.type === 'hero' ? 60 : GAME.bounty; if (sideState[by.side]) sideState[by.side].gold += b;
    if (by.side === 0) floatText(u.pos.clone().setY(u.pos.y + 2.8), '+' + b + ' ORO', '#e8c870', 9);
    if (by.kills != null && !by.dead) { by.kills += u.type === 'hero' ? 3 : 1; promote(by); }
  }
  if (u.vis) sfx('die');
  updateCtx();
}
function hitBase(att, s) {
  const dmg = att.def.dmg * (RANGED(att.type) ? .6 : 1) * (att.leader ? GAME.escortBonus : 1) * RANKS[att.rank].mul;
  s.hp -= dmg; s.shake = .18;
  if (s.vis) floatText(spotPos(s, 7), '-' + Math.round(dmg), s.side === 0 ? '#d83a4a' : '#ffffff', 9);
  if (s.side === 0) raiseAlarm(spotPos(s), '¡TU CASTILLO ESTÁ BAJO ATAQUE!');
}
export function shoot(from, toPos, lift = 1.1) {
  const m = takeBox(0xfff1c4); m.scale.set(.07, .07, .6); m.visible = seenAt(from) || seenAt(toPos);
  arrows.push({ m, a: from.clone().setY(from.y + lift), b: toPos.clone().setY(toPos.y + .7), t: 0 });
}
export function strike(u, tgt, dt) {
  if (!alive(tgt)) return false;
  const high = RANGED(u.type) && HM[u.node] - HM[tgt.node] >= 2;   // ventaja de altura: los tiradores desde dos niveles por encima llegan más lejos y hacen más daño
  const d = u.pos.distanceTo(tgt.pos), reach = u.def.range + (high ? 2.5 : 0) + (tgt.type === 'hero' ? .8 : 0);
  if (d > reach) {
    if (!stepToward(u, tgt.pos.x, tgt.pos.z, spd(u), dt)) {
      if (!u.chase || (u.chaseT -= dt) <= 0) { u.chase = bfs([tgt.node], u.node); u.chaseT = 1.2; }   // para al llegar a la tropa: explora solo lo necesario
      followField(u, u.chase, dt);
    }
  } else {
    u.fwd.set(tgt.pos.x - u.pos.x, 0, tgt.pos.z - u.pos.z).normalize(); u.combatT = 2;
    if (u.cd <= 0) {
      u.cd = u.def.cd; if (RANGED(u.type)) { shoot(u.pos, tgt.pos); if (u.vis) sfx('arrow'); } else u.lunge = 1;
      const k = (u.def.vs[tgt.type] || 1) * (u.leader ? GAME.escortBonus : 1) * (charging(u) ? 1.5 : 1) * RANKS[u.rank].mul * (high ? 1.25 : 1);
      damage(u, tgt, u.def.dmg * k * (.85 + Math.random() * .3));
    }
  }
  return true;
}
export function siege(u, s, dt) {
  const c = spotPos(s), d = Math.hypot(u.pos.x - c.x, u.pos.z - c.z);
  if (d < 3.8 + u.def.range) {
    u.fwd.set(c.x - u.pos.x, 0, c.z - u.pos.z).normalize(); u.combatT = 2;
    if (u.cd <= 0) { u.cd = u.def.cd; if (RANGED(u.type)) shoot(u.pos, spotPos(s, 2)); else u.lunge = 1; hitBase(u, s); }
  } else followField(u, fields[s.side], dt);
}
export function nearestEnemy(u, range) {
  let best = null, bd = range;
  for (const o of UGRID.near(u.pos.x, u.pos.z, range, _nearEn)) if (o.side !== u.side) { const d = u.pos.distanceTo(o.pos); if (d < bd) { bd = d; best = o; } }
  return best;
}
