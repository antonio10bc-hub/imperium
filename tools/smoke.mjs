// Prueba rápida: abre dist/imperium.html en Chrome sin ventana, juega IA contra IA en cada geografía y avisa de cualquier error.
// Uso: npm run smoke [-- --geo=canon,lago --min=4 --size=n]   (requiere `npm run build` antes y Google Chrome instalado; CHROME=ruta para otro navegador)
import { chromium } from 'playwright-core';
import path from 'path';
const arg = k => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const GEOS = (arg('geo') || 'cordillera,istmo,archipielago,barrancos,meseta,afluentes,delta,bosque,oasis,lago,helado,canon,costa,ruinas').split(',');
const MIN = +(arg('min') || 3), SIZE = arg('size') || 'n';
const CHROME = process.env.CHROME || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const url = 'file://' + path.resolve('dist/imperium.html');
const b = await chromium.launch({ executablePath: CHROME, headless: true }); let fails = 0;
for (const geo of GEOS) {
  const p = await b.newPage({ viewport: { width: 320, height: 200 } }), errors = []; p.on('pageerror', e => errors.push(String(e.stack || e).slice(0, 300)));
  await p.addInitScript(([g, s]) => { localStorage.setItem('imperium-geo', g); localStorage.setItem('imperium-size', s); }, [geo, SIZE]);
  await p.goto(url); await p.waitForFunction(() => window.__game && document.getElementById('loading').hidden, null, { timeout: 120000 });
  await p.click('#go'); await p.waitForFunction(() => __game.state === 'play'); await p.keyboard.press('p');
  const r = await p.evaluate(min => { const g = __game; g.setAI(0, 'normal'); const t0 = performance.now(); let steps = 0;
    for (let m = 0; m < min * 60 * 20 && g.state === 'play'; m++) { g.step(1); steps++; }
    return { scen: g.scen, state: g.state, towns: [0, 1].map(sd => g.spots.filter(s => s.kind === 'town' && s.owner === sd).length).join('/'), units: g.units.length, msPerStep: +((performance.now() - t0) / steps).toFixed(2) }; }, MIN);
  const ok = !errors.length && r.scen === geo; if (!ok) fails++;
  console.log(`${ok ? 'OK ' : 'MAL'} ${geo.padEnd(13)} ${JSON.stringify(r)}${errors.length ? '\n    ' + errors.join('\n    ') : ''}`); await p.close();
}
await b.close(); if (fails) { console.log(`${fails} geografías con problemas`); process.exit(1); }
