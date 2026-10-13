// core.mjs: pure game rules for Eli's Scrandle Rip. No DOM, no storage, no audio.
// Imported by Node tests; build.py strips the `export` keywords and inlines it.

export const GAME_TITLE = "Eli's Scrandle Rip";
export const PERCENT_SOURCES = ['scrandle', 'mensa'];
export const MAX_PLAYERS = 4;
export const ENDLESS_LIVES = 3;
export const CHAMPION_LIMIT = 3;

export const DIFFICULTIES = {
  mixed: { label: 'House Mix', min: 0, max: Infinity, blurb: 'Any gap at all. A bit of everything.' },
  easy: { label: 'Easy Peasy', min: 25, max: Infinity, blurb: 'The crowd was 25+ points apart.' },
  medium: { label: 'Medium Rare', min: 10, max: 25, blurb: '10–25 points between them.' },
  hard: { label: "Knife's Edge", min: 0, max: 10, blurb: 'Under 10 points. Pure instinct.' },
};

export const MODES = {
  classic: { label: 'Classic', emoji: '🍽️', blurb: 'Ten plates. Back the crowd’s favourite.' },
  endless: { label: 'Bottomless Refills', emoji: '☕', blurb: 'Winner stays on. Three spills and you’re out.' },
  party: { label: 'Pass the Plate', emoji: '🫶', blurb: '2–4 players take turns on one device.' },
  daily: { label: 'Daily Special', emoji: '📅', blurb: 'Same ten plates for everyone today.' },
};

