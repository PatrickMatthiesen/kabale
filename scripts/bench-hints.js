import { parseArgs } from 'node:util';
import { applyMove, deal, legalMoves } from '../src/engine.js';
import { selectHelpHint } from '../src/help-hint.js';
import { hintVisitKey } from '../src/hints.js';
import { rememberStock } from '../src/stock-memory.js';

const modes = ['klondike', 'spider', 'freecell', 'pyramid'];
const defaultMoveCap = 240;

export function seededDeal(mode, difficulty, seed) {
  let state = seed >>> 0;
  const random = Math.random;
  try {
    // Use Mulberry32 for the synchronous shuffle only.
    Math.random = () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = Math.imul(state ^ (state >>> 15), state | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 2 ** 32;
    };
    return deal(mode, difficulty);
  } finally {
    Math.random = random;
  }
}

// Play the supplied game in place, one Help recommendation at a time.
export function replayHints(game, maxMoves = defaultMoveCap) {
  rememberStock(game);
  const initial = hintVisitKey(game);
  const replayKey = position => JSON.stringify([position, game.stockMemory]);
  const visited = new Set([initial]);
  const visitedWithKnowledge = new Set([replayKey(initial)]);
  const startingMoves = game.moves;
  const hintMs = [];
  let stockExplorations = 0;
  let stockKnowledgeRevisits = 0;
  const finish = (outcome, details = {}) => ({
    outcome, moves: game.moves - startingMoves, hintMs, stockExplorations, stockKnowledgeRevisits, ...details
  });

  if (game.won) return finish('win');
  for (let turn = 0; turn < maxMoves; turn++) {
    const start = performance.now();
    // Keep Klondike's production node and depth limits without a wall-clock cutoff.
    const {move, plan} = selectHelpHint(game, visited, {maxTimeMs: Infinity});
    hintMs.push(performance.now() - start);

    const legal = legalMoves(game);
    if (!move) return finish(legal.length ? 'stalled' : 'dead-end');
    if (!legal.some(({from, to}) => from === move.from && to === move.to)) {
      return finish('invalid-hint', {move});
    }

    const before = structuredClone(game);
    if (!applyMove(game, move.from, move.to) || game.moves !== before.moves + 1) {
      return finish('invalid-hint', {move});
    }
    rememberStock(game, before);
    if (plan?.reason === 'explore') stockExplorations++;
    if (game.won) return finish('win');

    const position = hintVisitKey(game);
    const withKnowledge = replayKey(position);
    // Klondike can pass through an earlier stock split after learning more card faces.
    if (visitedWithKnowledge.has(withKnowledge)) return finish('repeat', {move, planReason: plan?.reason});
    if (visited.has(position)) stockKnowledgeRevisits++;
    visited.add(position);
    visitedWithKnowledge.add(withKnowledge);
  }
  return finish('move-cap');
}

function percentile(sorted, fraction) {
  return sorted[Math.ceil(sorted.length * fraction) - 1].toFixed(3);
}

function main() {
  const { values } = parseArgs({ options: {
    difficulty: { type: 'string', default: 'normal' },
    deals: { type: 'string', default: '32' },
    seed: { type: 'string', default: '1' },
    'max-moves': { type: 'string', default: String(defaultMoveCap) },
    help: { type: 'boolean' }
  } });
  if (values.help) {
    console.log('bun scripts/bench-hints.js [--difficulty normal|easy] [--deals 32] [--seed 1] [--max-moves 240]');
    console.log('Stalled means Help found no hint but legal moves remain. A repeat includes the stock knowledge.');
    return;
  }
  const { difficulty } = values;
  const [deals, seed, maxMoves] = [values.deals, values.seed, values['max-moves']].map(Number);
  if (![deals, seed, maxMoves].every(Number.isSafeInteger) || deals < 1 || maxMoves < 1 || seed < 0 ||
      seed + deals - 1 > 0xffffffff || !['normal', 'easy'].includes(difficulty)) {
    throw new Error('Use normal or easy, positive deal and move counts, and a seed range within 0 to 4294967295.');
  }

  console.log(`${difficulty}, ${deals} deals per game, seeds ${seed} to ${seed + deals - 1}, ${maxMoves} moves per deal`);
  console.log('Klondike uses the production node and depth limits with no elapsed-time cutoff.');
  const examples = [];
  const rows = modes.map(mode => {
    const row = {
      mode, win: 0, stalled: 0, 'dead-end': 0, repeat: 0, 'invalid-hint': 0, 'move-cap': 0,
      'stock explorations': 0, 'revisits with new knowledge': 0
    };
    const hintMs = [];
    for (let index = 0; index < deals; index++) {
      const dealSeed = seed + index;
      const result = replayHints(seededDeal(mode, difficulty, dealSeed), maxMoves);
      const { outcome, moves, move, planReason, stockExplorations, stockKnowledgeRevisits } = result;
      if ((outcome === 'repeat' || outcome === 'invalid-hint') && row[outcome] === 0) {
        examples.push({ mode, seed: dealSeed, outcome, moves, move, planReason });
      }
      row[outcome]++;
      row['stock explorations'] += stockExplorations;
      row['revisits with new knowledge'] += stockKnowledgeRevisits;
      for (const duration of result.hintMs) hintMs.push(duration);
    }
    hintMs.sort((a, b) => a - b);
    return { ...row, 'median hint ms': percentile(hintMs, 0.5), 'p95 hint ms': percentile(hintMs, 0.95) };
  });
  console.table(rows);
  for (const example of examples) console.log(example);
  if (rows.some(row => row['invalid-hint'])) process.exitCode = 1;
}

if (import.meta.main) main();
