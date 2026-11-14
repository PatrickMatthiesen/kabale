import test from 'node:test';
import assert from 'node:assert/strict';
import { boardLayout } from '../src/board-layout.js';

test('all game columns fit narrow phones, larger phones and desktop boards', () => {
  for (const mode of ['klondike','spider','freecell','pyramid']) {
    for (const contentWidth of [260,274,300,336,354,390,600,640,1080]) {
      const layout=boardLayout(mode,contentWidth);
      assert.ok(layout.cardWidth>0);
      assert.ok(layout.cardWidth<=160);
      assert.ok(layout.columns*layout.cardWidth+(layout.columns-1)*layout.gap<=contentWidth,`${mode} at ${contentWidth}px`);
      assert.ok(layout.faceStep<layout.cardWidth*14/9);
    }
  }
});

test('desktop cards grow when both width and height are available', () => {
  const wide=boardLayout('klondike',1400,900);
  const short=boardLayout('klondike',1400,440);
  assert.ok(wide.cardWidth>82);
  assert.ok(wide.cardWidth>short.cardWidth);
  assert.ok(wide.cardWidth<=160);
  assert.ok(boardLayout('freecell',1400,600).cardWidth<wide.cardWidth);
});

test('mobile card width remains determined by columns, even in a short viewport', () => {
  assert.equal(boardLayout('spider',354,200).cardWidth,boardLayout('spider',354,900).cardWidth);
});

test('Spider and FreeCell use their actual column counts when switching games', () => {
  assert.equal(boardLayout('spider',354).columns,10);
  assert.equal(boardLayout('freecell',354).columns,8);
  assert.ok(boardLayout('spider',354).cardWidth<boardLayout('klondike',354).cardWidth);
});
