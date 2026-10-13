'use strict';
/* ============ audio.js: lobby music + sound effects (Web Audio, no files needed) ============
 * The lobby loop is a procedurally generated lo-fi jazz groove: Rhodes-ish chords,
 * a walking bass, brushed drums and vinyl crackle. Drop a royalty-free track at
 * assets/audio/lobby.mp3 (or .ogg / .m4a), re-run build.py, and it is used instead.
 */
const Sound = (() => {
  const BPM = 78, BEAT = 60 / BPM, BAR = BEAT * 4, LOOKAHEAD = 0.25;
  // ii–V–I–vi in F with jazzy extensions; [root midi, chord tones as midi]
  const PROGRESSION = [
    [43, [55, 58, 62, 65, 69]],   // Gm9
    [48, [52, 58, 62, 64, 69]],   // C13
    [41, [57, 60, 64, 65, 67]],   // Fmaj9
    [50, [53, 57, 60, 65, 66]],   // Dm9 (with a little rub)
  ];
  const MELODY = [72, null, 74, 77, null, 76, 74, null, 72, 69, null, null, 70, null, 69, 67];
  let ctx = null, master = null, musicBus = null, sfxBus = null, filter = null, noiseBuf = null;
  let timer = null, nextBar = 0, barIndex = 0, playing = false, mode = 'lobby', fileTrack = null;
  const settings = { music: 0.55, sfx: 0.7, muted: false };

  const midi = n => 440 * Math.pow(2, (n - 69) / 12);

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 5200; filter.Q.value = 0.4;
    musicBus = ctx.createGain(); musicBus.connect(filter); filter.connect(master);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    applyVolumes();
    return ctx;
  }

  function applyVolumes() {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(settings.muted ? 0 : 1, t, 0.05);
    musicBus.gain.setTargetAtTime(settings.music * (mode === 'game' ? 0.45 : 1) * 0.5, t, 0.4);
    sfxBus.gain.setTargetAtTime(settings.sfx * 0.6, t, 0.05);
    filter.frequency.setTargetAtTime(mode === 'game' ? 1300 : 5200, t, 0.6);
    if (fileTrack) fileTrack.volume = settings.muted ? 0 : settings.music * (mode === 'game' ? 0.45 : 1);
  }

  function env(gainNode, t, attack, peak, decay, sustain, release, end) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + attack);
    g.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + attack + decay);
    g.setValueAtTime(Math.max(sustain, 0.0001), end);
    g.exponentialRampToValueAtTime(0.0001, end + release);
  }

  function keys(note, t, dur, vel = 0.06, dest = musicBus) {
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), trem = ctx.createGain(), lfo = ctx.createOscillator();
    o1.type = 'sine'; o2.type = 'triangle';
    o1.frequency.value = midi(note); o2.frequency.value = midi(note) * 2.001;
    const g2 = ctx.createGain(); g2.gain.value = 0.18;
    lfo.frequency.value = 4.2; const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.12;
    lfo.connect(lfoGain); lfoGain.connect(trem.gain); trem.gain.value = 0.88;
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(trem); trem.connect(dest);
    env(g, t, 0.012, vel, 0.5, vel * 0.35, 0.6, t + dur);
    for (const o of [o1, o2, lfo]) { o.start(t); o.stop(t + dur + 0.7); }
  }

  function bass(note, t, dur) {
    const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = midi(note);
    lp.type = 'lowpass'; lp.frequency.value = 700;
    o.connect(lp); lp.connect(g); g.connect(musicBus);
    env(g, t, 0.01, 0.22, 0.18, 0.1, 0.08, t + dur * 0.85);
    o.start(t); o.stop(t + dur + 0.2);
  }

  function noise(t, dur, freq, vel, type = 'bandpass', dest = musicBus) {
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true;
    f.type = type; f.frequency.value = freq; f.Q.value = 0.8;
    src.connect(f); f.connect(g); g.connect(dest);
    env(g, t, 0.004, vel, dur * 0.6, vel * 0.2, dur * 0.4, t + dur * 0.4);
    src.start(t, Math.random()); src.stop(t + dur + 0.1);
  }

  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    o.connect(g); g.connect(musicBus);
    env(g, t, 0.003, 0.32, 0.16, 0.001, 0.05, t + 0.18);
    o.start(t); o.stop(t + 0.3);
  }

  function crackle(t, dur) {
    for (let i = 0; i < 7; i++) {
      if (Math.random() < 0.55) noise(t + Math.random() * dur, 0.02, 2500 + Math.random() * 4000, 0.02, 'highpass');
    }
  }

  // Schedule one bar of the groove starting at time t.
  function scheduleBar(t, index) {
    const [root, chord] = PROGRESSION[index % PROGRESSION.length];
    const swing = BEAT * 0.16;
    // Rhodes chord: on 1, re-voiced softly on the "and" of 2
    chord.forEach((n, i) => keys(n, t + i * 0.012, BEAT * 1.9, 0.045));
    chord.slice(1, 4).forEach((n, i) => keys(n, t + BEAT * 1.5 + swing + i * 0.01, BEAT * 1.2, 0.028));
    // Walking bass: root, fifth, octave-ish, chromatic approach to next root
    const nextRoot = PROGRESSION[(index + 1) % PROGRESSION.length][0];
    [root, root + 7, root + 12, nextRoot + (nextRoot > root ? -1 : 1)].forEach((n, i) => bass(n, t + i * BEAT, BEAT));
    // Drums: soft kick on 1 & 3, brushed snare on 2 & 4, swung shaker eighths
    kick(t); kick(t + BEAT * 2 + (index % 2 ? swing : 0));
    noise(t + BEAT, 0.22, 1800, 0.07); noise(t + BEAT * 3, 0.22, 1800, 0.07);
    for (let i = 0; i < 8; i++) noise(t + i * (BEAT / 2) + (i % 2 ? swing : 0), 0.05, 7500, i % 2 ? 0.018 : 0.03, 'highpass');
    // A lazy melody every other bar
    if (index % 2 === 1) {
      const half = MELODY.slice(index % 4 === 1 ? 0 : 8, index % 4 === 1 ? 8 : 16);
      half.forEach((n, i) => { if (n) keys(n, t + i * (BEAT / 2) + (i % 2 ? swing : 0), BEAT * 0.45, 0.035); });
    }
    crackle(t, BAR);
  }

  function tick() {
    if (!playing || !ctx) return;
    while (nextBar < ctx.currentTime + LOOKAHEAD + BAR) {
      scheduleBar(nextBar, barIndex++);
      nextBar += BAR;
    }
  }

  // build.py sets LOBBY_TRACK when assets/audio/lobby.(mp3|ogg|m4a) exists; otherwise it's null.
  async function tryFileTrack() {
    const track = typeof LOBBY_TRACK === 'string' ? LOBBY_TRACK : null;
    if (!track || fileTrack === false) return false;
    if (fileTrack) return true;
    fileTrack = new Audio(track);
    fileTrack.loop = true;
    fileTrack.addEventListener('error', () => { // broken file: fall back to the generated groove
      fileTrack = false;
      if (playing) { playing = false; startMusic(); }
    }, { once: true });
    return true;
  }

  async function startMusic() {
    if (!ensure()) return false;
    if (ctx.state === 'suspended') await ctx.resume();
    if (playing) return true;
    playing = true;
    if (await tryFileTrack()) {
      applyVolumes();
      fileTrack.play().catch(() => {});
      return true;
    }
    nextBar = ctx.currentTime + 0.08;
    tick();
    timer = setInterval(tick, 120);
    return true;
  }

  function stopMusic() {
    playing = false;
    clearInterval(timer);
    timer = null;
    if (fileTrack) fileTrack.pause();
  }

  // ---------------------------------------------------------------- sound effects
  function blip(freqs, { type = 'sine', step = 0.07, dur = 0.18, vel = 0.12 } = {}) {
    if (!ensure() || settings.muted) return;
    const t = ctx.currentTime + 0.01;
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = f;
      o.connect(g); g.connect(sfxBus);
      env(g, t + i * step, 0.006, vel, dur * 0.5, vel * 0.25, dur * 0.5, t + i * step + dur * 0.4);
      o.start(t + i * step); o.stop(t + i * step + dur + 0.1);
    });
  }

  const sfx = {
    hover: () => blip([1320], { dur: 0.05, vel: 0.025 }),
    pick: () => blip([660, 880], { type: 'triangle', step: 0.04, dur: 0.09, vel: 0.08 }),
    tick: () => blip([1900], { type: 'square', dur: 0.025, vel: 0.012 }),
    correct: () => blip([midi(72), midi(76), midi(79), midi(84)], { type: 'triangle', step: 0.075, dur: 0.32, vel: 0.11 }),
    wrong: () => { blip([midi(55), midi(54)], { type: 'sawtooth', step: 0.13, dur: 0.28, vel: 0.05 }); },
    fanfare: () => blip([midi(67), midi(72), midi(76), midi(79), midi(84), midi(88)], { type: 'triangle', step: 0.09, dur: 0.5, vel: 0.1 }),
    plate: () => { if (ensure() && !settings.muted) noise(ctx.currentTime + 0.01, 0.12, 3200, 0.05, 'bandpass', sfxBus); },
  };

  return {
    settings,
    startMusic,
    stopMusic,
    isPlaying: () => playing,
    setMode(next) { mode = next; applyVolumes(); },
    setMusic(v) { settings.music = Math.max(0, Math.min(1, v)); applyVolumes(); },
    setSfx(v) { settings.sfx = Math.max(0, Math.min(1, v)); applyVolumes(); },
    setMuted(m) { settings.muted = !!m; applyVolumes(); },
    load(saved) { Object.assign(settings, saved || {}); applyVolumes(); },
    play(name) { try { sfx[name]?.(); } catch { /* audio is best-effort */ } },
  };
})();

