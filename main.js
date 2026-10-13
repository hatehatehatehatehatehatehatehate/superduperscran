'use strict';
/* ============ main.js: browser shell for Eli's Scrandle Rip (DOM, storage, saving, flow) ============ */
const DB = window.SCRAN_DB || { foods: [], categories: [], countries: {}, sources: {}, minPlayable: 8 };
const $ = id => document.getElementById(id);
const STORE = { settings: 'esr:settings', log: 'esr:answers', pending: 'esr:pending', best: 'esr:best', daily: 'esr:daily', sound: 'esr:sound' };
const load = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } };
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pick = list => list[Math.floor(Math.random() * list.length)];
const TABS = [['all', 'Everything'], ['venue', 'Venues'], ['dish', 'Dishes'], ['region', 'Regions'], ['price', 'Prices']];
const CATS = new Map(DB.categories.map(c => [c.id, c]));
const PLAYABLE = new Map(DB.categories.map(c => [c.id, isPlayable(DB.foods, c.id, DB.minPlayable || 8)]));
const RIGHT = ["Chef's kiss!", 'The crowd agrees!', 'Absolute scran instinct.', 'Plate licked clean.', 'Ten out of ten, no notes.'];
const CLOSE = ["Knife's-edge call. Nailed it!", 'By a whisker! What a palate.', 'Photo finish, and you called it.'];
const WRONG = ['Sent back to the kitchen.', 'The crowd disagrees…', 'Bit undercooked, that one.', 'Spilled the gravy.', 'Respectfully: no.'];

const ui = {
  screen: 'lobby', game: null, shownAt: 0, busy: false,
  settings: Object.assign({ mode: 'classic', categoryId: 'all:everything', difficulty: 'mixed', tab: 'all',
    players: ['Player 1', 'Player 2'], roundsPerPlayer: 5, musicOn: true }, load(STORE.settings, {})),
};
if (!CATS.has(ui.settings.categoryId) || !PLAYABLE.get(ui.settings.categoryId)) ui.settings.categoryId = 'all:everything';
const persist = () => save(STORE.settings, ui.settings);

function toast(text, ms = 2600) {
  const el = $('toast');
  el.textContent = text; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, ms);
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------------- answer saving ----------------
 * Every answer goes to the browser log (stats + exports). On top of that:
 *  - served by serve.py -> POSTed and appended to data/answers/answers.jsonl + answers.csv
 *  - opened as a file   -> optionally rewritten into a CSV you link (Chromium File System Access API)
 */
