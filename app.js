/* ============================================================
   Sepotong — P0
   Audio engine Web Audio API, skor 100/70/45/25/10,
   salah membuka tahap berikutnya, layar Jawaban + Ringkasan.
   ============================================================ */
(function () {
  'use strict';

  var LS = 'sepotong:v1:';
  var STEPS = [
    { sec: 0.1, label: '0,1' },
    { sec: 0.5, label: '0,5' },
    { sec: 2, label: '2' },
    { sec: 8, label: '8' },
    { sec: 15, label: '15' }
  ];
  var BASE = [100, 70, 45, 25, 10];
  var ROUNDS = 10;
  var PRACTICE = 3;
  var MAXPTS = ROUNDS * 100;
  var HINT_COST = 15;
  var SITE = 'https://ramizakamala.github.io/sepotong-lagu/';

  var GENRE_LABEL = {
    pop: 'Pop', rock: 'Rock', folk: 'Folk', dangdut: 'Dangdut', jazz: 'Jazz',
    indie: 'Indie', religi: 'Religi', keroncong: 'Keroncong', campursari: 'Campursari'
  };

  /* ---------------- util ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function fmt(n) { return String(n).replace('.', ','); }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function mmss(sec) {
    sec = Math.max(0, Math.round(sec));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }

  /* ---------------- penyimpanan ---------------- */
  var store = {
    get: function (k, d) {
      try {
        var v = localStorage.getItem(LS + k);
        return v == null ? d : JSON.parse(v);
      } catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) {}
    }
  };

  var settings = Object.assign({ theme: 'auto', sound: true, haptic: true }, store.get('settings', {}));
  var setup = Object.assign(
    { era: 'semua', genres: ['Pop', 'Rock', 'Folk', 'Dangdut', 'Jazz'] },
    store.get('lastSetup', {})
  );
  if (!Array.isArray(setup.genres)) setup.genres = ['Pop', 'Rock', 'Folk', 'Dangdut', 'Jazz'];

  /* ---------------- bank lagu ---------------- */
  var SONGS = (window.SONGS || []).map(function (s) {
    var g = String(s.genre || '').toLowerCase();
    return {
      id: String(s.id),
      title: String(s.title || '').trim(),
      artist: String(s.artist || '').trim(),
      year: Number(s.year) || 0,
      genre: GENRE_LABEL[g] || (g ? g.charAt(0).toUpperCase() + g.slice(1) : 'Lainnya'),
      album: s.album || '',
      art: s.art || '',
      previewUrl: s.preview || '',
      appleUrl: s.appleUrl || ''
    };
  }).filter(function (s) {
    return s.title && s.artist && s.year >= 1900 && s.previewUrl;
  });

  var DECADES = (function () {
    var m = new Map();
    SONGS.forEach(function (s) {
      var d = Math.floor(s.year / 10) * 10;
      m.set(d, (m.get(d) || 0) + 1);
    });
    return Array.from(m.entries()).sort(function (a, b) { return a[0] - b[0]; });
  })();

  var GENRES = (function () {
    var m = new Map();
    SONGS.forEach(function (s) { m.set(s.genre, (m.get(s.genre) || 0) + 1); });
    return Array.from(m.entries()).sort(function (a, b) { return b[1] - a[1]; });
  })();

  function eraLabel(d) { return d >= 2000 ? d + '-an' : String(d).slice(2) + '-an'; }

  function poolFor(era, genres) {
    return SONGS.filter(function (s) {
      var eraOk = era === 'semua' || Math.floor(s.year / 10) * 10 === Number(era);
      var genreOk = !genres.length || genres.indexOf(s.genre) !== -1;
      return eraOk && genreOk;
    });
  }

  /* ---------------- efek suara ---------------- */
  function beep(kind) {
    if (!settings.sound) return;
    try {
      var ctx = Engine.init();
      var t = ctx.currentTime;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      if (kind === 'good') {
        osc.frequency.setValueAtTime(620, t);
        osc.frequency.exponentialRampToValueAtTime(930, t + 0.12);
      } else {
        osc.frequency.setValueAtTime(240, t);
        osc.frequency.exponentialRampToValueAtTime(160, t + 0.14);
      }
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.10, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    } catch (e) {}
  }
  function buzz(ms) {
    if (!settings.haptic) return;
    try {
      if (!navigator.vibrate) return;
      if (!window.matchMedia('(pointer: coarse)').matches) return;
      navigator.vibrate(ms);
    } catch (e) {}
  }

  /* ---------------- audio engine (Web Audio API) ---------------- */
  var Engine = {
    ctx: null,
    cache: new Map(),
    active: null,
    full: null,

    init: function () {
      if (!this.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
      }
      return this.ctx;
    },

    resume: function () {
      var ctx = this.init();
      if (ctx.state === 'suspended') {
        return ctx.resume().catch(function () {}).then(function () { return ctx; });
      }
      return Promise.resolve(ctx);
    },

    load: function (song) {
      var self = this;
      var key = song.previewUrl;
      if (this.cache.has(key)) return Promise.resolve(this.cache.get(key));
      var ctx = this.init();
      return fetch(key, { mode: 'cors' })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.arrayBuffer();
        })
        .then(function (ab) {
          return new Promise(function (ok, no) {
            var p = ctx.decodeAudioData(ab, ok, no);
            if (p && p.then) p.then(ok, no);
          });
        })
        .then(function (buf) {
          var rec = { buf: buf, offset: pickOffset(buf) };
          if (self.cache.size >= 12) self.cache.delete(self.cache.keys().next().value);
          self.cache.set(key, rec);
          return rec;
        });
    },

    stopClip: function () {
      if (!this.active) return;
      var a = this.active;
      this.active = null;
      try { a.src.onended = null; a.src.stop(); } catch (e) {}
      try { a.src.disconnect(); a.gain.disconnect(); } catch (e) {}
    },

    playClip: function (rec, sec) {
      this.stopClip();
      var ctx = this.init();
      var src = ctx.createBufferSource();
      var gain = ctx.createGain();
      src.buffer = rec.buf;
      var t0 = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(1, t0 + 0.006);
      src.connect(gain);
      gain.connect(ctx.destination);
      var maxStart = Math.max(0, rec.buf.duration - sec - 0.02);
      var start = Math.min(rec.offset, maxStart);
      var self = this;
      var settled = false;
      var ended = new Promise(function (resolve) {
        src.onended = function () {
          if (settled) return;
          settled = true;
          if (self.active && self.active.src === src) self.active = null;
          try { src.disconnect(); gain.disconnect(); } catch (e) {}
          resolve();
        };
      });
      src.start(0, start, sec);
      this.active = { src: src, gain: gain, startedAt: ctx.currentTime, sec: sec };
      return {
        ended: ended,
        stop: function () { self.stopClip(); }
      };
    },

    stopFull: function () {
      if (!this.full) return;
      var f = this.full;
      this.full = null;
      try { f.src.onended = null; f.src.stop(); } catch (e) {}
      try { f.src.disconnect(); f.gain.disconnect(); } catch (e) {}
    },

    playFull: function (rec, onEnd) {
      this.stopFull();
      var ctx = this.init();
      var src = ctx.createBufferSource();
      var gain = ctx.createGain();
      src.buffer = rec.buf;
      gain.gain.value = 1;
      src.connect(gain);
      gain.connect(ctx.destination);
      var dur = rec.buf.duration;
      var startedAt = ctx.currentTime;
      var self = this;
      src.onended = function () {
        if (self.full && self.full.src === src) self.full = null;
        try { src.disconnect(); gain.disconnect(); } catch (e) {}
        if (onEnd) onEnd();
      };
      src.start(0, 0, dur);
      this.full = { src: src, gain: gain, startedAt: startedAt, dur: dur };
      return {
        duration: dur,
        position: function () { return Math.min(dur, ctx.currentTime - startedAt); },
        stop: function () { self.stopFull(); }
      };
    },

    stopAll: function () { this.stopClip(); this.stopFull(); }
  };

  /* pilih titik mulai: hindari potongan hening (RMS jendela 0,1 detik) */
  function pickOffset(buf) {
    var ch = buf.getChannelData(0);
    var sr = buf.sampleRate;
    var dur = buf.duration;
    var maxStart = Math.max(0, dur - 15 - 0.25);
    var lo = Math.min(3, maxStart);
    var hi = Math.min(13, maxStart);
    var win = Math.max(64, Math.floor(0.1 * sr));
    var stride = Math.max(1, Math.floor(win / 400));
    var cands = [];
    for (var t = lo; t <= hi; t += 0.25) {
      var i0 = Math.floor(t * sr);
      var sum = 0, n = 0;
      for (var k = 0; k < win; k += stride) {
        var v = ch[i0 + k] || 0;
        sum += v * v;
        n++;
      }
      cands.push({ t: t, rms: Math.sqrt(sum / Math.max(1, n)) });
    }
    if (!cands.length) return 0;
    var maxR = 0;
    cands.forEach(function (c) { if (c.rms > maxR) maxR = c.rms; });
    var th = maxR * 0.35;
    var good = cands.filter(function (c) { return c.rms >= th; });
    if (good.length < 3) {
      good = cands.slice().sort(function (a, b) { return b.rms - a.rms; }).slice(0, 3);
    }
    return good[Math.floor(Math.random() * good.length)].t;
  }

  /* ---------------- state ---------------- */
  var state = {
    view: 'home',
    practice: false,
    queue: [],
    options: [],
    index: 0,
    stage: 0,
    answered: false,
    loading: false,
    pending: null,
    score: 0,
    streak: 0,
    bestStreak: 0,
    song: null,
    rec: null,
    rounds: [],
    usedSpare: {}
  };

  /* ---------------- toast ---------------- */
  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2500);
  }

  /* ---------------- tampilan ---------------- */
  function show(name) {
    state.view = name;
    var onMain = name === 'main' || name === 'reveal';
    $('view-home').hidden = name !== 'home';
    $('view-main').hidden = !onMain;
    $('view-reveal').hidden = name !== 'reveal';
    $('view-summary').hidden = name !== 'summary';
    if (!onMain) Engine.stopClip();
    if (name !== 'reveal') stopFullPlayer();
    document.body.style.overflow = onMain ? 'hidden' : '';
  }

  /* ---------------- beranda ---------------- */
  function renderFilters() {
    var eraWrap = $('eraChips');
    var eras = [{ key: 'semua', label: 'Semua', n: SONGS.length }].concat(
      DECADES.map(function (d) { return { key: String(d[0]), label: eraLabel(d[0]), n: d[1] }; })
    );
    eraWrap.innerHTML = eras.map(function (e) {
      return '<button class="chip" data-era="' + e.key + '" aria-pressed="' +
        (setup.era === e.key) + '">' + esc(e.label) + '<span class="n">' + e.n + '</span></button>';
    }).join('');

    var genreWrap = $('genreChips');
    genreWrap.innerHTML = GENRES.map(function (g) {
      var on = setup.genres.indexOf(g[0]) !== -1;
      return '<button class="chip" data-genre="' + esc(g[0]) + '" aria-pressed="' + on + '">' +
        esc(g[0]) + '<span class="n">' + g[1] + '</span></button>';
    }).join('');

    updateBankNote();
  }

  function updateBankNote() {
    var pool = poolFor(setup.era, setup.genres);
    var note = $('bankNote');
    var btn = $('btnStart');
    if (pool.length < ROUNDS) {
      note.className = 'bank warn';
      note.textContent = 'Filter terlalu sempit. Longgarkan era atau genre. (' + pool.length + ' lagu)';
      btn.disabled = true;
    } else {
      note.className = 'bank';
      note.textContent = pool.length + ' lagu di bank';
      btn.disabled = false;
    }
  }

  function persistSetup() {
    store.set('lastSetup', { era: setup.era, genres: setup.genres.slice() });
  }

  $('eraChips').addEventListener('click', function (e) {
    var b = e.target.closest('[data-era]');
    if (!b) return;
    setup.era = b.dataset.era;
    persistSetup();
    renderFilters();
  });

  $('genreChips').addEventListener('click', function (e) {
    var b = e.target.closest('[data-genre]');
    if (!b) return;
    var g = b.dataset.genre;
    var i = setup.genres.indexOf(g);
    if (i === -1) setup.genres.push(g);
    else setup.genres.splice(i, 1);
    persistSetup();
    renderFilters();
  });

  $('btnStart').addEventListener('click', function () { startSession(false); });
  $('btnPractice').addEventListener('click', function () { startSession(true); });
  $('modeKlasik').addEventListener('click', function () { $('btnStart').focus(); });

  /* ---------------- sesi ---------------- */
  function buildOptions(answer, pool) {
    var seen = {};
    seen[norm(answer.title) + '|' + norm(answer.artist).split(' ')[0]] = true;
    var others = pool.filter(function (s) {
      var key = norm(s.title);
      if (!key || s.id === answer.id) return false;
      if (seen[key + '|' + norm(s.artist).split(' ')[0]]) return false;
      seen[key + '|' + norm(s.artist).split(' ')[0]] = true;
      return norm(s.title) !== norm(answer.title);
    });
    shuffle(others);
    var picks = others.slice(0, 3);
    var opts = [{ song: answer, correct: true }].concat(
      picks.map(function (s) { return { song: s, correct: false }; })
    );
    return shuffle(opts);
  }

  function startSession(practice) {
    var pool = poolFor(setup.era, setup.genres);
    var need = practice ? PRACTICE : ROUNDS;
    if (pool.length < need) {
      toast('Lagu di filter ini kurang dari ' + need + '.');
      return;
    }
    state.practice = !!practice;
    state.queue = shuffle(pool.slice()).slice(0, need);
    state.index = 0;
    state.score = 0;
    state.streak = 0;
    state.bestStreak = 0;
    state.rounds = [];
    state.usedSpare = {};
    persistSetup();

    // buka kunci audio pada gestur pengguna ini
    Engine.init();
    Engine.resume();
    show('main');
    renderScore();
    nextRound();
  }

  function nextRound() {
    if (state.index >= state.queue.length) return finish();
    var song = state.queue[state.index];
    state.song = song;
    state.stage = 0;
    state.answered = false;
    state.loading = true;
    state.rec = null;
    state.pending = null;

    renderRound();
    setPlayState('loading');

    Engine.load(song).catch(function () {
      return Engine.load(song);
    }).then(function (rec) {
      if (state.song !== song) return;
      state.rec = rec;
      state.loading = false;
      setPlayState('ready');
      if (state.pending && state.pending.song === song) {
        var pend = state.pending;
        state.pending = null;
        var pbtn = document.querySelectorAll('#answers .answer')[pend.idx];
        if (pbtn) pickAnswer(pend.idx, pbtn);
        return;
      }
      setTimeout(function () { if (state.song === song) playStage(); }, 60);
      preloadNext();
    }).catch(function () {
      if (state.song !== song) return;
      toast('Lagu ini gagal dimuat. Lanjut ke soal berikutnya.');
      var spare = takeSpare();
      if (spare) {
        state.queue[state.index] = spare;
        nextRound();
      } else {
        state.index++;
        nextRound();
      }
    });
  }

  function takeSpare() {
    var pool = poolFor(setup.era, setup.genres);
    var used = {};
    state.queue.forEach(function (s) { used[s.id] = true; });
    var cands = pool.filter(function (s) { return !used[s.id] && !state.usedSpare[s.id]; });
    if (!cands.length) return null;
    var pick = cands[Math.floor(Math.random() * cands.length)];
    state.usedSpare[pick.id] = true;
    return pick;
  }

  function preloadNext() {
    var nxt = state.queue[state.index + 1];
    if (nxt) Engine.load(nxt).catch(function () {});
  }

  function renderRound() {
    var n = state.practice ? PRACTICE : ROUNDS;
    $('roundLabel').textContent = (state.practice ? 'Latihan ' : 'Soal ') + (state.index + 1) + '/' + n;
    $('kbdHint').textContent = window.matchMedia('(hover: hover)').matches ? '1–4 jawab · spasi putar' : '';

    var pool = poolFor(setup.era, setup.genres);
    state.options = buildOptions(state.song, pool.length >= 4 ? pool : SONGS);
    $('answers').innerHTML = state.options.map(function (o, i) {
      return '<li><button class="answer" data-opt="' + i + '">' +
        '<span class="k">' + (i + 1) + '</span>' +
        '<span class="t"><span class="title">' + esc(o.song.title) + '</span>' +
        '<span class="artist">' + esc(o.song.artist) + '</span></span>' +
        '<span class="mark" aria-hidden="true"></span></button></li>';
    }).join('');

    $('btnSkip').textContent = 'Lewati';
    renderStages();
    renderPoints(false);
    renderScore();
  }

  function renderStages(playing) {
    var segs = $('stages').children;
    for (var i = 0; i < segs.length; i++) {
      segs[i].classList.toggle('open', i <= state.stage);
      segs[i].classList.toggle('active', i === state.stage);
    }
    $('stages').classList.toggle('playing', !!playing);
    var step = STEPS[state.stage];
    $('stageLabel').textContent = 'Tahap ' + (state.stage + 1) + ' · ' + step.label + ' detik';
    var next = STEPS[state.stage + 1];
    var openBtn = $('btnOpen');
    if (!next) {
      openBtn.hidden = true;
    } else {
      openBtn.hidden = false;
      openBtn.textContent = 'Buka ' + next.label + ' detik · jadi ' + BASE[state.stage + 1] + ' poin';
    }
  }

  function renderPoints(animate) {
    var el = $('pointsNow');
    var v = BASE[state.stage];
    if (animate && !reduced()) {
      el.style.transition = 'opacity 120ms ease-out';
      el.style.opacity = '0';
      setTimeout(function () { el.textContent = v; el.style.opacity = '1'; }, 120);
    } else {
      el.textContent = v;
    }
  }

  function renderScore() {
    $('scoreTotal').textContent = state.score;
    var chip = $('streakChip');
    if (state.streak >= 3) {
      $('streakNum').textContent = state.streak;
      chip.classList.add('on');
    } else {
      chip.classList.remove('on');
    }
  }

  function setPlayState(s) {
    var b = $('btnPlay');
    b.dataset.state = s;
    var hint = $('playHint');
    if (s === 'loading') {
      hint.textContent = 'Menyiapkan klip…';
      b.setAttribute('aria-label', 'Memuat audio');
    } else if (s === 'playing') {
      hint.textContent = 'Memutar · spasi untuk ulang';
      b.setAttribute('aria-label', 'Sedang memutar');
    } else {
      hint.textContent = 'Dengerin ulang · spasi';
      b.setAttribute('aria-label', 'Putar potongan lagu');
    }
  }

  function playStage() {
    if (!state.rec || state.answered) return;
    var sec = STEPS[state.stage].sec;
    setPlayState('playing');
    renderStages(true);
    var clip = Engine.playClip(state.rec, sec);
    clip.ended.then(function () {
      if (state.view === 'main') {
        setPlayState('ready');
        renderStages(false);
      }
    });
  }

  $('btnPlay').addEventListener('click', function () {
    if (state.loading) return;
    if (state.answered) return;
    Engine.resume().then(playStage);
  });

  function openNextStep(autoPlay) {
    if (state.stage >= STEPS.length - 1) return;
    state.stage++;
    renderStages();
    renderPoints(true);
    if (autoPlay) setTimeout(playStage, 400);
  }

  $('btnOpen').addEventListener('click', function () {
    if (state.loading || state.answered) return;
    openNextStep(true);
  });

  $('btnSkip').addEventListener('click', function () {
    if (state.loading || state.answered) return;
    if (state.stage >= STEPS.length - 1) {
      endRound(false);
      return;
    }
    openNextStep(true);
  });

  $('answers').addEventListener('click', function (e) {
    var b = e.target.closest('.answer');
    if (!b) return;
    pickAnswer(Number(b.dataset.opt), b);
  });

  function pickAnswer(idx, btn) {
    if (state.answered) return;
    var opt = state.options[idx];
    if (!opt) return;
    if (state.loading) {
      state.pending = { idx: idx, song: state.song };
      return;
    }

    if (opt.correct) {
      state.answered = true;
      btn.classList.add('is-correct');
      btn.querySelector('.mark').textContent = '✓';
      beep('good');
      buzz(18);
      var base = BASE[state.stage];
      state.streak++;
      if (state.streak > state.bestStreak) state.bestStreak = state.streak;
      state.score += base;
      state.rounds.push({
        song: state.song, stage: state.stage, correct: true,
        points: base, bonus: 0, art: state.song.art
      });
      renderScore();
      setTimeout(function () { showReveal(true); }, 500);
      return;
    }

    btn.classList.add('is-wrong');
    btn.disabled = true;
    btn.querySelector('.mark').textContent = '✕';
    beep('bad');
    buzz(30);
    state.streak = 0;
    renderScore();

    if (state.stage >= STEPS.length - 1) {
      endRound(false);
      return;
    }
    var next = STEPS[state.stage + 1];
    toast('Belum tepat. Klip dibuka jadi ' + next.label + ' detik.');
    setTimeout(function () {
      openNextStep(false);
      playStage();
    }, 400);
  }

  function endRound() {
    state.answered = true;
    state.streak = 0;
    state.rounds.push({ song: state.song, stage: STEPS.length - 1, correct: false, points: 0, bonus: 0, art: state.song.art });
    renderScore();
    showReveal(false);
  }

  /* ---------------- layar jawaban ---------------- */
  var fullPlayer = null;
  var fullRaf = 0;

  function stopFullPlayer() {
    if (fullPlayer) {
      try { fullPlayer.stop(); } catch (e) {}
      fullPlayer = null;
    }
    cancelAnimationFrame(fullRaf);
    var b = $('btnFull');
    if (b) {
      b.setAttribute('aria-pressed', 'false');
      $('fullLabel').textContent = 'Dengerin 30 detik';
      $('progFill').style.width = '0%';
      $('progTime').textContent = '0:00';
    }
  }

  function toggleFull() {
    if (fullPlayer) { stopFullPlayer(); return; }
    if (!state.rec) return;
    Engine.stopClip();
    var btn = $('btnFull');
    fullPlayer = Engine.playFull(state.rec, function () { stopFullPlayer(); });
    btn.setAttribute('aria-pressed', 'true');
    $('fullLabel').textContent = 'Jeda';
    var tick = function () {
      if (!fullPlayer) return;
      var d = fullPlayer.duration || 30;
      var p = fullPlayer.position();
      $('progFill').style.width = Math.min(100, (p / d) * 100) + '%';
      $('progTime').textContent = mmss(p);
      fullRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  $('btnFull').addEventListener('click', toggleFull);

  function showReveal(correct) {
    Engine.stopClip();
    stopFullPlayer();
    var song = state.song;
    var banner = $('revBanner');
    var last = state.rounds[state.rounds.length - 1];

    if (correct) {
      banner.className = 'banner good';
      banner.innerHTML = 'Benar! <span class="pts">+' + last.points + '</span>' +
        (last.bonus ? '<span class="bonus">+' + last.bonus + ' beruntun</span>' : '');
    } else {
      var gaveUp = state.stage >= STEPS.length - 1;
      banner.className = 'banner neutral';
      banner.textContent = gaveUp ? 'Tidak kali ini' : 'Tidak kali ini';
    }

    $('revTitle').textContent = song.title;
    $('revArtist').textContent = song.artist;
    $('revLine2').textContent = song.year + ' · ' + song.genre;
    $('revRecap').textContent = correct
      ? 'Ketemu di tahap ' + (last.stage + 1) + ' (' + STEPS[last.stage].label + ' detik)'
      : 'Tidak ketemu';

    var cover = $('revCover');
    cover.innerHTML = song.art
      ? '<img alt="" src="' + esc(song.art) + '" loading="lazy">'
      : '<span class="ph-line"></span>';
    var img = cover.querySelector('img');
    if (img) {
      img.addEventListener('error', function () {
        cover.innerHTML = '<span class="ph-line"></span>';
      });
    }

    var apple = $('revApple');
    if (song.appleUrl) { apple.href = song.appleUrl; apple.hidden = false; }
    else { apple.hidden = true; }

    var isLast = state.index >= state.queue.length - 1;
    $('btnNext').textContent = isLast ? (state.practice ? 'Selesai' : 'Lihat hasil') : 'Soal berikutnya';

    show('reveal');
  }

  $('btnNext').addEventListener('click', function () {
    Engine.stopClip();
    state.index++;
    if (state.index >= state.queue.length) finish();
    else { show('main'); nextRound(); }
  });

  /* ---------------- ringkasan ---------------- */
  function gradeFor(score) {
    if (score >= 800) return 'Telinga Emas';
    if (score >= 550) return 'Kuping Tajam';
    if (score >= 300) return 'Kuping Lumayan';
    return 'Kuping Baru';
  }

  function emojiFor(r) {
    if (!r.correct) return '🟥';
    if (r.stage <= 1) return '🟩';
    if (r.stage <= 3) return '🟨';
    return '🟧';
  }

  function finish() {
    Engine.stopAll();
    if (state.practice) {
      show('home');
      toast('Latihan selesai. Siap main beneran?');
      return;
    }
    var total = state.score;
    var benar = state.rounds.filter(function (r) { return r.correct; }).length;

    $('sumScore').textContent = reduced() ? total : '0';
    $('sumOf').textContent = 'dari ' + MAXPTS;
    $('sumTitle').textContent = gradeFor(total);
    var avgPct = Math.round((benar / state.rounds.length) * 100);
    $('sumNote').textContent = benar >= 8
      ? 'Kuping kamu akurat. Coba era lain buat uji.'
      : benar >= 5
        ? 'Lumayan. Kebanyakan ketemu di tahap tengah.'
        : 'Masih sering di tahap akhir. Santai, naik pelan-pelan.';

    $('sumGrid').textContent = state.rounds.map(emojiFor).join('');
    $('sumAcc').textContent = benar + '/' + state.rounds.length;

    var found = state.rounds.filter(function (r) { return r.correct; });
    var avgStage = found.length
      ? (found.reduce(function (a, r) { return a + r.stage + 1; }, 0) / found.length)
      : null;
    $('sumStage').textContent = avgStage ? 'tahap ' + fmt(Math.round(avgStage * 10) / 10) : '–';
    var best = found.length ? Math.min.apply(null, found.map(function (r) { return r.stage; })) : null;
    $('sumFast').textContent = best === null ? '–' : STEPS[best].label + ' dtk';

    $('sumRows').innerHTML = state.rounds.map(function (r) {
      return '<div class="row">' +
        (r.art ? '<img class="mini" alt="" src="' + esc(r.art) + '" loading="lazy">' : '<span class="mini"></span>') +
        '<span class="t"><b>' + esc(r.song.title) + '</b><span>' + esc(r.song.artist) + ' · ' + r.song.year + '</span></span>' +
        '<span class="mark ' + (r.correct ? 'good' : 'bad') + '">' + (r.correct ? '+' + r.points : '0') + '</span>' +
        '</div>';
    }).join('');

    show('summary');

    if (!reduced()) {
      var t0 = performance.now();
      var dur = 600;
      var step = function (now) {
        var p = Math.min(1, (now - t0) / dur);
        var eased = 1 - Math.pow(1 - p, 3);
        $('sumScore').textContent = Math.round(total * eased);
        if (p < 1) requestAnimationFrame(step);
        else $('sumScore').textContent = total;
      };
      requestAnimationFrame(step);
    }

    store.set('stats', Object.assign(store.get('stats', {
      plays: 0, best: 0, streakBest: 0, correct: 0, total: 0, stages: [0, 0, 0, 0, 0]
    }), {
      plays: (store.get('stats', { plays: 0 }).plays || 0) + 1
    }));
    var st = store.get('stats', {});
    st.best = Math.max(st.best || 0, total);
    st.streakBest = Math.max(st.streakBest || 0, state.bestStreak);
    st.correct = (st.correct || 0) + benar;
    st.total = (st.total || 0) + state.rounds.length;
    st.stages = st.stages || [0, 0, 0, 0, 0];
    found.forEach(function (r) { st.stages[r.stage] = (st.stages[r.stage] || 0) + 1; });
    store.set('stats', st);
    void avgPct;
  }

  function shareText() {
    var lines = state.rounds.map(emojiFor).join('');
    return 'Sepotong · ' + state.score + '/' + MAXPTS + '\n' + lines + '\nCoba juga: ' + SITE;
  }

  $('btnShare').addEventListener('click', function () {
    var text = shareText();
    if (navigator.share) {
      navigator.share({ text: text }).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        copyFallback(text);
      });
      return;
    }
    copyFallback(text);
  });

  function copyFallback(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('Tersalin!'); },
        function () { legacyCopy(text); });
    } else {
      legacyCopy(text);
    }
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove();
    toast(ok ? 'Tersalin!' : 'Gagal menyalin');
  }

  $('btnAgain').addEventListener('click', function () { startSession(false); });
  $('btnHome').addEventListener('click', function () { show('home'); renderFilters(); });

  /* ---------------- keluar sesi ---------------- */
  $('btnQuit').addEventListener('click', function () {
    if (window.confirm('Keluar dari sesi? Progres tidak disimpan.')) {
      Engine.stopAll();
      show('home');
      renderFilters();
    }
  });

  /* ---------------- sheet ---------------- */
  var openSheetEl = null;
  var lastFocus = null;

  function openSheet(el) {
    lastFocus = document.activeElement;
    openSheetEl = el;
    $('backdrop').hidden = false;
    el.hidden = false;
    var first = el.querySelector('button, [href], input, select, textarea');
    if (first) first.focus();
  }
  function closeSheet() {
    if (!openSheetEl) return;
    openSheetEl.hidden = true;
    openSheetEl = null;
    $('backdrop').hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  $('backdrop').addEventListener('click', closeSheet);
  document.querySelectorAll('[data-close]').forEach(function (b) {
    b.addEventListener('click', closeSheet);
  });

  document.addEventListener('keydown', function (e) {
    if (openSheetEl) {
      if (e.key === 'Escape') { e.preventDefault(); closeSheet(); }
      if (e.key === 'Tab') {
        var f = openSheetEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      return;
    }
    if (state.view === 'main') {
      if (/^[1-4]$/.test(e.key)) {
        var btn = document.querySelectorAll('#answers .answer')[Number(e.key) - 1];
        if (btn) { e.preventDefault(); btn.click(); }
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (!state.loading && !state.answered) Engine.resume().then(playStage);
      }
    } else if (state.view === 'reveal' && e.key === 'Enter') {
      e.preventDefault();
      $('btnNext').click();
    }
  });

  /* ---------------- pengaturan ---------------- */
  function applyTheme() {
    if (settings.theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', settings.theme);
    var seg = $('segTheme');
    Array.prototype.forEach.call(seg.children, function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.themeOpt === settings.theme));
    });
  }

  function syncSettingsUI() {
    Array.prototype.forEach.call($('segSound').children, function (b) {
      b.setAttribute('aria-pressed', String((b.dataset.sound === '1') === !!settings.sound));
    });
    Array.prototype.forEach.call($('segHaptic').children, function (b) {
      b.setAttribute('aria-pressed', String((b.dataset.haptic === '1') === !!settings.haptic));
    });
    applyTheme();
  }

  $('segTheme').addEventListener('click', function (e) {
    var b = e.target.closest('[data-theme-opt]');
    if (!b) return;
    settings.theme = b.dataset.themeOpt;
    store.set('settings', settings);
    applyTheme();
  });
  $('segSound').addEventListener('click', function (e) {
    var b = e.target.closest('[data-sound]');
    if (!b) return;
    settings.sound = b.dataset.sound === '1';
    store.set('settings', settings);
    syncSettingsUI();
    if (settings.sound) beep('good');
  });
  $('segHaptic').addEventListener('click', function (e) {
    var b = e.target.closest('[data-haptic]');
    if (!b) return;
    settings.haptic = b.dataset.haptic === '1';
    store.set('settings', settings);
    syncSettingsUI();
    buzz(20);
  });

  if (navigator.vibrate) $('rowHaptic').hidden = false;

  $('btnSettings').addEventListener('click', function () {
    syncSettingsUI();
    openSheet($('sheetSettings'));
  });
  $('btnHowTo').addEventListener('click', function () { openSheet($('sheetHowTo')); });

  /* ---------------- start ---------------- */
  applyTheme();
  renderFilters();

  if (!store.get('seenHowTo', false)) {
    store.set('seenHowTo', true);
    setTimeout(function () { openSheet($('sheetHowTo')); }, 600);
  }

  // hook verifikasi (dipakai uji otomatis, tidak memengaruhi permainan)
  window.SEPOTONG = {
    engine: Engine,
    state: state,
    steps: STEPS,
    base: BASE,
    poolFor: poolFor,
    playClipTiming: function (sec) {
      if (!state.rec) return Promise.resolve(null);
      return new Promise(function (resolve) {
        var t0 = performance.now();
        var clip = Engine.playClip(state.rec, sec);
        clip.ended.then(function () { resolve(performance.now() - t0); });
      });
    }
  };
})();
