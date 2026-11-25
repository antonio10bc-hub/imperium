// Simulación de equilibrio: partidas IA contra IA sin ventana y un informe con lo que sale.
//  · civilizaciones: todas las parejas, cada una desde los dos lados del mismo mapa (anula la ventaja de posición), con la misma dificultad y personalidad
//  · geografías: duración, ventaja de lado y empates en cada una (con las mismas partidas)
//  · dificultad: fácil contra normal, normal contra difícil y fácil contra difícil
//  · personalidades: cada pareja de personalidades, en difícil
// Uso: npm run build && npm run balance [-- --rounds=2 --workers=3 --min=25 --only=civs,geo,diff,pers]
// CHROME=ruta del navegador · THREE=ruta de three.module.min.js (sin acceso a la CDN) · deja dist/balance.json y docs/balance.md
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const ROUNDS = +arg('rounds', 2), WORKERS = +arg('workers', 3), MIN = +arg('min', 25), ONLY = arg('only', 'civs,diff,pers').split(','), FOCUS = arg('civs', '').split(',').filter(Boolean), OUT = arg('out', 'docs/balance.md');   // --civs: solo las parejas con alguna de estas civilizaciones · --out: dónde va el informe
const CHROME = process.env.CHROME || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const THREE = process.env.THREE ? fs.readFileSync(process.env.THREE) : null;
const url = 'file://' + path.resolve(process.env.GAME || 'dist/imperium.html');   // GAME: otra copia del juego (para seguir compilando mientras corre)
const CIVS = ['roma', 'cartago', 'china', 'mexica', 'egipto', 'galos', 'grecia', 'vikingos', 'persia', 'mongoles', 'japon'];
const GEOS = ['cordillera', 'istmo', 'archipielago', 'barrancos', 'meseta', 'afluentes', 'delta', 'bosque', 'oasis', 'lago', 'helado', 'canon', 'costa', 'ruinas'];
const PERS = ['agresivo', 'mercader', 'defensivo', 'relampago'];
let rs = 12345; const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647;

// lista de partidas: cada una con su mapa (geografía + semilla), civilizaciones, dificultad y personalidad de cada lado
const jobs = [];
if (ONLY.includes('civs')) for (let r = 0; r < ROUNDS; r++) for (let a = 0; a < CIVS.length; a++) for (let b = a + 1; b < CIVS.length; b++) {
  if (FOCUS.length && !FOCUS.includes(CIVS[a]) && !FOCUS.includes(CIVS[b])) continue;
  const geo = GEOS[(a * 3 + b * 5 + r * 7) % GEOS.length], seed = 1 + (rnd() * 99999 | 0), pers = PERS[(a + b + r) % PERS.length];
  for (const [c0, c1] of [[CIVS[a], CIVS[b]], [CIVS[b], CIVS[a]]]) jobs.push({ set: 'civs', geo, seed, civs: [c0, c1], diff: ['hard', 'hard'], pers: [pers, pers] });
}
if (ONLY.includes('diff')) for (const [d0, d1] of [['easy', 'normal'], ['normal', 'hard'], ['easy', 'hard']]) for (let k = 0; k < 8 * ROUNDS; k++) {
  const geo = GEOS[k % GEOS.length], seed = 1 + (rnd() * 99999 | 0), c = CIVS[k % CIVS.length], p = PERS[k % PERS.length];
  for (const sw of [0, 1]) jobs.push({ set: 'diff', geo, seed, civs: [c, c], diff: sw ? [d1, d0] : [d0, d1], pers: [p, p] });
}
if (ONLY.includes('pers')) for (let a = 0; a < PERS.length; a++) for (let b = a + 1; b < PERS.length; b++) for (let k = 0; k < 3 * ROUNDS; k++) {
  const geo = GEOS[(a + b * 3 + k * 5) % GEOS.length], seed = 1 + (rnd() * 99999 | 0), c = CIVS[(a * 4 + b + k) % CIVS.length];
  for (const sw of [0, 1]) jobs.push({ set: 'pers', geo, seed, civs: [c, c], diff: ['hard', 'hard'], pers: sw ? [PERS[b], PERS[a]] : [PERS[a], PERS[b]] });
}

