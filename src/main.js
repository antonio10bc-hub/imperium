// Punto de entrada: bucle principal y arranque.
import * as THREE from 'three';
import { layout, orderMove } from './behavior.js';
import { damageFx, setOwner, templeFx } from './buildings.js';
import { alarm, assign, corpses, gateLook, promote } from './combat.js';
import { CFG, MD, MW } from './config.js';
import { dropBox } from './effects.js';
import { updateFog } from './fog.js';
import { endIntro, enqueue, fields, heroOf, newGame, state, summonHero, updateGame, upgradeTown } from './game.js';
import { selectSpot, setSelection, updateHud } from './hud.js';
import { PITCH, camT, command, drag, focusOn, keys, mouse, pan, pickGate, rayPlane } from './input.js';
import { GEOT, HM, gateList, geoR, parseCode, roadCell, scen, spots, surfY, wallHit } from './map.js';
import { drawMinimap } from './minimap.js';
import { walk } from './nav.js';
import { _h, applyRes, drawOverlay } from './overlay.js';
import { camera, fogU, gl, postCam, postScene, scene, setFade, target, world } from './render.js';
import { S } from './state.js';
import { makeAI } from './ai.js';
import { ev, triggerEvent } from './events.js';
import { makeThumbs, puffs, sel, sideState, spawnAt, units } from './units.js';
import { init as init_minimap } from './minimap.js';
import { init as init_fog } from './fog.js';
import { init as init_hud } from './hud.js';
import { init as init_input } from './input.js';
import { init as init_menu, setPlayersPick, setSize } from './menu.js';
import { init as init_overlay } from './overlay.js';
import { R, breakBridge, buildBridge, rulesFrame, startChop } from './rules.js';
import { WEA, ambientInfo, updateLife } from './ambient.js';
import { STATS } from './stats.js';
import { civOf } from './civs.js';