// ---------------------------------------------------------------- seeded randomness
export function hashString(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function random(state) {
  // mulberry32 over a serialisable integer kept on the state
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function dailyKey(date = new Date()) {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dailySeed(key) {
  return hashString(`eli-scrandle-rip:daily:${key}`);
}

// ---------------------------------------------------------------- categories
export function filterByCategory(foods, categoryId) {
  const [group, slug] = String(categoryId || 'all:everything').split(':');
  if (group === 'all') return foods.slice();
  if (group === 'venue') return foods.filter(f => f.venueCat === slug);
  if (group === 'dish') return foods.filter(f => (f.dishes || []).includes(slug));
  if (group === 'region') return foods.filter(f => f.region === slug);
  if (group === 'price') return foods.filter(f => f.tier === slug);
  return [];
}

// Foods are only ever paired with foods from the same rating source.
export function groupBySource(foods, minPerSource = 8) {
  const map = new Map();
  for (const f of foods) {
    if (!map.has(f.source)) map.set(f.source, []);
    map.get(f.source).push(f);
  }
  return [...map.entries()]
    .filter(([, list]) => list.length >= minPerSource)
    .map(([source, list]) => ({ source, foods: list }))
    .sort((a, b) => b.foods.length - a.foods.length || a.source.localeCompare(b.source));
}

export function isPlayable(foods, categoryId, minPerSource = 8) {
  return groupBySource(filterByCategory(foods, categoryId), minPerSource).length > 0;
}

// ---------------------------------------------------------------- pairing
export function gapOf(a, b) {
  const pct = PERCENT_SOURCES.includes(a.source) && a.source === b.source;
  const diff = pct ? Math.abs(a.rating - b.rating) : Math.abs((a.pct ?? 0) - (b.pct ?? 0));
  return Math.round(diff * 100) / 100;
}

export function inBand(gap, difficulty) {
  const band = DIFFICULTIES[difficulty] || DIFFICULTIES.mixed;
  return gap > 0 && gap >= band.min && gap < band.max;
}

function pickIndex(state, n) {
  return Math.floor(random(state) * n);
}

function chooseSource(state) {
  const total = state.sources.reduce((n, s) => n + s.foods.length, 0);
  let roll = random(state) * total;
  for (const s of state.sources) {
    roll -= s.foods.length;
    if (roll < 0) return s;
  }
  return state.sources[state.sources.length - 1];
}

function findChallenger(state, list, anchor, used, strict) {
  for (let i = 0; i < 80; i++) {
    const b = list[pickIndex(state, list.length)];
    if (b.id === anchor.id || used.has(b.id) || (b.image && b.image === anchor.image)) continue;
    const gap = gapOf(anchor, b);
    if (strict ? inBand(gap, state.difficulty) : gap > 0) return b;
  }
  return null;
}

// Build the next pair. `stayer` keeps its seat (Bottomless Refills).
export function makePair(state, stayer = null) {
  const used = new Set(state.used);
  const pool = stayer ? state.sources.find(s => s.source === stayer.source) : chooseSource(state);
  if (!pool) return null;
  const list = pool.foods;
  for (const strict of [true, false]) {
    for (let attempt = 0; attempt < 120; attempt++) {
      const a = stayer || list[pickIndex(state, list.length)];
      if (!stayer && used.has(a.id)) continue;
      const b = findChallenger(state, list, a, used, strict);
      if (b) return random(state) < 0.5 ? [a, b] : [b, a];
      if (stayer) break;
    }
  }
  return null;
}

// ---------------------------------------------------------------- game state
export function createGame(foods, opts = {}) {
  const mode = MODES[opts.mode] ? opts.mode : 'classic';
  const categoryId = mode === 'daily' ? 'all:everything' : opts.categoryId || 'all:everything';
  const difficulty = mode === 'daily' ? 'mixed' : DIFFICULTIES[opts.difficulty] ? opts.difficulty : 'mixed';
  const seed = (opts.seed ?? (mode === 'daily' ? dailySeed(opts.dailyKey || dailyKey()) : Date.now())) >>> 0;
  const names = mode === 'party' ? (opts.players || ['Player 1', 'Player 2']).slice(0, MAX_PLAYERS) : [opts.playerName || 'You'];
  const perPlayer = Math.max(1, opts.roundsPerPlayer || 5);
  const state = {
    mode, categoryId, difficulty, seed, rng: seed,
    dailyKey: mode === 'daily' ? opts.dailyKey || dailyKey() : null,
    sessionId: opts.sessionId || `g${seed.toString(36)}`,
    sources: groupBySource(filterByCategory(foods, categoryId), opts.minPerSource ?? 8),
    players: names.map(name => ({ name: String(name).slice(0, 18) || 'Player', score: 0, correct: 0, answered: 0, streak: 0, bestStreak: 0 })),
    totalRounds: mode === 'endless' ? Infinity : mode === 'party' ? perPlayer * names.length : opts.rounds || 10,
    lives: mode === 'endless' ? ENDLESS_LIVES : null,
    round: 0, turn: 0, phase: 'choosing', pair: null, champion: null, championWins: 0,
    used: [], history: [], events: [],
  };
  if (!state.sources.length) {
    state.phase = 'empty';
    return state;
  }
  nextPair(state);
  return state;
}

function nextPair(state) {
  const stay = state.mode === 'endless' && state.champion && state.championWins < CHAMPION_LIMIT ? state.champion : null;
  let pair = makePair(state, stay);
  if (!pair && stay) pair = makePair(state, null);
  if (!pair) {
    state.phase = 'over';
    state.pair = null;
    state.events.push({ type: 'over', reason: 'out-of-food' });
    return false;
  }
  state.pair = pair;
  for (const f of pair) if (!state.used.includes(f.id)) state.used.push(f.id);
  state.round += 1;
  state.phase = 'choosing';
  state.events.push({ type: 'pair', round: state.round });
  return true;
}

export function currentPlayer(state) {
  return state.players[state.turn % state.players.length];
}

// Which side(s) the crowd preferred: [0], [1], or [0, 1] on a dead heat.
export function winningSides(pair) {
  const [a, b] = pair;
  if (a.rating === b.rating) return [0, 1];
  return a.rating > b.rating ? [0] : [1];
}

export function pointsFor(gap, streak) {
  const closeness = Math.max(0, 25 - Math.min(gap, 25)) * 2; // up to +50 for knife-edge calls
  return 100 + Math.round(closeness) + 20 * Math.min(Math.max(streak - 1, 0), 5);
}

// The player picks side 0 or 1. Returns the answer record (also pushed to history).
export function choose(state, side, meta = {}) {
  if (state.phase !== 'choosing' || !state.pair || (side !== 0 && side !== 1)) return null;
  const player = currentPlayer(state);
  const picked = state.pair[side], other = state.pair[1 - side];
  const winners = winningSides(state.pair);
  const correct = winners.includes(side);
  const gap = gapOf(picked, other);
  player.answered += 1;
  let points = 0;
  if (correct) {
    player.streak += 1;
    player.bestStreak = Math.max(player.bestStreak, player.streak);
    player.correct += 1;
    points = pointsFor(gap, player.streak);
    player.score += points;
  } else {
    player.streak = 0;
    if (state.lives !== null) state.lives -= 1;
  }
  const record = answerRecord(state, player, side, correct, gap, points, meta);
  state.history.push(record);
  if (state.mode === 'endless') {
    const top = state.pair[winners[0]];
    if (state.champion && state.champion.id === top.id) state.championWins += 1;
    else { state.champion = top; state.championWins = 1; }
  }
  state.phase = 'revealed';
  state.events.push({ type: correct ? 'correct' : 'wrong', side, points });
  return record;
}

export function answerRecord(state, player, side, correct, gap, points, meta = {}) {
  const [left, right] = state.pair, picked = state.pair[side], other = state.pair[1 - side];
  return {
    v: 1,
    ts: meta.ts || new Date().toISOString(),
    session: state.sessionId,
    mode: state.mode,
    daily: state.dailyKey,
    category: state.categoryId,
    difficulty: state.difficulty,
    round: state.round,
    player: player.name,
    side: side === 0 ? 'left' : 'right',
    pickedId: picked.id, pickedTitle: picked.title, pickedVenue: picked.venue, pickedRating: picked.rating,
    otherId: other.id, otherTitle: other.title, otherVenue: other.venue, otherRating: other.rating,
    leftId: left.id, rightId: right.id,
    source: picked.source,
    correct, gap, points,
    ms: Number.isFinite(meta.ms) ? Math.round(meta.ms) : null,
  };
}

// Move on after the reveal. Returns false once the game is over.
export function advance(state) {
  if (state.phase !== 'revealed') return state.phase !== 'over';
  const outOfLives = state.lives !== null && state.lives <= 0;
  if (outOfLives || state.round >= state.totalRounds) {
    state.phase = 'over';
    state.pair = null;
    state.events.push({ type: 'over', reason: outOfLives ? 'lives' : 'rounds' });
    return false;
  }
  state.turn += 1;
  return nextPair(state);
}


// ---------------------------------------------------------------- results
export function standings(state) {
  return state.players
    .map((p, i) => ({ ...p, index: i, accuracy: p.answered ? p.correct / p.answered : 0 }))
    .sort((a, b) => b.score - a.score || b.correct - a.correct || a.index - b.index);
}

export function summarize(state) {
  const rows = state.history;
  const correct = rows.filter(r => r.correct).length;
  const closest = rows.filter(r => r.correct).sort((a, b) => a.gap - b.gap)[0] || null;
  const bestPick = rows.filter(r => r.correct).sort((a, b) => b.pickedRating - a.pickedRating)[0] || null;
  const ranking = standings(state);
  const top = ranking[0];
  const tie = ranking.length > 1 && ranking[1].score === top.score;
  return {
    mode: state.mode, category: state.categoryId, difficulty: state.difficulty, daily: state.dailyKey,
    rounds: rows.length, correct, accuracy: rows.length ? correct / rows.length : 0,
    score: state.players.reduce((n, p) => n + p.score, 0),
    bestStreak: Math.max(0, ...state.players.map(p => p.bestStreak)),
    closestCall: closest, plateOfTheDay: bestPick,
    standings: ranking, winner: tie ? null : top.name,
    grade: grade(rows.length ? correct / rows.length : 0),
  };
}

export function grade(accuracy) {
  if (accuracy >= 0.95) return { letter: 'S', title: 'Michelin Mouth' };
  if (accuracy >= 0.8) return { letter: 'A', title: 'Head Chef' };
  if (accuracy >= 0.65) return { letter: 'B', title: 'Sous Chef' };
  if (accuracy >= 0.5) return { letter: 'C', title: 'Line Cook' };
  if (accuracy >= 0.3) return { letter: 'D', title: 'Kitchen Porter' };
  return { letter: 'E', title: 'Microwave Enthusiast' };
}

export function shareText(state, title = GAME_TITLE) {
  const s = summarize(state);
  const squares = state.history.map(r => (r.correct ? (r.gap < 10 ? '🟨' : '🟩') : '🟥')).join('');
  const head = state.mode === 'daily' ? `${title} · Daily Special ${state.dailyKey}` : `${title} · ${MODES[state.mode].label}`;
  return `${head}\n${squares}\n${s.correct}/${s.rounds} · ${s.score} pts · ${s.grade.letter} ${s.grade.title}`;
}

// ---------------------------------------------------------------- answer log helpers
export const ANSWER_FIELDS = [
  'ts', 'session', 'mode', 'daily', 'category', 'difficulty', 'round', 'player', 'side',
  'pickedId', 'pickedTitle', 'pickedVenue', 'pickedRating', 'otherId', 'otherTitle', 'otherVenue', 'otherRating',
  'source', 'correct', 'gap', 'points', 'ms',
];

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function answersToCsv(rows, header = true) {
  const lines = rows.map(r => ANSWER_FIELDS.map(k => csvCell(r[k])).join(','));
  return (header ? [ANSWER_FIELDS.join(','), ...lines] : lines).join('\n') + (lines.length || header ? '\n' : '');
}

// Lifetime stats from any list of answer records (local log or server file).
export function aggregateAnswers(rows) {
  const byCategory = {}, byFood = {};
  let correct = 0;
  for (const r of rows) {
    if (r.correct) correct += 1;
    const c = (byCategory[r.category] ||= { answered: 0, correct: 0 });
    c.answered += 1;
    if (r.correct) c.correct += 1;
    const f = (byFood[r.pickedId] ||= { title: r.pickedTitle, picks: 0 });
    f.picks += 1;
  }
  const sessions = new Set(rows.map(r => r.session)).size;
  const favourites = Object.entries(byFood).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.picks - a.picks).slice(0, 5);
  return { answered: rows.length, correct, accuracy: rows.length ? correct / rows.length : 0, sessions, byCategory, favourites };
}