const Saver = {
  mode: 'local', serverCount: 0, files: [], handle: null, flushing: false,
  async init() {
    if (location.protocol.startsWith('http')) {
      try {
        const res = await fetch('api/health', { cache: 'no-store' });
        if (res.ok) { const j = await res.json(); this.mode = 'file'; this.serverCount = j.answers; this.files = j.files || []; }
      } catch { /* static hosting without the save server */ }
    }
    setInterval(() => { if (this.mode === 'error') this.flush(); }, 8000);
    this.render();
    this.flush();
  },
  log: () => load(STORE.log, []),
  record(rec) {
    const log = this.log(); log.push(rec); save(STORE.log, log);
    if (this.mode === 'file' || this.mode === 'error') {
      const pending = load(STORE.pending, []); pending.push(rec); save(STORE.pending, pending);
      this.flush();
    }
    if (this.handle) this.writeLinked();
    this.render();
  },
  async flush() {
    const batch = load(STORE.pending, []);
    if (this.flushing || !batch.length || this.mode === 'local' || this.mode === 'linked') return;
    this.flushing = true;
    try {
      const res = await fetch('api/answers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: batch }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      save(STORE.pending, load(STORE.pending, []).slice(batch.length));
      this.serverCount = j.total; this.mode = 'file';
    } catch { this.mode = 'error'; }
    this.flushing = false;
    this.render();
    if (this.mode === 'file' && load(STORE.pending, []).length) this.flush();
  },
  async link() {
    try {
      this.handle = await window.showSaveFilePicker({ suggestedName: 'scrandle-rip-answers.csv', types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }] });
      this.mode = 'linked';
      await this.writeLinked();
      toast(`Linked! Answers now save to ${this.handle.name}`);
    } catch (e) { if (e?.name !== 'AbortError') toast('Could not link that file.'); }
    this.render();
  },
  async writeLinked() {
    try {
      const w = await this.handle.createWritable();
      await w.write(answersToCsv(this.log()));
      await w.close();
    } catch { this.handle = null; this.mode = 'local'; toast('Lost access to the linked file; saving in this browser.'); this.render(); }
  },
  render() {
    const pill = $('save-pill'), text = $('save-text'), pending = load(STORE.pending, []).length;
    pill.className = 'chip save-pill ' + (this.mode === 'file' || this.mode === 'linked' ? 'file' : this.mode);
    $('link-file').hidden = !(this.mode === 'local' && 'showSaveFilePicker' in window);
    if (this.mode === 'file') {
      text.textContent = `Saving to ${this.files[0] || 'data/answers/answers.jsonl'} · ${this.serverCount}`;
      pill.title = `Every answer is appended to ${this.files.join(' and ')}`;
    } else if (this.mode === 'linked') {
      text.textContent = `Saving to ${this.handle?.name} · ${this.log().length}`;
      pill.title = 'Answers are written to the CSV file you linked';
    } else if (this.mode === 'error') {
      text.textContent = `Save server offline · ${pending} queued`;
      pill.title = 'Answers are kept and re-sent automatically when serve.py is back';
    } else {
      text.textContent = 'Saving in this browser only';
      pill.title = 'Run "python3 serve.py" to save every answer to data/answers/, or link a file / export from the lobby';
    }
    renderStats();
  },
};

function renderStats() {
  const agg = aggregateAnswers(Saver.log());
  $('st-answered').textContent = Saver.mode === 'file' ? Saver.serverCount : agg.answered;
  $('st-acc').textContent = agg.answered ? `${Math.round(agg.accuracy * 100)}%` : '–';
  $('st-best').textContent = Math.max(0, ...Object.values(load(STORE.best, {})));
  $('save-detail').textContent = Saver.mode === 'file' ? 'saved to data/answers/' : 'saved in this browser';
}

/* ---------------- music ---------------- */
function syncSoundUi() {
  $('music-btn').textContent = `🎵 Music: ${ui.settings.musicOn && Sound.isPlaying() ? 'on' : 'off'}`;
  $('music-btn').setAttribute('aria-pressed', String(ui.settings.musicOn && Sound.isPlaying()));
  $('mute-btn').textContent = Sound.settings.muted ? '🔇' : '🔊';
  $('mute-btn').setAttribute('aria-pressed', String(Sound.settings.muted));
  $('music-vol').value = Math.round(Sound.settings.music * 100);
}
async function wakeAudio() {
  if (ui.settings.musicOn && !Sound.isPlaying()) { await Sound.startMusic(); syncSoundUi(); }
}


/* ---------------- lobby ---------------- */
function catLabel(id) {
  const c = CATS.get(id);
  return c ? `${c.emoji} ${c.label}` : '🍽️ Everything';
}

function renderModes() {
  const today = load(STORE.daily, {})[dailyKey()];
  $('modes').innerHTML = Object.entries(MODES).map(([key, m]) => `
    <button class="mode${ui.settings.mode === key ? ' on' : ''}" data-mode="${key}" aria-pressed="${ui.settings.mode === key}">
      <span class="em">${m.emoji}</span><b>${esc(m.label)}</b><small>${esc(m.blurb)}</small>
      ${key === 'daily' ? `<span class="badge">${today ? `Today: ${today.correct}/${today.rounds} · ${today.score} pts ✓` : `Fresh today · ${dailyKey()}`}</span>` : ''}
    </button>`).join('');
  const daily = ui.settings.mode === 'daily';
  $('cats').classList.toggle('disabled', daily);
  $('party-setup').hidden = ui.settings.mode !== 'party';
  $('difficulty-setup').hidden = daily;
  $('mode-hint').textContent = daily ? 'Daily uses the whole menu' : '';
  updateStart();
}

