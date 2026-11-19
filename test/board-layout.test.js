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

test('available height constrains card size on short viewports', () => {
  const short = boardLayout('klondike',600,160);
  const tall = boardLayout('klondike',600,900);
  assert.ok(short.cardWidth < tall.cardWidth);
  assert.equal(short.fits, false, 'minimum readable cards remain visible when the viewport is too short');
});

test('phone and desktop stacks expose the complete fluid rank and suit labels', () => {
  for (const mode of ['spider','freecell','klondike','pyramid']) for (const width of [260,274,300,336,354,390,640,1080,1680]) {
    const layout = boardLayout(mode,width);
    const indexSize=Math.min(layout.cardWidth*.46,Math.max(12,Math.min(layout.cardWidth*.4,layout.cardWidth*.2+14)));
    const indexInset=Math.max(2,Math.min(6,layout.cardWidth*.03));
    const labelHeight=indexSize*1.4025;
    assert.ok(layout.faceStep >= labelHeight+indexInset+4, `complete label is covered in ${mode} at ${width}px`);
    assert.ok(layout.columns * layout.cardWidth + (layout.columns - 1) * layout.gap <= width);
    assert.ok(layout.faceStep < layout.cardWidth * 14 / 9);
  }
});

test('Spider and FreeCell use their actual column counts when switching games', () => {
  assert.equal(boardLayout('spider',354).columns,10);
  assert.equal(boardLayout('freecell',354).columns,8);
  assert.ok(boardLayout('spider',354).cardWidth<boardLayout('klondike',354).cardWidth);
});

test('long tableau stacks fit when possible and report when readable minimum cannot fit', () => {
  for (const mode of ['klondike','spider','freecell']) {
    const stacks = Array.from({ length: boardLayout(mode,900).columns }, (_, i) => ({ face: i === 0 ? 18 : 5, back: i === 0 ? 2 : 0 }));
    const wide = boardLayout(mode,1600,1800,{ stacks, reserveGap: 12 });
    const { cardWidth, faceStep, backStep } = wide;
    const exactHeight = 2 * cardWidth * 14 / 9 + 12 + 18 * faceStep + 2 * backStep;
    assert.equal(wide.fits, true, `${mode} should fit the available board height`);
    assert.ok(exactHeight <= 1800);

    const short = boardLayout(mode,900,220,{ stacks, reserveGap: 12 });
    assert.equal(short.fits, false, `${mode} should report overflow instead of shrinking below readable size`);
    assert.ok(short.cardWidth >= 40);
  }
});

test('Pyramid accounts for all seven overlapping rows and reserve separation', () => {
  const layout = boardLayout('pyramid',1200,1100,{ reserveGap: 12 });
  assert.equal(layout.fits, true);
  assert.ok(3.92 * layout.cardWidth * 14 / 9 + 12 <= 1100);
  const tight = boardLayout('pyramid',1200,200,{ reserveGap: 12 });
  assert.equal(tight.fits, false);
  assert.ok(tight.cardWidth >= 40);
});

test('compact rank and suit labels allow larger cards in a tight board', () => {
  const stacks = [{ face: 12, back: 0 }];
  const regular = boardLayout('klondike',1400,720,{ stacks });
  const compact = boardLayout('klondike',1400,720,{ stacks, compact: true });
  assert.ok(compact.faceStep < regular.faceStep);
  assert.ok(compact.cardWidth > regular.cardWidth);
});

test('FreeCell side reserves fit in the width and height calculations', () => {
  const stacks = Array.from({ length: 8 }, (_, i) => ({ face: i < 4 ? 7 : 6, back: 0 }));
  const layout = boardLayout('freecell',1200,900,{ stacks, sideReserves: true });
  assert.equal(layout.sideReserves, true);
  assert.ok(8 * layout.cardWidth + 9 * layout.gap + 1.28 * layout.cardWidth + 1 <= 1200);
  const height = Math.max(
    layout.cardWidth * 14 / 9 + 7 * layout.faceStep,
    4 * (.64 * layout.cardWidth * 14 / 9) + 3 * layout.gap
  );
  assert.ok(height <= 900);
});
