// Comprueba los módulos de src/: importaciones sin usar, nombres sin importar y exportaciones que no existen. Uso: npm run check
import * as acorn from 'acorn';
import * as escope from 'eslint-scope';
import fs from 'fs';
const dir = process.argv[2], files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
const GLOBALS = new Set(Object.getOwnPropertyNames(globalThis).concat(['window', 'document', 'localStorage', 'innerWidth', 'innerHeight', 'requestAnimationFrame', 'performance', 'addEventListener', 'dispatchEvent', 'KeyboardEvent', 'Image', 'AudioContext', 'webkitAudioContext', 'location', 'navigator', 'getComputedStyle', 'devicePixelRatio', 'requestIdleCallback']));
const exportsOf = {};
for (const f of files) { const ast = acorn.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'), { ecmaVersion: 2022, sourceType: 'module', ranges: true }); exportsOf[f] = new Set();
  for (const n of ast.body) if (n.type === 'ExportNamedDeclaration' && n.declaration) { const d = n.declaration; (d.declarations ? d.declarations.map(x => x.id.name) : [d.id.name]).forEach(x => exportsOf[f].add(x)); } }
let bad = 0;
for (const f of files) {
  const code = fs.readFileSync(`${dir}/${f}`, 'utf8'), ast = acorn.parse(code, { ecmaVersion: 2022, sourceType: 'module', ranges: true });
  const mod = escope.analyze(ast, { ecmaVersion: 2022, sourceType: 'module', ranges: true }).scopes.find(s => s.type === 'module');
  for (const v of mod.variables) if (v.defs[0]?.type === 'ImportBinding' && v.references.length === 0) { console.log(`${f}: importación sin usar: ${v.name}`); bad++; }
  for (const r of mod.through) if (!GLOBALS.has(r.identifier.name)) { console.log(`${f}: sin importar: ${r.identifier.name}`); bad++; }
  for (const n of ast.body) if (n.type === 'ImportDeclaration' && n.source.value.startsWith('./')) for (const sp of n.specifiers) if (sp.imported && !exportsOf[n.source.value.slice(2)]?.has(sp.imported.name)) { console.log(`${f}: ${n.source.value} no exporta ${sp.imported.name}`); bad++; }
}
console.log(bad ? bad + ' problemas' : 'módulos OK');
