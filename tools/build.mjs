// Junta index.html, src/style.css y los módulos de src/ en un único dist/imperium.html que se abre con doble clic.
// Sin dependencias: los módulos se concatenan en el mismo orden en que el navegador los evalúa
// (recorrido en profundidad de los import desde main.js), quitando los import/export locales.
// Así el archivo único ejecuta lo mismo y en el mismo orden que la versión por módulos.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = path.join(root, 'src');
const IMPORT = /^import\s+(?:\{[^}]*\}|\*\s+as\s+\w+)\s+from\s+'([^']+)';[ \t]*\n/gm;

// orden de evaluación de los módulos ES: post-orden del recorrido de imports desde la entrada
const order = [], seen = new Set();
function visit(file) {
  if (seen.has(file)) return; seen.add(file);
  const code = fs.readFileSync(path.join(src, file), 'utf8');
  for (const [, spec] of code.matchAll(IMPORT)) if (spec.startsWith('./')) visit(spec.slice(2));
  order.push(file);
}
visit('main.js');

let bundle = "import * as THREE from 'three';\n";
for (const file of order) {
  let code = fs.readFileSync(path.join(src, file), 'utf8');
  // import { init as init_x } from './x.js' → const init_x = init__x (cada init se renombra en su módulo)
  const aliases = [];
  code = code.replace(IMPORT, (all, spec) => {
    const m = all.match(/\{([^}]*)\}/);
    if (m && spec.startsWith('./')) for (const part of m[1].split(',')) { const [a, b] = part.trim().split(/\s+as\s+/); if (b) aliases.push(`const ${b} = ${a === 'init' ? `${a}__${spec.slice(2, -3)}` : a};`); }   // solo las init se renombran por módulo; el resto conserva su nombre
    return '';
  });
  code = code.replace(/^export function init\(/m, `function init__${file.slice(0, -3)}(`);
  code = code.replace(/^export (const|let|function|class) /gm, '$1 ');
  // los alias van delante: las init son declaraciones de función (existen desde el principio), los const no
  bundle += `\n// ===== ${file} =====\n${aliases.length ? aliases.join('\n') + '\n' : ''}${code}`;
}

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(src, 'style.css'), 'utf8');
html = html.replace('<link rel="stylesheet" href="src/style.css">', `<style>\n${css}</style>`);
html = html.replace(/<!-- el código está en src\/[\s\S]*?<\/script>/, `<script type="module">\n${bundle}</script>`);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'imperium.html');
fs.writeFileSync(out, html);
// icono de la app y manifiesto (para instalarla en el móvil): se copian junto al HTML
fs.cpSync(path.join(root, 'icons'), path.join(root, 'dist', 'icons'), { recursive: true });
fs.copyFileSync(path.join(root, 'manifest.webmanifest'), path.join(root, 'dist', 'manifest.webmanifest'));

// comprobación de sintaxis del módulo resultante (detecta, por ejemplo, nombres repetidos entre módulos)
const tmp = path.join(root, 'dist', '.check.mjs');
fs.writeFileSync(tmp, bundle.replace("import * as THREE from 'three';", ''));
try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'inherit' }); } finally { fs.unlinkSync(tmp); }
console.log(`dist/imperium.html · ${order.length} módulos · ${Math.round(html.length / 1024)} KB`);