function renderTabs() {
  $('cat-tabs').innerHTML = TABS.map(([key, label]) =>
    `<button class="chip${ui.settings.tab === key ? ' on' : ''}" data-tab="${key}">${label}</button>`).join('');
}

function renderCats() {
  const list = DB.categories.filter(c => c.group === ui.settings.tab && (c.count > 0 || c.group === 'venue'));
  const open = list.filter(c => PLAYABLE.get(c.id));
  $('cat-count').textContent = `${open.length} of ${list.length} open`;
  $('cats').innerHTML = list.map(c => {
    const playable = PLAYABLE.get(c.id), on = ui.settings.categoryId === c.id;
    const sub = playable ? `${c.count.toLocaleString()} plates` : c.count ? `${c.count} plates · needs ${DB.minPlayable}+` : 'Awaiting photos';
    return `<button class="cat${on ? ' on' : ''}${playable ? '' : ' locked'}" data-cat="${c.id}" ${playable ? '' : 'aria-disabled="true"'} title="${esc(c.blurb)}">
      <span class="em">${c.emoji}</span><b>${esc(c.label)}</b><small>${esc(sub)}</small></button>`;
  }).join('');
  const locked = list.length - open.length;
  $('cat-note').innerHTML = ui.settings.tab === 'venue' && locked
    ? `🔒 ${locked} venue types (fast food, restaurants, school dinners…) unlock when foods are added to <code>data/custom/manifest.csv</code>.`
    : esc(CATS.get(ui.settings.categoryId)?.blurb || '');
}

function renderDifficulty() {
  $('difficulty').innerHTML = Object.entries(DIFFICULTIES).map(([key, d]) =>
    `<button class="chip${ui.settings.difficulty === key ? ' on' : ''}" data-diff="${key}">${esc(d.label)}</button>`).join('');
  $('difficulty-note').textContent = DIFFICULTIES[ui.settings.difficulty].blurb;
}

function renderPlayers() {
  const ps = ui.settings.players;
  $('players').innerHTML = ps.map((name, i) => `
    <label>🍴<input value="${esc(name)}" maxlength="18" data-player="${i}" aria-label="Player ${i + 1} name">
    ${ps.length > 2 ? `<button data-remove="${i}" aria-label="Remove player ${i + 1}">✕</button>` : ''}</label>`).join('');
  $('add-player').hidden = ps.length >= MAX_PLAYERS;
  $('party-rounds').innerHTML = [3, 5, 8].map(n =>
    `<button class="chip${ui.settings.roundsPerPlayer === n ? ' on' : ''}" data-rounds="${n}">${n} rounds</button>`).join('');
}

