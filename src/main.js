// Punto de entrada: bucle principal y arranque.
import * as THREE from 'three';
import { layout, orderMove } from './behavior.js';
import { setOwner } from './buildings.js';
import { alarm, assign, corpses, promote } from './combat.js';
import { CFG, MD, MW } from './config.js';
import { dropBox } from './effects.js';
import { updateFog } from './fog.js';
import { enqueue, fields, heroOf, newGame, state, summonHero, updateGame, upgradeTown } from './game.js';
import { selectSpot, setSelection, updateHud } from './hud.js';
import { PITCH, camT, command, drag, focusOn, keys, mouse, pan, rayPlane } from './input.js';
import { HM, spots, surfY, wallHit } from './map.js';
import { drawMinimap } from './minimap.js';
import { walk } from './nav.js';
import { _h, applyRes, drawOverlay } from './overlay.js';
import { camera, fogU, gl, postCam, postScene, scene, target, world } from './render.js';
import { S } from './state.js';
import { makeThumbs, puffs, sel, sideState, spawnAt, units } from './units.js';
import { init as init_minimap } from './minimap.js';
import { init as init_fog } from './fog.js';
import { init as init_hud } from './hud.js';
import { init as init_input } from './input.js';
import { init as init_menu } from './menu.js';
import { init as init_overlay } from './overlay.js';

// ---------- Bucle ----------
let prev = performance.now(), hudT = 0, miniT = 0, fogT = 0;
function frame(now) {
  const dt = Math.min(.05, (now - prev) / 1000); prev = now;
  S.camDist += (S.camGoal - S.camDist) * Math.min(1, dt * 8);
  // desplazamiento: WASD / flechas / borde de pantalla
  let kx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  let kz = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
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
  if (state === 'play' && !S.paused) { for (let i = 0; i < S.speed; i++) if (state === 'play') updateGame(dt); if ((hudT -= dt) <= 0) { hudT = .1; updateHud(); } }
  const live = state !== 'play' || !S.paused;
  if (live) {
    for (const s of spots) if (s.shake > 0) { s.shake -= dt; s.group.position.copy(s.base).add(_h.set(Math.random() - .5, 0, Math.random() - .5).multiplyScalar(s.shake * 1.5)); if (s.shake <= 0) s.group.position.copy(s.base); }
    for (let i = corpses.length - 1; i >= 0; i--) {
      const c = corpses[i]; c.t += dt; const k = Math.min(1, c.t / .35);
      c.body.rotation.x = -k * k * Math.PI / 2 * .95; c.body.rotation.z = c.side * k * .25; c.body.position.y = Math.sin(k * Math.PI) * .25;
      if (c.t > 8) c.g.position.y -= dt * .45;
      if (c.t > 10.5) { world.remove(c.g); corpses.splice(i, 1); }
    }
    for (let i = puffs.length - 1; i >= 0; i--) { const p = puffs[i]; p.t -= dt; p.v.y -= 9 * dt; p.m.position.addScaledVector(p.v, dt); p.m.scale.setScalar(Math.max(.01, p.s * p.t / p.life)); if (p.t <= 0) { dropBox(p.m); puffs.splice(i, 1); } }
  }
  for (const s of spots) if (s.anim > 0 && s.group) {   // conquista: el pueblo da un bote y la bandera sube por el mástil
    s.anim = Math.max(0, s.anim - dt); const k = s.anim / 1.4, t = 1.4 - s.anim;
    s.group.scale.set(1 + Math.sin(t * 12) * .06 * k, 1 + Math.sin(t * 12) * .16 * k, 1 + Math.sin(t * 12) * .06 * k);
  }
  for (const s of spots) for (const f of s.flags || []) { f.y0 ??= f.m.position.y; f.m.position.y = f.y0 - (s.anim > 0 ? (s.anim / 1.4) * 1.6 : 0); const k = .8 + .2 * (.5 + .5 * Math.sin(now / 160 + f.ph)); f.m.scale.x = f.w * k; f.m.position.x = f.px + f.dir * f.w * k / 2; f.m.rotation.y = Math.sin(now / 230 + f.ph) * .18; }
  if (alarm.t > 0) alarm.t -= dt;
  if (state === 'play' && (fogT -= dt) <= 0) { fogT = .2; updateFog(); }
  fogU.uTime.value = now / 1000;
  gl.setRenderTarget(target); gl.render(scene, camera); gl.setRenderTarget(null); gl.render(postScene, postCam);
  drawOverlay(live ? dt : 0);
  if ((miniT -= dt) <= 0) { miniT = .15; drawMinimap(); }
  requestAnimationFrame(frame);
}
init_minimap(); init_fog(); init_hud(); init_input(); init_menu(); init_overlay();
window.__game = { gl, units, get spots() { return spots; }, sideState, enqueue, summonHero, assign, heroOf, sel, command, setSelection, setOwner, get state() { return state; },
  step(n) { for (let i = 0; i < n && state === 'play'; i++) updateGame(.05); }, cam(x, z, d) { focusOn(x, z, true); if (d) S.camGoal = S.camDist = d; }, orderMove, upgradeTown, selectSpot, layout, get corpses() { return corpses; }, spawnAt, dbg: () => ({ fields, walk, HM, MW, wallHit, promote }) };
makeThumbs();
newGame(1 + Math.floor(Math.random() * 99999));
requestAnimationFrame(frame);
