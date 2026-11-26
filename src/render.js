// Renderizador, escena, cámara, post-proceso, materiales y fusión de piezas en mallas.
import * as THREE from 'three';
import { CFG, INK, MD, MW } from './config.js';

// ---------- Render retro (estilo Tank-less) ----------
export const canvas = document.getElementById('c');
export const gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
gl.setPixelRatio(1); gl.outputColorSpace = THREE.LinearSRGBColorSpace;
export const target = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
const post = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: target.texture }, uSat: { value: CFG.sat }, uVig: { value: .28 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uFade: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
  // saturación, tinte de la luz de cada geografía, viñeteado suave en las esquinas y fundido a negro (transiciones)
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat, uVig, uFade; uniform vec3 uTint; varying vec2 vUv;
  void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb * uTint; float l = dot(c, vec3(.299,.587,.114)); c = mix(vec3(l), c, uSat);
    vec2 d = vUv - .5; c *= 1. - uVig * smoothstep(.28, .75, dot(d, d) * 2.2); gl_FragColor = vec4(c * uFade, 1.); }`,
  depthTest: false, depthWrite: false });
export const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post); quad.frustumCulled = false; postScene.add(quad);
const SKY = new THREE.Color(0x8ad8f0);
export const scene = new THREE.Scene(); scene.background = SKY; scene.fog = new THREE.Fog(SKY, 100, 300);
export const camera = new THREE.PerspectiveCamera(40, 1, 3, 1400);
const sun = new THREE.DirectionalLight(0xfff6e8, 2.2); sun.position.set(-60, 120, 80);
const hemi = new THREE.HemisphereLight(0xe6eeff, 0x5a4aa8, 1.25);
scene.add(sun, hemi);
// luz propia de cada geografía (fija, sin ciclo de día): color e intensidad del sol, del cielo y del suelo, color del cielo y tinte final
const LIGHTS = {
  def: { sun: 0xfff6e8, si: 2.2, sky: 0xe6eeff, gnd: 0x5a4aa8, hi: 1.25, bg: 0x8ad8f0, tint: [1, 1, 1] },
  cordillera: { sun: 0xfff8f0, si: 2.35, sky: 0xdce8ff, gnd: 0x4a5aa8, hi: 1.3, bg: 0x9cd0f4, tint: [.97, 1, 1.05] },
  istmo: { sun: 0xfff2dc, si: 2.25, sky: 0xe0f0ff, gnd: 0x4a6ab0, hi: 1.25, bg: 0x84d4f4, tint: [1, 1, 1.02] },
  archipielago: { sun: 0xfff4d8, si: 2.3, sky: 0xd8f4ff, gnd: 0x3a7ab0, hi: 1.3, bg: 0x7ad8f4, tint: [.98, 1.02, 1.04] },
  barrancos: { sun: 0xffe0b8, si: 2.25, sky: 0xffe8d8, gnd: 0x7a4a6a, hi: 1.15, bg: 0xf0c8a0, tint: [1.03, .99, .96] },
  meseta: { sun: 0xffeccc, si: 2.3, sky: 0xf0ecff, gnd: 0x6a4a8a, hi: 1.2, bg: 0xa8d8f0, tint: [1.03, 1, .96] },
  afluentes: { sun: 0xfff8e8, si: 2.15, sky: 0xe0f4ff, gnd: 0x4a6aa0, hi: 1.3, bg: 0x8ad8f0, tint: [.99, 1.02, 1] },
  delta: { sun: 0xf0f4d8, si: 1.9, sky: 0xd8ecd8, gnd: 0x4a6a5a, hi: 1.35, bg: 0xa8c8b8, tint: [.96, 1.02, .96] },
  bosque: { sun: 0xf4ffd8, si: 2, sky: 0xd8f0d0, gnd: 0x3a5a4a, hi: 1.3, bg: 0x9ad0c0, tint: [.95, 1.03, .94] },
  oasis: { sun: 0xffe4b0, si: 2.45, sky: 0xfff0d8, gnd: 0x8a5a4a, hi: 1.1, bg: 0xf4d8a8, tint: [1.03, 1, .94] },
  lago: { sun: 0xffb890, si: 2.1, sky: 0xe8c8c8, gnd: 0x5a2a3a, hi: 1.15, bg: 0xc89a8a, tint: [1.03, .97, .95] },
  helado: { sun: 0xf0f8ff, si: 2.05, sky: 0xe0f0ff, gnd: 0x5a6ab8, hi: 1.4, bg: 0xc8e4f4, tint: [.93, .99, 1.08] },
  canon: { sun: 0xffd8a8, si: 2.35, sky: 0xffe0c8, gnd: 0x8a4a3a, hi: 1.1, bg: 0xf0b890, tint: [1.02, .99, .96] },
  costa: { sun: 0xfff0d0, si: 2.25, sky: 0xe0f0ff, gnd: 0x4a6ab0, hi: 1.25, bg: 0x84d0f0, tint: [1.01, 1, 1] },
  ruinas: { sun: 0xf8f0e0, si: 2.05, sky: 0xe8e4f0, gnd: 0x6a5a7a, hi: 1.25, bg: 0xb8c8d0, tint: [1.01, .99, .97] },
};
export function setGeoLight(key) {
  const L = LIGHTS[key] || LIGHTS.def;
  sun.color.setHex(L.sun); sun.intensity = L.si; hemi.color.setHex(L.sky); hemi.groundColor.setHex(L.gnd); hemi.intensity = L.hi;
  SKY.setHex(L.bg); post.uniforms.uTint.value.set(...L.tint);
}
export const setFade = k => { post.uniforms.uFade.value = k; };
// ---------- Materiales ----------
export const grad = new THREE.DataTexture(new Uint8Array([120, 195, 255]), 3, 1, THREE.RedFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
const toon = (color = 0xffffff) => new THREE.MeshToonMaterial({ color, gradientMap: grad });
export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const fogU = { uFog: { value: null }, uTime: { value: 0 } };   // uniformes de la niebla de guerra en el material del terreno
export const matCache = new Map(), HULLMAT = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
export const FLASH = new THREE.MeshBasicMaterial({ color: 0xffffff });
export const mat = c => { let m = matCache.get(c); if (!m) { m = toon(c); m.userData.part = true; matCache.set(c, m); } return m; };
// materiales y geometrías compartidos: se crean una vez y no hay que liberarlos al morir una tropa ni al empezar otra partida
const basicCache = new Map(), geoCache = new Map();
export const basic = (c, o = 1) => { const k = c + '|' + o; let m = basicCache.get(k); if (!m) basicCache.set(k, (m = new THREE.MeshBasicMaterial({ color: c, transparent: o < 1, opacity: o, depthWrite: o === 1 }))); return m; };
const sharedGeo = (k, make) => { let g = geoCache.get(k); if (!g) geoCache.set(k, (g = make())); return g; };
export const ringGeo = (r1, r2) => sharedGeo('r' + r1 + ',' + r2, () => new THREE.RingGeometry(r1, r2, 28));
export const discGeo = (r, n = 28) => sharedGeo('c' + r + ',' + n, () => new THREE.CircleGeometry(r, n));
export function part(g, w, h, d, color, x, y, z, hull = true) {
  const m = new THREE.Mesh(BOX, mat(color)); m.scale.set(w, h, d); m.position.set(x, y, z); g.add(m);
  if (hull) { const o = new THREE.Mesh(BOX, HULLMAT); o.scale.set(w + .09, h + .09, d + .09); o.position.copy(m.position); g.add(o); m.userData.hull = o; }
  return m;
}
export function ring(g, r1, r2, color, y = .06, o = 1) {
  const m = new THREE.Mesh(ringGeo(r1, r2), basic(color, o)); m.rotation.x = -Math.PI / 2; m.position.y = y; g.add(m); return m;
}
// ---------- Fusión de piezas ----------
// Los modelos se construyen con cajas sueltas (cómodo para escribir civilizaciones), pero dibujar cada caja por separado no escala:
// una tropa son ~50 mallas y un pueblo cientos. Aquí las cajas de un grupo se funden en dos mallas (color por vértice + contorno).
export const VCMAT = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad });
const _m4 = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _n3 = new THREE.Matrix3(), _bv = new THREE.Vector3();
// piezas fusionables bajo root (cajas con material de pieza o de contorno), saltándose los objetos de skip y lo que cuelga de ellos
export function collectParts(root, skip) {
  const fill = [], hull = [];
  const visit = o => { if (skip?.has(o)) return; if (o.isMesh && o.geometry === BOX && (o.material === HULLMAT || o.material.userData.part)) (o.material === HULLMAT ? hull : fill).push(o); for (const c of o.children) visit(c); };
  // el contorno se creó junto a la pieza: si luego se giró, movió o escaló la pieza, el contorno la sigue (si no, quedaba una caja negra recta)
  root.traverse(o => { const h = o.userData.hull; if (!h || h.parent !== o.parent) return; h.position.copy(o.position); h.quaternion.copy(o.quaternion); h.scale.set(o.scale.x + .09, o.scale.y + .09, o.scale.z + .09); });
  root.updateMatrixWorld(true); for (const c of root.children) visit(c);
  return { fill, hull };
}
// una geometría con todas las cajas de la lista, en coordenadas de root; con color, cada caja lleva el de su material
export function mergeBoxes(list, root, colored) {
  const P = BOX.attributes.position.array, NR = BOX.attributes.normal.array, I = BOX.index.array, nv = P.length / 3, ni = I.length;
  const pos = new Float32Array(list.length * nv * 3), nor = new Float32Array(list.length * nv * 3), col = colored ? new Uint8Array(list.length * nv * 3) : null;
  const ix = list.length * nv > 65535 ? new Uint32Array(list.length * ni) : new Uint16Array(list.length * ni);
  _inv.copy(root.matrixWorld).invert();
  list.forEach((m, k) => {
    _m4.multiplyMatrices(_inv, m.matrixWorld); _n3.getNormalMatrix(_m4); const o = k * nv * 3;
    for (let v = 0; v < nv; v++) { _bv.fromArray(P, v * 3).applyMatrix4(_m4).toArray(pos, o + v * 3); _bv.fromArray(NR, v * 3).applyMatrix3(_n3).normalize().toArray(nor, o + v * 3); }
    if (col) { const c = m.material.color.getHex(); for (let v = 0; v < nv; v++) { col[o + v * 3] = c >> 16 & 255; col[o + v * 3 + 1] = c >> 8 & 255; col[o + v * 3 + 2] = c & 255; } }
    for (let i = 0; i < ni; i++) ix[k * ni + i] = I[i] + k * nv;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
  g.setIndex(new THREE.BufferAttribute(ix, 1)); g.computeBoundingSphere(); return g;
}
// funde las piezas estáticas de un edificio; lo que se anima o cambia de color (banderas, tejados del dueño) va en skip y queda suelto
export const bakedGeos = [];
export function bake(root, skip) {
  const { fill, hull } = collectParts(root, skip), out = [];
  if (fill.length) out.push(new THREE.Mesh(mergeBoxes(fill, root, true), VCMAT));
  if (hull.length) out.push(new THREE.Mesh(mergeBoxes(hull, root, false), HULLMAT));
  for (const m of fill) m.parent.remove(m); for (const m of hull) m.parent.remove(m);
  for (const m of out) { root.add(m); bakedGeos.push(m.geometry); }
  return out;
}
// mar abierto alrededor del mapa
export const ocean = new THREE.Mesh(new THREE.PlaneGeometry(MW * 10, MD * 10), toon(0x1e4a8a)); ocean.rotation.x = -Math.PI / 2; ocean.position.set(MW / 2, -3, MD / 2); scene.add(ocean);
export const world = new THREE.Group(); scene.add(world);
