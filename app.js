/* ============================================================
   Sepotong — sistem tebak: ketik judul, salah = klip kebuka,
   skor = beruntun lagu + waktu tebak.
   ============================================================ */
(function () {
  'use strict';

  var LS = 'sepotong:v1:';
  var STAGES = [0.1, 0.5, 2, 8, 15];
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
  function norm(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function secLabel(n) { return String(n).replace('.', ',') + 's'; }
  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
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

  var settings = Object.assign(
    { theme: 'auto', sound: true, haptic: true, startPoint: 'hook' },
    store.get('settings', {})
  );
  var streak = Object.assign({ current: 0, best: 0 }, store.get('streak', {}));
  var setup = Object.assign({ genre: 'semua', era: 'semua' }, store.get('lastSetup', {}));

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

  var GENRES = (function () {
    var m = new Map();
    SONGS.forEach(function (s) { m.set(s.genre, (m.get(s.genre) || 0) + 1); });
    return Array.from(m.entries()).sort(function (a, b) { return b[1] - a[1]; });
  })();

  var DECADES = (function () {
    var m = new Map();
    SONGS.forEach(function (s) {
      var d = Math.floor(s.year / 10) * 10;
      m.set(d, (m.get(d) || 0) + 1);
    });
    return Array.from(m.entries()).sort(function (a, b) { return a[0] - b[0]; });
  })();

  function eraLabel(d) { return d >= 2000 ? d + '-an' : String(d).slice(2) + '-an'; }

  function poolFor(genre, era) {
    return SONGS.filter(function (s) {
      var gOK = genre === 'semua' || s.genre === genre;
      var eOK = era === 'semua' || Math.floor(s.year / 10) * 10 === Number(era);
      return gOK && eOK;
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
      osc.connect(gain);
      gain.connect(ctx.destination);
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

  /* ---------------- audio engine ---------------- */
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

    startAt: function (rec) {
      if (settings.startPoint === 'zero') return 0;
      if (settings.startPoint === 'full') return 0;
      return rec.offset;
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
      var start = this.startAt(rec);
      var maxStart = Math.max(0, rec.buf.duration - sec - 0.02);
      if (start > maxStart) start = maxStart;
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
      return { ended: ended, stop: function () { self.stopClip(); } };
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

  /* titik mulai: hindari potongan hening (RMS jendela 0,1 detik) */
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
    stage: 0,
    loading: false,
    solved: false,
    song: null,
    rec: null,
    tried: [],
    pool: [],
    recent: [],
    startedAt: 0,
    suggestIndex: -1,
    suggestions: []
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

  function show(name) {
    state.view = name;
    var onMain = name === 'main' || name === 'reveal';
    $('view-home').hidden = name !== 'home';
    $('view-main').hidden = !onMain;
    $('view-reveal').hidden = name !== 'reveal';
    if (!onMain) Engine.stopClip();
    if (name !== 'reveal') stopFullPlayer();
    document.body.style.overflow = onMain ? 'hidden' : '';
  }

  /* ---------------- beranda ---------------- */
  function renderHome() {
    $('homeCurrent').textContent = streak.current;
    $('homeBest').textContent = streak.best;

    $('genreChips').innerHTML =
      '<button class="chip" data-genre="semua" aria-pressed="' + (setup.genre === 'semua') + '">Semua genre</button>' +
      GENRES.map(function (g) {
        return '<button class="chip" data-genre="' + esc(g[0]) + '" aria-pressed="' + (setup.genre === g[0]) + '">' +
          esc(g[0]) + '<span class="n">' + g[1] + '</span></button>';
      }).join('');

    $('eraChips').innerHTML =
      '<button class="chip" data-era="semua" aria-pressed="' + (setup.era === 'semua') + '">Semua era</button>' +
      DECADES.map(function (d) {
        return '<button class="chip" data-era="' + d[0] + '" aria-pressed="' + (setup.era === String(d[0])) + '">' +
          eraLabel(d[0]) + '<span class="n">' + d[1] + '</span></button>';
      }).join('');

    var n = poolFor(setup.genre, setup.era).length;
    var note = $('bankNote');
    var start = $('btnStart');
    if (n < 4) {
      note.className = 'bank warn';
      note.textContent = 'Kombinasi ini cuma ' + n + ' lagu. Longgarkan genre atau era.';
      start.disabled = true;
    } else {
      note.className = 'bank';
      note.textContent = n + ' lagu di bank';
      start.disabled = false;
    }
  }

  function persistSetup() {
    store.set('lastSetup', { genre: setup.genre, era: setup.era });
  }

  $('genreChips').addEventListener('click', function (e) {
    var b = e.target.closest('[data-genre]');
    if (!b) return;
    setup.genre = b.dataset.genre;
    persistSetup();
    renderHome();
  });

  $('eraChips').addEventListener('click', function (e) {
    var b = e.target.closest('[data-era]');
    if (!b) return;
    setup.era = b.dataset.era;
    persistSetup();
    renderHome();
  });

  /* ---------------- sesi ---------------- */
  function startSession() {
    state.pool = poolFor(setup.genre, setup.era);
    if (state.pool.length < 4) {
      toast('Lagu di kombinasi ini kurang dari 4.');
      return;
    }
    state.solved = false;
    state.tried = [];
    persistSetup();
    Engine.init();
    Engine.resume();
    show('main');
    nextSong();
  }

  function pickSong() {
    var pool = state.pool.filter(function (s) { return state.recent.indexOf(s.id) === -1; });
    if (!pool.length) {
      state.recent = [];
      pool = state.pool.slice();
    }
    var s = pool[Math.floor(Math.random() * pool.length)];
    state.recent.push(s.id);
    if (state.recent.length > Math.min(40, Math.floor(state.pool.length * 0.6))) state.recent.shift();
    return s;
  }

  function nextSong() {
    state.song = pickSong();
    state.stage = 0;
    state.tried = [];
    state.answeredWrong = false;
    state.loading = true;
    state.solved = false;
    state.rec = null;
    state.suggestions = [];
    state.suggestIndex = -1;

    $('guess').value = '';
    $('guess').disabled = true;
    $('suggest').hidden = true;
    $('suggest').innerHTML = '';
    $('tried').innerHTML = '';
    $('btnGiveUp').hidden = true;
    $('guessHint').textContent = '';
    renderStreak();
    renderStages();
    setPlayState('loading');

    Engine.load(state.song).catch(function () {
      return Engine.load(state.song);
    }).then(function (rec) {
      if (!state.song) return;
      state.rec = rec;
      state.loading = false;
      $('guess').disabled = false;
      setPlayState('ready');
      state.startedAt = performance.now();
      setTimeout(function () { if (!state.solved) playStage(); }, 60);
      buildIndices();
    }).catch(function () {
      toast('Lagu ini gagal dimuat. Lanjut ke lagu berikutnya.');
      nextSong();
    });
  }

  /* indeks pencarian untuk saran judul */
  var searchIndex = null;
  function buildIndices() {
    if (searchIndex && searchIndex.pool === state.pool) return;
    searchIndex = {
      pool: state.pool,
      items: state.pool.map(function (s) {
        return { song: s, t: norm(s.title), a: norm(s.artist), ta: norm(s.title + ' ' + s.artist) };
      })
    };
  }

  function findSuggestions(q) {
    var nq = norm(q);
    if (nq.length < 2 || !searchIndex) return [];
    var out = [];
    searchIndex.items.forEach(function (it) {
      var score = 0;
      if (it.t.indexOf(nq) === 0) score = 4;
      else if (it.t.indexOf(nq) > 0) score = 3;
      else if (it.a.indexOf(nq) === 0) score = 2;
      else if (it.a.indexOf(nq) > 0) score = 1;
      else if (it.ta.indexOf(nq) > 0) score = 1;
      if (score) out.push({ song: it.song, score: score });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    var seen = {};
    return out.filter(function (o) {
      var k = norm(o.song.title) + '|' + norm(o.song.artist);
      if (seen[k]) return false;
      seen[k] = 1;
      return true;
    }).slice(0, 6).map(function (o) { return o.song; });
  }

  function renderSuggestions() {
    var q = $('guess').value;
    var list = $('suggest');
    state.suggestions = state.solved ? [] : findSuggestions(q);
    if (state.suggestIndex >= state.suggestions.length) state.suggestIndex = state.suggestions.length - 1;
    if (!state.suggestions.length) {
      list.hidden = true;
      list.innerHTML = '';
      $('guess').setAttribute('aria-expanded', 'false');
      return;
    }
    list.innerHTML = state.suggestions.map(function (s, i) {
      return '<li role="option" id="sg' + i + '" class="sg' + (i === state.suggestIndex ? ' on' : '') + '"' +
        ' data-i="' + i + '" aria-selected="' + (i === state.suggestIndex) + '">' +
        '<span class="st">' + esc(s.title) + '</span>' +
        '<span class="sa">' + esc(s.artist) + ' · ' + s.year + '</span></li>';
    }).join('');
    list.hidden = false;
    $('guess').setAttribute('aria-expanded', 'true');
    if (state.suggestIndex >= 0) {
      $('guess').setAttribute('aria-activedescendant', 'sg' + state.suggestIndex);
    } else {
      $('guess').removeAttribute('aria-activedescendant');
    }
  }

  function onSuggestPick(e) {
    var li = e.target.closest('[data-i]');
    if (!li) return;
    e.preventDefault();
    var song = state.suggestions[Number(li.dataset.i)];
    if (song) submitGuess(song);
  }
  $('suggest').addEventListener('mousedown', onSuggestPick);
  $('suggest').addEventListener('click', onSuggestPick);

  $('guess').addEventListener('input', function () {
    state.suggestIndex = -1;
    renderSuggestions();
  });

  $('guess').addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!state.suggestions.length) return;
      state.suggestIndex = Math.min(state.suggestions.length - 1, state.suggestIndex + 1);
      renderSuggestions();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.suggestIndex = Math.max(-1, state.suggestIndex - 1);
      renderSuggestions();
    } else if (e.key === 'Escape') {
      $('suggest').hidden = true;
      $('guess').setAttribute('aria-expanded', 'false');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (state.suggestIndex >= 0 && state.suggestions[state.suggestIndex]) {
        submitGuess(state.suggestions[state.suggestIndex]);
      } else {
        var typed = $('guess').value.trim();
        if (!typed) return;
        var exact = state.suggestions.find(function (s) {
          return norm(s.title) === norm(typed);
        });
        if (exact) submitGuess(exact);
        else submitGuess(null, typed);
      }
    }
  });

  function submitGuess(song, typed) {
    if (state.solved || state.loading) return;
    if (!song) {
      var raw = (typed || '').trim();
      if (raw.length < 2) return;
      var key = norm(raw);
      if (state.tried.indexOf(raw) !== -1) {
        toast('Sudah pernah ditebak.');
        return;
      }
      state.tried.push(raw);
      wrongGuess(raw);
      return;
    }
    if (song.id === state.song.id) {
      solveRound();
    } else {
      var label = song.title;
      if (state.tried.indexOf(label) !== -1) return;
      state.tried.push(label);
      wrongGuess(label);
    }
  }

  function wrongGuess(label) {
    renderTried();
    $('guess').value = '';
    $('suggest').hidden = true;
    $('guess').setAttribute('aria-expanded', 'false');
    beep('bad');
    buzz(25);

    if (state.stage >= STAGES.length - 1) {
      loseRound('gb');
      return;
    }
    state.stage++;
    renderStages();
    $('guessHint').textContent = 'Belum tepat. Potongan dibuka jadi ' + secLabel(STAGES[state.stage]) + '.';
    setTimeout(function () {
      if (!state.solved) playStage();
    }, 350);
  }

  function renderTried() {
    var wrap = $('tried');
    var items = state.tried.slice(-4);
    wrap.innerHTML = items.map(function (t) {
      return '<li>' + esc(t) + '</li>';
    }).join('');
  }

  function solveRound() {
    state.solved = true;
    var seconds = Math.max(1, Math.round((performance.now() - state.startedAt) / 1000));
    streak.current += 1;
    if (streak.current > streak.best) streak.best = streak.current;
    store.set('streak', streak);
    renderStreak();
    beep('good');
    buzz(20);
    Engine.stopClip();
    showReveal(true, seconds);
  }

  function loseRound(reason) {
    if (state.solved) return;
    state.solved = true;
    streak.current = 0;
    store.set('streak', streak);
    renderStreak();
    Engine.stopClip();
    showReveal(false, 0, reason);
  }

  $('btnSkip').addEventListener('click', function () {
    if (state.loading || state.solved) return;
    loseRound('skip');
  });

  $('btnGiveUp').addEventListener('click', function () {
    if (state.loading || state.solved) return;
    loseRound('giveup');
  });

  function renderStreak() {
    $('streakNow').textContent = streak.current;
    $('bestNow').textContent = streak.best;
    var chip = $('streakChip');
    chip.classList.toggle('hot', streak.current >= 3);
  }

  function renderStages() {
    var segs = $('tlSegs').children;
    for (var i = 0; i < segs.length; i++) {
      segs[i].className = 's' + (i + 1) + (i <= state.stage ? ' open' : '') + (i === state.stage ? ' on' : '');
    }
    var pct = ((state.stage + 1) / STAGES.length) * 100;
    $('tlFill').style.width = pct + '%';
    $('tlKnob').style.left = 'calc(' + pct + '% - ' + (pct / 100 * 10) + 'px)';
    $('playSecs').textContent = secLabel(STAGES[state.stage]);
    $('stageLabel').textContent = 'Tahap ' + (state.stage + 1) + ' dari ' + STAGES.length;
    $('btnGiveUp').hidden = false;
  }

  function setPlayState(s) {
    var b = $('btnPlay');
    b.dataset.state = s;
    var hint = $('playHint');
    if (s === 'loading') {
      hint.textContent = 'Menyiapkan klip…';
      b.setAttribute('aria-label', 'Memuat audio');
    } else if (s === 'playing') {
      hint.textContent = 'Memutar…';
      b.setAttribute('aria-label', 'Sedang memutar');
    } else {
      hint.textContent = 'Ketuk untuk dengar ulang · spasi';
      b.setAttribute('aria-label', 'Putar potongan lagu');
    }
  }

  function playStage() {
    if (!state.rec || state.solved) return;
    var sec = STAGES[state.stage];
    setPlayState('playing');
    var clip = Engine.playClip(state.rec, sec);
    clip.ended.then(function () {
      if (state.view === 'main' && !state.solved) setPlayState('ready');
    });
  }

  $('btnPlay').addEventListener('click', function () {
    if (state.loading || state.solved) return;
    Engine.resume().then(playStage);
  });

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

  function mmss(sec) {
    sec = Math.max(0, Math.round(sec));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
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

  function showReveal(solved, seconds, reason) {
    Engine.stopClip();
    stopFullPlayer();
    var s = state.song;

    $('revEyebrow').textContent = solved ? 'Kena' : 'Itu tadi';
    $('revTitle').textContent = s.title;
    $('revArtist').textContent = s.artist;
    $('revLine2').textContent = s.year + ' · ' + s.genre;

    var cover = $('revCover');
    cover.innerHTML = s.art
      ? '<img alt="" src="' + esc(s.art) + '" loading="lazy">'
      : '<span class="ph-line"></span>';
    var img = cover.querySelector('img');
    if (img) {
      img.addEventListener('error', function () {
        cover.innerHTML = '<span class="ph-line"></span>';
      });
    }

    var apple = $('revApple');
    if (s.appleUrl) { apple.href = s.appleUrl; apple.hidden = false; }
    else { apple.hidden = true; }

    var v = $('revVerdict');
    v.className = 'verdict ' + (solved ? 'good' : 'neutral');
    if (solved) {
      v.innerHTML = '<b class="num">Beruntun ' + streak.current + '</b>' +
        '<span>Tahap ' + (state.stage + 1) + ' · ' + secLabel(STAGES[state.stage]) +
        ' · ' + seconds + ' detik' +
        (streak.current === streak.best && streak.best > 1 ? ' · rekor baru' : '') + '</span>';
    } else {
      var why = reason === 'skip' ? 'Kamu lewati' : reason === 'giveup' ? 'Kamu menyerah' : 'Tidak ketemu';
      v.innerHTML = '<b class="num">Beruntun terhenti</b>' +
        '<span>' + why + ' · rekor kamu tetap ' + streak.best + '</span>';
    }

    $('btnNext').textContent = 'Lagu berikutnya';
    show('reveal');
    $('btnNext').focus();
  }

  $('btnNext').addEventListener('click', function () {
    Engine.stopClip();
    show('main');
    nextSong();
  });

  $('btnBackHome').addEventListener('click', function () {
    Engine.stopAll();
    show('home');
    renderHome();
  });

  $('btnStart').addEventListener('click', startSession);

  $('btnQuit').addEventListener('click', function () {
    if (window.confirm('Keluar dari sesi? Beruntun sekarang hilang.')) {
      Engine.stopAll();
      streak.current = 0;
      store.set('streak', streak);
      show('home');
      renderHome();
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
    if (state.view === 'main' && e.code === 'Space' && document.activeElement !== $('guess')) {
      e.preventDefault();
      if (!state.loading && !state.solved) Engine.resume().then(playStage);
    }
    if (state.view === 'reveal' && e.key === 'Enter') {
      e.preventDefault();
      $('btnNext').click();
    }
  });

  /* ---------------- pengaturan ---------------- */
  function applyTheme() {
    if (settings.theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', settings.theme);
    Array.prototype.forEach.call($('segTheme').children, function (b) {
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
    Array.prototype.forEach.call($('segStart').children, function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.start === settings.startPoint));
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

  $('segStart').addEventListener('click', function (e) {
    var b = e.target.closest('[data-start]');
    if (!b) return;
    settings.startPoint = b.dataset.start;
    store.set('settings', settings);
    syncSettingsUI();
  });

  if (navigator.vibrate) $('rowHaptic').hidden = false;

  $('btnSettings').addEventListener('click', function () {
    syncSettingsUI();
    openSheet($('sheetSettings'));
  });
  $('btnHowTo').addEventListener('click', function () { openSheet($('sheetHowTo')); });

  /* ---------------- start ---------------- */
  applyTheme();
  renderHome();

  if (!store.get('seenHowTo', false)) {
    store.set('seenHowTo', true);
    setTimeout(function () { openSheet($('sheetHowTo')); }, 600);
  }

  window.SEPOTONG = {
    engine: Engine,
    state: state,
    stages: STAGES,
    streak: function () { return { current: streak.current, best: streak.best }; },
    setStreak: function (c, b) { streak.current = c; streak.best = b; store.set('streak', streak); renderStreak(); },
    pool: function () { return state.pool; },
    answer: function () { return state.song; },
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
