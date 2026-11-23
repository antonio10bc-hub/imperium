// Proyección, selección, órdenes del jugador, cámara, ratón y teclado.
import * as THREE from 'three';
import { sfx } from './audio.js';
import { orderMove } from './behavior.js';
import { spotPos } from './buildings.js';
import { alarm, assign, unassign } from './combat.js';
import { ALT0, BARR0, BASE0, BASE1, GAME, MD, MW, TEMP0, TYPES } from './config.js';
import { ping } from './effects.js';
import { exploredAt, toggleFog } from './fog.js';
import { enqueue, heroesOf, newGame, startGame, state, toast } from './game.js';
import { closeMenu, openMenu, pickGroup, selectBuilding, selectSpot, setSelection, syncTools, updateCtx } from './hud.js';
import { GEOT, HM, cellOf, spots, surfY } from './map.js';
import { seed } from './noise.js';
import { camera, canvas, part, world } from './render.js';
import { $, S, track } from './state.js';
import { sel, units } from './units.js';
import { R, startChop } from './rules.js';

// ---------- Proyección y selección ----------
const _p = new THREE.Vector3();
export function project(loc, out = {}) {
  _p.copy(loc).project(camera); out.x = (_p.x * .5 + .5) * S.VW; out.y = (-_p.y * .5 + .5) * S.VH;
  out.vis = _p.z < 1 && out.x > -40 && out.x < S.VW + 40 && out.y > -40 && out.y < S.VH + 40; return out;
}
export function pickUnit(x, y, side) {
  let best = null, bd = 22;
  for (const u of units) if (u.side === side && u.vis) { const d = Math.hypot(u.sx - x, u.sy - y) * (u.type === 'hero' ? .6 : 1); if (d < bd) { bd = d; best = u; } }
  return best;
}
export const pickEnemy = (x, y) => pickUnit(x, y, 1) || pickUnit(x, y, 2);
export function pickSpot(x, y) {
  let best = null, bd = 1e9;
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
  const k = S.selBld; S.rally[k] = g;
  let f = S.rallyFlag[k];
  if (!f) { f = S.rallyFlag[k] = new THREE.Group(); part(f, .1, 2, .1, 0x8a5a34, 0, 1, 0); part(f, .8, .5, .08, 0x2f7bff, .45, 1.7, 0); part(f, .3, .3, .1, parseInt(RALLY_BLD[k].slice(1), 16), .45, 1.7, .06, false); world.add(f); }
  f.position.set(g.x, surfY(g.x, g.z), g.z);
  ping(f.position, '#3a6ad8'); sfx('cmd'); toast(`PUNTO DE REUNIÓN ${{ barracks: 'DEL CUARTEL', altar: 'DE LOS HÉROES', temple: 'DEL DIOS' }[k]} FIJADO`);
}
// orden sobre la fortaleza rival (asalto), un pueblo ajeno (conquista) o un punto del suelo (mover); la usan el mapa y el minimapa
function orderTo(list, sp, g, attack) {
  if (sp && sp.side === 1) { for (const u of list) u.order = { type: 'siege' }; ping(spotPos(spots[BASE1]), '#d83a4a'); sfx('cmd'); toast('¡AL ASALTO DE LA FORTALEZA!'); track('order', { type: 'siege' }); return; }
  if (sp && sp.kind === 'bridge' && sp.built) { for (const u of list) u.order = { type: 'demolish', b: sp }; ping(new THREE.Vector3(sp.x, sp.hb, sp.z), '#d83a4a'); sfx('cmd'); toast('¡A DERRIBAR EL PUENTE!'); return; }   // derribar un puente
  if (sp && sp.kind === 'town' && sp.owner !== 0) { const k = spots.indexOf(sp); for (const u of list) u.order = { type: 'capture', k }; ping(spotPos(sp), '#e8c870'); sfx('cmd'); track('order', { type: 'capture' }); return; }
  orderMove(list, g.x, g.z, true, attack); sfx('cmd'); track('order', { type: attack ? 'amove' : 'move' });
}
const commandList = () => [...sel].filter(u => !(u.leader && sel.has(u.leader)));   // la escolta de un héroe seleccionado sigue en formación
export function command(x, y, attack = false) {
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
  const eu = pickEnemy(x, y);
  if (eu) { for (const u of list) u.order = { type: 'attack', target: eu }; ping(eu.pos, '#d83a4a'); sfx('cmd'); track('order', { type: 'attack' }); return; }
  const sp = pickSpot(x, y), g = sp ? { x: sp.x, z: sp.z } : groundAt(x, y); if (!g) return;
  if (!sp && !attack && GEOT[cellOf(g.x, g.z)] === 1 && startChop(g.x, g.z, list)) { sfx('cmd'); return; }   // bosque denso: talarlo
  orderTo(list, sp, g, attack);
}
// orden desde el minimapa (clic derecho): punto de reunión con el cuartel seleccionado; si no, mover, conquistar o asaltar
export function commandAt(x, z, attack = false) {
  if (state !== 'play') return false;
  if (S.selBld in RALLY_BLD) { setRally({ x, z }); return true; }
  if (!sel.size) return false;
  const list = commandList(); for (const u of list) unassign(u);
  const sp = spots.find(s => (s.kind === 'town' || (s.kind === 'base' && s.side === 1)) && exploredAt(s.x, s.z) && Math.hypot(s.x - x, s.z - z) < (s.kind === 'base' ? 10 : 7));
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
  if (h) { setSelection([h, ...h.escort], false); S.follow = h; S.focusGoal = null; } else { selectBuilding('altar'); focusOn(spots[ALT0].x, spots[ALT0].z); } }

