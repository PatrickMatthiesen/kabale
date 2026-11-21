import test from 'node:test';
import assert from 'node:assert/strict';
import { createWinTracker } from '../src/win-times.js';

const klondike = { mode: 'klondike', difficulty: 'normal' };
const spider = { mode: 'spider', difficulty: 'normal' };
const historyKey = 'kabale-win-times';

function memoryStorage(values = new Map()) {
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('each win compares with the last time and the best time', () => {
  const { recordWin } = createWinTracker(memoryStorage());
  assert.deepEqual(recordWin(klondike, 60), { seconds: 60, previousSeconds: null, bestSeconds: 60, isNewBest: true });
  assert.deepEqual(recordWin(klondike, 80), { seconds: 80, previousSeconds: 60, bestSeconds: 60, isNewBest: false });
  assert.deepEqual(recordWin(klondike, 70), { seconds: 70, previousSeconds: 80, bestSeconds: 60, isNewBest: false });
  assert.deepEqual(recordWin(klondike, 50), { seconds: 50, previousSeconds: 70, bestSeconds: 50, isNewBest: true });
  assert.deepEqual(recordWin(klondike, 50), { seconds: 50, previousSeconds: 50, bestSeconds: 50, isNewBest: false });
});

test('successive wins stay in completion order when the system clock moves backward', () => {
  const storage = memoryStorage();
  const { recordWin } = createWinTracker(storage);
  recordWin(klondike, 60, { attemptId: 'first', completedAt: 200 });
  recordWin(klondike, 30, { attemptId: 'second', completedAt: 100 });

  assert.deepEqual(createWinTracker(storage).recordWin(klondike, 45, { attemptId: 'third', completedAt: 120 }), {
    seconds: 45, previousSeconds: 30, bestSeconds: 30, isNewBest: false,
  });
});

test('retry preserves the latest win when storage fails during a clock rollback', () => {
  const storage = memoryStorage();
  let blocked = false;
  const { recordWin } = createWinTracker({
    getItem: storage.getItem,
    setItem(key, value) {
      if (blocked) throw new Error('blocked');
      storage.setItem(key, value);
    },
  });
  recordWin(klondike, 60, { attemptId: 'first', completedAt: 200 });
  blocked = true;
  recordWin(klondike, 30, { attemptId: 'second', completedAt: 100 });
  blocked = false;

  assert.deepEqual(recordWin(klondike, 45, { attemptId: 'third', completedAt: 120 }), {
    seconds: 45, previousSeconds: 30, bestSeconds: 30, isNewBest: false,
  });
});

test('retry keeps a newer saved win when two tabs complete games during a clock rollback', () => {
  const storage = memoryStorage();
  const other = createWinTracker(storage);
  let blocked = false;
  const { recordWin } = createWinTracker({
    getItem: storage.getItem,
    setItem(key, value) {
      if (blocked) throw new Error('blocked');
      storage.setItem(key, value);
    },
  });
  recordWin(klondike, 60, { attemptId: 'saved', completedAt: 200 });
  blocked = true;
  recordWin(klondike, 30, { attemptId: 'pending-one', completedAt: 100 });
  recordWin(klondike, 35, { attemptId: 'pending-two', completedAt: 110 });
  other.recordWin(klondike, 40, { attemptId: 'other-tab', completedAt: 120 });
  blocked = false;

  assert.deepEqual(recordWin(klondike, 45, { attemptId: 'next', completedAt: 130 }), {
    seconds: 45, previousSeconds: 40, bestSeconds: 30, isNewBest: false,
  });
});

test('retry keeps a receipt saved between pending wins that share its timestamp', () => {
  const storage = memoryStorage();
  const other = createWinTracker(storage);
  let blocked = false;
  let writes = 0;
  const { recordWin } = createWinTracker({
    getItem: storage.getItem,
    setItem(key, value) {
      if (blocked) throw new Error('blocked');
      writes++;
      storage.setItem(key, value);
    },
  });
  recordWin(klondike, 60, { attemptId: 'saved-first', completedAt: 200 });
  blocked = true;
  recordWin(klondike, 30, { attemptId: 'pending-first', completedAt: 100 });
  const original = other.recordWin(klondike, 40, { attemptId: 'saved-between', completedAt: 110 });

  let lastResult;
  for (let completedAt = 111; completedAt <= 141; completedAt++) {
    lastResult = recordWin(klondike, 35, { attemptId: `pending-${completedAt}`, completedAt });
  }

  blocked = false;
  assert.deepEqual(recordWin(klondike, 20, { attemptId: 'pending-141', completedAt: 150 }), lastResult);
  assert.equal(writes, 2);
  const beforeReplay = storage.getItem(historyKey);
  assert.deepEqual(other.recordWin(klondike, 25, { attemptId: 'saved-between', completedAt: 160 }), original);
  assert.equal(storage.getItem(historyKey), beforeReplay);

  const record = JSON.parse(beforeReplay)['klondike:normal:kings'];
  assert.equal(record.receipts.length, 32);
  assert.equal(record.receipts.at(-1).attemptId, 'saved-between');
  assert.equal(record.lastAttemptId, 'pending-141');
  assert.equal(record.bestSeconds, 30);
});

test('retry orders a tied receipt after a saved win without an attempt ID', () => {
  const storage = memoryStorage();
  let blocked = false;
  const { recordWin } = createWinTracker({
    getItem: storage.getItem,
    setItem(key, value) {
      if (blocked) throw new Error('blocked');
      storage.setItem(key, value);
    },
  });
  recordWin(klondike, 60, { attemptId: 'saved', completedAt: 200 });
  recordWin(klondike, 45, { completedAt: 190 });
  blocked = true;
  const pending = recordWin(klondike, 30, { attemptId: 'pending', completedAt: 180 });

  blocked = false;
  assert.deepEqual(recordWin(klondike, 20, { attemptId: 'pending', completedAt: 170 }), pending);
  const record = JSON.parse(storage.getItem(historyKey))['klondike:normal:kings'];
  assert.deepEqual(record.receipts.map(receipt => receipt.attemptId), ['pending', 'saved']);
});

test('records survive reloads and separate modes, difficulty and the Klondike empty-column rule', () => {
  const storage = memoryStorage();
  const any = { ...klondike, emptyColumns: 'any' };
  const hard = { ...klondike, difficulty: 'hard' };
  const { recordWin } = createWinTracker(storage);
  recordWin(klondike, 60);
  recordWin(klondike, 80);
  assert.equal(recordWin(any, 45).previousSeconds, null);
  assert.equal(recordWin(hard, 90).previousSeconds, null);
  assert.equal(recordWin(spider, 0).previousSeconds, null);

  const reloaded = createWinTracker(storage);
  assert.deepEqual(reloaded.recordWin({ ...klondike, emptyColumns: 'kings' }, 65), {
    seconds: 65, previousSeconds: 80, bestSeconds: 60, isNewBest: false,
  });
  assert.equal(reloaded.recordWin(any, 55).bestSeconds, 45);
  assert.equal(reloaded.recordWin(hard, 95).bestSeconds, 90);
  assert.deepEqual(reloaded.recordWin({ ...spider, emptyColumns: 'any' }, 0), {
    seconds: 0, previousSeconds: 0, bestSeconds: 0, isNewBest: false,
  });
});

test('trackers read sequential updates from shared storage before recording a win', () => {
  const storage = memoryStorage();
  const first = createWinTracker(storage);
  const second = createWinTracker(storage);
  first.recordWin(klondike, 60);
  assert.equal(second.recordWin(klondike, 40).previousSeconds, 60);
  second.recordWin(spider, 50);
  assert.deepEqual(first.recordWin(klondike, 70), { seconds: 70, previousSeconds: 40, bestSeconds: 40, isNewBest: false });
  assert.equal(createWinTracker(storage).recordWin(spider, 55).previousSeconds, 50);
});

test('both tabs return the original attempt result without writing again', () => {
  const storage = memoryStorage();
  const setItem = storage.setItem;
  let writes = 0;
  storage.setItem = (key, value) => {
    writes++;
    setItem(key, value);
  };
  const firstTab = createWinTracker(storage);
  const secondTab = createWinTracker(storage);
  firstTab.recordWin(klondike, 60, { completedAt: 100 });
  const original = firstTab.recordWin(klondike, 40, { attemptId: 'first', completedAt: 200 });
  assert.deepEqual(original, { seconds: 40, previousSeconds: 60, bestSeconds: 40, isNewBest: true });
  assert.deepEqual(secondTab.recordWin(klondike, 35, { attemptId: 'first', completedAt: 300 }), original);
  assert.equal(writes, 2);

  const next = secondTab.recordWin(klondike, 30, { attemptId: 'second', completedAt: 400 });
  assert.equal(next.previousSeconds, 40);
  const beforeReplay = storage.getItem(historyKey);
  assert.deepEqual(firstTab.recordWin(klondike, 25, { attemptId: 'first', completedAt: 500 }), original);
  assert.deepEqual(createWinTracker(storage).recordWin(klondike, 20, { attemptId: 'second' }), next);
  assert.equal(writes, 3);
  assert.equal(storage.getItem(historyKey), beforeReplay);
  assert.equal(secondTab.recordWin(spider, 50, { attemptId: 'first' }).previousSeconds, null);
});

test('each rule set stores at most 32 receipts ordered by completion time', () => {
  const storage = memoryStorage();
  const tracker = createWinTracker(storage);
  for (let completion = 1; completion <= 33; completion++) {
    tracker.recordWin(klondike, completion, { attemptId: `win-${completion}`, completedAt: completion });
  }
  const record = JSON.parse(storage.getItem(historyKey))['klondike:normal:kings'];
  assert.equal(record.lastSeconds, 33);
  assert.equal(record.completedAt, 33);
  assert.equal(record.bestSeconds, 1);
  assert.equal(record.receipts.length, 32);
  assert.equal(record.receipts[0].attemptId, 'win-33');
  assert.equal(record.receipts.at(-1).attemptId, 'win-2');
});

test('absent and unreadable storage leave the tracker usable in memory', () => {
  const blocked = { getItem() { throw new Error('blocked'); } };
  for (const storage of [undefined, blocked]) {
    const { recordWin } = createWinTracker(storage);
    recordWin(klondike, 30);
    assert.deepEqual(recordWin(klondike, 40), { seconds: 40, previousSeconds: 30, bestSeconds: 30, isNewBest: false });
  }
});

test('failed writes retain wins and retry them with the latest persisted records', () => {
  const storage = memoryStorage();
  let blocked = true;
  const { recordWin } = createWinTracker({
    getItem: storage.getItem,
    setItem(key, value) {
      if (blocked) throw new Error('blocked');
      storage.setItem(key, value);
    },
  });
  recordWin(klondike, 30, { completedAt: 200 });
  recordWin(spider, 55, { completedAt: 200 });
  createWinTracker(storage).recordWin(klondike, 20, { completedAt: 100 });
  assert.deepEqual(recordWin(klondike, 40, { completedAt: 300 }), {
    seconds: 40, previousSeconds: 30, bestSeconds: 20, isNewBest: false,
  });

  blocked = false;
  assert.equal(recordWin(klondike, 45).previousSeconds, 40);
  const reloaded = createWinTracker(storage);
  assert.equal(reloaded.recordWin(klondike, 50).bestSeconds, 20);
  assert.equal(reloaded.recordWin(spider, 60).previousSeconds, 55);
});

test('retry keeps the latest completion and fastest time independently across rule sets', () => {
  const storage = memoryStorage();
  const persisted = createWinTracker(storage);
  let blocked = true;
  const retrying = createWinTracker({
    getItem: storage.getItem,
    setItem(key, value) {
      if (blocked) throw new Error('blocked');
      storage.setItem(key, value);
    },
  });
  const olderPending = retrying.recordWin(klondike, 25, { attemptId: 'older-pending', completedAt: 100 });
  const newerPending = retrying.recordWin(spider, 75, { attemptId: 'newer-pending', completedAt: 200 });
  const newerStored = persisted.recordWin(klondike, 55, { attemptId: 'newer-stored', completedAt: 200 });
  const olderStored = persisted.recordWin(spider, 45, { attemptId: 'older-stored', completedAt: 100 });

  blocked = false;
  assert.deepEqual(retrying.recordWin(spider, 60, { attemptId: 'newer-pending' }), newerPending);
  const reloaded = createWinTracker(storage);
  assert.deepEqual(reloaded.recordWin(klondike, 80, { completedAt: 300 }), {
    seconds: 80, previousSeconds: 55, bestSeconds: 25, isNewBest: false,
  });
  assert.deepEqual(reloaded.recordWin(spider, 80, { completedAt: 300 }), {
    seconds: 80, previousSeconds: 75, bestSeconds: 45, isNewBest: false,
  });
  assert.deepEqual(reloaded.recordWin(klondike, 1, { attemptId: 'older-pending' }), olderPending);
  assert.deepEqual(reloaded.recordWin(klondike, 1, { attemptId: 'newer-stored' }), newerStored);
  assert.deepEqual(reloaded.recordWin(spider, 1, { attemptId: 'older-stored' }), olderStored);
});

test('a saved receipt supersedes the same attempt from a failed write', () => {
  const storage = memoryStorage();
  let blocked = true;
  const retrying = createWinTracker({
    getItem: storage.getItem,
    setItem(key, value) {
      if (blocked) throw new Error('blocked');
      storage.setItem(key, value);
    },
  });
  retrying.recordWin(klondike, 20, { attemptId: 'shared', completedAt: 200 });
  const original = createWinTracker(storage).recordWin(klondike, 30, { attemptId: 'shared', completedAt: 100 });
  const beforeReplay = storage.getItem(historyKey);
  blocked = false;
  assert.deepEqual(retrying.recordWin(klondike, 20, { attemptId: 'shared' }), original);
  assert.equal(storage.getItem(historyKey), beforeReplay);
  assert.deepEqual(retrying.recordWin(klondike, 40, { completedAt: 300 }), {
    seconds: 40, previousSeconds: 30, bestSeconds: 30, isNewBest: false,
  });
});

test('an already saved attempt still retries other wins after storage recovers', () => {
  const storage = memoryStorage();
  const original = createWinTracker(storage).recordWin(spider, 40, { attemptId: 'shared', completedAt: 100 });
  let blocked = true;
  const retrying = createWinTracker({
    getItem: storage.getItem,
    setItem(key, value) {
      if (blocked) throw new Error('blocked');
      storage.setItem(key, value);
    },
  });
  retrying.recordWin(klondike, 20, { attemptId: 'pending', completedAt: 200 });

  blocked = false;
  assert.deepEqual(retrying.recordWin(spider, 22, { attemptId: 'shared', completedAt: 300 }), original);
  assert.deepEqual(createWinTracker(storage).recordWin(klondike, 45, { attemptId: 'next', completedAt: 400 }), {
    seconds: 45, previousSeconds: 20, bestSeconds: 20, isNewBest: false,
  });
});

test('malformed stored data and impossible times are ignored', () => {
  const storage = memoryStorage();
  for (const value of ['{', '[]', 'null', '{"klondike:normal:kings":{"lastSeconds":30,"bestSeconds":60}}',
    '{"klondike:normal:kings":{"lastSeconds":30.5,"bestSeconds":-1}}']) {
    storage.setItem(historyKey, value);
    const { recordWin } = createWinTracker(storage);
    assert.deepEqual(recordWin(klondike, 40), { seconds: 40, previousSeconds: null, bestSeconds: 40, isNewBest: true });
  }
});

test('legacy times survive invalid completion and receipt metadata', () => {
  const storage = memoryStorage();
  storage.setItem(historyKey, JSON.stringify({
    'klondike:normal:kings': { lastSeconds: 50, bestSeconds: 30 },
    'spider:normal': {
      lastSeconds: 70,
      bestSeconds: 40,
      completedAt: 'tomorrow',
      receipts: [null, { attemptId: 'invalid', completedAt: 100, result: { seconds: 20, bestSeconds: 50 } }],
    },
  }));
  const { recordWin } = createWinTracker(storage);
  assert.equal(recordWin(klondike, 40, { completedAt: 0 }).previousSeconds, 50);
  assert.deepEqual(recordWin(spider, 50, { attemptId: 'invalid', completedAt: 0 }), {
    seconds: 50, previousSeconds: 70, bestSeconds: 40, isNewBest: false,
  });
  assert.equal(recordWin(spider, 60, { completedAt: 1 }).previousSeconds, 50);
});
