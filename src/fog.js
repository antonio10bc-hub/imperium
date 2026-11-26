// Niebla de guerra.
import * as THREE from 'three';
import { sfx } from './audio.js';
import { decos, refreshKnownTowns } from './buildings.js';
import { GAME, MD, MW } from './config.js';
import { toast } from './game.js';
import { geoR, spots } from './map.js';
import { markMiniDirty } from './minimap.js';
import { fogU } from './render.js';
import { units } from './units.js';
import { visionBonus } from './rules.js';
import { weatherVis } from './ambient.js';
import { R } from './rules.js';

// ---------- Niebla de guerra ----------
// resolución completa (una celda por casilla), borde de visión en degradado y desenfoque: 255 = a la vista, 120 = explorado, 0 = sin explorar
export let FW = 0, FH = 0, fogData = null, seen = null, explored = null;
let visF = null, expF = null, fogTgt = null, fogB = null, fogTex = null;
// la niebla tiene una celda por casilla: al cambiar el tamaño del mapa se rehacen sus búferes y su textura
export function ensureFogSize() {
  if (FW === MW && FH === MD) return;
  FW = MW; FH = MD; const n = FW * FH;
  fogData = new Uint8Array(n).fill(255); seen = new Uint8Array(n); explored = new Uint8Array(n);
  visF = new Float32Array(n); expF = new Float32Array(n); fogTgt = new Float32Array(n); fogB = new Float32Array(n);
  fogTex?.dispose(); fogTex = new THREE.DataTexture(fogData, FW, FH, THREE.RedFormat); fogTex.magFilter = fogTex.minFilter = THREE.LinearFilter; fogTex.needsUpdate = true; fogU.uFog.value = fogTex;
}
const VISION = { sword: 10, bow: 13, horse: 15, harcher: 15, hero: 14, titan: 10, god: 14 }, FOG_SOFT = 5;   // casillas de degradado en el borde de la visión
export let fogOn = false;
function revealAt(x, z, r) {
  const R = r + FOG_SOFT * .5;
  for (let j = Math.max(0, Math.floor(z - R)); j <= Math.min(FH - 1, Math.ceil(z + R)); j++) for (let i = Math.max(0, Math.floor(x - R)); i <= Math.min(FW - 1, Math.ceil(x + R)); i++) {
    const d = Math.hypot(i + .5 - x, j + .5 - z), v = THREE.MathUtils.clamp((R - d) / FOG_SOFT, 0, 1), k = j * FW + i;
    if (v > visF[k]) visF[k] = v;
  }
}
function blurFog(src, dst, tmp) {   // desenfoque de caja separable, radio 2, dos pasadas
  const r = 2, n = 2 * r + 1;
  for (let pass = 0; pass < 2; pass++) {
    const a = pass ? dst : src;
    for (let z = 0; z < FH; z++) { let acc = 0; const o = z * FW; for (let x = -r; x <= r; x++) acc += a[o + THREE.MathUtils.clamp(x, 0, FW - 1)]; for (let x = 0; x < FW; x++) { tmp[o + x] = acc / n; acc += a[o + Math.min(FW - 1, x + r + 1)] - a[o + Math.max(0, x - r)]; } }
    for (let x = 0; x < FW; x++) { let acc = 0; for (let z = -r; z <= r; z++) acc += tmp[THREE.MathUtils.clamp(z, 0, FH - 1) * FW + x]; for (let z = 0; z < FH; z++) { dst[z * FW + x] = acc / n; acc += tmp[Math.min(FH - 1, z + r + 1) * FW + x] - tmp[Math.max(0, z - r) * FW + x]; } }
  }
}
export function updateFog(snapTo) {
  if (!fogOn) return;
  visF.fill(0);
  const rv = geoR?.reveal; if (rv && rv.length === visF.length) for (let k = 0; k < rv.length; k++) if (rv[k]) visF[k] = 1;   // caldera: el volcán y su lago se ven siempre
  for (const u of units) if (u.side === 0) revealAt(u.pos.x, u.pos.z, ((VISION[u.type] || 10) + visionBonus(u)) * weatherVis());
  for (const s of spots) if (s.kind === 'base' && s.side === 0) revealAt(s.x, s.z, 28); else if (s.kind === 'town' && s.owner === 0) revealAt(s.x, s.z, s.watch ? GAME.watchVision : 14);
  for (let k = 0; k < visF.length; k++) { const v = visF[k]; if (v > expF[k]) expF[k] = v; seen[k] = v > .5 ? 1 : 0; if (expF[k] > .5) explored[k] = 1; fogTgt[k] = Math.max(v * 255, expF[k] * 120); }
  blurFog(fogTgt, fogB, visF);   // visF se reutiliza como búfer temporal
  for (let k = 0; k < fogData.length; k++) { const t = fogB[k]; fogData[k] = snapTo ? t : fogData[k] + (t - fogData[k]) * .5; }
  fogTex.needsUpdate = true; markMiniDirty();
  // lo que nunca has visto queda oculto: edificios, pueblos y murallas
  for (const sp of spots) if (sp.group) sp.group.visible = exploredAt(sp.x, sp.z);
  for (const d of decos) d.visible = exploredAt(d.position.x, d.position.z);
  for (const b of R.bridges) b.group.visible = b.built && exploredAt(b.x, b.z);   // los puentes no se ven hasta explorarlos
  for (const t of R.treasures || []) t.g.visible = !t.taken && exploredAt(t.x, t.z);
  if (R.lava) R.lava.visible = exploredAt(R.lava.position.x, R.lava.position.z);   // la lava del cráter, solo si se ha explorado
  refreshKnownTowns(false);
}
const fogIdx = (x, z) => THREE.MathUtils.clamp(Math.floor(z), 0, FH - 1) * FW + THREE.MathUtils.clamp(Math.floor(x), 0, FW - 1);
export const exploredAt = (x, z) => !fogOn || explored[fogIdx(x, z)] === 1;
export const visibleAt = (x, z) => !fogOn || seen[fogIdx(x, z)] === 1;
export function toggleFog() {
  fogOn = !fogOn;
  if (fogOn) updateFog(true);
  else { fogData.fill(255); fogTex.needsUpdate = true; markMiniDirty(); for (const sp of spots) if (sp.group) sp.group.visible = true; for (const d of decos) d.visible = true; showRuleProps(); for (const u of units) u.g.visible = true; refreshKnownTowns(true); }
  toast(fogOn ? 'NIEBLA DE GUERRA: SÍ · N' : 'NIEBLA DE GUERRA: NO · N'); sfx('ui');
}
export function resetFog(on) { ensureFogSize(); fogOn = on; explored.fill(0); expF.fill(0); fogData.fill(255); if (on) updateFog(true); else { fogTex.needsUpdate = true; for (const sp of spots) if (sp.group) sp.group.visible = true; for (const d of decos) d.visible = true; showRuleProps(); } }
// sin niebla: puentes, cofres y lava se ven siempre (si existen)
function showRuleProps() { for (const b of R.bridges) b.group.visible = b.built; for (const t of R.treasures || []) t.g.visible = !t.taken; if (R.lava) R.lava.visible = true; }

// preparación de la página (listeners y elementos del DOM); la llama main.js al arrancar
export function init() { ensureFogSize();
}
