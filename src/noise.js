// Ruido con semilla y utilidades de relieve.

// ---------- Ruido ----------
export let seed = 1;
export const setSeed = s => { seed = s; };
export function hash(i, j, k) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1440662683) + Math.imul(seed, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967295;
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let u = x - xi, v = y - yi, w = z - zi; u = u*u*(3-2*u); v = v*v*(3-2*v); w = w*w*(3-2*w);
  const a = hash(xi,yi,zi), b = hash(xi+1,yi,zi), c = hash(xi,yi+1,zi), d = hash(xi+1,yi+1,zi);
  const e = hash(xi,yi,zi+1), f = hash(xi+1,yi,zi+1), g = hash(xi,yi+1,zi+1), h = hash(xi+1,yi+1,zi+1);
  const x1 = a + (b-a)*u, x2 = c + (d-c)*u, x3 = e + (f-e)*u, x4 = g + (h-g)*u;
  const y1 = x1 + (x2-x1)*v, y2 = x3 + (x4-x3)*v; return y1 + (y2-y1)*w;
}
function fbm(x, y, z, oct) { let a = .5, f = 1, s = 0, n = 0; for (let o = 0; o < oct; o++) { s += a*vnoise(x*f, y*f, z*f); n += a; a *= .5; f *= 2.03; } return s/n; }
// generador pseudoaleatorio con semilla (mapas reproducibles)
export const rngOf = s => { s = (s * 9301 + 49297) % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
export const smooth01 = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
export const n2 = (x, z, f, oct = 4, o = 0) => fbm(x * f + o * 17.3, 3.1 + o, z * f - o * 9.7, oct);
export const plains = (x, z) => 2.2 + Math.max(0, n2(x, z, .03, 3, 1) - .5) * 4.5;   // llanura con pocas lomas, anchas y suaves
