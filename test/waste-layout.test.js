import test from 'node:test';
import assert from 'node:assert/strict';
import { wasteLayout } from '../src/waste-layout.js';

test('waste scatter is deterministic and stays within subtle offsets', () => {
  const cards = Array.from({length:5},(_,i)=>({id:`card-${i}`,r:i+1,s:'♠'}));
  const first = wasteLayout(cards);
  assert.deepEqual(wasteLayout(cards), first);
  assert.deepEqual(first.map(item=>item.card),cards.slice(-3));
  assert.ok(first.every(({angle,x,y})=>Math.abs(angle)<=3&&Math.abs(x)<=4&&Math.abs(y)<=4));
});

test('the last waste card remains the clickable top card', () => {
  const cards = [{id:'older',r:2,s:'♣'},{id:'newest',r:3,s:'♥'}];
  const layout = wasteLayout(cards);
  assert.deepEqual(layout.map(({top})=>top),[false,true]);
  assert.equal(layout.at(-1).card,cards.at(-1));
});

test('empty and one-card piles are supported', () => {
  assert.deepEqual(wasteLayout([]),[]);
  const [only] = wasteLayout([{id:'single',r:1,s:'♦'}]);
  assert.equal(only.top,true);
});

test('duplicate identities in a Spider deck get distinct, stable positions', () => {
  const cards = [0,1,2].map(pack=>({id:'duplicate-spider-card',r:7,s:'♠',pack}));
  const layout = wasteLayout(cards);
  assert.deepEqual(wasteLayout(cards),layout);
  assert.ok(new Set(layout.map(({angle,x,y})=>`${angle}:${x}:${y}`)).size>1);
});
