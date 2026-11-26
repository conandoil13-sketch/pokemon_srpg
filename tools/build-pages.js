import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { relative } from 'node:path';

// Run from the repository root (npm run build).
const outdir = 'dist';
const entry = 'src/main.js';
const html = await readFile('index.html', 'utf8');
const script = `src="${entry}"`;
if (html.split(script).length !== 2) throw new Error('Expected one game entry in index.html');

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir);
const result = await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  keepNames: true,
  entryNames: 'game-[hash]',
  outdir,
  metafile: true,
});
const output = Object.keys(result.metafile.outputs).find(path => result.metafile.outputs[path].entryPoint === entry);
await writeFile('dist/index.html', html.replace(script, `src="${relative(outdir, output)}"`));

// The preview pages import the original ES modules. Game assets also use document-relative URLs.
for (const path of ['assets', 'src', 'tools/fx-preview.html', 'tools/map-preview.html', 'tools/training-ground.js']) {
  await cp(path, `dist/${path}`, { recursive: true });
}
