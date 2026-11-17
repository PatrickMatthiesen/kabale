import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const workerSource = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

function createWorker({ scope = 'https://example.test/kabale/', cache = new Map(), failures = {} } = {}) {
  const handlers = new Map();
  const fetchCalls = [];
  const cacheApi = {
    async open() {
      if (failures.open) throw new Error('cache unavailable');
      return {
        async match(request) {
          if (failures.match) throw new Error('cache read failed');
          return cache.get(request.url);
        },
        async put(request, response) {
          if (failures.put) throw new Error('cache write failed');
          cache.set(request.url, response);
        },
        async keys() {
          return [...cache.keys()].map(url => ({ url }));
        },
        async delete(request) {
          return cache.delete(request.url);
        }
      };
    },
    async keys() { return []; },
    async delete() { return true; }
  };
  const context = {
    URL,
    caches: cacheApi,
    fetch: async request => {
      fetchCalls.push(request);
      return {
        ok: true,
        type: 'basic',
        url: request.url,
        clone() { return this; },
        async text() { return 'fresh'; }
      };
    },
    self: {
      registration: { scope },
      clients: { claim: async () => {} },
      skipWaiting: async () => {},
      addEventListener(name, handler) { handlers.set(name, handler); }
    }
  };
  vm.runInNewContext(workerSource, context, { filename: 'sw.js' });
  return { handlers, cache, fetchCalls };
}

function request(url, init = {}) {
  return { url, method: 'GET', mode: 'cors', ...init };
}

async function dispatchFetch(worker, req) {
  let responsePromise;
  worker.handlers.get('fetch')({
    request: req,
    respondWith(promise) { responsePromise = promise; }
  });
  return responsePromise;
}

test('cache-first stores only hashed optimized artwork in the worker scope', async () => {
  const worker = createWorker();
  const artwork = request('https://example.test/kabale/assets/cards/optimized/woodcut-hearts-court-mobile.a1b2c3d4.webp');

  const first = await dispatchFetch(worker, artwork);
  assert.equal(await first.text(), 'fresh');
  assert.equal(worker.fetchCalls.length, 1);
  assert.equal(worker.cache.size, 1);

  const second = await dispatchFetch(worker, artwork);
  assert.equal(await second.text(), 'fresh');
  assert.equal(worker.fetchCalls.length, 1);
});

test('does not intercept app files, navigation, other origins, or unhashed/non-WebP files', async () => {
  const worker = createWorker();
  const requests = [
    request('https://example.test/kabale/index.html'),
    request('https://example.test/kabale/assets/app.js'),
    request('https://example.test/kabale/assets/cards/full/woodcut.jpg'),
    request('https://example.test/kabale/assets/cards/optimized/woodcut-hearts-court-mobile.webp'),
    request('https://example.test/kabale/assets/cards/optimized/woodcut-hearts-court-mobile.a1b2c3d4.png'),
    request('https://example.test/other/assets/cards/optimized/woodcut-hearts-court-mobile.a1b2c3d4.webp'),
    request('https://cdn.example.test/kabale/assets/cards/optimized/woodcut-hearts-court-mobile.a1b2c3d4.webp'),
    request('https://example.test/kabale/assets/cards/optimized/woodcut-hearts-court-mobile.a1b2c3d4.webp', { mode: 'navigate' }),
    request('https://example.test/kabale/assets/cards/optimized/woodcut-hearts-court-mobile.a1b2c3d4.webp?size=small')
  ];

  for (const req of requests) assert.equal(await dispatchFetch(worker, req), undefined);
  assert.equal(worker.fetchCalls.length, 0);
  assert.equal(worker.cache.size, 0);
});

test('cache failures fall back to the network and return the response', async () => {
  for (const failures of [{ open: true }, { match: true }, { put: true }]) {
    const worker = createWorker({ failures });
    const response = await dispatchFetch(worker, request(
      'https://example.test/kabale/assets/cards/optimized/woodcut-spades-numbers-desktop.deadbeef.webp'
    ));
    assert.equal(await response.text(), 'fresh');
    assert.equal(worker.fetchCalls.length, 1);
  }
});

test('prunes oldest artwork entries after reaching the cache bound', async () => {
  const cache = new Map();
  for (let index = 0; index < 100; index += 1) {
    const hash = index.toString(16).padStart(8, '0');
    cache.set(`https://example.test/kabale/assets/cards/optimized/woodcut-clubs-numbers-mobile.${hash}.webp`, new Response('old'));
  }
  const worker = createWorker({ cache });
  await dispatchFetch(worker, request(
    'https://example.test/kabale/assets/cards/optimized/woodcut-hearts-court-mobile.a1b2c3d4.webp'
  ));
  assert.equal(worker.cache.size, 100);
  assert.equal(worker.cache.has('https://example.test/kabale/assets/cards/optimized/woodcut-clubs-numbers-mobile.00000000.webp'), false);
});

test('registration uses the app directory scope and is harmless when unavailable or unsupported', async () => {
  const { registerArtworkCache } = await import('../src/register-cache.js');
  const calls = [];
  await registerArtworkCache({ serviceWorker: { register(...args) { calls.push(args); return Promise.resolve({}); } } }, {
    protocol: 'https:', hostname: 'patrickmatthiesen.github.io'
  });
  assert.equal(calls.length, 1);
  const registrationModule = new URL('../src/register-cache.js', import.meta.url);
  assert.equal(calls[0][0].pathname, new URL('../sw.js', registrationModule).pathname);
  assert.equal(calls[0][1].scope, new URL('../', registrationModule).pathname);
  assert.equal(calls[0][1].updateViaCache, 'none');

  await registerArtworkCache({ serviceWorker: { register() { throw new Error('unsupported'); } } }, {
    protocol: 'https:', hostname: 'example.test'
  });
  assert.deepEqual(await registerArtworkCache({}, { protocol: 'http:', hostname: 'example.test' }), null);
});
