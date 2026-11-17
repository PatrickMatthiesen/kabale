import { mkdir, copyFile, readdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

// Publish only the game and runtime artwork, not tests, server files or local originals.
const output=path.resolve('_site');
if (path.dirname(output)!==process.cwd() || path.basename(output)!=='_site') throw new Error('Unexpected build output path');
await rm(output,{recursive:true,force:true});
await mkdir(output, { recursive: true });
await copyFile('index.html', '_site/index.html');
await copyFile('sw.js', '_site/sw.js');
for (const [directory, extensions] of [['src', ['.js', '.css']], ['assets/cards/optimized', ['.webp']]]) {
  await mkdir(`_site/${directory}`, { recursive: true });
  for (const file of await readdir(directory)) {
    if (extensions.some(extension => file.endsWith(extension))) {
      await copyFile(`${directory}/${file}`, `_site/${directory}/${file}`);
    }
  }
}
await writeFile('_site/.nojekyll', '');
