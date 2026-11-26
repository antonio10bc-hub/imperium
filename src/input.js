// Proyección, selección, órdenes del jugador, cámara, ratón y teclado.
import * as THREE from 'three';
import { sfx } from './audio.js';
import { orderMove } from './behavior.js';
import { spotPos } from './buildings.js';
import { alarm, assign, unassign } from './combat.js';
import { GAME, MD, MW, SIEGE, TYPES } from './config.js';
import { ping } from './effects.js';
import { exploredAt, toggleFog } from './fog.js';
import { enqueue, heroesOf, newGame, startGame, startRitual, state, summonGod, summonHero, toast } from './game.js';
import { closeMenu, curCity, cycleBuilding, saveGroup, selectGroup, openMenu, pickGroup, selectBuilding, selectSpot, setSelection, syncTools, updateCtx } from './hud.js';
import { GEOT, HM, cellOf, gateList, homeOf, spots, surfY } from './map.js';
import { bfs, nearestNode } from './nav.js';
import { seed } from './noise.js';
import { camera, canvas, part, world } from './render.js';
import { $, S, track } from './state.js';
import { sel, sideState, units } from './units.js';
import { R, startChop } from './rules.js';
import { arrowHits } from './overlay.js';

// ---------- Proyección y selección ----------
const _p = new THREE.Vector3();
export function project(loc, out = {}) {
  _p.copy(loc).project(camera); out.x = (_p.x * .5 + .5) * S.VW; out.y = (-_p.y * .5 + .5) * S.VH;
  out.vis = _p.z < 1 && out.x > -40 && out.x < S.VW + 40 && out.y > -40 && out.y < S.VH + 40; return out;
}
export function pickUnit(x, y, side) {
  let best = null, bd = S.touch ? 30 : 22;   // con el dedo, más margen
  for (const u of units) if (u.side === side && u.vis) { const d = Math.hypot(u.sx - x, u.sy - y) * (u.type === 'hero' ? .6 : 1); if (d < bd) { bd = d; best = u; } }
  return best;
}
export function pickEnemy(x, y) {   // cualquier tropa que no sea tuya: rivales, guardianes, bandidos y caravanas
  let best = null, bd = 22;
  for (const u of units) if (u.side !== 0 && u.vis) { const d = Math.hypot(u.sx - x, u.sy - y) * (u.type === 'hero' ? .6 : 1); if (d < bd) { bd = d; best = u; } }
  return best;
}
// puerta en pie de una fortaleza ajena bajo el cursor (solo si se ha explorado)
const _gq = new THREE.Vector3(), _gs = {};
export function pickGate(x, y) {
  let best = null, bd = 24;
  for (const g of gateList) if (g.hp > 0 && spots[g.f.side].side !== 0 && exploredAt(g.x, g.z)) { project(_gq.set(g.x, surfY(g.x, g.z) + 1.2, g.z), _gs); const d = Math.hypot(_gs.x - x, _gs.y - y); if (_gs.vis && d < bd) { bd = d; best = g; } }
  return best;
}
// cofre del tesoro bajo el cursor (solo los que se ven)
const _t = new THREE.Vector3(), _tp = {};
export function pickTreasure(x, y) {
  for (const t of R.treasures || []) if (!t.taken && t.g.visible) { project(_t.set(t.x, t.y + .5, t.z), _tp); if (_tp.vis && Math.hypot(_tp.x - x, _tp.y - y) < 20) return t; }
  return null;
}
export function pickSpot(x, y) {
  let best = null, bd = 1e9;
  for (const s of spots) if (s.vis && s.ix != null && Math.abs(s.ix - x) < 19 && Math.abs(s.iy - y) < 19) return s;   // el icono de acción de un edificio tuyo
  for (const s of [...spots, ...R.bridges]) if (s.vis) { const d = Math.hypot(s.sx - x, s.sy - y); if (d < s.pr && d < bd) { bd = d; best = s; } }
  return best;
}
const ray = new THREE.Raycaster();
export function groundAt(x, y, loose) {
  ray.setFromCamera({ x: x / S.VW * 2 - 1, y: -(y / S.VH) * 2 + 1 }, camera);
  const o = ray.ray.origin, d = ray.ray.direction; if (d.y > -1e-3) return null;
  let h = 2, px = 0, pz = 0;
  for (let k = 0; k < 4; k++) { const t = (h - o.y) / d.y; px = o.x + d.x * t; pz = o.z + d.z * t; if (loose) break; h = surfY(px, pz); }
  if (!loose && (px < 0 || pz < 0 || px >= MW || pz >= MD)) return null;
  return { x: px, z: pz };
}
// punto de reunión de cada edificio que produce (cuartel, salón de héroes y templo); su banderín lleva el color del icono del edificio
export const RALLY_BLD = { barracks: '#8ad8f0', altar: '#e8c870', temple: '#f4f4e8' };
function setRally(g) {
  const k = S.selBld, key = k + curCity(); S.rally[key] = g;   // un punto de reunión por edificio y ciudad
  let f = S.rallyFlag[key];
  if (!f) { f = S.rallyFlag[key] = new THREE.Group(); part(f, .1, 2, .1, 0x8a5a34, 0, 1, 0); part(f, .8, .5, .08, 0x2f7bff, .45, 1.7, 0); part(f, .3, .3, .1, parseInt(RALLY_BLD[k].slice(1), 16), .45, 1.7, .06, false); world.add(f); }
  f.position.set(g.x, surfY(g.x, g.z), g.z);
  ping(f.position, '#3a6ad8'); sfx('cmd'); toast(`PUNTO DE REUNIÓN ${{ barracks: 'DEL CUARTEL', altar: 'DE LOS HÉROES', temple: 'DEL DIOS' }[k]} FIJADO`);
}
// orden sobre la fortaleza rival (asalto), un pueblo ajeno (conquista) o un punto del suelo (mover); la usan el mapa y el minimapa
function orderTo(list, sp, g, attack, face = null) {
  if (sp && sp.kind === 'base' && sp.side !== 0) { const tgt = sp; for (const u of list) u.order = { type: 'siege', s: tgt }; ping(spotPos(tgt), '#d83a4a'); sfx('cmd'); toast('¡AL ASALTO DE LA FORTALEZA!'); track('order', { type: 'siege' }); return; }
  if (sp && sp.kind === 'bridge' && sp.built) { for (const u of list) u.order = { type: 'demolish', b: sp }; ping(new THREE.Vector3(sp.x, sp.hb, sp.z), '#d83a4a'); sfx('cmd'); toast('¡A DERRIBAR EL PUENTE!'); return; }   // derribar un puente
  if (sp && sp.kind === 'town' && sp.owner !== 0) { const k = spots.indexOf(sp); for (const u of list) u.order = { type: 'capture', k }; ping(spotPos(sp), '#e8c870'); sfx('cmd'); track('order', { type: 'capture' }); return; }
  orderMove(list, g.x, g.z, true, attack, face); sfx('cmd'); track('order', { type: attack ? 'amove' : 'move', face: !!face });
}
// orden con orientación: van al punto donde empezó el arrastre y miran hacia donde terminó
function faceCommand(d, x, y) {
  const a = groundAt(d.x0, d.y0), b = groundAt(x, y), atk = !!S.amode; S.amode = false;
  const fx = a && b ? b.x - a.x : 0, fz = a && b ? b.z - a.z : 0, L = Math.hypot(fx, fz);
  command(d.x0, d.y0, atk, L > 1.2 ? { x: fx / L, z: fz / L } : null);
}
const commandList = () => [...sel].filter(u => !(u.leader && sel.has(u.leader)));   // la escolta de un héroe seleccionado sigue en formación
export function command(x, y, attack = false, face = null) {
  if (state !== 'play') return;
  if (S.selBld in RALLY_BLD) { const g = groundAt(x, y); if (g) setRally(g); return; }
  if (!sel.size) return;
  const list = commandList();
  const own = pickUnit(x, y, 0);
  if (own && own.type === 'hero' && list.some(u => u !== own)) {
    let n = 0; for (const u of list) if (assign(u, own)) n++;
    ping(own.pos, '#e8c870'); sfx(n ? 'cmd' : 'deny');
    toast(n ? `${n} ${n === 1 ? 'TROPA ESCOLTA' : 'TROPAS ESCOLTAN'} AL HÉROE (${own.escort.length}/${GAME.escortMax})` : 'LA ESCOLTA ESTÁ COMPLETA', n ? 'good' : 'bad');
    track('escort_assign', { n }); updateCtx(); return;
  }
  if (own && own.type === 'hero' && list.length === 1 && list[0] === own) return;
  for (const u of list) unassign(u);
  const eu = pickEnemy(x, y), gt = pickGate(x, y);
  if (gt && (list.some(u => u.def.siege) || !eu)) {   // derribar esa puerta (con asedio seleccionado, la puerta manda aunque haya enemigos delante)
    const f = bfs([nearestNode(gt.x, gt.z)]); for (const u of list) u.order = { type: 'gate', g: gt, f };
    ping(new THREE.Vector3(gt.x, surfY(gt.x, gt.z) + .5, gt.z), '#d83a4a'); sfx('cmd'); track('order', { type: 'gate' }); return;
  }
  if (eu) { for (const u of list) u.order = { type: 'attack', target: eu }; ping(eu.pos, '#d83a4a'); sfx('cmd'); track('order', { type: 'attack' }); return; }
  const sp = pickSpot(x, y), g = sp ? { x: sp.x, z: sp.z } : groundAt(x, y); if (!g) return;
  if (!sp && !attack && GEOT[cellOf(g.x, g.z)] === 1 && startChop(g.x, g.z, list)) { sfx('cmd'); return; }   // bosque denso: talarlo
  orderTo(list, sp, g, attack, face);
}
// ---------- Táctil ----------
// Con tropas o un edificio seleccionados, tocar el mapa da la orden (mover, atacar, conquistar, asaltar, talar o fijar el punto de reunión);
// tocar una tropa propia o un edificio propio lo selecciona. La pulsación larga elige todas las tropas de ese tipo o avanza atacando
const buzz = ms => { try { navigator.vibrate?.(ms); } catch (e) {} };   // vibración corta al dar una orden (Android)
function touchTap(x, y) {
  const r = touchTap0(x, y); if (r) buzz(12); return r;
}
function touchTap0(x, y) {
  if (S.amode && sel.size) { S.amode = false; command(x, y, true); syncTouch(); return true; }
  if (pickUnit(x, y, 0)) { const own = pickUnit(x, y, 0); if (own.type === 'hero' && sel.size && ![...sel].every(u => u === own || u.leader === own)) { command(x, y); return true; } return false; }
  const sp = pickSpot(x, y), ownBld = sp && sp.side === 0 && sp.kind !== 'town';
  if (S.selBld in RALLY_BLD && !ownBld) { command(x, y); return true; }
  if (sel.size && !ownBld && !(sp && sp.kind === 'town' && sp.owner === 0)) { command(x, y); return true; }
  return false;
}
function longPress(x, y) {
  if (state !== 'play') return; buzz(25);
  const u = pickUnit(x, y, 0);
  if (u) { setSelection(units.filter(o => o.side === 0 && o.vis && o.type === u.type), false); ping(u.pos, '#e8c870'); sfx('select'); return; }
  if (sel.size) { command(x, y, true); const g = groundAt(x, y); if (g) ping(new THREE.Vector3(g.x, surfY(g.x, g.z), g.z), '#d83a4a'); return; }
  const g = groundAt(x, y); if (g) ping(new THREE.Vector3(g.x, surfY(g.x, g.z), g.z), '#f4f4e8');
}
// botones táctiles (solo en pantallas táctiles): selección por área, todo el ejército, avanzar atacando y quitar la selección
export function syncTouch() {
  const b = $('ttools'); if (!b) return;
  b.querySelector('[data-t=box]').classList.toggle('on', !!S.boxMode); b.querySelector('[data-t=amove]').classList.toggle('on', !!S.amode);
  b.querySelector('[data-t=amove]').disabled = !sel.size; b.querySelector('[data-t=none]').disabled = !sel.size && !S.selBld && !S.selSpot;
}
function initTouch() {
  const on = () => { if (S.touch) return; S.touch = true; document.body.classList.add('touch'); syncTouch(); };
  if (window.matchMedia('(pointer: coarse)').matches) on();
  addEventListener('pointerdown', e => { if (e.pointerType === 'touch') on(); }, { capture: true });
  $('ttools').addEventListener('pointerdown', e => { const b = e.target.closest('[data-t]'); if (!b || b.disabled) return; e.preventDefault(); const t = b.dataset.t;
    if (t === 'box') S.boxMode = !S.boxMode;
    else if (t === 'all') { const l = units.filter(u => u.side === 0 && u.type !== 'god'); setSelection(l, false); if (!l.length) sfx('deny'); }
    else if (t === 'amove') { if (sel.size) { S.amode = !S.amode; sfx('select'); } }
    else if (t === 'none') { S.amode = false; S.follow = null; setSelection([], false); }
    syncTouch(); });
  const fs = $('fullBtn'); if (fs) fs.addEventListener('click', () => { const d = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen?.(); else (d.requestFullscreen || d.webkitRequestFullscreen)?.call(d)?.then?.(() => window.screen.orientation?.lock?.('landscape').catch(() => {})).catch?.(() => {}); });
}
// orden desde el minimapa (clic derecho): punto de reunión con el cuartel seleccionado; si no, mover, conquistar o asaltar
export function commandAt(x, z, attack = false) {
  if (state !== 'play') return false;
  if (S.selBld in RALLY_BLD) { setRally({ x, z }); return true; }
  if (!sel.size) return false;
  const list = commandList(); for (const u of list) unassign(u);
  const sp = spots.find(s => (s.kind === 'town' || (s.kind === 'base' && s.side !== 0)) && exploredAt(s.x, s.z) && Math.hypot(s.x - x, s.z - z) < (s.kind === 'base' ? 13 : 7));
  orderTo(list, sp, sp ? { x: sp.x, z: sp.z } : { x, z }, attack); return true;
}
// ---------- Cámara ----------
export const PITCH = .98, camT = new THREE.Vector3(MW / 2, 2, MD / 2);
export function focusOn(x, z, instant) { S.follow = null; S.zoomAnchor = null; if (instant) { camT.x = x; camT.z = z; S.focusGoal = null; } else S.focusGoal = { x, z }; }
export function pan(dx, dz) { S.focusGoal = null; S.follow = null; S.zoomAnchor = null; camT.x = THREE.MathUtils.clamp(camT.x + dx, 0, MW); camT.z = THREE.MathUtils.clamp(camT.z + dz, 0, MD); }
// ---------- Ratón y teclado ----------
export let drag = null, mouse = { x: -1, y: -1, in: false }, lastClick = 0;
const touches = new Map(); let pinch = null;
function touchEnd(e) {
  if (e.pointerType !== 'touch') return false;
  touches.delete(e.pointerId); if (touches.size < 2) pinch = null;
  if (drag?.pinch) { if (!touches.size) drag = null; return true; }
  return false;
}
// zoom hacia el cursor: se fija el punto del suelo bajo el ratón y la cámara se corrige cada fotograma para mantenerlo ahí
export function rayPlane(sx, sy, y) {
  ray.setFromCamera({ x: sx / S.VW * 2 - 1, y: -(sy / S.VH) * 2 + 1 }, camera);
  const o = ray.ray.origin, d = ray.ray.direction; if (d.y > -1e-3) return null;
  const t = (y - o.y) / d.y; return { x: o.x + d.x * t, z: o.z + d.z * t };
}
export const keys = new Set();
export function heroButton() {   // G: va pasando por tus héroes; sin héroes, al altar
  const hs = heroesOf(0), cur = hs.findIndex(u => sel.has(u)), h = hs.length ? hs[(cur + 1) % hs.length] : null;
  if (h) { setSelection([h, ...h.escort], false); S.follow = h; S.focusGoal = null; } else cycleBuilding('altar'); }

