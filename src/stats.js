// Estadísticas de la partida: muestras cada pocos segundos (oro, ejército, territorio) y contadores (bajas, reclutas, conquistas).
// Al acabar se dibujan en la pantalla final: gráfica de territorio y ejército, tabla por bando, héroe más valioso y momentos clave.
import { TEAM, NEU, players } from './config.js';
import { civOf } from './civs.js';
import { incomeOf } from './game.js';
import { spots } from './map.js';
import { sideState, units } from './units.js';
import { $ } from './state.js';

export const STATS = { t: 0, samples: [], per: [], moments: [], mvp: null };
const blankStat = () => ({ kills: 0, lost: 0, made: 0, caps: 0, gold: 0, maxArmy: 0, maxTowns: 0 });
export function resetStats() { STATS.t = 0; STATS.samples = []; STATS.per = players().map(blankStat); STATS.moments = []; STATS.mvp = null; STATS.sampleT = 0; }
const stOf = sd => STATS.per[sd];
export function statKill(u, by) {
  if (u.side < NEU && stOf(u.side)) stOf(u.side).lost++;
  if (by?.side != null && by.side < NEU && stOf(by.side)) stOf(by.side).kills++;
  if (by && by.side === 0 && by.type === 'hero' && (!STATS.mvp || by.kills >= STATS.mvp.kills)) STATS.mvp = { kills: by.kills + (u.type === 'hero' ? 3 : 1), rank: by.rank };
}
export const statMade = sd => { if (stOf(sd)) stOf(sd).made++; };
export function statCapture(sd, s) { if (stOf(sd)) stOf(sd).caps++; if (sd === 0 && (s.keep || s.fortified || s.camp || s.watch)) addMoment(`${s.name}`); }
export function addMoment(text) { if (STATS.moments.length < 40) STATS.moments.push({ t: STATS.t, text }); }
// cada 5 s: oro por segundo, tropas y pueblos de cada bando
export function sampleStats(dt) {
  STATS.t += dt; for (const sd of players()) if (stOf(sd) && !sideState[sd]?.dead) stOf(sd).gold += Math.max(0, incomeOf(sd)) * dt;
  if ((STATS.sampleT = (STATS.sampleT ?? 0) - dt) > 0) return; STATS.sampleT = 5;
  const row = players().map(sd => { const army = units.filter(u => u.side === sd).length, towns = spots.filter(s => s.kind === 'town' && s.owner === sd).length;
    if (stOf(sd)) { stOf(sd).maxArmy = Math.max(stOf(sd).maxArmy, army); stOf(sd).maxTowns = Math.max(stOf(sd).maxTowns, towns); } return { army, towns }; });
  STATS.samples.push({ t: STATS.t, row });
}
const clockOf = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
// gráfica de líneas: territorio (continua) y ejército (discontinua) de cada bando a lo largo de la partida
function drawChart(cv) {
  const W = cv.width = cv.clientWidth * 2 || 520, H = cv.height = 220, x = cv.getContext('2d'), S = STATS.samples; x.clearRect(0, 0, W, H);
  x.fillStyle = '#d4e0b8'; x.fillRect(0, 0, W, H); x.strokeStyle = 'rgba(15,15,27,.15)'; x.lineWidth = 2; for (let k = 1; k < 4; k++) { x.beginPath(); x.moveTo(0, H * k / 4); x.lineTo(W, H * k / 4); x.stroke(); }
  if (S.length < 2) return;
  const T = S[S.length - 1].t, maxA = Math.max(4, ...S.flatMap(s => s.row.map(r => r.army))), maxT = Math.max(2, ...S.flatMap(s => s.row.map(r => r.towns)));
  for (const [key, max, dash] of [['army', maxA, [8, 6]], ['towns', maxT, []]]) for (const sd of players()) {
    x.setLineDash(dash); x.lineWidth = sd === 0 ? 5 : 3; x.strokeStyle = TEAM[sd].css; x.beginPath();
    S.forEach((s, i) => { const px = s.t / T * (W - 16) + 8, py = H - 10 - (s.row[sd]?.[key] ?? 0) / max * (H - 24); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.stroke();
  }
  x.setLineDash([]);
}
export function renderEndStats(win) {
  const rows = players().map(sd => { const p = stOf(sd) || blankStat(); return `<tr style="color:${TEAM[sd].css}"><th>${sd === 0 ? 'TÚ' : civOf(sd).name}</th><td>${p.kills}</td><td>${p.lost}</td><td>${p.made}</td><td>${p.caps}</td><td>${Math.round(p.gold)}</td><td>${p.maxArmy}</td></tr>`; }).join('');
  const mvp = STATS.mvp ? `<p class="mvp">HÉROE MÁS VALIOSO: <b>${STATS.mvp.kills} BAJAS</b></p>` : '';
  const mom = STATS.moments.slice(-5).map(m => `<li><b>${clockOf(m.t)}</b> ${m.text}</li>`).join('');
  $('endStats').innerHTML = `<canvas id="endChart" aria-label="Territorio (línea continua) y ejército (discontinua) de cada bando"></canvas><p class="leg">— PUEBLOS · - - TROPAS</p>
    <table><tr><th></th><td>BAJAS</td><td>PÉRDIDAS</td><td>RECLUTAS</td><td>CONQUISTAS</td><td>ORO</td><td>EJÉRCITO</td></tr>${rows}</table>${mvp}${mom ? `<ul class="moments">${mom}</ul>` : ''}`;
  requestAnimationFrame(() => { const c = $('endChart'); if (c) drawChart(c); });
}
