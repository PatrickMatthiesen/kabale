import test from 'node:test';
import assert from 'node:assert/strict';
import { boardLayout } from '../src/board-layout.js';

test('all game columns fit narrow phones, larger phones and desktop boards', () => {
  for (const mode of ['klondike','spider','freecell','pyramid']) {
    for (const contentWidth of [260,274,300,336,354,390,600,640,1080]) {
      const layout=boardLayout(mode,contentWidth);
      assert.ok(layout.cardWidth>0);
      assert.ok(layout.cardWidth<=82);
      assert.ok(layout.columns*layout.cardWidth+(layout.columns-1)*layout.gap<=contentWidth,`${mode} at ${contentWidth}px`);
      assert.ok(layout.faceStep<layout.cardWidth*14/9);
    }
  }
});

test('Spider and FreeCell use their actual column counts when switching games', () => {
  assert.equal(boardLayout('spider',354).columns,10);
  assert.equal(boardLayout('freecell',354).columns,8);
  assert.ok(boardLayout('spider',354).cardWidth<boardLayout('klondike',354).cardWidth);
});
