// Capa 2D sobre el 3D (barras, iconos, textos), cursores y tamaño de la ventana.
import * as THREE from 'three';
import { spotPos } from './buildings.js';
import { BARR0, BASE1, CFG, GAME, RANKS, TEAM, UNITS } from './config.js';
import { exploredAt, visibleAt } from './fog.js';
import { state } from './game.js';
import { drag, mouse, pickEnemy, pickSpot, pickUnit, project } from './input.js';
import { spots, surfY } from './map.js';
import { camera, canvas, gl, target } from './render.js';
import { $, S } from './state.js';
import { floats, pings, sel, sideState, units } from './units.js';

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
  shield: ['2222222', '2000002', '2022202', '2022202', '0200020', '0020200', '0002000'],
};
// icono grande de acción sobre un edificio (con un pequeño bote)
function actionIcon(x, y, type, bg, fg = '#0f0f1b') {
  const k = 3, n = 7, w = n * k + 8, b = Math.round(Math.sin(performance.now() / 260 + x * .01) * 2), x0 = Math.round(x - w / 2), y0 = Math.round(y - w) + b;
  octx.fillStyle = '#0f0f1b'; octx.fillRect(x0 - 2, y0 - 2, w + 4, w + 4); octx.fillStyle = bg; octx.fillRect(x0, y0, w, w);
  octx.fillStyle = fg; const m = ICONS[type];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (m[j][i] === '2') octx.fillRect(x0 + 4 + i * k, y0 + 4 + j * k, k, k);
  octx.fillStyle = '#0f0f1b'; octx.beginPath(); octx.moveTo(x - 5, y0 + w + 2); octx.lineTo(x + 5, y0 + w + 2); octx.lineTo(x, y0 + w + 8); octx.closePath(); octx.fill();
}
function unitIcon(x, y, type, css) {
  const k = 2, n = 7, w = n * k + 6, x0 = Math.round(x - w / 2), y0 = Math.round(y - w);
  octx.fillStyle = '#0f0f1b'; octx.fillRect(x0, y0, w, w); octx.fillStyle = css; octx.fillRect(x0 + 1, y0 + 1, w - 2, w - 2);
  octx.fillStyle = '#f4f4e8'; const m = ICONS[type];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (m[j][i] === '2') octx.fillRect(x0 + 3 + i * k, y0 + 3 + j * k, k, k);
  octx.fillStyle = '#0f0f1b'; octx.fillRect(Math.round(x) - 1, y0 + w, 2, 3);
}
export const tmpP = {}, LBL = { barracks: 'CUARTEL', altar: 'ALTAR DEL HÉROE' }, _h = new THREE.Vector3();
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
    else if (o.type === 'capture') { const t = spots[o.k]; x = t.x; z = t.z; c = '#e8c870'; }
    else if (o.type === 'siege') { const t = spots[BASE1]; x = t.x; z = t.z; c = '#d83a4a'; }
    else continue;
    if (!scr(u.pos.x, u.pos.y + .3, u.pos.z, LA) || !scr(x, surfY(x, z) + .1, z, LB)) continue;
    dashLine(LA.x, LA.y, LB.x, LB.y, c); ends.set(Math.round(LB.x / 4) + ',' + Math.round(LB.y / 4), [LB.x, LB.y, c]);
  }
  const b = spots[BARR0];
  if (S.selBld === 'barracks' && S.rally && scr(b.x, b.y + .5, b.z, LA) && scr(S.rally.x, surfY(S.rally.x, S.rally.z) + .1, S.rally.z, LB)) { dashLine(LA.x, LA.y, LB.x, LB.y, '#8ad8f0'); ends.set('rally', [LB.x, LB.y, '#8ad8f0']); }
  octx.globalAlpha = 1;
  for (const [x, y, c] of ends.values()) { octx.fillStyle = '#0f0f1b'; octx.fillRect(x - 4, y - 4, 8, 8); octx.fillStyle = c; octx.fillRect(x - 2.5, y - 2.5, 5, 5); }   // marca en cada destino
}
export function drawOverlay(dt) {
  octx.clearRect(0, 0, S.VW, S.VH);
  const showUI = state !== 'menu';
  for (const s of spots) {
    const c = project(spotPos(s), tmpP); s.sx = c.x; s.sy = c.y; s.vis = c.vis && (state !== 'play' || exploredAt(s.x, s.z));
    const ed = project(_h.set(s.x + 3, s.y, s.z), tmpQ); s.pr = Math.max(18, Math.hypot(ed.x - s.sx, ed.y - s.sy) * (s.kind === 'base' ? 1.3 : 1));
    if (!s.vis || !showUI) continue;
    const top = project(spotPos(s, s.kind === 'base' ? 9 : s.kind === 'town' ? 6 : 5), tmpP);
    if (s.kind === 'base') {
      if (s.hp < GAME.baseHp) bar(top.x, top.y - 4, 70, 6, s.hp / GAME.baseHp, TEAM[s.side].css);
    } else if (s.kind === 'town') {
      const own = s.owner;
      for (let k = 1; k < s.lvl; k++) pip(top.x + (k - s.lvl / 2) * 10, top.y - 6, '#e8c870');
      const seenT = visibleAt(s.x, s.z);
      if (s.fortified && s.owner < 0 && s.guards > 0) actionIcon(top.x, top.y - 16, 'shield', '#9a7a3a', '#f4f4e8');
      if (seenT && own < 0 && (s.prog[0] > 0 || s.prog[1] > 0)) { const sd = s.prog[0] >= s.prog[1] ? 0 : 1; bar(top.x, top.y + 6, 50, 5, s.prog[sd], TEAM[sd].css); }
      if (seenT && own >= 0 && s.lose > 0) bar(top.x, top.y + 6, 50, 5, 1 - s.lose, TEAM[own].css);
    } else {
      const q = s.kind === 'barracks' ? sideState[s.side].queue[0] : null, h = s.kind === 'altar' ? sideState[s.side].heroQ.find(e => e.state === 'training') : null;
      if (s.side === 0 && state === 'play') {   // tus edificios con acciones: reclutar tropas y el héroe
        const ic = project(spotPos(s, s.kind === 'barracks' ? 4.6 : 5.2), tmpQ);
        actionIcon(ic.x, ic.y - 6, s.kind === 'barracks' ? 'sword' : 'hero', S.selBld === s.kind ? '#f4f4e8' : '#e8c870');
      }
      if (s.side === 0 && S.selBld === s.kind) continue;
      if (s.side === 0 && q) bar(top.x, top.y + 6, 44, 4, 1 - q.t / UNITS[q.type].time, '#e8c870');
      if (s.side === 0 && h?.state === 'training') bar(top.x, top.y + 6, 44, 4, 1 - h.t / UNITS.hero.time, '#e8c870');
    }
  }
  if (state === 'play' && showUI) orderLines();
  for (const u of units) {
    project(u.pos, tmpP); u.sx = tmpP.x; u.sy = tmpP.y;
    const hidden = u.side !== 0 && state === 'play' && !visibleAt(u.pos.x, u.pos.z); u.g.visible = !hidden; u.vis = tmpP.vis && !hidden;
    if (!u.vis || !showUI) continue;
    const tip = project(_h.copy(u.pos).setY(u.pos.y + 1.6), tmpQ), small = Math.hypot(tip.x - u.sx, tip.y - u.sy) < 16;
    if (small) unitIcon(tip.x, tip.y - 4, u.type, sel.has(u) ? '#e8c870' : TEAM[u.side].css);
    const hero = u.type === 'hero', t = project(_h.copy(u.pos).setY(u.pos.y + (hero ? 4.2 : 2.4)), tmpP);
    if (hero || sel.has(u) || u.hp < u.maxHp) {
      const k = u.hp / u.maxHp;
      bar(t.x, t.y, hero ? 40 : 20, hero ? 4 : 3, k, k > .5 ? '#9ad86a' : k > .25 ? '#e8c870' : '#d83a4a');
      if (hero) label(t.x, t.y - 4, u.chargeT > 0 ? '¡CARGA!' : 'HÉROE', u.chargeT > 0 ? '#e8c870' : TEAM[u.side].css, u.chargeT > 0 ? '#0f0f1b' : '#fff', 7);
    }
    let px = t.x - (hero ? 26 : 16);
    if (u.rank) { pip(px, t.y + 1, RANKS[u.rank].css); px -= 9; }
    if (u.leader) pip(px, t.y + 1, '#e8c870');
  }
  for (let i = pings.length - 1; i >= 0; i--) {
    const p = pings[i]; p.t += dt; const q = project(p.local, tmpP);
    if (q.vis) { const k = p.t / .7; octx.strokeStyle = p.color; octx.globalAlpha = 1 - k; octx.lineWidth = 3; octx.beginPath(); octx.ellipse(q.x, q.y, 8 + k * 26, (8 + k * 26) * .55, 0, 0, 7); octx.stroke(); octx.globalAlpha = 1; octx.lineWidth = 1; }
    if (p.t > .7) pings.splice(i, 1);
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.t += dt; const q = project(f.local, tmpP);
    if (q.vis) {
      octx.font = `${Math.max(12, Math.round(f.size * 1.35))}px ${FONT}`; octx.textAlign = 'center'; octx.globalAlpha = Math.max(0, Math.min(1, 2.2 - f.t * 2));
      octx.fillStyle = '#0f0f1b'; octx.fillText(f.text, q.x + 1, q.y - f.t * 30 + 2); octx.fillStyle = f.color; octx.fillText(f.text, q.x, q.y - f.t * 30); octx.globalAlpha = 1;
    }
    if (f.t > 1.1) floats.splice(i, 1);
  }
  if (drag && drag.btn === 0 && drag.moved) {
    const x = Math.min(drag.x0, mouse.x), y = Math.min(drag.y0, mouse.y), w = Math.abs(mouse.x - drag.x0), h = Math.abs(mouse.y - drag.y0);
    octx.fillStyle = 'rgba(232,200,112,.12)'; octx.fillRect(x, y, w, h); octx.strokeStyle = '#e8c870'; octx.lineWidth = 2; octx.strokeRect(x, y, w, h); octx.lineWidth = 1;
  }
  if (state === 'play' && !drag) canvas.style.cursor = hoverCursor();
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
  move: makeCursor(['1.......', '11......', '121.....', '1221....', '12221...', '122221..', '1222111.', '121.....', '11......'], { 1: '#f4f4e8', 2: '#9ad86a' }, 0, 0, 'default'),
};
function hoverCursor() {
  const x = mouse.x, y = mouse.y, has = sel.size > 0;
  if (S.amode && has) return CUR.attack;
  if (S.selBld === 'barracks') { const sp = pickSpot(x, y); return sp ? 'pointer' : CUR.rally; }
  if (has && pickEnemy(x, y)) return CUR.attack;
  const own = pickUnit(x, y, 0);
  if (own) return has && own.type === 'hero' && [...sel].some(u => u !== own && u.type !== 'hero') ? CUR.assign : 'pointer';
  const sp = pickSpot(x, y);
  if (sp) { if (has && sp.side === 1) return CUR.attack; if (has && sp.kind === 'town' && sp.owner !== 0) return CUR.flag; return 'pointer'; }
  return has ? CUR.move : 'default';
}

// preparación de la página (listeners y elementos del DOM); la llama main.js al arrancar
export function init() {
  addEventListener('resize', resize);
}
