// Minimapa.
import { alarm } from './combat.js';
import { MD, MW, N, TEAM, TP, idx, mixHex } from './config.js';
import { exploredAt, fogData, visibleAt } from './fog.js';
import { miniPings } from './game.js';
import { commandAt, focusOn, groundAt } from './input.js';
import { G, HM, biomeAt, regionCell, regionShown, spots, terrainColor, treeCell } from './map.js';
import { S } from './state.js';
import { sel, units } from './units.js';
import { drawRulesMini, hiddenFrom } from './rules.js';

// ---------- Minimapa ----------
const mini = document.getElementById('mini'), mctx = mini.getContext('2d'), MS = 1;
const mbuf = document.createElement('canvas'); const bctx = mbuf.getContext('2d');
let miniRaw = null, miniImg = null, miniDirty = true;
export const markMiniDirty = () => { miniDirty = true; };
export function buildMinimap() {
  miniRaw = new Uint32Array(N); miniImg = bctx.createImageData(MW, MD);
  if (mbuf.width !== MW || mbuf.height !== MD) { mini.width = MW * MS; mini.height = MD * MS; mbuf.width = MW; mbuf.height = MD; }
  for (let i = 0; i < N; i++) {
    const h = HM[i], g = G[i], x = i % MW, z = (i / MW) | 0;
    miniRaw[i] = h <= 0 ? (g > -2.2 ? TP.shallow : TP.deep) : treeCell[i] ? biomeAt(x + .5, z + .5).treeCol : terrainColor(x, z);
  }
  miniDirty = true;
}
function paintMinimap() {
  const d = miniImg.data;
  for (let z = 0; z < MD; z++) for (let x = 0; x < MW; x++) {
    const i = idx(x, z), o = i * 4; let c = miniRaw[i];
    if (HM[i] > 0) {
      const r = regionCell[i], own = regionShown(r);
      const edge = (x + 1 < MW && HM[i + 1] > 0 && regionCell[i + 1] !== r) || (z + 1 < MD && HM[i + MW] > 0 && regionCell[i + MW] !== r);
      c = edge ? (own < 0 ? 0xe8e8d8 : TEAM[own].c) : own >= 0 ? mixHex(c, TEAM[own].c, .28) : c;
    }
    const fv = fogData[i] / 255;
    if (fv < .47) { const k = fv / .47; d[o] = 19 + ((c >> 16 & 255) * .58 - 19) * k; d[o+1] = 23 + ((c >> 8 & 255) * .58 - 23) * k; d[o+2] = 31 + ((c & 255) * .58 - 31) * k; }
    else { const k = .58 + .42 * (fv - .47) / .53; d[o] = (c >> 16 & 255) * k; d[o+1] = (c >> 8 & 255) * k; d[o+2] = (c & 255) * k; }
    d[o+3] = 255;
  }
  miniDirty = false;
}
export function drawMinimap() {
  if (!miniImg) return;
  if (miniDirty) { paintMinimap(); bctx.putImageData(miniImg, 0, 0); }
  mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.imageSmoothingEnabled = false; mctx.drawImage(mbuf, 0, 0, MW * MS, MD * MS); mctx.setTransform(MS, 0, 0, MS, 0, 0);
  mctx.lineWidth = 2; mctx.strokeStyle = '#0f0f1b';
  for (const s of spots) {
    if (!exploredAt(s.x, s.z)) continue;
    if (s.kind === 'town') { const r = s.fortified || s.keep ? 10 : 7, ko = s.known ?? s.owner; mctx.fillStyle = ko < 0 ? '#f4f4e8' : TEAM[ko].css; mctx.beginPath(); mctx.moveTo(s.x, s.z - r); mctx.lineTo(s.x + r, s.z); mctx.lineTo(s.x, s.z + r); mctx.lineTo(s.x - r, s.z); mctx.closePath(); mctx.fill(); mctx.stroke(); }
    else if (s.kind === 'base') { mctx.fillStyle = TEAM[s.side].css; mctx.fillRect(s.x - 8, s.z - 8, 16, 16); mctx.strokeRect(s.x - 8, s.z - 8, 16, 16); }
  }
  for (const u of units) { if (u.side !== 0 && (!visibleAt(u.pos.x, u.pos.z) || hiddenFrom(u, 0))) continue; const k = u.type === 'hero' || u.type === 'god' ? 4 : 2; mctx.fillStyle = sel.has(u) ? '#e8c870' : u.type === 'god' ? '#ffe9a0' : u.type === 'hero' ? '#fff' : TEAM[u.side].css; mctx.fillRect(u.pos.x - k, u.pos.z - k, k * 2, k * 2); }
  drawRulesMini(mctx);
  if (alarm.t > 0 && alarm.pos) { mctx.strokeStyle = (alarm.t * 4 | 0) % 2 ? '#d83a4a' : '#fff'; mctx.lineWidth = 1.5; mctx.beginPath(); mctx.arc(alarm.pos.x, alarm.pos.z, 8 + (1 - alarm.t % 1) * 12, 0, 7); mctx.stroke(); }
  for (let i = miniPings.length - 1; i >= 0; i--) {   // destellos de avisos
    const p = miniPings[i]; p.t += .15; const r = 6 + (p.t % .9) * 30;
    mctx.strokeStyle = p.c; mctx.globalAlpha = 1 - (p.t % .9) / .9; mctx.lineWidth = 3; mctx.strokeRect(p.x - r, p.z - r, r * 2, r * 2); mctx.globalAlpha = 1;
    if (p.t > 2.7) miniPings.splice(i, 1);
  }
  // zona visible: esquinas de la pantalla proyectadas sobre el suelo
  const pts = [[0, 0], [S.VW, 0], [S.VW, S.VH], [0, S.VH]].map(([a, b]) => groundAt(a, b, true));
  if (pts.every(Boolean)) { mctx.strokeStyle = '#fff'; mctx.lineWidth = 2; mctx.beginPath(); pts.forEach((p, k) => k ? mctx.lineTo(p.x, p.z) : mctx.moveTo(p.x, p.z)); mctx.closePath(); mctx.stroke(); }
}
let miniDrag = false;
const miniGo = e => { const r = mini.getBoundingClientRect(); focusOn((e.clientX - r.left) / r.width * MW, (e.clientY - r.top) / r.height * MD, true); };

// preparación de la página (listeners y elementos del DOM); la llama main.js al arrancar
export function init() {
  mini.width = MW * MS; mini.height = MD * MS; mbuf.width = MW; mbuf.height = MD;
  mini.addEventListener('contextmenu', e => e.preventDefault());
  mini.addEventListener('pointerdown', e => {
    if (e.button === 2) {   // clic derecho: orden a lo seleccionado (o punto de reunión), como en el mapa
      const r = mini.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * MW, z = (e.clientY - r.top) / r.height * MD;
      if (commandAt(x, z, S.amode)) { S.amode = false; miniPings.push({ x, z, t: 0, c: '#9ad86a' }); }
      return;
    }
    miniDrag = true; mini.setPointerCapture(e.pointerId); miniGo(e);
  });
  mini.addEventListener('pointermove', e => { if (miniDrag) miniGo(e); });
  mini.addEventListener('pointerup', () => { miniDrag = false; });
}
