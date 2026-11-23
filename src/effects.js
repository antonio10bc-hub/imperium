// Efectos: partículas, textos flotantes y señales.
import * as THREE from 'three';
import { fogOn, visibleAt } from './fog.js';
import { BOX, mat, world } from './render.js';
import { floats, pings, puffs } from './units.js';

// ---------- Efectos ----------
const UP = new THREE.Vector3(0, 1, 0);
// azar propio de los efectos de ambiente: no consume Math.random, que usa la simulación
let fxSeed = 1;
export const fxRand = () => (fxSeed = (fxSeed * 16807) % 2147483647) / 2147483647;
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
// humo o fuego que sube: g < 0 es empuje hacia arriba (las chispas de burst caen con g = 9) y grow hace que la bocanada crezca antes de deshacerse
export function plume(loc, color, size, life, up = 1.2, g = -.6) {
  if (!seenAt(loc)) return;
  const m = takeBox(color); m.scale.setScalar(size * .5); m.position.copy(loc);
  puffs.push({ m, v: new THREE.Vector3((fxRand() - .5) * .5, up, (fxRand() - .5) * .5), t: life, life, s: size, g, grow: true });
}
// destello que vuela de un punto a otro (la curación del dios hacia cada tropa)
export function streak(from, to, color, life = .45, size = .2) {
  if (!seenAt(from) && !seenAt(to)) return;
  const m = takeBox(color); m.scale.setScalar(size); m.position.copy(from);
  puffs.push({ m, v: new THREE.Vector3().subVectors(to, from).divideScalar(life), t: life, life, s: size, g: 0 });
}
// lo que pasa en la niebla no se ve: textos, señales, partículas y flechas
export const seenAt = p => !fogOn || visibleAt(p.x, p.z);
export const floatText = (loc, text, color, size = 10) => { if (seenAt(loc)) floats.push({ local: loc.clone(), text, color, t: 0, size }); };
export const ping = (loc, color) => { if (seenAt(loc)) pings.push({ local: loc.clone(), color, t: 0 }); };
