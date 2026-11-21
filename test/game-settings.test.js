import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEmptyColumns, saveEmptyColumns, loadFreeCellAutoFill, saveFreeCellAutoFill, loadAutoMoveTrigger, saveAutoMoveTrigger } from '../src/game-settings.js';
import { loadLanguage, saveLanguage } from '../src/i18n.js';

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

test('FreeCell auto-fill defaults to on and honors an explicit opt-out', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  assert.equal(loadFreeCellAutoFill(storage), 'on');
  assert.equal(saveFreeCellAutoFill(storage, 'off'), 'off');
  assert.equal(loadFreeCellAutoFill(storage), 'off');
  assert.equal(saveFreeCellAutoFill(storage, 'on'), 'on');
  assert.equal(loadFreeCellAutoFill(storage), 'on');
  values.set('kabale-freecell-auto-fill-foundations', 'invalid');
  assert.equal(loadFreeCellAutoFill(storage), 'on');
  assert.equal(loadFreeCellAutoFill({ getItem() { throw new Error('blocked'); } }), 'on');
  assert.equal(saveFreeCellAutoFill({ setItem() { throw new Error('blocked'); } }, 'off'), 'off');
});

test('auto-move trigger defaults to double-click and tolerates unavailable storage', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  assert.equal(loadAutoMoveTrigger(storage), 'double');
  assert.equal(saveAutoMoveTrigger(storage, 'single'), 'single');
  assert.equal(loadAutoMoveTrigger(storage), 'single');
  assert.equal(saveAutoMoveTrigger(storage, 'invalid'), 'double');
  assert.equal(loadAutoMoveTrigger(storage), 'double');
  values.set('kabale-auto-move-trigger', 'invalid');
  assert.equal(loadAutoMoveTrigger(storage), 'double');
  assert.equal(loadAutoMoveTrigger({ getItem() { throw new Error('blocked'); } }), 'double');
  assert.equal(saveAutoMoveTrigger({ setItem() { throw new Error('blocked'); } }, 'single'), 'single');
});

test('language follows the browser default until the player chooses an override',()=>{
  assert.equal(loadLanguage(null,'da-DK'),'da');
  assert.equal(loadLanguage(null,'en-US'),'en');
  assert.equal(loadLanguage(null,'sv-SE'),'en');
  const saved = new Map();
  const storage = {getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)};
  saveLanguage(storage,'en');
  assert.equal(loadLanguage(storage,'da-DK'),'en');
  saveLanguage(storage,'da');
  assert.equal(loadLanguage(storage,'sv-SE'),'da');
});