async function play(page, j) {
  await page.addInitScript(job => { localStorage.setItem('imperium-civs', JSON.stringify(job.civs)); localStorage.setItem('imperium-size', 'n'); localStorage.setItem('imperium-players', '2'); localStorage.setItem('imperium-diff', 'hard'); }, j);
  await page.goto(`${url}?mapa=${j.geo.toUpperCase()}-${j.seed}`);
  await page.waitForFunction(() => window.__game && document.getElementById('loading').hidden, null, { timeout: 120000 });
  await page.click('#go'); await page.waitForFunction(() => __game.state === 'play');
  return page.evaluate(([j, MIN]) => {
    const g = __game; for (const sd of [0, 1]) g.setAI(sd, j.diff[sd], null, { persona: j.pers[sd] });
    let steps = 0; for (; steps < MIN * 60 * 20 && g.state === 'play'; steps++) g.step(1);
    const sp = g.spots, towns = [0, 1].map(sd => sp.filter(s => s.kind === 'town' && s.owner === sd).length), hp = [0, 1].map(sd => Math.max(0, Math.round(sp[sd].hp)));
    const done = g.state === 'end', score = sd => hp[sd] + towns[sd] * 120 + g.units.filter(u => u.side === sd).length * 10;
    const winner = done ? (hp[0] <= 0 ? 1 : 0) : score(0) === score(1) ? -1 : score(0) > score(1) ? 0 : 1;
    const st = g.stats;
    return { scen: g.scen, civs: g.civs(), done, winner, min: +(steps / 1200).toFixed(2), towns, hp, walls: [0, 1].map(sd => sp[sd].wallLvl || 0),
      gatesBroken: [0, 1].map(sd => g.dbg().gateList.filter(q => q.f.side === sd && q.hp <= 0).length), siege: [0, 1].map(sd => g.units.filter(u => u.side === sd && u.def.siege).length),
      kills: st.per.map(p => p.kills), made: st.per.map(p => p.made), errors: (window.__errors || []).length };
  }, [j, MIN]);
}
if (arg('limit')) jobs.splice(+arg('limit'));
const results = []; let next = 0, t0 = Date.now();
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
async function worker() {
  while (next < jobs.length) {
    const j = jobs[next++], ctx = await browser.newContext({ viewport: { width: 320, height: 200 } }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    if (THREE) await page.route('**/*', r => { const u = r.request().url(); if (u.includes('three.module')) return r.fulfill({ body: THREE, contentType: 'text/javascript' }); if (u.startsWith('http')) return r.fulfill({ body: '' }); return r.continue(); });
    try { const r = await play(page, j); results.push({ ...j, ...r, pageErrors: errs }); }
    catch (e) { results.push({ ...j, fail: String(e).slice(0, 200), pageErrors: errs }); }
    await ctx.close();
    if (results.length % 10 === 0) console.log(`${results.length}/${jobs.length} · ${Math.round((Date.now() - t0) / 1000)} s`);
  }
}
await Promise.all(Array.from({ length: WORKERS }, worker)); await browser.close();
fs.mkdirSync('dist', { recursive: true }); fs.writeFileSync('dist/balance.json', JSON.stringify(results, null, 1));

// ---------- informe ----------
const ok = results.filter(r => !r.fail), pct = (a, b) => b ? Math.round(a / b * 100) + ' %' : '—', avg = l => l.length ? (l.reduce((a, b) => a + b, 0) / l.length) : 0;
const NAME = { roma: 'Roma', cartago: 'Cartago', china: 'Han', mexica: 'Mexicas', egipto: 'Egipto', galos: 'Galos', grecia: 'Grecia', vikingos: 'Vikingos', persia: 'Persia', mongoles: 'Mongoles', japon: 'Japón' };
let md = `# Equilibrio: simulación IA contra IA\n\n${ok.length} partidas (${results.length - ok.length} fallidas) · límite ${MIN} min de partida · mapa normal, 2 jugadores. `
  + `Sin fortaleza caída al límite, gana quien tenga más puntos (vida del castillo + 120 por pueblo + 10 por tropa).\n`;
const civG = ok.filter(r => r.set === 'civs');
if (civG.length) {
  md += `\n## Civilizaciones\n\nTodas las parejas, desde los dos lados del mismo mapa, en difícil y con la misma personalidad.\n\n| Civilización | Partidas | Victorias | % | Duración media (min) |\n|---|---|---|---|---|\n`;
  const rows = CIVS.map(c => { const g = civG.filter(r => r.civs.includes(c)), w = g.filter(r => r.winner >= 0 && r.civs[r.winner] === c).length; return [c, g.length, w, w / Math.max(1, g.length), avg(g.map(r => r.min))]; }).sort((a, b) => b[3] - a[3]);
  for (const [c, n, w, k, m] of rows) md += `| ${NAME[c]} | ${n} | ${w} | ${Math.round(k * 100)} % | ${m.toFixed(1)} |\n`;
  md += `\n### Enfrentamientos (victorias de la fila contra la columna)\n\n| | ${CIVS.map(c => NAME[c].slice(0, 4)).join(' | ')} |\n|---|${CIVS.map(() => '---').join('|')}|\n`;
  for (const a of CIVS) md += `| ${NAME[a]} | ${CIVS.map(b => { if (a === b) return '·'; const g = civG.filter(r => r.civs.includes(a) && r.civs.includes(b)); return `${g.filter(r => r.winner >= 0 && r.civs[r.winner] === a).length}/${g.length}`; }).join(' | ')} |\n`;
}
const geoG = ok.filter(r => r.set === 'civs' || r.set === 'pers');
if (geoG.length) {
  md += `\n## Geografías\n\nCon las partidas de civilizaciones y personalidades (mismo nivel en los dos lados). «Gana el oeste» mide la ventaja de posición: lo justo es ~50 %.\n\n| Geografía | Partidas | Gana el oeste | Acaban antes del límite | Duración media | Puertas derribadas / partida | Asedio en juego |\n|---|---|---|---|---|---|---|\n`;
  for (const geo of GEOS) { const g = geoG.filter(r => r.scen === geo); if (!g.length) continue;
    md += `| ${geo} | ${g.length} | ${pct(g.filter(r => r.winner === 0).length, g.filter(r => r.winner >= 0).length)} | ${pct(g.filter(r => r.done).length, g.length)} | ${avg(g.map(r => r.min)).toFixed(1)} | ${avg(g.map(r => r.gatesBroken[0] + r.gatesBroken[1])).toFixed(1)} | ${pct(g.filter(r => r.siege[0] + r.siege[1] > 0).length, g.length)} |\n`; }
  const other = geoG.filter(r => !GEOS.includes(r.scen)); if (other.length) md += `\n${other.length} partidas cayeron en el río de reserva (la geografía pedida no dio un mapa válido).\n`;
}
const dG = ok.filter(r => r.set === 'diff');
if (dG.length) {
  md += `\n## Dificultad\n\nMisma civilización en los dos lados, cambiando de lado.\n\n| Duelo | Partidas | Gana el nivel superior | Duración media |\n|---|---|---|---|\n`;
  const L = { easy: 'Fácil', normal: 'Normal', hard: 'Difícil' }, rank = { easy: 0, normal: 1, hard: 2 };
  for (const [a, b] of [['easy', 'normal'], ['normal', 'hard'], ['easy', 'hard']]) { const g = dG.filter(r => r.diff.includes(a) && r.diff.includes(b)), up = g.filter(r => r.winner >= 0 && rank[r.diff[r.winner]] > rank[r.diff[1 - r.winner]]).length;
    md += `| ${L[a]} contra ${L[b]} | ${g.length} | ${pct(up, g.filter(r => r.winner >= 0).length)} | ${avg(g.map(r => r.min)).toFixed(1)} |\n`; }
}
const pG = ok.filter(r => r.set === 'pers');
if (pG.length) {
  md += `\n## Personalidades de la IA (difícil)\n\n| Personalidad | Partidas | Victorias | % | Duración media |\n|---|---|---|---|---|\n`;
  for (const p of PERS) { const g = pG.filter(r => r.pers.includes(p) && r.pers[0] !== r.pers[1]), w = g.filter(r => r.winner >= 0 && r.pers[r.winner] === p).length; md += `| ${p} | ${g.length} | ${w} | ${pct(w, g.length)} | ${avg(g.map(r => r.min)).toFixed(1)} |\n`; }
}
const errs = results.filter(r => r.pageErrors?.length || r.errors).length; md += `\n---\nPartidas con errores en la página: ${errs}.\n`;
fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, md);
console.log(`listo: ${results.length} partidas en ${Math.round((Date.now() - t0) / 60000)} min · ${OUT}`);
