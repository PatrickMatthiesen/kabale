import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { cardFace } from '../src/card-art.js';

const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const rank = c => ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][c.r];
function renderer(style) {
  const context = {
    cardFace, art: {resolved: style}, cardPixels: 34,
    window: {devicePixelRatio: 3}, selected: null, hint: null, g: {},
    getHintRole: () => '', rank,
    suitNames: {'♣':'clubs','♠':'spades','♥':'hearts','♦':'diamonds'},
    sourceLabel: () => 'Column 1'
  };
  vm.runInNewContext(source.slice(source.indexOf('function card('), source.indexOf('function waste(')) + ';globalThis.renderCard=card;', context);
  return context.renderCard;
}

test('each face has two independent, correct rank and text-suit labels in either deck', () => {
  for (const style of ['engraved','woodcut']) {
    const renderCard = renderer(style);
    const labels = new Set();
    for (const s of ['♣','♠','♥','♦']) for (let r=1;r<=13;r++) {
      const html = renderCard({r,s,up:true},'col:0:0');
      const corners = [...html.matchAll(/class="card-index card-index-(top|bottom)"><b>(.*?)<\/b><span>(.*?)<\/span>/g)];
      assert.equal(corners.length,2);
      for (const corner of corners) {
        assert.equal(corner[2],rank({r}));
        assert.equal(corner[3],s+'\uFE0E');
      }
      assert.ok(!html.includes('\\uFE0E'),'Unicode escapes must not appear as visible text');
      assert.ok(html.includes(`data-art="${style}"`),'drag clones carry their own deck styling');
      labels.add(corners[0][2]+corners[0][3]);
    }
    assert.equal(labels.size,52,'shared numeric artwork must not erase individual card values');
  }
});

test('face-down markup never reveals any card identity or face asset', () => {
  const renderCard=renderer('woodcut');
  for (const s of ['♣','♠','♥','♦']) for (let r=1;r<=13;r++) {
    const html=renderCard({r,s,up:false},'col:0:0');
    assert.ok(html.includes('aria-label="Face down card, Column 1"'));
    assert.ok(!/card-index|data-rank|data-suit|background-image|full-face/.test(html));
    assert.ok(!html.includes(s));
  }
});
