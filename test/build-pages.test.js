import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const favicon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"/>';

test('a dependency change versions the published HTML, styles and complete module graph together', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'kabale-build-'));
  const script = fileURLToPath(new URL('../scripts/build-pages.js', import.meta.url));
  const put = (file, content) => writeFile(path.join(directory, file), content);
  const read = file => readFile(path.join(directory, '_site', file), 'utf8');
  const build = () => {
    const result = spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  try {
    await mkdir(path.join(directory, 'src'));
    await mkdir(path.join(directory, 'assets/cards/optimized'), { recursive: true });
    await put('index.html', '<link rel="icon" href="./favicon.svg"><link href="src/style.css"><script type="module" src="src/app.js"></script>');
    await put('favicon.svg', favicon);
    await put('sw.js', '// artwork worker');
    await put('src/app.js', "import { value } from './dependency.js'; import './register-cache.js'; console.log(value);");
    await put('src/dependency.js', "export { value } from './values.js';");
    await put('src/values.js', 'export const value = 1;');
    await put('src/register-cache.js', "const worker = new URL('../sw.js', import.meta.url);");
    await put('src/style.css', 'body { margin: 0; }');
    build();
    const firstHtml = await read('index.html');
    assert.ok(firstHtml.includes('<link rel="icon" href="./favicon.svg">'));
    assert.equal(await read('favicon.svg'), favicon);
    const firstVersion = firstHtml.match(/app\.js\?v=([a-f0-9]{16})/)[1];
    assert.ok(firstHtml.includes(`style.css?v=${firstVersion}`));
    assert.ok((await read('src/app.js')).includes(`'./dependency.js?v=${firstVersion}'`));
    assert.ok((await read('src/app.js')).includes(`'./register-cache.js?v=${firstVersion}'`));
    assert.ok((await read('src/dependency.js')).includes(`'./values.js?v=${firstVersion}'`));
    assert.equal(await read('src/register-cache.js'), "const worker = new URL('../sw.js', import.meta.url);");
    build();
    assert.equal(await read('index.html'), firstHtml, 'an unchanged build keeps its URLs');
    await put('src/values.js', 'export const value = 2;');
    build();
    const nextVersion = (await read('index.html')).match(/app\.js\?v=([a-f0-9]{16})/)[1];
    assert.notEqual(nextVersion, firstVersion);
    assert.ok((await read('src/app.js')).includes(`'./dependency.js?v=${nextVersion}'`));
    assert.ok((await read('src/dependency.js')).includes(`'./values.js?v=${nextVersion}'`));
  } finally {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('kabale-build-'));
    await rm(directory, { recursive: true, force: true });
  }
});

test('Pages publishes current and retained hashed card artwork', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'kabale-art-build-'));
  const script = fileURLToPath(new URL('../scripts/build-pages.js', import.meta.url));
  const retained = JSON.parse(await readFile(new URL('../assets/cards/retained-art.json', import.meta.url), 'utf8'));
  const manifest = await import('../src/art-manifest.js');
  const previousName = retained.files[0];
  const currentName = Object.values(manifest.artManifest)[0][0].url.split('/').at(-1);
  const sourceRoot = new URL('../assets/cards/optimized/', import.meta.url);
  const outputPath = name => path.join(directory, '_site', 'assets', 'cards', 'optimized', name);
  try {
    await mkdir(path.join(directory, 'src'));
    await mkdir(path.join(directory, 'assets/cards/optimized'), { recursive: true });
    await writeFile(path.join(directory, 'index.html'), '<script type="module" src="src/app.js"></script>');
    await writeFile(path.join(directory, 'favicon.svg'), favicon);
    await writeFile(path.join(directory, 'sw.js'), '// artwork worker');
    await writeFile(path.join(directory, 'src/app.js'), '');
    await writeFile(path.join(directory, 'assets/cards/optimized', previousName), await readFile(new URL(previousName, sourceRoot)));
    await writeFile(path.join(directory, 'assets/cards/optimized', currentName), await readFile(new URL(currentName, sourceRoot)));
    const result = spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(await readFile(outputPath(previousName)), await readFile(new URL(previousName, sourceRoot)));
    assert.deepEqual(await readFile(outputPath(currentName)), await readFile(new URL(currentName, sourceRoot)));
  } finally {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('kabale-art-build-'));
    await rm(directory, { recursive: true, force: true });
  }
});