function updateStart() {
  const id = ui.settings.mode === 'daily' ? 'all:everything' : ui.settings.categoryId;
  const ok = PLAYABLE.get(id);
  $('start-btn').disabled = !ok;
  const label = !ok ? 'Pick an open category' : ui.settings.mode === 'daily' ? "Serve today's special ↗" : 'Serve it up ↗';
  const sub = ok ? (ui.settings.mode === 'daily' ? `📅 ${dailyKey()}` : `${catLabel(id)} · ${DIFFICULTIES[ui.settings.difficulty].label}`) : '';
  $('start-btn').innerHTML = `${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
}

function renderLobby() {
  renderModes(); renderTabs(); renderCats(); renderDifficulty(); renderPlayers(); updateStart(); renderStats();
  $('save-help').innerHTML = Saver.mode === 'file'
    ? 'Every answer is appended to <code>data/answers/answers.jsonl</code> and <code>answers.csv</code>.'
    : 'Tip: run <code>python3 serve.py</code> to save every answer straight into <code>data/answers/</code>.';
}


function wireLobby() {
  $('modes').addEventListener('click', e => {
    const b = e.target.closest('[data-mode]'); if (!b) return;
    ui.settings.mode = b.dataset.mode; persist(); Sound.play('pick'); renderModes();
  });
  $('cat-tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    ui.settings.tab = b.dataset.tab; persist(); renderTabs(); renderCats();
  });
  $('cats').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    if (!PLAYABLE.get(b.dataset.cat)) { toast('That one is still waiting for photos 📸'); return; }
    ui.settings.categoryId = b.dataset.cat; persist(); Sound.play('pick'); renderCats(); updateStart();
  });
  $('difficulty').addEventListener('click', e => {
    const b = e.target.closest('[data-diff]'); if (!b) return;
    ui.settings.difficulty = b.dataset.diff; persist(); renderDifficulty(); updateStart();
  });
  $('players').addEventListener('input', e => {
    const i = e.target.dataset.player; if (i === undefined) return;
    ui.settings.players[i] = e.target.value; persist();
  });
  $('players').addEventListener('click', e => {
    const b = e.target.closest('[data-remove]'); if (!b) return;
    ui.settings.players.splice(Number(b.dataset.remove), 1); persist(); renderPlayers();
  });
  $('add-player').addEventListener('click', () => {
    if (ui.settings.players.length < MAX_PLAYERS) ui.settings.players.push(`Player ${ui.settings.players.length + 1}`);
    persist(); renderPlayers();
  });
  $('party-rounds').addEventListener('click', e => {
    const b = e.target.closest('[data-rounds]'); if (!b) return;
    ui.settings.roundsPerPlayer = Number(b.dataset.rounds); persist(); renderPlayers();
  });
  $('start-btn').addEventListener('click', startGame);
  $('link-file').addEventListener('click', () => Saver.link());
  $('export-csv').addEventListener('click', () => download(`scrandle-rip-answers-${dailyKey()}.csv`, answersToCsv(Saver.log()), 'text/csv'));
  $('export-json').addEventListener('click', () => download(`scrandle-rip-answers-${dailyKey()}.json`, JSON.stringify(Saver.log(), null, 1), 'application/json'));
  $('clear-local').addEventListener('click', () => {
    if (!confirm('Clear the answer log stored in this browser? Files in data/answers/ are not touched.')) return;
    save(STORE.log, []); Saver.render(); toast('Browser log cleared.');
  });
}

/* ---------------- screens ---------------- */
function show(screen) {
  ui.screen = screen;
  for (const id of ['lobby', 'game', 'results']) $(id).hidden = id !== screen;
  $('home-btn').hidden = screen === 'lobby';
  Sound.setMode(screen === 'game' ? 'game' : 'lobby');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startGame() {
  wakeAudio();
  const s = ui.settings;
  if (s.mode === 'daily' && load(STORE.daily, {})[dailyKey()] && !confirm("You've already had today's special. Play it again just for fun? (Your first score is kept.)")) return;
  const players = s.players.map((p, i) => p.trim() || `Player ${i + 1}`);
  ui.game = createGame(DB.foods, {
    mode: s.mode, categoryId: s.categoryId, difficulty: s.difficulty, players, roundsPerPlayer: s.roundsPerPlayer,
    minPerSource: DB.minPlayable || 8, sessionId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
  });
  if (ui.game.phase === 'empty') { toast('Not enough plates in that category yet.'); return; }
  Sound.play('plate');
  show('game');
  renderRound();
}


/* ---------------- game ---------------- */
function money(price) {
  if (price === null || price === undefined) return null;
  return price === 0 ? 'Free' : `£${Number(price).toFixed(2)}`;
}

function cardHtml(food, side) {
  const c = DB.countries[food.country] || {};
  const where = [c.flag, food.venue].filter(Boolean).join(' ');
  const tags = [money(food.price), food.year, c.name].filter(v => v !== null && v !== undefined && v !== '');
  const img = food.image || food.imageRemote || '';
  return `
  <button class="card ${side ? 'right' : 'left'}" data-side="${side}" aria-label="Pick ${esc(food.title)}">
    <div class="photo">
      <img src="${esc(img)}" alt="${esc(food.title)}" style="object-position:${esc(food.imagePos || 'center')}" ${food.imageRemote ? `data-fallback="${esc(food.imageRemote)}"` : ''} decoding="async">
      <span class="key">${side ? '→ / 2' : '← / 1'}</span><span class="steam">♨</span>
      <span class="stamp">Crowd pick!</span>
    </div>
    <h3>${esc(food.title)}</h3>
    <p class="sub">${esc(food.subtitle)}</p>
    <div class="meta"><span class="tag">📍 ${esc(where)}</span>${tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
    <div class="ticket"><span class="pct" data-to="${food.rating}">0%</span><small>${esc(DB.sources[food.source] || 'crowd rating')}</small></div>
  </button>`;
}

function renderHud() {
  const g = ui.game, p = currentPlayer(g);
  $('turn').textContent = g.mode === 'party' ? `${p.name}'s turn` : MODES[g.mode].label;
  $('hud-cat').textContent = g.mode === 'daily' ? `📅 ${g.dailyKey}` : catLabel(g.categoryId);
  $('hud-round').textContent = Number.isFinite(g.totalRounds) ? `Plate ${g.round} / ${g.totalRounds}` : `Plate ${g.round}`;
  $('hud-lives').hidden = g.lives === null;
  if (g.lives !== null) $('hud-lives').textContent = '❤️'.repeat(Math.max(g.lives, 0)) + '🤍'.repeat(ENDLESS_LIVES - Math.max(g.lives, 0));
  $('hud-streak').textContent = `🔥 ${p.streak}`;
  $('hud-score').textContent = g.mode === 'party' ? g.players.map(x => `${x.name}: ${x.score}`).join(' · ') : `${p.score} pts`;
  const done = Number.isFinite(g.totalRounds) ? (g.round - 1) / g.totalRounds : Math.min(g.round / 30, 1);
  $('progress').style.width = `${Math.round(done * 100)}%`;
}

function renderRound() {
  const g = ui.game;
  if (g.phase === 'over') { finishGame(); return; }
  renderHud();
  $('question').innerHTML = g.mode === 'party'
    ? `<span>${esc(currentPlayer(g).name)}</span>, which did the crowd rate higher?`
    : 'Which did <span>the crowd</span> rate higher?';
  $('arena').className = 'arena';
  $('arena').innerHTML = cardHtml(g.pair[0], 0) + '<div class="vs" aria-hidden="true">vs</div>' + cardHtml(g.pair[1], 1);
  $('arena').querySelectorAll('img[data-fallback]').forEach(img => img.addEventListener('error', () => {
    if (img.src !== img.dataset.fallback) img.src = img.dataset.fallback;
  }, { once: true }));
  $('verdict').innerHTML = '';
  ui.shownAt = performance.now();
  ui.busy = false;
}

function countUp(el, to, ms = 900) {
  const start = performance.now();
  let lastTick = 0;
  const step = now => {
    const t = Math.min((now - start) / ms, 1), eased = 1 - Math.pow(1 - t, 3);
    el.textContent = `${(to * eased).toFixed(t < 1 ? 0 : 2)}%`;
    if (now - lastTick > 70 && t < 1) { Sound.play('tick'); lastTick = now; }
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function choosePlate(side) {
  const g = ui.game;
  if (ui.screen !== 'game' || ui.busy || g.phase !== 'choosing') return;
  ui.busy = true;
  const rec = choose(g, side, { ms: performance.now() - ui.shownAt });
  if (!rec) { ui.busy = false; return; }
  Saver.record(rec);
  Sound.play('pick');
  const winners = winningSides(g.pair);
  const arena = $('arena');
  arena.classList.add('revealed');
  arena.querySelectorAll('.card').forEach(card => {
    const s = Number(card.dataset.side);
    card.disabled = true;
    card.classList.add(winners.includes(s) ? 'winner' : 'loser');
    if (s === side) card.classList.add('picked');
    countUp(card.querySelector('.pct'), Number(card.querySelector('.pct').dataset.to));
  });
  setTimeout(() => {
    Sound.play(rec.correct ? 'correct' : 'wrong');
    if (!rec.correct) arena.querySelector(`.card[data-side="${side}"]`).classList.add('wobble');
    const line = rec.correct ? (rec.gap < 5 ? pick(CLOSE) : pick(RIGHT)) : pick(WRONG);
    const last = g.mode !== 'endless' && g.round >= g.totalRounds || g.lives !== null && g.lives <= 0;
    $('verdict').innerHTML = `
      <h2 class="${rec.correct ? 'good' : 'bad'}">${esc(line)}</h2>
      <p>${rec.correct ? `+${rec.points} pts` : 'No points this time'} · the crowd split by ${rec.gap.toFixed(2)} points</p>
      <button class="next" id="next-btn">${last ? 'See the bill 🧾' : 'Next plate →'}</button>`;
    $('next-btn').addEventListener('click', nextRound);
    $('next-btn').focus({ preventScroll: true });
    renderHud();
  }, 950);
}

function nextRound() {
  const g = ui.game;
  if (!g || g.phase !== 'revealed') return;
  advance(g);
  renderRound();
}


/* ---------------- results ---------------- */
function foodById(id) {
  return DB.foods.find(f => f.id === id);
}

function miniHtml(label, rec) {
  if (!rec) return '';
  const f = foodById(rec.pickedId) || {};
  return `<div class="mini"><img src="${esc(f.image || f.imageRemote || '')}" alt="">
    <div><small>${esc(label)}</small><b>${esc(rec.pickedTitle)}</b><span>${esc(rec.pickedVenue)} · ${rec.pickedRating}% vs ${rec.otherRating}%</span></div></div>`;
}

function finishGame() {
  const g = ui.game, sum = summarize(g);
  const best = load(STORE.best, {}), key = `${g.mode}:${g.mode === 'daily' ? 'daily' : g.categoryId}`;
  const newBest = g.mode !== 'party' && sum.score > (best[key] || 0);
  if (newBest) { best[key] = sum.score; save(STORE.best, best); }
  if (g.mode === 'daily') {
    const days = load(STORE.daily, {});
    if (!days[g.dailyKey]) { days[g.dailyKey] = { correct: sum.correct, rounds: sum.rounds, score: sum.score }; save(STORE.daily, days); }
  }
  Sound.play('fanfare');
  const squares = g.history.map(r => (r.correct ? (r.gap < 10 ? '🟨' : '🟩') : '🟥')).join('');
  const podium = g.mode === 'party' ? `<div class="podium">${sum.standings.map((p, i) =>
    `<div><span>${['🥇', '🥈', '🥉', '🍴'][i]} ${esc(p.name)}</span><span>${p.score} pts · ${p.correct}/${p.answered}</span></div>`).join('')}</div>` : '';
  const head = g.mode === 'party' ? (sum.winner ? `${esc(sum.winner)} takes the last slice!` : "It's a tie at the table!") : esc(sum.grade.title);
  $('results-body').innerHTML = `
    <div class="grade">${sum.grade.letter}</div>
    <h2>${head}</h2>
    <p class="big">${sum.correct}/${sum.rounds} correct · <b>${sum.score}</b> pts · best streak ${sum.bestStreak}${newBest ? ' · <b style="color:var(--mustard)">New best!</b>' : ''}</p>
    <div class="squares" aria-label="Round by round results">${squares}</div>
    ${podium}
    <div class="highlights">${miniHtml('Plate of the day', sum.plateOfTheDay)}${miniHtml('Closest call you won', sum.closestCall)}</div>
    <div class="history">${g.history.map(r => `<div><span>${r.correct ? '✅' : '❌'}</span>
      <span><b>${esc(r.pickedTitle)}</b> <em>over</em> ${esc(r.otherTitle)}${g.mode === 'party' ? ` <em>· ${esc(r.player)}</em>` : ''}</span>
      <em>${r.pickedRating}% vs ${r.otherRating}%</em></div>`).join('')}</div>
    <p class="note">${Saver.mode === 'file' ? `✓ All ${g.history.length} answers saved to <code>data/answers/answers.jsonl</code> and <code>answers.csv</code>.` : `✓ ${g.history.length} answers logged in this browser. Use the lobby buttons to export them.`}</p>
    <div class="actions">
      <button class="next" id="again-btn">Another round ↻</button>
      <button class="ghost" id="share-btn">📋 Copy results</button>
      <button class="ghost" id="lobby-btn">Back to the lobby</button>
    </div>`;
  $('again-btn').addEventListener('click', startGame);
  $('lobby-btn').addEventListener('click', goLobby);
  $('share-btn').addEventListener('click', async () => {
    const text = shareText(g, GAME_TITLE);
    try { await navigator.clipboard.writeText(text); toast('Copied! Go brag. 📋'); } catch { prompt('Copy your results:', text); }
  });
  show('results');
}

function goLobby() {
  ui.game = null;
  show('lobby');
  renderLobby();
}

/* ---------------- boot ---------------- */
function wireGlobal() {
  $('home-btn').addEventListener('click', () => {
    if (ui.screen === 'game' && ui.game?.history.length && !confirm('Leave this game? Answers so far are already saved.')) return;
    goLobby();
  });
  $('arena').addEventListener('click', e => {
    const card = e.target.closest('.card'); if (card) choosePlate(Number(card.dataset.side));
  });
  $('music-btn').addEventListener('click', async () => {
    if (Sound.isPlaying()) { Sound.stopMusic(); ui.settings.musicOn = false; } else { ui.settings.musicOn = true; await Sound.startMusic(); }
    persist(); syncSoundUi();
  });
  $('music-vol').addEventListener('input', e => { Sound.setMusic(e.target.value / 100); save(STORE.sound, Sound.settings); });
  $('mute-btn').addEventListener('click', () => { Sound.setMuted(!Sound.settings.muted); save(STORE.sound, Sound.settings); syncSoundUi(); });
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'm') { $('mute-btn').click(); return; }
    if (ui.screen !== 'game' || !ui.game) return;
    if (ui.game.phase === 'choosing' && (k === 'arrowleft' || k === '1')) { e.preventDefault(); choosePlate(0); }
    else if (ui.game.phase === 'choosing' && (k === 'arrowright' || k === '2')) { e.preventDefault(); choosePlate(1); }
    else if (ui.game.phase === 'revealed' && (k === 'enter' || k === ' ') && $('next-btn')) { e.preventDefault(); nextRound(); }
  });
  // Browsers only allow audio after a gesture: the first click anywhere starts the lobby music.
  const firstGesture = () => { wakeAudio(); };
  document.addEventListener('pointerdown', firstGesture, { once: true });
  document.addEventListener('keydown', firstGesture, { once: true });
}

function boot() {
  document.title = GAME_TITLE;
  const words = GAME_TITLE.split(' ');
  $('title-neon').innerHTML = `${esc(words.slice(0, -1).join(' '))} <span class="last">${esc(words.at(-1))}</span>`;
  $('db-info').textContent = DB.foods.length
    ? `${DB.foods.length.toLocaleString()} plates · data built ${DB.builtAt ? new Date(DB.builtAt).toLocaleDateString() : '?'}.`
    : 'No food data found: run python3 tools/build_db.py';
  Sound.load(load(STORE.sound, {}));
  syncSoundUi();
  wireLobby();
  wireGlobal();
  renderLobby();
  Saver.init().then(renderLobby);
  if (!DB.foods.length) { $('start-btn').disabled = true; $('start-btn').textContent = 'No food data yet'; }
  window.__esr = { ui, DB, Saver, Sound, choosePlate, nextRound };
}

boot();