// ---------- Bucle ----------
let prev = performance.now(), hudT = 0, miniT = 0, fogT = 0;
// el bucle nunca se detiene: si algo falla en un fotograma se anota y el juego sigue (antes un error congelaba la partida)
let lastErr = '';
// los errores se guardan en el navegador (localStorage «imperium-errors», los 8 últimos) para poder revisarlos después
function logError(e) {
  console.error(e); const t = String(e && e.stack || e).slice(0, 600); window.__errors = (window.__errors || []).concat(t);
  try { const l = JSON.parse(localStorage.getItem('imperium-errors') || '[]'); l.push(new Date().toISOString() + ' ' + t); localStorage.setItem('imperium-errors', JSON.stringify(l.slice(-8))); } catch (x) {}
}
addEventListener('error', ev => logError(ev.error || ev.message)); addEventListener('unhandledrejection', ev => logError(ev.reason));
function frame(now) {
  requestAnimationFrame(frame);
  try { frameBody(now); } catch (e) {
    const m = String(e && e.message || e); if (m !== lastErr) { lastErr = m; logError(e); }
  }
}
let lastState = '';
function frameBody(now) {
  if (state !== lastState) { lastState = state; document.body.classList.toggle('inmenu', state !== 'play'); }   // en el menú se puede usar el móvil en vertical
  const dt = Math.min(.05, (now - prev) / 1000); prev = now;
  S.camDist += (S.camGoal - S.camDist) * Math.min(1, dt * 8);
  // desplazamiento: flechas / borde de pantalla (Q, W, E y A son atajos)
  let kx = (keys.has('arrowright') ? 1 : 0) - (keys.has('arrowleft') ? 1 : 0);
  let kz = (keys.has('arrowdown') ? 1 : 0) - (keys.has('arrowup') ? 1 : 0);
  if (mouse.in && !drag && state === 'play') { const E = 8; if (mouse.x < E) kx = -1; else if (mouse.x > S.VW - E) kx = 1; if (mouse.y < E) kz = -1; else if (mouse.y > S.VH - E) kz = 1; }
  if ((kx || kz) && !keys.has('control') && !keys.has('meta')) pan(kx * S.camDist * .9 * dt, kz * S.camDist * .9 * dt);
  if (S.follow && (S.follow.dead || !sel.has(S.follow))) S.follow = null;
  if (S.follow) { camT.x += (S.follow.pos.x - camT.x) * Math.min(1, dt * 6); camT.z += (S.follow.pos.z - camT.z) * Math.min(1, dt * 6); }
  else if (S.focusGoal) { camT.x += (S.focusGoal.x - camT.x) * Math.min(1, dt * 6); camT.z += (S.focusGoal.z - camT.z) * Math.min(1, dt * 6); if (Math.hypot(S.focusGoal.x - camT.x, S.focusGoal.z - camT.z) < .05) S.focusGoal = null; }
  if (HM) camT.y += (surfY(camT.x, camT.z) + 1 - camT.y) * Math.min(1, dt * 3);
  camera.position.set(camT.x, camT.y + S.camDist * Math.sin(PITCH), camT.z + S.camDist * Math.cos(PITCH)); camera.lookAt(camT); camera.updateMatrixWorld();
  if (S.zoomAnchor) {
    const a = S.zoomAnchor, p = rayPlane(a.sx, a.sy, a.y);
    if (p) {
      camT.x = THREE.MathUtils.clamp(camT.x + a.x - p.x, 0, MW); camT.z = THREE.MathUtils.clamp(camT.z + a.z - p.z, 0, MD);
      camera.position.set(camT.x, camT.y + S.camDist * Math.sin(PITCH), camT.z + S.camDist * Math.cos(PITCH)); camera.lookAt(camT); camera.updateMatrixWorld();
    }
    if (Math.abs(S.camGoal - S.camDist) < S.camDist * .002) S.zoomAnchor = null;
  }
  scene.fog.near = S.camDist * 1.4; scene.fog.far = S.camDist * 3.6;
  applyRes(CFG.lines);
  if (S.intro) {   // presentación: la cámara desciende desde muy alto sobre tu ciudad (la partida espera)
    const I = S.intro; I.t += dt; const k = Math.min(1, I.t / I.dur), e = 1 - Math.pow(1 - k, 3);   // frena al llegar
    camT.x = I.a.x + (I.b.x - I.a.x) * e; camT.z = I.a.z + (I.b.z - I.a.z) * e; S.camGoal = S.camDist = I.a.d + (I.b.d - I.a.d) * e; S.focusGoal = null;
    if (k >= 1 || state !== 'play') endIntro();
  }
  if ((S.fade ?? 1) < 1) { S.fade = Math.min(1, S.fade + dt * 1.6); setFade(S.fade); }
  if (state === 'play' && !S.paused && !S.intro) for (let i = 0; i < S.speed; i++) if (state === 'play') updateGame(dt);
  if (state === 'play' && !S.paused && (hudT -= dt) <= 0) { hudT = .1; updateHud(); }
  const live = state !== 'play' || !S.paused;
  if (live) {
    damageFx(dt); templeFx(dt, now); updateLife(dt); rulesFrame(dt);
    for (const g of gateList) if (g.shake > 0) { g.shake -= dt; for (const d of g.doors) { d.userData.p0 ??= d.position.clone(); if (g.shake > 0) d.position.set(d.userData.p0.x + (Math.random() - .5) * g.shake * .8, d.position.y, d.userData.p0.z + (Math.random() - .5) * g.shake * .8); else d.position.x = d.userData.p0.x, d.position.z = d.userData.p0.z; } }   // la puerta tiembla con cada golpe
    for (const s of spots) if (s.shake > 0) { s.shake -= dt; s.group.position.copy(s.base).add(_h.set(Math.random() - .5, 0, Math.random() - .5).multiplyScalar(s.shake * 1.5)); if (s.shake <= 0) s.group.position.copy(s.base); }
    for (let i = corpses.length - 1; i >= 0; i--) {
      const c = corpses[i]; c.t += dt; const k = Math.min(1, c.t / .35);
      c.body.rotation.x = -k * k * Math.PI / 2 * .95; c.body.rotation.z = c.side * k * .25; c.body.position.y = Math.sin(k * Math.PI) * .25;
      if (c.t > 8) c.g.position.y -= dt * .45;
      if (c.t > 10.5) { world.remove(c.g); corpses.splice(i, 1); }
    }
    for (let i = puffs.length - 1; i >= 0; i--) { const p = puffs[i], k = p.t / p.life; p.t -= dt; p.v.y -= (p.g ?? 9) * dt; p.m.position.addScaledVector(p.v, dt); p.m.scale.setScalar(Math.max(.01, p.grow ? p.s * (.5 + (1 - k) * .8) * Math.min(1, k * 3) : p.s * k)); if (p.t <= 0) { dropBox(p.m); puffs.splice(i, 1); } }
  }
  for (const s of spots) if (s.anim > 0 && s.group) {   // conquista: el pueblo da un bote y la bandera sube por el mástil
    s.anim = Math.max(0, s.anim - dt); const k = s.anim / 1.4, t = 1.4 - s.anim;
    const b = s.gsc || 1; s.group.scale.set(b * (1 + Math.sin(t * 12) * .06 * k), b * (1 + Math.sin(t * 12) * .16 * k), b * (1 + Math.sin(t * 12) * .06 * k));   // relativo a su escala: la ciudadela no encoge
  }
  for (const s of spots) for (const f of s.flags || []) { f.y0 ??= f.m.position.y; f.m.position.y = f.y0 - (s.anim > 0 ? (s.anim / 1.4) * 1.6 : 0); const k = .8 + .2 * (.5 + .5 * Math.sin(now / 160 + f.ph)); f.m.scale.x = f.w * k; f.m.position.x = f.px + f.dir * f.w * k / 2; f.m.rotation.y = Math.sin(now / 230 + f.ph) * .18; }
  if (alarm.t > 0) alarm.t -= dt;
  if (state === 'play' && (fogT -= dt) <= 0) { fogT = .2; updateFog(); }
  fogU.uTime.value = now / 1000;
  gl.setRenderTarget(target); gl.render(scene, camera); gl.setRenderTarget(null); gl.render(postScene, postCam);
  drawOverlay(live ? dt : 0);
  if ((miniT -= dt) <= 0) { miniT = .15; drawMinimap(); }
}
init_minimap(); init_fog(); init_hud(); init_input(); init_menu(); init_overlay();
// pruebas: imagen del mapa entero visto desde arriba (sin niebla del cielo); devuelve un dataURL PNG
function mapShot(w = 1536) {
  const h = Math.round(w * MD / MW), rt = new THREE.WebGLRenderTarget(w, h), cam = new THREE.OrthographicCamera(-MW / 2, MW / 2, MD / 2, -MD / 2, 1, 1000);
  cam.position.set(MW / 2, 400, MD / 2 + 160); cam.lookAt(MW / 2, 0, MD / 2); cam.zoom = 1; cam.top = MD / 2 * .93; cam.bottom = -MD / 2 * .93; cam.updateProjectionMatrix();
  const f = scene.fog; scene.fog = null; gl.setRenderTarget(rt); gl.render(scene, cam); gl.setRenderTarget(null); scene.fog = f;
  const px = new Uint8Array(w * h * 4); gl.readRenderTargetPixels(rt, 0, 0, w, h, px); rt.dispose();
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'), im = x.createImageData(w, h);
  for (let j = 0; j < h; j++) im.data.set(px.subarray((h - 1 - j) * w * 4, (h - j) * w * 4), j * w * 4);
  x.putImageData(im, 0, 0); return c.toDataURL('image/png');
}
window.__game = { mapShot, WEATHER: WEA, ambientInfo, S, gl, units, triggerEvent, ev, R, buildBridge, breakBridge, startChop, get scen() { return scen; },
  // pruebas: pone un cerebro de IA en un bando (diff: dificultad base; over: ajustes que la sobrescriben) o se lo quita con diff = null
  setAI(sd, diff, brain, over) { sideState[sd].ai = diff ? makeAI(sd, diff, brain, over?.persona) : null; if (over && sideState[sd].ai) { const A = sideState[sd].ai; A.Df = { ...A.Df, ...over }; if (over.inc != null) A.inc = over.inc; } }, get spots() { return spots; }, sideState, enqueue, summonHero, assign, heroOf, sel, command, setSelection, setOwner, get state() { return state; },
  step(n) { for (let i = 0; i < n && state === 'play'; i++) updateGame(.05); }, cam(x, z, d) { focusOn(x, z, true); if (d) S.camGoal = S.camDist = d; }, orderMove, upgradeTown, selectSpot, layout, get corpses() { return corpses; }, get stats() { return STATS; }, civs: () => [0, 1].map(sd => civOf(sd).id), spawnAt, dbg: () => ({ geoR, world, roadCell, fields, walk, HM, GEOT, MW, wallHit, promote, gateList, pickGate, gateLook, THREE }) };
makeThumbs();
// ?mapa=RIO-48213 en la dirección abre ese mapa
{ let c = null; try { c = parseCode(new URLSearchParams(location.search).get('mapa')); } catch (e) {}
  if (c) { S.wantScen = c.geo; S.codeSeed = c.seed; setSize(c.size, true); setPlayersPick(c.players, true); document.getElementById('mapCode').value = c.geo.toUpperCase() + '-' + c.seed; document.getElementById('mapCode').className = 'ok'; }
  newGame(c ? c.seed : 1 + Math.floor(Math.random() * 99999)); }
requestAnimationFrame(frame);
