// Navegación en rejilla: casillas transitables, búsquedas BFS y casilla más cercana.
import { MD, MW, N, idx } from './config.js';
import { GEOT, HM, wallHit } from './map.js';

// ---------- Navegación en rejilla ----------
export let walk = null, inMain = null, mainList = [], stepMask = null;
export const NB8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]], NBO = NB8.map(([dx, dz]) => dz * MW + dx);
function canStep(x, z, nx, nz) {
  if (nx < 0 || nz < 0 || nx >= MW || nz >= MD) return false;
  const b = idx(nx, nz); if (!walk[b] || Math.abs(HM[idx(x, z)] - HM[b]) > 1) return false;
  if (nx !== x && nz !== z && (!walk[idx(nx, z)] || !walk[idx(x, nz)])) return false;
  return true;
}
// stepMask[i]: bit k encendido si desde la casilla i se puede pasar a su vecina NB8[k]. Se calcula una vez por mapa
// y así las búsquedas (BFS, seguir un campo) no repiten las comprobaciones de desnivel y esquinas en cada paso
// blocked: casillas cerradas por una regla de la geografía (marea alta, crecida, hielo roto…), aunque el terreno se pueda pisar
export let blocked = null;
const baseWalk = (x, z) => { const i = idx(x, z); return HM[i] >= 1 && GEOT[i] !== 1 && !blocked[i] && !wallHit(x + .5, z + .5) ? 1 : 0; };
export function buildNav() {
  walk = new Uint8Array(N); inMain = new Uint8Array(N); stepMask = new Uint8Array(N); blocked = new Uint8Array(N);
  for (let z = 0; z < MD; z++) for (let x = 0; x < MW; x++) walk[idx(x, z)] = baseWalk(x, z);
  for (let z = 0; z < MD; z++) for (let x = 0; x < MW; x++) { const i = idx(x, z); if (!walk[i]) continue; let m = 0; for (let k = 0; k < 8; k++) if (canStep(x, z, x + NB8[k][0], z + NB8[k][1])) m |= 1 << k; stepMask[i] = m; }
  const comp = new Int32Array(N).fill(-1); let best = -1, bestN = 0, cid = 0, landN = 0;
  for (let i = 0; i < N; i++) {
    if (!walk[i] || comp[i] >= 0) continue;
    const st = [i]; comp[i] = cid; let n = 0;
    while (st.length) { const v = st.pop(), m = stepMask[v]; n++; for (let k = 0; k < 8; k++) if (m >> k & 1) { const j = v + NBO[k]; if (comp[j] < 0) { comp[j] = cid; st.push(j); } } }
    landN += n; if (n > bestN) { bestN = n; best = cid; } cid++;
  }
  mainList = []; for (let i = 0; i < N; i++) if (comp[i] === best) { inMain[i] = 1; mainList.push(i); }
  return bestN / Math.max(1, landN);
}
// tras cambiar el terreno de unas casillas (alturas, bosque o blocked): recalcula su paso y el de sus vecinas
export function refreshCells(cells) {
  const near = new Set();
  for (const c of cells) { const x = c % MW, z = (c / MW) | 0; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, nz = z + dz; if (nx >= 0 && nz >= 0 && nx < MW && nz < MD) near.add(idx(nx, nz)); } }
  for (const c of cells) walk[c] = baseWalk(c % MW, (c / MW) | 0);
  for (const c of near) { const x = c % MW, z = (c / MW) | 0; let m = 0; if (walk[c]) for (let k = 0; k < 8; k++) if (canStep(x, z, x + NB8[k][0], z + NB8[k][1])) m |= 1 << k; stepMask[c] = m; }
  for (const c of cells) if (walk[c] && !inMain[c]) { inMain[c] = 1; mainList.push(c); }   // un puente o una tala puede abrir casillas nuevas
}
// casilla transitable abierta más cercana (para sacar a las tropas de una casilla que se cierra)
export function nearestOpen(x, z, maxR = 10) {
  const cx = Math.floor(x), cz = Math.floor(z);
  for (let R = 1; R <= maxR; R++) for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== R) continue;
    const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= MW || nz >= MD) continue;
    const i = idx(nx, nz); if (walk[i] && inMain[i] && stepMask[i]) return i;
  }
  return -1;
}
const _q = new Int32Array(N);
// campo de distancias por camino desde las casillas de origen. Con stop, para en cuanto llega a esa casilla:
// las casillas del camino de vuelta ya tienen su distancia final, así que se puede seguir igual pero explorando mucho menos
export function bfs(sources, stop = -1) {
  const f = new Int32Array(N).fill(1e9); let qh = 0, qt = 0;
  for (const s of sources) if (f[s]) { f[s] = 0; _q[qt++] = s; }
  while (qh < qt) { const v = _q[qh++]; if (v === stop) break; const dv = f[v] + 1, m = stepMask[v]; for (let k = 0; k < 8; k++) if (m >> k & 1) { const j = v + NBO[k]; if (f[j] > dv) { f[j] = dv; _q[qt++] = j; } } }
  return f;
}
export function nearestNode(x, z) {
  const cx = Math.floor(x), cz = Math.floor(z);
  for (let R = 0; R < 50; R++) {
    let best = -1, bd = 1e9;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== R) continue;
      const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= MW || nz >= MD) continue;
      const i = idx(nx, nz); if (inMain[i] && dx * dx + dz * dz < bd) { bd = dx * dx + dz * dz; best = i; }
    }
    if (best >= 0) return best;
  }
  return mainList[0];
}
export function fieldAround(x, z, rad) {   // campo hacia un círculo (pueblo, fortaleza): solo se recorre el cuadrado que lo contiene
  const src = [], x0 = Math.max(0, Math.floor(x - rad)), x1 = Math.min(MW - 1, Math.ceil(x + rad)), z0 = Math.max(0, Math.floor(z - rad)), z1 = Math.min(MD - 1, Math.ceil(z + rad));
  for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) { const c = idx(i, j); if (inMain[c] && Math.hypot(i + .5 - x, j + .5 - z) < rad) src.push(c); }
  return bfs(src.length ? src : [nearestNode(x, z)]);
}
export const cellX = i => i % MW + .5, cellZ = i => ((i / MW) | 0) + .5;
