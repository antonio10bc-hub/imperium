// Capa 2D sobre el 3D (barras, iconos, textos), cursores y tamaño de la ventana.
import * as THREE from 'three';
import { spotPos } from './buildings.js';
import { ALT0, BARR0, BASE1, CFG, GAME, RANKS, TEAM, TEMP0, UNITS } from './config.js';
import { uname } from './civs.js';
import { exploredAt, visibleAt } from './fog.js';
import { edgeMarks, state } from './game.js';
import { RALLY_BLD, drag, groundAt, mouse, pickEnemy, pickGate, pickSpot, pickTreasure, pickUnit, project } from './input.js';
import { GEOT, cellOf, gateList, signs, spots, surfY } from './map.js';
import { curCity } from './hud.js';
import { camera, canvas, gl, target } from './render.js';
import { $, S } from './state.js';
import { showTip, uiTipOn } from './hud.js';
import { townIncNow } from './game.js';
import { civOf } from './civs.js';
import { floats, pings, sel, sideState, units } from './units.js';
import { BRIDGE_COST, R, hiddenFrom, ruleTimer, warnZones } from './rules.js';
import { drawWeather } from './ambient.js';

let curScale = 0, curLines = CFG.lines;
export function applyRes(lines, force) {
  curLines = lines;
  const scale = Math.min(CFG.maxScale, Math.max(1, Math.round(Math.min(S.VW, S.VH) / lines)));
  if (scale === curScale && !force) return;
  curScale = scale;
  const lw = Math.ceil(S.VW / scale), lh = Math.ceil(S.VH / scale);
  gl.setSize(lw, lh, false); target.setSize(lw, lh);
  canvas.style.width = lw * scale + 'px'; canvas.style.height = lh * scale + 'px';
}
const ov = $('ov'), octx = ov.getContext('2d');
export function resize() { S.VW = innerWidth; S.VH = innerHeight; ov.width = S.VW; ov.height = S.VH; applyRes(curLines, true); camera.aspect = S.VW / S.VH; const bh = Math.min(S.VH * .4, $('bar').offsetHeight || 0); camera.setViewOffset(S.VW, S.VH + bh, 0, bh, S.VW, S.VH); camera.updateProjectionMatrix(); }
// ---------- Capa 2D ----------
const FONT = '"Silkscreen", monospace';
function bar(x, y, w, h, k, color) {
  octx.fillStyle = '#0f0f1b'; octx.fillRect(x - w / 2 - 2, y - 2, w + 4, h + 4);
  octx.fillStyle = '#b8c8a0'; octx.fillRect(x - w / 2, y, w, h);
  octx.fillStyle = color; octx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, k)), h);
}
function label(x, y, text, bg, fg = '#fff', size = 8) {
  octx.font = `${Math.max(12, Math.round(size * 1.35))}px ${FONT}`; const w = octx.measureText(text).width + 10;
  octx.fillStyle = '#0f0f1b'; octx.fillRect(x - w / 2 - 2, y - size - 6, w + 4, size + 10);
  octx.fillStyle = bg; octx.fillRect(x - w / 2, y - size - 4, w, size + 6);
  octx.fillStyle = fg; octx.textAlign = 'center'; octx.textBaseline = 'alphabetic'; octx.fillText(text, x, y);
}
function pip(x, y, color) { octx.fillStyle = '#0f0f1b'; octx.fillRect(x - 4, y - 4, 8, 8); octx.fillStyle = color; octx.fillRect(x - 2.5, y - 2.5, 5, 5); }
const tmpQ = {};
// Iconos 7×7 de cada tropa (1 = color de equipo, 2 = tinta)
const ICONS = {
  sword: ['0000020', '0000220', '0002200', '2022000', '0220000', '0220000', '2002000'],
  bow:   ['0222000', '2000200', '2000020', '2222222', '2000020', '2000200', '0222000'],
  horse: ['0002200', '0022220', '0222020', '2222000', '0222000', '0202000', '0202000'],
  harcher: ['0002200', '0022220', '2222020', '2222000', '0222000', '0202000', '0202000'],
  hero:  ['2020202', '2222222', '2222222', '0000000', '0222220', '0222220', '0000000'],
  bridge: ['0000000', '2000002', '2222222', '2202022', '2000002', '2000002', '0000000'],
  titan: ['0222200', '0222220', '2222222', '2022202', '0222200', '0220220', '0220220'],
  god:   ['2002002', '0222220', '0200020', '2202022', '0200020', '0222220', '2002002'],
  ram:   ['0000000', '0222220', '2222222', '0002222', '0222220', '2020202', '0000000'],
  catapult: ['0000022', '0000220', '0002200', '0222000', '2222222', '2020202', '0000000'],
  shield: ['2222222', '2000002', '2022202', '2022202', '0200020', '0020200', '0002000'],
};
// icono grande de acción sobre un edificio (con un pequeño bote)
function actionIcon(x, y, type, bg, fg = '#0f0f1b') {
  const k = 3, n = 7, w = n * k + 8, b = Math.round(Math.sin(performance.now() / 260 + x * .01) * 2), x0 = Math.round(x - w / 2), y0 = Math.round(y - w) + b;
  octx.fillStyle = '#0f0f1b'; octx.fillRect(x0 - 2, y0 - 2, w + 4, w + 4); octx.fillStyle = bg; octx.fillRect(x0, y0, w, w);
  octx.fillStyle = fg; const m = ICONS[type] || ICONS.shield;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (m[j][i] === '2') octx.fillRect(x0 + 4 + i * k, y0 + 4 + j * k, k, k);
  octx.fillStyle = '#0f0f1b'; octx.beginPath(); octx.moveTo(x - 5, y0 + w + 2); octx.lineTo(x + 5, y0 + w + 2); octx.lineTo(x, y0 + w + 8); octx.closePath(); octx.fill();
}
function unitIcon(x, y, type, css) {
  const k = 2, n = 7, w = n * k + 6, x0 = Math.round(x - w / 2), y0 = Math.round(y - w);
  octx.fillStyle = '#0f0f1b'; octx.fillRect(x0, y0, w, w); octx.fillStyle = css; octx.fillRect(x0 + 1, y0 + 1, w - 2, w - 2);
  octx.fillStyle = '#f4f4e8'; const m = ICONS[type] || ICONS.shield;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (m[j][i] === '2') octx.fillRect(x0 + 3 + i * k, y0 + 3 + j * k, k, k);
  octx.fillStyle = '#0f0f1b'; octx.fillRect(Math.round(x) - 1, y0 + w, 2, 3);
}
export const tmpP = {}, LBL = { barracks: 'CUARTEL', altar: 'SALÓN DE HÉROES', temple: 'TEMPLO' }, _h = new THREE.Vector3();
// líneas de destino de lo seleccionado: verde al moverse, roja al atacar o asediar, amarilla al conquistar; azul del cuartel al punto de reunión
const _lp = new THREE.Vector3(), LA = {}, LB = {};
const scr = (x, y, z, out) => { _lp.set(x, y, z).project(camera); out.x = (_lp.x * .5 + .5) * S.VW; out.y = (-_lp.y * .5 + .5) * S.VH; return _lp.z < 1; };   // false si queda detrás de la cámara
function dashLine(ax, ay, bx, by, color) {
  octx.setLineDash([6, 5]); octx.lineWidth = 4; octx.strokeStyle = 'rgba(15,15,27,.45)'; octx.beginPath(); octx.moveTo(ax, ay); octx.lineTo(bx, by); octx.stroke();
  octx.lineWidth = 2; octx.strokeStyle = color; octx.stroke(); octx.setLineDash([]); octx.lineWidth = 1;
}
function orderLines() {
  const ends = new Map();
  octx.globalAlpha = .75;
  for (const u of sel) {
    const o = u.order; if (u.dead || u.side !== 0 || u.leader || !o) continue;
    let x, z, c;
    if (o.type === 'move') { x = o.tx; z = o.tz; c = o.attack ? '#d83a4a' : '#9ad86a'; }
    else if (o.type === 'attack') { if (!o.target || o.target.dead) continue; x = o.target.pos.x; z = o.target.pos.z; c = '#d83a4a'; }
    else if (o.type === 'gate') { x = o.g.x; z = o.g.z; c = '#d83a4a'; }
    else if (o.type === 'capture') { const t = spots[o.k]; x = t.x; z = t.z; c = '#e8c870'; }
    else if (o.type === 'siege') { const t = o.s || spots[BASE1]; x = t.x; z = t.z; c = '#d83a4a'; }
    else continue;
    if (!scr(u.pos.x, u.pos.y + .3, u.pos.z, LA) || !scr(x, surfY(x, z) + .1, z, LB)) continue;
    dashLine(LA.x, LA.y, LB.x, LB.y, c); ends.set(Math.round(LB.x / 4) + ',' + Math.round(LB.y / 4), [LB.x, LB.y, c]);
  }
  const rb = { barracks: BARR0, altar: ALT0, temple: TEMP0 }[S.selBld], rp = S.rally[S.selBld + curCity()];
  if (rb != null && rp) { const b = spots[rb + curCity()], c = RALLY_BLD[S.selBld]; if (scr(b.x, b.y + .5, b.z, LA) && scr(rp.x, surfY(rp.x, rp.z) + .1, rp.z, LB)) { dashLine(LA.x, LA.y, LB.x, LB.y, c); ends.set('rally', [LB.x, LB.y, c]); } }
  octx.globalAlpha = 1;
  for (const [x, y, c] of ends.values()) { octx.fillStyle = '#0f0f1b'; octx.fillRect(x - 4, y - 4, 8, 8); octx.fillStyle = c; octx.fillRect(x - 2.5, y - 2.5, 5, 5); }   // marca en cada destino
}
// avisos de cambios del escenario (rules.js · warnZones): zona en el suelo que late (relleno + borde) y un cartel con triángulo de aviso.
// Rojo = peligro · amarillo = el terreno cambia sin hacer daño
const _g = new THREE.Vector3(), _gp = {}, _ga = {}, _gb = {};
const WC = { red: ['255,58,58', '#ff3a3a', '#fff'], yellow: ['255,210,63', '#ffd23f', '#0f0f1b'] };
function warnSign(x, y, text, danger) {
  const [, col, fg] = WC[danger ? 'red' : 'yellow'];
  octx.fillStyle = '#0f0f1b'; octx.beginPath(); octx.moveTo(x, y - 22); octx.lineTo(x + 13, y + 1); octx.lineTo(x - 13, y + 1); octx.closePath(); octx.fill();
  octx.fillStyle = col; octx.beginPath(); octx.moveTo(x, y - 18); octx.lineTo(x + 9.5, y - 1.5); octx.lineTo(x - 9.5, y - 1.5); octx.closePath(); octx.fill();
  octx.fillStyle = '#0f0f1b'; octx.fillRect(x - 1.2, y - 13, 2.4, 6.5); octx.fillRect(x - 1.2, y - 5, 2.4, 2.2);
  if (text) label(x, y + 18, text, col, fg, 7);
}
function drawWarnings() {
  if (state !== 'play') return;
  const now = performance.now(), pulse = .5 + .5 * Math.sin(now / 170), signs = [];   // signs: carteles ya puestos (uno por grupo cercano)
  for (const w of warnZones()) {
    const [rgb, col] = WC[w.danger ? 'red' : 'yellow'], fa = (w.strong ? .24 : w.danger ? .18 : .14) + pulse * (w.strong ? .2 : .12), ea = .55 + pulse * .4;
    let lx, ly, show = false;
    if (w.type === 'disc') {
      if (!exploredAt(w.x, w.z)) continue;
      const y = Math.max(0, surfY(w.x, w.z)) + .2, c = project(_g.set(w.x, y, w.z), _gp); if (!c.vis && Math.abs(c.x - S.VW / 2) > S.VW) continue;
      const e = project(_g.set(w.x + w.r, y, w.z), _ga), s2 = project(_g.set(w.x, y, w.z + w.r), _gb), rx = Math.hypot(e.x - c.x, e.y - c.y), ry = Math.hypot(s2.x - c.x, s2.y - c.y);
      octx.beginPath(); octx.ellipse(c.x, c.y, rx, ry, 0, 0, 7);
      octx.fillStyle = `rgba(${rgb},${fa})`; octx.fill(); octx.lineWidth = 3; octx.strokeStyle = `rgba(15,15,27,${ea * .7})`; octx.stroke(); octx.lineWidth = 2; octx.strokeStyle = `rgba(${rgb},${ea})`; octx.stroke();
      if (w.cross) { const k = Math.min(rx, ry) * .45; octx.lineWidth = 4; octx.strokeStyle = '#0f0f1b'; octx.beginPath(); octx.moveTo(c.x - k, c.y - k); octx.lineTo(c.x + k, c.y + k); octx.moveTo(c.x + k, c.y - k); octx.lineTo(c.x - k, c.y + k); octx.stroke(); octx.lineWidth = 2; octx.strokeStyle = col; octx.stroke(); }
      if (ry > 90) { lx = c.x; ly = c.y; } else { lx = c.x; ly = c.y - ry - 6; } show = c.vis;   // zona grande: el cartel en el centro
    } else {
      const y = w.y ?? 2, P = [[w.x0, w.z0], [w.x1, w.z0], [w.x1, w.z1], [w.x0, w.z1]].map(([x, z]) => { const q = project(_g.set(x, y, z), {}); return [q.x, q.y]; });
      octx.beginPath(); P.forEach(([x, z], i) => i ? octx.lineTo(x, z) : octx.moveTo(x, z)); octx.closePath();
      if (!w.fixed && !exploredAt((w.x0 + w.x1) / 2, (w.z0 + w.z1) / 2)) continue;
      if (w.type === 'edge') { octx.setLineDash([5, 4]); octx.lineWidth = 2; octx.strokeStyle = `rgba(${rgb},.7)`; octx.stroke(); octx.setLineDash([]); continue; }
      octx.fillStyle = `rgba(${rgb},${fa})`; octx.fill(); octx.lineWidth = 3; octx.strokeStyle = `rgba(${rgb},${ea})`; octx.stroke();
      if (w.cross) { const cx = (P[0][0] + P[2][0]) / 2, cy = (P[0][1] + P[2][1]) / 2, k = 8; octx.lineWidth = 4; octx.strokeStyle = '#0f0f1b'; octx.beginPath(); octx.moveTo(cx - k, cy - k); octx.lineTo(cx + k, cy + k); octx.moveTo(cx + k, cy - k); octx.lineTo(cx - k, cy + k); octx.stroke(); octx.lineWidth = 2; octx.strokeStyle = col; octx.stroke(); }
      const q = project(_g.set(w.lx ?? (w.x0 + w.x1) / 2, y + 1, w.lz ?? (w.z0 + w.z1) / 2), _gp); lx = q.x; ly = q.y - 14; show = q.vis;
    }
    if (show && w.label && !signs.some(([x, y]) => Math.abs(x - lx) < 170 && Math.abs(y - ly) < 70)) { signs.push([lx, ly]); warnSign(lx, ly, w.label, w.danger); }
  }
  octx.lineWidth = 1;
}
export function drawOverlay(dt) {
  octx.clearRect(0, 0, S.VW, S.VH);
  drawWeather(octx, S.VW, S.VH, dt);
  drawWarnings();
  if (state === 'play') { const rt = ruleTimer(); if (rt) label(S.VW / 2, 62, rt, '#0f0f1b', rt.startsWith('¡') ? '#ff9a6a' : '#e8c870', 9); }   // contador de mareas, crecidas o volcán
  const showUI = state !== 'menu';
  for (const s of spots) {
    const c = project(spotPos(s), tmpP); s.sx = c.x; s.sy = c.y; s.vis = c.vis && (state !== 'play' || exploredAt(s.x, s.z));
    const ed = project(_h.set(s.x + 3, s.y, s.z), tmpQ); s.pr = Math.max(18, Math.hypot(ed.x - s.sx, ed.y - s.sy) * (s.kind === 'base' ? 1.3 : 1));
    if (!s.vis || !showUI) continue;
    const top = project(spotPos(s, s.kind === 'base' ? 11.5 : s.watch ? 11 : s.keep ? (s.narrow ? 9.5 : 12) : s.kind === 'town' ? 6 : 5), tmpP);
    if (s.kind === 'base') {
      if (s.hp < GAME.baseHp) bar(top.x, top.y - 4, 70, 6, s.hp / GAME.baseHp, TEAM[s.side].css);
    } else if (s.kind === 'town') {
      const own = s.owner;
      for (let k = 1; k < s.lvl; k++) pip(top.x + (k - s.lvl / 2) * 10, top.y - 6, '#e8c870');
      const seenT = visibleAt(s.x, s.z);
      if ((s.fortified || s.keep) && s.owner < 0 && s.guards > 0) actionIcon(top.x, top.y - 16, s.keep ? 'titan' : 'shield', '#9a7a3a', '#f4f4e8');
      if (seenT && own < 0 && (s.prog[0] > 0 || s.prog[1] > 0)) { const sd = s.prog[0] >= s.prog[1] ? 0 : 1; bar(top.x, top.y + 6, 50, 5, s.prog[sd], TEAM[sd].css); }
      if (seenT && own >= 0 && s.lose > 0) bar(top.x, top.y + 6, 50, 5, 1 - s.lose, TEAM[own].css);
    } else {
      const st = sideState[s.side], mine = e => e && (e.c ?? s.side) === s.civ, q = s.kind === 'barracks' && mine(st.queue[0]) ? st.queue[0] : null, h = s.kind === 'altar' ? st.heroQ.find(e => e.state === 'training' && mine(e)) : null;
      if (s.side === 0 && state === 'play') {   // tus edificios con acciones: reclutar tropas y el héroe
        const ic = project(spotPos(s, s.kind === 'barracks' ? 4.6 : 5.2), tmpQ);
        actionIcon(ic.x, ic.y - 6, s.kind === 'barracks' ? 'sword' : s.kind === 'temple' ? 'god' : 'hero', S.selBld === s.kind && s.civ === curCity() ? '#f4f4e8' : '#e8c870');
      }
      if (s.side === 0 && S.selBld === s.kind && s.civ === curCity()) continue;
      if (s.side === 0 && q) bar(top.x, top.y + 6, 44, 4, 1 - q.t / UNITS[q.type].time, '#e8c870');
      if (s.side === 0 && h?.state === 'training') bar(top.x, top.y + 6, 44, 4, 1 - h.t / UNITS.hero.time, '#e8c870');
      if (s.kind === 'temple' && s.side === 0 && (st.ritual?.c ?? 0) === s.civ) { if (st.ritual?.state === 'ritual') bar(top.x, top.y + 6, 44, 4, 1 - st.ritual.t / GAME.ritualTime, '#ffe9a0'); else if (st.godQ) bar(top.x, top.y + 6, 44, 4, 1 - st.godQ.t / UNITS.god.time, '#ffe9a0'); }
    }
  }
  for (const g of gateList) {   // puertas dañadas: barra de vida (las derribadas, una marca)
    if (g.hp >= g.max || !showUI || state !== 'play' || !exploredAt(g.x, g.z)) continue; const c = project(_h.set(g.x, surfY(g.x, g.z) + 3.5, g.z), tmpP); if (!c.vis) continue;
    if (g.hp > 0) bar(c.x, c.y, 34, 4, g.hp / g.max, '#c07a40'); else label(c.x, c.y, 'PUERTA ROTA', '#0f0f1b', '#d83a4a', 6);
  }
  for (const b of R.bridges) {   // puentes: sitio para construir (icono) o puente en pie
    const c = project(_h.set(b.x, 1, b.z), tmpP); b.sx = c.x; b.sy = c.y; b.vis = c.vis && state === 'play' && exploredAt(b.x, b.z); b.pr = 26;
    if (b.vis && showUI && !b.built) { actionIcon(c.x, c.y - 10, 'bridge', S.selSpot === b ? '#f4f4e8' : '#e8c870'); if (!b.breakable) label(c.x, c.y + 12, 'PUENTE · ' + BRIDGE_COST, '#0f0f1b', '#e8c870', 7); }   // el roto lo explica su aviso
  }
  for (const j of R.jobs) { const c = project(_h.set(j.x, j.y + 2.5, j.z), tmpP); if (c.vis && showUI) bar(c.x, c.y, 44, 5, j.t / j.need, '#9ad86a'); }   // tala en curso
  if (state === 'play' && showUI) orderLines();
  for (const u of units) {
    project(u.pos, tmpP); u.sx = tmpP.x; u.sy = tmpP.y;
    const hidden = u.side !== 0 && state === 'play' && (!visibleAt(u.pos.x, u.pos.z) || hiddenFrom(u, 0)); u.g.visible = !hidden; u.vis = tmpP.vis && !hidden;
    if (!u.vis || !showUI) continue;
    const tip = project(_h.copy(u.pos).setY(u.pos.y + 1.6), tmpQ), small = Math.hypot(tip.x - u.sx, tip.y - u.sy) < 16;
    if (small) unitIcon(tip.x, tip.y - 4, u.type, sel.has(u) ? '#e8c870' : TEAM[u.side].css);
    const god = u.type === 'god', hero = u.type === 'hero' || god, t = project(_h.copy(u.pos).setY(u.pos.y + (god ? 5.6 : hero ? 4.2 : 2.4)), tmpP);
    if (hero || sel.has(u) || u.hp < u.maxHp) {
      const k = u.hp / u.maxHp;
      bar(t.x, t.y, hero ? 40 : 20, hero ? 4 : 3, k, k > .5 ? '#9ad86a' : k > .25 ? '#e8c870' : '#d83a4a');
      if (god) label(t.x, t.y - 4, uname(u.civ ?? u.side, 'god'), '#ffe9a0', '#0f0f1b', 7);
      else if (hero) label(t.x, t.y - 4, u.chargeT > 0 ? '¡CARGA!' : 'HÉROE', u.chargeT > 0 ? '#e8c870' : TEAM[u.side].css, u.chargeT > 0 ? '#0f0f1b' : '#fff', 7);
    }
    let px = t.x - (hero ? 26 : 16);
    if (u.rank) { pip(px, t.y + 1, RANKS[u.rank].css); px -= 9; }
    if (u.leader) pip(px, t.y + 1, '#e8c870');
    if (u.raid != null) pip(t.x + (hero ? 26 : 16), t.y + 1, '#d83a4a');   // bandido
    if (u.caravan) label(t.x, t.y - 6, 'CARAVANA', '#e8c870', '#0f0f1b', 7);
  }
  for (let i = pings.length - 1; i >= 0; i--) {
    const p = pings[i]; p.t += dt; const q = project(p.local, tmpP);
    if (q.vis) { const k = p.t / .7; octx.strokeStyle = p.color; octx.globalAlpha = 1 - k; octx.lineWidth = 3; octx.beginPath(); octx.ellipse(q.x, q.y, 8 + k * 26, (8 + k * 26) * .55, 0, 0, 7); octx.stroke(); octx.globalAlpha = 1; octx.lineWidth = 1; }
    if (p.t > .7) pings.splice(i, 1);
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.t += dt; const q = project(f.local, tmpP);
    if (q.vis && f.t >= 0) {   // contorno oscuro: se lee sobre cualquier fondo
      octx.font = `${Math.max(12, Math.round(f.size * 1.35))}px ${FONT}`; octx.textAlign = 'center'; octx.globalAlpha = Math.max(0, Math.min(1, 2.2 - f.t * 2, f.t * 8));
      const y = q.y - f.t * 30; octx.lineWidth = 4; octx.lineJoin = 'round'; octx.strokeStyle = '#0f0f1b'; octx.strokeText(f.text, q.x, y); octx.fillStyle = f.color; octx.fillText(f.text, q.x, y); octx.globalAlpha = 1; octx.lineWidth = 1;
    }
    if (f.t > 1.1) floats.splice(i, 1);
  }
  if (showUI && state === 'play') { edgeArrows(dt); signLabels(); }
  if (drag && drag.btn === 0 && drag.moved) {
    const x = Math.min(drag.x0, mouse.x), y = Math.min(drag.y0, mouse.y), w = Math.abs(mouse.x - drag.x0), h = Math.abs(mouse.y - drag.y0);
    octx.fillStyle = 'rgba(232,200,112,.12)'; octx.fillRect(x, y, w, h); octx.strokeStyle = '#e8c870'; octx.lineWidth = 2; octx.strokeRect(x, y, w, h); octx.lineWidth = 1;
  }
  if (state === 'play' && !drag) canvas.style.cursor = hoverCursor();
  if (!uiTipOn()) showTip(state === 'play' && !drag && mouse.in && mouse.y < S.VH - (($('bar')?.offsetHeight || 86)) ? worldTip(pickSpot(mouse.x, mouse.y)) : '', mouse.x, mouse.y);
}
// flechas en el borde de la pantalla hacia los ataques que pasan fuera de la vista (6 s); se pueden pulsar para ir allí
export const arrowHits = [];
function edgeArrows(dt) {
  arrowHits.length = 0; const top = 70, bot = S.VH - (($('bar')?.offsetHeight || 86) + 14), m = 34;
  for (let i = edgeMarks.length - 1; i >= 0; i--) {
    const e = edgeMarks[i]; e.t += dt; if (e.t > 6) { edgeMarks.splice(i, 1); continue; }
    const front = scr(e.x, surfY(e.x, e.z) + 1, e.z, LA);
    if (front && LA.x > m && LA.x < S.VW - m && LA.y > top && LA.y < bot) continue;   // se ve en pantalla: la flecha no hace falta
    let dx = LA.x - S.VW / 2, dy = LA.y - (top + bot) / 2; if (!front) { dx = -dx; dy = -dy; }
    const k = Math.min((S.VW / 2 - m) / Math.max(1e-3, Math.abs(dx)), ((bot - top) / 2 - 10) / Math.max(1e-3, Math.abs(dy))), x = S.VW / 2 + dx * k, y = (top + bot) / 2 + dy * k, a = Math.atan2(dy, dx);
    const pulse = 1 + Math.sin(e.t * 9) * .12, al = Math.min(1, (6 - e.t) * 1.5);
    octx.save(); octx.globalAlpha = al; octx.translate(x, y); octx.rotate(a); octx.scale(pulse, pulse);
    octx.fillStyle = '#0f0f1b'; octx.beginPath(); octx.moveTo(18, 0); octx.lineTo(-10, -15); octx.lineTo(-4, 0); octx.lineTo(-10, 15); octx.closePath(); octx.fill();
    octx.fillStyle = '#d83a4a'; octx.beginPath(); octx.moveTo(13, 0); octx.lineTo(-6, -10); octx.lineTo(-1, 0); octx.lineTo(-6, 10); octx.closePath(); octx.fill(); octx.restore();
    arrowHits.push({ x, y, wx: e.x, wz: e.z });
  }
}
// nombres en los postes indicadores, solo con la cámara cerca
function signLabels() {
  if (S.camDist > 34) return;
  for (const g of signs) { if (!exploredAt(g.x, g.z)) continue; const c = project(_h.set(g.x, g.y, g.z), tmpP); if (!c.vis || c.x < 0 || c.y < 0 || c.x > S.VW || c.y > S.VH) continue; label(c.x, c.y - 4, g.name, '#d8b884', '#0f0f1b', 6); }
}
// texto de la caja de ayuda sobre un edificio del mapa
function worldTip(s) {
  if (!s) return '';
  const own = s.owner ?? s.side, who = own == null || own < 0 ? 'NEUTRAL' : own === 0 ? 'TUYO' : 'RIVAL · ' + civOf(own).name;
  if (s.kind === 'bridge') return `${s.name || 'PUENTE'} · ${s.built ? 'EN PIE' : 'DERRIBADO'}`;
  if (s.kind === 'base') return `${s.side === 0 ? 'TU FORTALEZA' : 'FORTALEZA · ' + civOf(s.side).name} · ${Math.max(0, Math.round(s.hp / GAME.baseHp * 100))} %${s.wallLvl ? ' · MURALLA ' + RANKS[s.wallLvl].name : ''}`;
  if (s.kind !== 'town') return s.side === 0 ? (LBL[s.kind] || '') + ' · CLIC PARA ABRIR' : LBL[s.kind] || '';
  if (s.known !== s.owner && s.known != null) return s.name;
  const what = s.camp ? 'DA JINETES ARQUEROS' : s.keep ? 'DA COLOSOS' : s.watch ? 'VISIÓN LEJANA Y TORRE' : `+${String(Math.round(townIncNow(s) * 10) / 10).replace('.', ',')} ORO/S · NIVEL ${s.lvl}`;
  return `${s.name} · ${who} · ${what}${s.guards > 0 && own < 0 ? ` · ${s.guards} DEFENSORES` : ''}`;
}
// ---------- Cursores ----------
// Iconos pixelados con contorno: espada = atacar, bandera = conquistar / punto de reunión, corona = asignar al héroe, flecha = mover
function makeCursor(rows, pal, hx, hy, fb) {
  const k = 2, w = rows[0].length, h = rows.length, c = document.createElement('canvas'); c.width = (w + 2) * k; c.height = (h + 2) * k;
  const x = c.getContext('2d'), on = (i, j) => rows[j]?.[i] && rows[j][i] !== '.';
  x.fillStyle = '#0f0f1b';
  for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) if (!on(i, j)) { let n = false; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (on(i + di, j + dj)) n = true; if (n) x.fillRect((i + 1) * k, (j + 1) * k, k, k); }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (on(i, j)) { x.fillStyle = pal[rows[j][i]]; x.fillRect((i + 1) * k, (j + 1) * k, k, k); }
  return `url(${c.toDataURL()}) ${(hx + 1) * k} ${(hy + 1) * k}, ${fb}`;
}
const CUR = {
  attack: makeCursor(['11.........', '131........', '.131.......', '..131......', '...131.....', '....131....', '.....131.2.', '......1322.', '.......22..', '......2.44.', '.........44'], { 1: '#f4f4e8', 3: '#b4afa2', 2: '#e8c870', 4: '#8a5a34' }, 0, 0, 'crosshair'),
  flag: makeCursor(['2........', '2333.....', '233333...', '2333333..', '23333....', '2........', '2........', '2........', '2........', '22.......'], { 2: '#8a5a34', 3: '#e8c870' }, 0, 9, 'pointer'),
  rally: makeCursor(['2........', '2333.....', '233333...', '2333333..', '23333....', '2........', '2........', '2........', '2........', '22.......'], { 2: '#8a5a34', 3: '#3a6ad8' }, 0, 9, 'pointer'),
  assign: makeCursor(['1..1..1', '11.1.11', '1111111', '1111111', '2222222'], { 1: '#e8c870', 2: '#c07a40' }, 3, 2, 'pointer'),
  chop: makeCursor(['....3333...', '...331333..', '...3333332.', '....33.22..', '......22...', '.....22....', '....22.....', '...22......', '..22.......', '.22........', '22.........'], { 1: '#f4f4e8', 2: '#8a5a34', 3: '#c8ccd8' }, 6, 2, 'pointer'),   // hacha: talar el bosque
  loot: makeCursor(['..1111..', '.122221.', '12233221', '11111111', '13344331', '13344331', '13333331', '11111111'], { 1: '#5a3418', 2: '#8a5a34', 3: '#7a4a24', 4: '#ffd23f' }, 4, 4, 'pointer'),   // cofre: recoger el tesoro
  move: makeCursor(['1.......', '11......', '121.....', '1221....', '12221...', '122221..', '1222111.', '121.....', '11......'], { 1: '#f4f4e8', 2: '#9ad86a' }, 0, 0, 'default'),
};
function hoverCursor() {
  const x = mouse.x, y = mouse.y, has = sel.size > 0;
  if (S.amode && has) return CUR.attack;
  if (S.selBld in RALLY_BLD) { const sp = pickSpot(x, y); return sp ? 'pointer' : CUR.rally; }
  if (has && (pickEnemy(x, y) || pickGate(x, y))) return CUR.attack;   // tropas ajenas y puertas de fortalezas ajenas
  if (pickTreasure(x, y)) return has ? CUR.loot : 'pointer';   // cofre: ir a por él
  const own = pickUnit(x, y, 0);
  if (own) return has && own.type === 'hero' && [...sel].some(u => u !== own && u.type !== 'hero') ? CUR.assign : 'pointer';
  const sp = pickSpot(x, y);
  if (sp) { if (has && ((sp.kind === 'base' && sp.side !== 0) || (sp.kind === 'bridge' && sp.built))) return CUR.attack; if (has && sp.kind === 'town' && sp.owner !== 0) return CUR.flag; return 'pointer'; }
  if (has && R.on.chop) { const g = groundAt(x, y); if (g) { const t = GEOT[cellOf(g.x, g.z)]; if (t === 1 || t === 16) return CUR.chop; } }   // sobre el bosque: talarlo
  return has ? CUR.move : 'default';
}

// preparación de la página (listeners y elementos del DOM); la llama main.js al arrancar
export function init() {
  addEventListener('resize', resize);
}
