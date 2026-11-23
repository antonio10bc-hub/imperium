// Rendimiento: mapa grande con muchas tropas peleando. Mide el paso de simulación y los fotogramas por segundo.
// Uso: npm run bench [-- --units=200 --geo=helado]   (requiere `npm run build` y Google Chrome)
import { chromium } from 'playwright-core';
import path from 'path';
const arg = k => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const N = +(arg('units') || 200), GEO = arg('geo') || 'oasis';
const CHROME = process.env.CHROME || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const b = await chromium.launch({ executablePath: CHROME, headless: true });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errors = []; p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
await p.addInitScript(g => { localStorage.setItem('imperium-geo', g); localStorage.setItem('imperium-size', 'g'); }, GEO);
await p.goto('file://' + path.resolve('dist/imperium.html')); await p.waitForFunction(() => window.__game && document.getElementById('loading').hidden, null, { timeout: 120000 });
await p.click('#go'); await p.waitForFunction(() => __game.state === 'play'); await p.keyboard.press('p');
const r = await p.evaluate(n => { const g = __game, T = ['sword', 'bow', 'horse'], [a, c] = [g.spots[0], g.spots[1]], mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2;
  g.setAI(0, 'normal'); for (let k = 0; k < n; k++) { const sd = k % 2; g.spawnAt(sd, T[k % 3], mx + (sd ? 12 : -12) + (k % 10), mz + ((k / 10 | 0) % 20) - 10); }
  g.step(20); const t0 = performance.now(); g.step(200); const ms = (performance.now() - t0) / 200; g.cam(mx, mz, 70); return { units: g.units.length, msPerStep: +ms.toFixed(2) }; }, N);
await p.keyboard.press('p');
r.fps = await p.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(Math.round(n / 3)); }; requestAnimationFrame(f); }));
console.log(GEO, JSON.stringify(r), errors.length ? errors : ''); await b.close();
