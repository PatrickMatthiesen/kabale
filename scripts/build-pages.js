import { mkdir, copyFile, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

// Publish only the game and runtime artwork, not tests, server files or local originals.
const output=path.resolve('_site');
if (path.dirname(output)!==process.cwd() || path.basename(output)!=='_site') throw new Error('Unexpected build output path');
await rm(output,{recursive:true,force:true});
await mkdir(output, { recursive: true });
const index = await readFile('index.html', 'utf8');
const sources = new Map();
const revision = createHash('sha256').update(index);
for (const file of (await readdir('src')).sort()) {
  if (!/\.(js|css)$/.test(file)) continue;
  const content = await readFile(`src/${file}`, 'utf8');
  sources.set(file, content);
  revision.update(file).update('\0').update(content).update('\0');
}
const version = revision.digest('hex').slice(0,16);
// Version the whole module graph together. A new entry point must not import
// an older cached dependency, especially after its HTML structure changes.
await writeFile('_site/index.html', index
  .replace('src/style.css', `src/style.css?v=${version}`)
  .replace('src/app.js', `src/app.js?v=${version}`));
await mkdir('_site/src', { recursive: true });
for (const [file, content] of sources) {
  const published = file.endsWith('.js')
    ? content.replace(/((?:from\s*|import\s*)['"])(\.\/[^'"]+\.js)(['"])/g, `$1$2?v=${version}$3`)
    : content;
  await writeFile(`_site/src/${file}`, published);
}
await copyFile('sw.js', '_site/sw.js');
await copyFile('favicon.svg', '_site/favicon.svg');
for (const [directory, extensions] of [['assets/cards/optimized', ['.webp']]]) {
  await mkdir(`_site/${directory}`, { recursive: true });
  for (const file of await readdir(directory)) {
    if (extensions.some(extension => file.endsWith(extension))) {
      await copyFile(`${directory}/${file}`, `_site/${directory}/${file}`);
    }
  }
}
await writeFile('_site/.nojekyll', '');