// preparación de la página (listeners y elementos del DOM); la llama main.js al arrancar
export function init() {
  initTouch();
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    if (e.button === 0 && S.intro) { S.intro.t = S.intro.dur; return; }   // un clic se salta la presentación
    if (e.button === 0) { const h = arrowHits.find(a => Math.hypot(a.x - e.clientX, a.y - e.clientY) < 24); if (h) { focusOn(h.wx, h.wz); return; } }   // flecha de un ataque fuera de la vista
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: S.camGoal, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; if (drag) drag.pinch = true; return; }
      if (touches.size > 2) return;
      drag = { btn: S.boxMode ? 0 : 'touch', touch: true, x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, shift: false };
      const d0 = drag; d0.lp = setTimeout(() => { if (drag === d0 && !d0.moved && !pinch) { d0.done = true; longPress(d0.x0, d0.y0); } }, 480);   // pulsación larga
      return;
    }
    // clic derecho con tropas seleccionadas: arrastrar dibuja una flecha (adónde van y hacia dónde mirarán) en vez de mover la cámara
    const face = e.button === 2 && state === 'play' && sel.size > 0 && !(S.selBld in RALLY_BLD);
    drag = { btn: e.button, x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, shift: e.shiftKey, face };
  });
  addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.in = e.pointerType === 'mouse'; });
  document.addEventListener('pointerleave', () => { mouse.in = false; });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && touches.size >= 2) {
        const [a, b] = [...touches.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, k = S.camDist * .0019;
        S.camGoal = THREE.MathUtils.clamp(pinch.z0 * pinch.d0 / (Math.hypot(a.x - b.x, a.y - b.y) || 1), 22, 240);
        pan(-(mx - pinch.mx) * k, -(my - pinch.my) * k * 1.5); pinch.mx = mx; pinch.my = my; return;
      }
    }
    if (!drag || drag.pinch) return;
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > (drag.touch ? 12 : 5)) { drag.moved = true; clearTimeout(drag.lp); }
    if (drag.btn !== 0 && drag.moved && !drag.face) { const k = S.camDist * .0019; pan(-(e.clientX - drag.lx) * k, -(e.clientY - drag.ly) * k * 1.5); }
    drag.lx = e.clientX; drag.ly = e.clientY;
  });
  canvas.addEventListener('pointercancel', e => { if (drag) clearTimeout(drag.lp); touchEnd(e); if (!touches.size) drag = null; });
  canvas.addEventListener('pointerup', e => {
    if (drag) clearTimeout(drag.lp);
    if (touchEnd(e) || !drag) return; const d = drag; drag = null;
    if (state !== 'play' || d.done) return;
    if (d.touch && d.btn === 0 && d.moved) { S.boxMode = false; syncTouch(); }   // la selección por área se usa una vez
    if (d.btn === 'touch') { if (d.moved) return; if (touchTap(e.clientX, e.clientY)) return; d.btn = 0; }   // toque corto: orden o clic
    if (S.amode && !d.moved && (d.btn === 0 || d.btn === 2)) { S.amode = false; command(e.clientX, e.clientY, true); return; }
    if (d.btn === 0) {
      if (d.moved) {
        const x0 = Math.min(d.x0, e.clientX), x1 = Math.max(d.x0, e.clientX), y0 = Math.min(d.y0, e.clientY), y1 = Math.max(d.y0, e.clientY);
        S.follow = null;
        setSelection(units.filter(u => u.side === 0 && u.vis && u.sx >= x0 && u.sx <= x1 && u.sy >= y0 && u.sy <= y1), d.shift);
      } else {
        const u = pickUnit(e.clientX, e.clientY, 0), now = performance.now();
        if (u && now - lastClick < 350 && sel.has(u)) setSelection(units.filter(o => o.side === 0 && o.vis && o.type === u.type), d.shift);
        else if (u) { if (d.shift && sel.has(u)) { sel.delete(u); updateCtx(); } else { setSelection([u], d.shift); if (!d.shift) { S.follow = u; S.focusGoal = null; } } }
        else {
          S.follow = null; const sp = pickSpot(e.clientX, e.clientY);
          if (sp && sp.side === 0 && (sp.kind === 'barracks' || sp.kind === 'altar' || sp.kind === 'temple')) { selectBuilding(sp.kind, sp.civ); sfx('select'); }
          else if (sp && (sp.kind === 'town' || sp.kind === 'base' || sp.kind === 'bridge')) { selectSpot(sp); sfx('select'); }
          else { S.selBld = null; setSelection([], d.shift); }
        }
        lastClick = now;
      }
    } else if (d.btn === 2 && !d.moved) command(e.clientX, e.clientY);
    else if (d.btn === 2 && d.face) faceCommand(d, e.clientX, e.clientY);
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    S.camGoal = THREE.MathUtils.clamp(S.camGoal * Math.exp(e.deltaY * .0011), 22, 240);
    if (S.follow) return;   // siguiendo a una unidad, el zoom se centra en ella
    const g = groundAt(e.clientX, e.clientY) || groundAt(e.clientX, e.clientY, true); if (!g) { S.zoomAnchor = null; return; }
    S.focusGoal = null; S.zoomAnchor = { sx: e.clientX, sy: e.clientY, x: g.x, z: g.z, y: HM ? surfY(g.x, g.z) : 2 };
  }, { passive: false });
  addEventListener('keydown', e => {
    if (e.target.closest?.('button') && (e.key === ' ' || e.key === 'Enter')) return;
    const k = e.key.toLowerCase(); keys.add(k);
    if (state !== 'play') return;
    if (S.intro) { S.intro.t = S.intro.dur; keys.delete(k); return; }   // una tecla se salta la presentación
    if (S.menuOpen) { if (k === 'escape') closeMenu(); return; }   // con el menú abierto, el juego no recibe teclas
    const dg = /^Digit[1-9]$/.test(e.code) ? +e.code[5] : 0;
    if (/^f[1-5]$/.test(k)) { e.preventDefault(); pickGroup(+k[1] - 1); }
    else if (dg && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveGroup(dg); }   // CTRL + número: guarda la selección como grupo
    else if (dg && S.selBld === 'barracks') { if (dg <= 3) enqueue(0, TYPES[dg - 1], curCity()); else if (dg <= 5) enqueue(0, SIEGE[dg - 4], curCity()); }   // números: lo que produce el edificio seleccionado
    else if (dg === 1 && S.selBld === 'altar') summonHero(0, curCity());
    else if (dg === 1 && S.selBld === 'temple') { if (sideState[0].ritual.state === 'none') startRitual(0, curCity()); else summonGod(0); }
    else if (dg && !S.selBld) selectGroup(dg);   // sin edificio seleccionado: los grupos guardados
    else if (k === 'q') cycleBuilding('barracks');
    else if (k === 'w') cycleBuilding('altar');
    else if (k === 'e') cycleBuilding('temple');
    else if (k === 'g') heroButton();
    else if (k === 'h') { const b = spots[homeOf(0)]; focusOn(b.x, b.z); selectSpot(b); }   // tu fortaleza: muralla y puertas
    else if (k === 'p') { S.paused = !S.paused; syncTools(); }
    else if (k === 'v') { S.speed = S.speed === 1 ? 2 : 1; syncTools(); }
    else if (k === ' ') { e.preventDefault(); const ev = alarm.ev && (!alarm.pos || alarm.ev.at > (alarm.at || 0)) ? alarm.ev : alarm.pos; if (ev) focusOn(ev.x, ev.z); }   // ESPACIO: el último ataque o el último cambio del escenario
    else if (k === 'n') toggleFog();
    else if (k === 'escape') {   // por orden: cancela ataque-mover, quita la selección y, si no hay nada, abre el menú
      if (S.amode) S.amode = false;
      else if (sel.size || S.selBld || S.selSpot) { S.follow = null; setSelection([], false); }
      else openMenu();
    }
    else if (k === 'a' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setSelection(units.filter(u => u.side === 0), false); }
    else if (k === 'a') { if (sel.size) { S.amode = !S.amode; sfx('select'); } }   // ataque-mover
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => { keys.clear(); mouse.in = false; });
  $('go').addEventListener('click', () => { sfx('ui'); if (S.menuDirty) { S.pendingStart = true; newGame(S.codeSeed ?? seed); } else startGame(); });
}
