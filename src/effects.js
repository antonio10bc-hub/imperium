// Efectos: partículas, textos flotantes y señales.
import * as THREE from 'three';
import { fogOn, visibleAt } from './fog.js';
import { BOX, mat, world } from './render.js';
import { floats, pings, puffs } from './units.js';

// ---------- Efectos ----------
const UP = new THREE.Vector3(0, 1, 0);
// partículas y flechas salen de un pool de cajas: se reutilizan en vez de crear y tirar una malla por cada una
const boxPool = [];
export function takeBox(color) { const m = boxPool.pop() || new THREE.Mesh(BOX); m.material = mat(color); m.visible = true; m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1); world.add(m); return m; }
export function dropBox(m) { world.remove(m); boxPool.push(m); }
export function burst(loc, colors, n, speed, up, life = .6, size = .22) {
  if (!seenAt(loc)) return;
  for (let k = 0; k < n; k++) {
    const m = takeBox(colors[k % colors.length]); m.scale.setScalar(size); m.position.copy(loc).y += .6; puffs.push({ m, v: new THREE.Vector3().randomDirection().multiplyScalar(speed).addScaledVector(UP, up), t: life, life, s: size });
  }
}
// lo que pasa en la niebla no se ve: textos, señales, partículas y flechas
export const seenAt = p => !fogOn || visibleAt(p.x, p.z);
export const floatText = (loc, text, color, size = 10) => { if (seenAt(loc)) floats.push({ local: loc.clone(), text, color, t: 0, size }); };
export const ping = (loc, color) => { if (seenAt(loc)) pings.push({ local: loc.clone(), color, t: 0 }); };
