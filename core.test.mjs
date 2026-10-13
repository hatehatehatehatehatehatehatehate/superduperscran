import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from './core.mjs';

// A small deterministic fixture covering two rating sources and several categories.
function food(id, rating, extra = {}) {
  return {
    id, title: `Food ${id}`, subtitle: '', venue: `Venue ${id}`, country: 'ENG', price: 5, rating,
    source: 'scrandle', image: `assets/food/scrandle/${id}.webp`, venueCat: 'football',
    dishes: ['pie'], region: 'uk_ire', tier: 'standard', pct: rating, ...extra,
  };
}
const FOODS = [
  ...Array.from({ length: 30 }, (_, i) => food(`s${i}`, 10 + i * 2.5)),
  ...Array.from({ length: 12 }, (_, i) => food(`m${i}`, 40 + i * 4, { source: 'mensa', venueCat: 'canteen', dishes: ['curry'], region: 'europe' })),
  food('t1', 50, { dishes: ['burger'] }), food('t2', 50, { dishes: ['burger'] }),
];
const play = (s, pick) => { const side = typeof pick === 'function' ? pick(s) : pick; const r = C.choose(s, side); C.advance(s); return r; };
const best = s => C.winningSides(s.pair)[0];
const worst = s => 1 - C.winningSides(s.pair)[0];

test('seeded rng is deterministic and serialisable', () => {
  const a = { rng: 42 }, b = { rng: 42 };
  const xs = Array.from({ length: 5 }, () => C.random(a));
  assert.deepEqual(xs, Array.from({ length: 5 }, () => C.random(b)));
  assert.ok(xs.every(x => x >= 0 && x < 1));
  assert.deepEqual(structuredClone(a), a);
});

test('categories filter by venue, dish, region and price', () => {
  assert.equal(C.filterByCategory(FOODS, 'all:everything').length, FOODS.length);
  assert.equal(C.filterByCategory(FOODS, 'venue:canteen').length, 12);
  assert.equal(C.filterByCategory(FOODS, 'dish:curry').length, 12);
  assert.equal(C.filterByCategory(FOODS, 'region:europe').length, 12);
  assert.equal(C.filterByCategory(FOODS, 'price:standard').length, FOODS.length);
  assert.equal(C.filterByCategory(FOODS, 'nonsense:x').length, 0);
  assert.equal(C.isPlayable(FOODS, 'dish:burger'), false, 'two foods are not enough');
  assert.equal(C.isPlayable(FOODS, 'venue:canteen'), true);
});

test('pairs never mix rating sources and never repeat a food in a game', () => {
  const s = C.createGame(FOODS, { mode: 'classic', seed: 7, rounds: 10 });
  const seen = new Set();
  while (s.phase !== 'over') {
    const [a, b] = s.pair;
    assert.equal(a.source, b.source);
    assert.notEqual(a.rating, b.rating, 'pairs must have a winner');
    for (const f of s.pair) { assert.ok(!seen.has(f.id), `repeat ${f.id}`); seen.add(f.id); }
    play(s, best);
  }
  assert.equal(s.history.length, 10);
});

test('difficulty bands are respected when the pool allows it', () => {
  for (const [difficulty, lo, hi] of [['easy', 25, Infinity], ['medium', 10, 25], ['hard', 0, 10]]) {
    const s = C.createGame(FOODS, { categoryId: 'venue:football', difficulty, seed: 3, rounds: 5 });
    while (s.phase !== 'over') {
      const gap = C.gapOf(...s.pair);
      assert.ok(gap >= lo && gap < hi, `${difficulty} gap ${gap}`);
      play(s, best);
    }
  }
});

test('correct picks score with closeness and streak bonuses; wrong picks reset the streak', () => {
  const s = C.createGame(FOODS, { seed: 11, rounds: 4 });
  const r1 = play(s, best), r2 = play(s, best);
  assert.ok(r1.correct && r2.correct);
  assert.equal(r1.points, C.pointsFor(r1.gap, 1));
  assert.equal(r2.points, C.pointsFor(r2.gap, 2));
  assert.ok(C.pointsFor(2, 1) > C.pointsFor(40, 1), 'close calls are worth more');
  const r3 = play(s, worst);
  assert.equal(r3.correct, false); assert.equal(r3.points, 0);
  assert.equal(s.players[0].streak, 0); assert.equal(s.players[0].bestStreak, 2);
  assert.equal(s.players[0].score, r1.points + r2.points);
});

test('choose is ignored outside the choosing phase and for bad sides', () => {
  const s = C.createGame(FOODS, { seed: 5 });
  assert.equal(C.choose(s, 2), null);
  assert.ok(C.choose(s, 0));
  const frozen = structuredClone(s);
  assert.equal(C.choose(s, 1), null);
  assert.deepEqual(s, frozen);
});

