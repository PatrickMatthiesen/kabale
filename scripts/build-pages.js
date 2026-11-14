import { mkdir, copyFile, readdir, writeFile } from 'node:fs/promises';

// Publish only the game and runtime artwork, not tests, server files or local originals.
await mkdir('_site', { recursive: true });
await copyFile('index.html', '_site/index.html');
for (const [directory, extensions] of [['src', ['.js', '.css']], ['assets/cards/full', ['.jpg']]]) {
  await mkdir(`_site/${directory}`, { recursive: true });
  for (const file of await readdir(directory)) {
    if (extensions.some(extension => file.endsWith(extension))) {
      await copyFile(`${directory}/${file}`, `_site/${directory}/${file}`);
    }
  }
}
await writeFile('_site/.nojekyll', '');
