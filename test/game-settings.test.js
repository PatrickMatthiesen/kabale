import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEmptyColumns, saveEmptyColumns } from '../src/game-settings.js';

test('empty-column preference loads saved values and defaults to King-only', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(loadEmptyColumns(storage), 'kings');
  assert.equal(saveEmptyColumns(storage, 'any'), 'any');
  assert.equal(values.get('kabale-empty-columns'), 'any');
  assert.equal(loadEmptyColumns(storage), 'any');
  values.set('kabale-empty-columns', 'unknown');
  assert.equal(loadEmptyColumns(storage), 'kings');
});

test('empty-column preference normalizes values and tolerates unavailable storage', () => {
  assert.equal(loadEmptyColumns(), 'kings');
  assert.equal(saveEmptyColumns(undefined, 'any'), 'any');
  assert.equal(saveEmptyColumns(undefined, 'invalid'), 'kings');
  assert.equal(loadEmptyColumns({ getItem() { throw new Error('blocked'); } }), 'kings');
  assert.equal(saveEmptyColumns({ setItem() { throw new Error('blocked'); } }, 'any'), 'any');
});