test('a dead heat counts as correct for both sides', () => {
  assert.deepEqual(C.winningSides([{ rating: 50 }, { rating: 50 }]), [0, 1]);
  assert.deepEqual(C.winningSides([{ rating: 51 }, { rating: 50 }]), [0]);
  assert.deepEqual(C.winningSides([{ rating: 1 }, { rating: 50 }]), [1]);
});

test('daily special is identical for everyone on the same date and differs across dates', () => {
  const ids = s => { const out = []; while (s.phase !== 'over') { out.push(s.pair.map(f => f.id).join('|')); play(s, 0); } return out; };
  const a = ids(C.createGame(FOODS, { mode: 'daily', dailyKey: '2026-10-06' }));
  const b = ids(C.createGame(FOODS, { mode: 'daily', dailyKey: '2026-10-06', categoryId: 'venue:canteen', difficulty: 'hard' }));
  const c = ids(C.createGame(FOODS, { mode: 'daily', dailyKey: '2026-10-07' }));
  assert.equal(a.length, 10);
  assert.deepEqual(a, b, 'daily ignores the chosen category and difficulty');
  assert.notDeepEqual(a, c);
  assert.equal(C.dailyKey(new Date(2026, 0, 5)), '2026-01-05');
});

test('bottomless refills: winner stays on (capped) and three wrong answers end it', () => {
  const s = C.createGame(FOODS, { mode: 'endless', seed: 9 });
  assert.equal(s.lives, 3); assert.equal(s.totalRounds, Infinity);
  const top = s.pair[best(s)].id;
  play(s, best);
  assert.ok(s.pair.some(f => f.id === top), 'the crowd favourite stays on');
  let wrong = 0, guard = 0;
  while (s.phase !== 'over' && guard++ < 200) { const r = play(s, worst); if (!r.correct) wrong++; }
  assert.equal(s.phase, 'over'); assert.equal(wrong, 3); assert.equal(s.lives, 0);
});

test('pass the plate rotates players and ranks them', () => {
  const s = C.createGame(FOODS, { mode: 'party', players: ['Eli', 'Sam', 'Jo'], roundsPerPlayer: 2, seed: 4 });
  assert.equal(s.totalRounds, 6);
  const order = [];
  while (s.phase !== 'over') { order.push(C.currentPlayer(s).name); play(s, C.currentPlayer(s).name === 'Eli' ? best : worst); }
  assert.deepEqual(order, ['Eli', 'Sam', 'Jo', 'Eli', 'Sam', 'Jo']);
  const sum = C.summarize(s);
  assert.equal(sum.standings[0].name, 'Eli'); assert.equal(sum.winner, 'Eli');
});

test('answer records carry everything needed to save them to a file', () => {
  const s = C.createGame(FOODS, { seed: 21, sessionId: 'test-session' });
  const r = C.choose(s, 1, { ms: 1234.4, ts: '2026-10-06T12:00:00.000Z' });
  for (const k of C.ANSWER_FIELDS) assert.ok(k in r, `missing ${k}`);
  assert.equal(r.session, 'test-session'); assert.equal(r.side, 'right'); assert.equal(r.ms, 1234);
  assert.equal(r.pickedId, s.pair[1].id); assert.equal(r.otherId, s.pair[0].id);
  const csv = C.answersToCsv([r, { ...r, pickedTitle: 'Pie, "peas" & gravy' }]);
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0], C.ANSWER_FIELDS.join(','));
  assert.ok(lines[2].includes('"Pie, ""peas"" & gravy"'));
  assert.ok(C.answersToCsv([r], false).startsWith('2026-10-06'));
});

test('summary, grade, share text and lifetime aggregates', () => {
  const s = C.createGame(FOODS, { seed: 2, rounds: 5 });
  while (s.phase !== 'over') play(s, best);
  const sum = C.summarize(s);
  assert.equal(sum.correct, 5); assert.equal(sum.accuracy, 1); assert.equal(sum.grade.letter, 'S');
  assert.ok(sum.closestCall && sum.plateOfTheDay);
  const text = C.shareText(s);
  assert.match(text, /Eli's Scrandle Rip/); assert.equal([...text.split('\n')[1]].length, 5);
  const agg = C.aggregateAnswers(s.history);
  assert.equal(agg.answered, 5); assert.equal(agg.sessions, 1); assert.equal(agg.byCategory['all:everything'].correct, 5);
  assert.equal(C.grade(0.1).letter, 'E');
});

test('empty categories produce an empty game instead of crashing', () => {
  const s = C.createGame(FOODS, { categoryId: 'dish:burger' });
  assert.equal(s.phase, 'empty'); assert.equal(s.pair, null);
  assert.equal(C.choose(s, 0), null);
});

test('running out of food ends the game gracefully', () => {
  const tiny = FOODS.filter(f => f.source === 'mensa');
  const s = C.createGame(tiny, { seed: 1, rounds: 50 });
  let guard = 0;
  while (s.phase !== 'over' && guard++ < 100) play(s, 0);
  assert.equal(s.phase, 'over');
  assert.ok(s.history.length <= 6, 'twelve foods make at most six fresh pairs');
});