// preparación de la página (listeners y elementos del DOM); la llama main.js al arrancar
export function init() {
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: S.camGoal, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; if (drag) drag.pinch = true; return; }
      if (touches.size > 2) return;
      drag = { btn: 'touch', x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, shift: false }; return;
    }
    drag = { btn: e.button, x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, shift: e.shiftKey };
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
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 5) drag.moved = true;
    if (drag.btn !== 0 && drag.moved) { const k = S.camDist * .0019; pan(-(e.clientX - drag.lx) * k, -(e.clientY - drag.ly) * k * 1.5); }
    drag.lx = e.clientX; drag.ly = e.clientY;
  });
  canvas.addEventListener('pointercancel', e => { touchEnd(e); if (!touches.size) drag = null; });
  canvas.addEventListener('pointerup', e => {
    if (touchEnd(e) || !drag) return; const d = drag; drag = null;
    if (state !== 'play') return;
    if (d.btn === 'touch') { if (d.moved) return; d.btn = 0; }   // toque corto = clic
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
          if (sp && sp.side === 0 && (sp.kind === 'barracks' || sp.kind === 'altar' || sp.kind === 'temple')) { selectBuilding(sp.kind); sfx('select'); }
          else if (sp && sp.side === 0) { selectBuilding('barracks'); sfx('select'); }
          else if (sp && (sp.kind === 'town' || sp.kind === 'base' || sp.kind === 'bridge')) { selectSpot(sp); sfx('select'); }
          else { S.selBld = null; setSelection([], d.shift); }
        }
        lastClick = now;
      }
    } else if (d.btn === 2 && !d.moved) command(e.clientX, e.clientY);
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
    if (S.menuOpen) { if (k === 'escape') closeMenu(); return; }   // con el menú abierto, el juego no recibe teclas
    if (/^f[1-5]$/.test(k)) { e.preventDefault(); pickGroup(+k[1] - 1); }
    else if (k === '1' || k === '2' || k === '3') enqueue(0, TYPES[+k - 1]);
    else if (k === 'b') { selectBuilding('barracks'); focusOn(spots[BARR0].x, spots[BARR0].z); }
    else if (k === 'g') heroButton();
    else if (k === 't') { selectBuilding('temple'); focusOn(spots[TEMP0].x, spots[TEMP0].z); }
    else if (k === 'h') focusOn(spots[BASE0].x, spots[BASE0].z);
    else if (k === 'p') { S.paused = !S.paused; syncTools(); }
    else if (k === 'v') { S.speed = S.speed === 1 ? 2 : 1; syncTools(); }
    else if (k === ' ') { e.preventDefault(); if (alarm.pos) focusOn(alarm.pos.x, alarm.pos.z); }
    else if (k === 'n') toggleFog();
    else if (k === 'e') { if (sel.size) { S.amode = !S.amode; sfx('select'); } }
    else if (k === 'escape') {   // por orden: cancela ataque-mover, quita la selección y, si no hay nada, abre el menú
      if (S.amode) S.amode = false;
      else if (sel.size || S.selBld || S.selSpot) { S.follow = null; setSelection([], false); }
      else openMenu();
    }
    else if (k === 'a' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setSelection(units.filter(u => u.side === 0), false); }
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => { keys.clear(); mouse.in = false; });
  $('go').addEventListener('click', () => { sfx('select'); if (S.menuDirty) { S.pendingStart = true; newGame(S.codeSeed ?? seed); } else startGame(); });
}
