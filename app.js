/* ============================================================
   Sepotong — satu layar: sidebar genre/era/kesulitan, area putar,
   panel pemutaran. Skor = beruntun lagu.
   ============================================================ */
(function () {
  'use strict';

  var LS = 'sepotong:v2:';
  var STAGES = [0.1, 0.5, 2, 8, 15];
  var TIERS = [
    { id: 'easy', label: 'Easy' },
    { id: 'medium', label: 'Medium' },
    { id: 'hard', label: 'Hard' },
    { id: 'expert', label: 'Expert' },
    { id: 'impossible', label: 'Impossible' }
  ];
  var GENRE_LABEL = {
    pop: 'Pop', rock: 'Rock', folk: 'Folk', dangdut: 'Dangdut', jazz: 'Jazz',
    indie: 'Indie', religi: 'Religi', keroncong: 'Keroncong', campursari: 'Campursari',
    'gen z': 'Gen Z'
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
  function eraLabel(d) { return d >= 2000 ? d + '-an' : String(d).slice(2) + '-an'; }
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

  var settings = Object.assign({
    genre: 'semua', era: 'semua', tier: 'easy',
    startStage: 0, startPoint: 'hook', suggest: true, navMode: 'genre', theme: 'auto',
    volume: 80, sound: true, haptic: true, reduceMotion: false
  }, store.get('settings', {}));

  var level = Object.assign({ current: 1, best: 1 }, store.get('level', {}));
  if (!store.get('level', null)) {
    try {
      var oldStreak = JSON.parse(localStorage.getItem('sepotong:v2:streak') || 'null');
      if (oldStreak && typeof oldStreak.best === 'number') {
        level.best = Math.max(1, oldStreak.best + 1);
        level.current = level.best;
      }
    } catch (e) {}
  }

  function saveSettings() { store.set('settings', settings); }

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

  /* kesulitan: peringkat artis menurut jumlah lagunya di bank, dibagi rata
     per kuantil supaya tiap tingkat terisi berapa pun ukuran banknya */
  var tierOfArtist = (function () {
    var counts = new Map();
    SONGS.forEach(function (s) { counts.set(s.artist, (counts.get(s.artist) || 0) + 1); });
    var ranked = Array.from(counts.entries())
      .sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); });
    var target = SONGS.length / TIERS.length;
    var acc = 0;
    var map = new Map();
    ranked.forEach(function (row) {
      var idx = Math.min(TIERS.length - 1, Math.floor(acc / target));
      map.set(row[0], TIERS[idx].id);
      acc += row[1];
    });
    return map;
  })();

  function nextTier(id) {
    var i = TIERS.findIndex(function (t) { return t.id === id; });
    if (i < 0) return TIERS[0].id;
    return TIERS[Math.min(i + 1, TIERS.length - 1)].id;
  }

  function tierOf(song) {
    return tierOfArtist.get(song.artist) || 'impossible';
  }
  SONGS.forEach(function (s) { s.tier = tierOf(s); });

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

  function baseFilter(genre, era, tier) {
    return SONGS.filter(function (s) {
      var gOK = genre === 'semua' || s.genre === genre;
      var eOK = era === 'semua' || Math.floor(s.year / 10) * 10 === Number(era);
      var tOK = tier === 'semua' || s.tier === tier;
      return gOK && eOK && tOK;
    });
  }

  function poolNow() {
    return baseFilter(settings.genre, settings.era, settings.tier);
  }

  /* ---------------- efek ---------------- */
  function beep(kind) {
    if (!settings.sound) return;
    try {
      var ctx = Engine.init();
      var t = ctx.currentTime;
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = 'sine';
      if (kind === 'good') {
        osc.frequency.setValueAtTime(620, t);
        osc.frequency.exponentialRampToValueAtTime(930, t + 0.12);
      } else {
        osc.frequency.setValueAtTime(240, t);
        osc.frequency.exponentialRampToValueAtTime(160, t + 0.14);
      }
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(g);
      g.connect(Engine.master());
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
    gainNode: null,

    init: function () {
      if (!this.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
      }
      return this.ctx;
    },

    master: function () {
      var ctx = this.init();
      if (!this.gainNode) {
        this.gainNode = ctx.createGain();
        this.gainNode.gain.value = (settings.volume / 100) * 1;
        this.gainNode.connect(ctx.destination);
      }
      return this.gainNode;
    },

    setVolume: function (v) {
      settings.volume = v;
      if (this.gainNode) this.gainNode.gain.value = v / 100;
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
      return settings.startPoint === 'zero' ? 0 : rec.offset;
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
      gain.connect(this.master());
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
      gain.connect(this.master());
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
    pool: [],
    song: null,
    rec: null,
    stage: 0,
    loading: true,
    solved: false,
    tried: [],
    triedNorm: [],
    triedIds: [],
    recent: [],
    startedAt: 0,
    nextTier: null,
    suggestIndex: -1,
    suggestions: [],
    searchIndex: null,
    bankPreview: null
  };

  /* ---------------- toast ---------------- */
  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }

  /* ---------------- sheet ---------------- */
  var openSheetEl = null;
  var lastFocus = null;

  function openSheet(el) {
    lastFocus = document.activeElement;
    openSheetEl = el;
    $('backdrop').hidden = false;
    el.hidden = false;
    var f = el.querySelector('input, button');
    if (f) setTimeout(function () { f.focus(); }, 40);
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
      return;
    }
    if (e.code === 'Space' && document.activeElement !== $('guess')) {
      e.preventDefault();
      if (!state.loading && !state.solved) Engine.resume().then(playStage);
    }
    if (e.key === 'Escape') closeDrawers();
  });

  /* ---------------- drawer (mobile) ---------------- */
  function openDrawer(which) {
    closeDrawers();
    $(which).classList.add('open');
  }
  function closeDrawers() {
    $('sideLeft').classList.remove('open');
    $('sideRight').classList.remove('open');
  }
  $('btnDrawerLeft').addEventListener('click', function () { openDrawer('sideLeft'); });
  $('btnDrawerRight').addEventListener('click', function () { openDrawer('sideRight'); });
  document.querySelectorAll('[data-drawer-close]').forEach(function (b) {
    b.addEventListener('click', closeDrawers);
  });

  /* ---------------- filter UI ---------------- */
  function renderSelects() {
    $('selGenre').innerHTML =
      '<option value="semua">Semua genre</option>' +
      GENRES.map(function (g) {
        return '<option value="' + esc(g[0]) + '">' + esc(g[0]) + ' — ' + g[1] + ' lagu</option>';
      }).join('');
    $('selGenre').value = settings.genre;

    $('selEra').innerHTML =
      '<option value="semua">Semua era</option>' +
      DECADES.map(function (d) {
        return '<option value="' + d[0] + '">' + eraLabel(d[0]) + ' — ' + d[1] + ' lagu</option>';
      }).join('');
    $('selEra').value = settings.era;
  }

  function navItems() {
    if (settings.navMode === 'era') {
      var active = settings.era;
      return [{ key: 'semua', label: 'Semua' }].concat(
        DECADES.map(function (d) {
          return { key: String(d[0]), label: eraLabel(d[0]) };
        })
      ).map(function (it) {
        it.on = String(active) === it.key;
        return it;
      });
    }
    return [{ key: 'semua', label: 'Semua' }].concat(
      GENRES.map(function (g) { return { key: g[0], label: g[0] }; })
    ).map(function (it) {
      it.on = settings.genre === it.key;
      return it;
    });
  }

  function renderGenreNav() {
    var isEra = settings.navMode === 'era';
    var items = navItems();
    $('genreNav').innerHTML =
      '<button class="navmode" id="btnNavMode" aria-label="Ganti antara genre dan tahun">' +
        '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">' +
        '<path d="M4 8h13M4 16h9"/><path d="M17 5l3 3-3 3"/></svg>' +
        (isEra ? 'Tahun' : 'Genre') +
      '</button>' +
      items.map(function (it) {
        return '<button data-nav="' + esc(it.key) + '" aria-pressed="' + (!!it.on) + '">' +
          esc(it.label) + '</button>';
      }).join('') +
      '<button class="navshuffle" id="btnShuffleGenre" aria-label="Acak pilihan">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
      '<path d="M16 3h5v5M4 20l6-6M21 3l-7 7M16 21h5v-5M4 4l5 5"/></svg></button>';
    updateNavScrollable();
  }

  function updateNavScrollable() {
    var nav = $('genreNav');
    if (!nav) return;
    nav.classList.toggle('scrollable', nav.scrollWidth - nav.clientWidth > 4);
  }

  /* geser baris genre: drag dengan mouse, usap dengan jari, wheel vertikal jadi horizontal */
  (function () {
    var nav = $('genreNav');
    var drag = null;
    var suppress = false;

    nav.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || nav.scrollWidth <= nav.clientWidth) return;
      drag = { x: e.clientX, left: nav.scrollLeft, moved: false };
      nav.classList.add('dragging');
    });
    nav.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x;
      if (Math.abs(dx) > 4) drag.moved = true;
      nav.scrollLeft = drag.left - dx;
    });
    function endDrag() {
      if (!drag) return;
      if (drag.moved) {
        suppress = true;
        setTimeout(function () { suppress = false; }, 0);
      }
      drag = null;
      nav.classList.remove('dragging');
    }
    nav.addEventListener('pointerup', endDrag);
    nav.addEventListener('pointercancel', endDrag);
    nav.addEventListener('pointerleave', endDrag);
    nav.addEventListener('click', function (e) {
      if (suppress) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    nav.addEventListener('wheel', function (e) {
      if (nav.scrollWidth <= nav.clientWidth) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        nav.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    }, { passive: false });

    window.addEventListener('resize', updateNavScrollable);
  })();

  function renderPills() {
    $('tierPills').innerHTML = TIERS.map(function (t) {
      return '<button class="pill" data-tier="' + t.id + '" aria-pressed="' +
        (settings.tier === t.id) + '">' + t.label + '</button>';
    }).join('');
  }

  function renderDiffList() {
    $('diffList').innerHTML = TIERS.map(function (t) {
      return '<button class="diff-row" data-diff="' + t.id + '" aria-pressed="' +
        (settings.tier === t.id) + '" style="--tier:var(--' + t.id + ')">' + t.label +
        '<span class="swatch" style="background:var(--' + t.id + ')"></span></button>';
    }).join('');
  }

  function renderStartGrid() {
    $('startGrid').innerHTML = STAGES.map(function (s, i) {
      return '<button class="dur-btn" data-start="' + i + '" aria-pressed="' +
        (settings.startStage === i) + '">' + secLabel(s) + '</button>';
    }).join('');
  }

  /* ---------------- tema ---------------- */
  var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function resolvedTheme() {
    if (settings.theme === 'light' || settings.theme === 'dark') return settings.theme;
    return darkQuery.matches ? 'dark' : 'light';
  }

  function applyTheme() {
    var t = resolvedTheme();
    document.documentElement.dataset.theme = t;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#17100B' : '#FDF6EE');
    var seg = $('themeSeg');
    if (seg) {
      seg.querySelectorAll('[data-theme-opt]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.dataset.themeOpt === settings.theme));
      });
    }
  }

  darkQuery.addEventListener('change', function () {
    if (settings.theme === 'auto') applyTheme();
  });

  $('themeSeg').addEventListener('click', function (e) {
    var b = e.target.closest('[data-theme-opt]');
    if (!b) return;
    settings.theme = b.dataset.themeOpt;
    saveSettings();
    applyTheme();
    toast('Tema: ' + (settings.theme === 'auto' ? 'ikut sistem' : settings.theme === 'dark' ? 'gelap' : 'terang'));
  });

  function renderSettingsUI() {
    $('optHook').setAttribute('aria-pressed', String(settings.startPoint === 'hook'));
    $('optZero').setAttribute('aria-pressed', String(settings.startPoint === 'zero'));
    $('optEasy').setAttribute('aria-pressed', String(!!settings.suggest));
    $('optSound').setAttribute('aria-pressed', String(!!settings.sound));
    $('optHaptic').setAttribute('aria-pressed', String(!!settings.haptic));
    $('optMotion').setAttribute('aria-pressed', String(!!settings.reduceMotion));
    $('guess').placeholder = settings.suggest ? 'Sebutkan judul lagunya' : 'Ketik judul lengkap';
    $('volRange').value = String(settings.volume);
    $('volFill').style.width = settings.volume + '%';
    $('volPct').textContent = settings.volume + '%';
    document.documentElement.classList.toggle('reduce-motion', !!settings.reduceMotion);
  }

  function applyFilters() {
    state.pool = poolNow();
    state.searchIndex = null;
    $('bankCount').textContent = state.pool.length + ' dari ' + SONGS.length + ' judul';
    renderSelects();
    renderGenreNav();
    renderPills();
    renderDiffList();
    bindFilterEvents();
    if (!state.pool.length) {
      emptyPool();
      return;
    }
    startSong();
  }

  /* kombinasi filter tanpa lagu: jangan biarkan layar nyangkut */
  function emptyPool() {
    Engine.stopAll();
    state.song = null;
    state.rec = null;
    state.solved = true;
    state.loading = true;
    state.tried = [];
    state.triedNorm = [];
    state.triedIds = [];
    state.suggestions = [];
    $('guess').value = '';
    $('guess').disabled = true;
    $('btnPlay').disabled = false;
    $('suggest').hidden = true;
    $('suggest').innerHTML = '';
    $('tried').innerHTML = '';
    $('hintLine').textContent = 'Tidak ada lagu untuk kombinasi ini';
    $('btnPlay').dataset.state = 'empty';
    $('btnPlay').setAttribute('aria-label', 'Tidak ada lagu');
    $('btnPlay').disabled = true;
    updateActionBtn();
    toast('Kombinasi filter kosong. Longgarkan genre, era, atau kesulitan.');
  }

  function bindFilterEvents() {
    $('genreNav').onclick = function (e) {
      if (e.target.closest('#btnNavMode')) {
        settings.navMode = settings.navMode === 'era' ? 'genre' : 'era';
        saveSettings();
        renderGenreNav();
        bindFilterEvents();
        return;
      }
      var b = e.target.closest('[data-nav]');
      if (b) {
        if (settings.navMode === 'era') settings.era = b.dataset.nav;
        else settings.genre = b.dataset.nav;
        saveSettings();
        applyFilters();
        return;
      }
      if (e.target.closest('#btnShuffleGenre')) {
        if (settings.navMode === 'era') {
          var d = DECADES[Math.floor(Math.random() * DECADES.length)][0];
          settings.era = String(d);
          saveSettings(); applyFilters();
          toast('Era: ' + eraLabel(d));
        } else {
          var g = GENRES[Math.floor(Math.random() * GENRES.length)][0];
          settings.genre = g;
          saveSettings(); applyFilters();
          toast('Genre: ' + g);
        }
      }
    };
    $('tierPills').onclick = function (e) {
      var b = e.target.closest('[data-tier]');
      if (!b) return;
      settings.tier = b.dataset.tier;
      saveSettings();
      applyFilters();
    };
    $('diffList').onclick = function (e) {
      var b = e.target.closest('[data-diff]');
      if (!b) return;
      settings.tier = b.dataset.diff;
      saveSettings();
      applyFilters();
    };
  }

  $('selGenre').addEventListener('change', function () {
    settings.genre = this.value;
    saveSettings();
    applyFilters();
  });
  $('selEra').addEventListener('change', function () {
    settings.era = this.value;
    saveSettings();
    applyFilters();
  });

  /* ---------------- panel kanan ---------------- */
  $('optHook').addEventListener('click', function () {
    settings.startPoint = 'hook'; saveSettings(); renderSettingsUI();
  });
  $('optZero').addEventListener('click', function () {
    settings.startPoint = 'zero'; saveSettings(); renderSettingsUI();
    if (!state.solved) playStage();
  });
  $('optPreview').addEventListener('click', function () {
    if (state.loading || state.solved || !state.rec) return;
    Engine.resume().then(function () {
      settings.startPoint = 'hook';
      saveSettings();
      renderSettingsUI();
      var last = STAGES.length - 1;
      if (state.stage !== last) {
        state.stage = last;
        syncStageUI();
        toast('Semua potongan dibuka (tahap 5).');
      }
      var clip = Engine.playFull(state.rec, function () {
        if (!state.solved) setPlayState('ready');
      });
      setPlayState('playing');
      state.previewPlaying = true;
      clip.onDone = null;
    });
  });
  $('optEasy').addEventListener('click', function () {
    settings.suggest = !settings.suggest;
    saveSettings();
    renderSettingsUI();
    $('suggest').hidden = true;
    toast(settings.suggest
      ? 'Saran judul nyala: ketik minimal 3 huruf.'
      : 'Saran judul mati: judul harus diketik lengkap.');
  });
  $('optSound').addEventListener('click', function () {
    settings.sound = !settings.sound; saveSettings(); renderSettingsUI();
    if (settings.sound) beep('good');
  });
  $('optHaptic').addEventListener('click', function () {
    settings.haptic = !settings.haptic; saveSettings(); renderSettingsUI(); buzz(18);
  });
  $('optMotion').addEventListener('click', function () {
    settings.reduceMotion = !settings.reduceMotion; saveSettings(); renderSettingsUI();
  });

  $('uiOptHead').addEventListener('click', function () {
    var open = this.getAttribute('aria-expanded') === 'true';
    this.setAttribute('aria-expanded', String(!open));
    $('uiOptBody').hidden = open;
  });

  $('startGrid').addEventListener('click', function (e) {
    var b = e.target.closest('[data-start]');
    if (!b) return;
    settings.startStage = Number(b.dataset.start);
    saveSettings();
    renderStartGrid();
    if (!state.tried.length && !state.solved) {
      state.stage = settings.startStage;
      syncStageUI();
      toast('Mulai dari ' + secLabel(STAGES[state.stage]) + '.');
      if (!state.loading) playStage();
    } else {
      toast('Berlaku untuk lagu berikutnya.');
    }
  });

  $('volRange').addEventListener('input', function () {
    Engine.setVolume(Number(this.value));
    $('volFill').style.width = this.value + '%';
    $('volPct').textContent = this.value + '%';
    saveSettings();
  });

  /* ---------------- sesi ---------------- */
  function pickSong() {
    var pool = state.pool.filter(function (s) { return state.recent.indexOf(s.id) === -1; });
    if (!pool.length) { state.recent = []; pool = state.pool.slice(); }
    var s = pool[Math.floor(Math.random() * pool.length)];
    state.recent.push(s.id);
    if (state.recent.length > Math.min(40, Math.floor(state.pool.length * 0.6))) state.recent.shift();
    return s;
  }

  function startSong(keepToast) {
    if (!state.pool.length) return;
    Engine.stopAll();
    state.song = pickSong();
    state.stage = Math.min(settings.startStage, STAGES.length - 1);
    state.tried = [];
    state.triedNorm = [];
    state.triedIds = [];
    state.loading = true;
    state.solved = false;
    showPlayView();
    state.rec = null;
    state.suggestIndex = -1;
    state.suggestions = [];
    $('guess').value = '';
    $('guess').disabled = true;
    $('suggest').hidden = true;
    $('suggest').innerHTML = '';
    $('tried').innerHTML = '';
    $('hintLine').textContent = 'Menyiapkan klip…';
    setPlayState('loading');
    syncStageUI();
    renderLevel();

    var song = state.song;
    Engine.load(song).catch(function () { return Engine.load(song); })
      .then(function (rec) {
        if (state.song !== song) return;
        state.rec = rec;
        state.loading = false;
        $('guess').disabled = false;
        setPlayState('ready');
        $('hintLine').textContent = 'Ketuk tombol putar';
        state.startedAt = performance.now();
        buildSearchIndex();
      })
      .catch(function () {
        toast('Lagu ini gagal dimuat. Coba lagi.');
        setPlayState('ready');
      });
  }

  function buildSearchIndex() {
    if (state.searchIndex) return;
    state.searchIndex = state.pool.map(function (s) {
      return { song: s, t: norm(s.title), a: norm(s.artist), ta: norm(s.title + ' ' + s.artist) };
    });
  }

  /* ---------------- pencarian judul ---------------- */
  function findSuggestions(q) {
    var nq = norm(q);
    if (!settings.suggest) return [];
    if (nq.length < 3 || !state.searchIndex) return [];
    var out = [];
    state.searchIndex.forEach(function (it) {
      if (state.triedIds.indexOf(it.song.id) !== -1) return;
      if (state.triedNorm.indexOf(it.t) !== -1) return;
      /* hanya dicocokkan ke judul: mengetik nama artis tidak memunculkan daftar lagunya */
      var score = 0;
      if (it.t.indexOf(nq) === 0) score = 3;
      else if (it.t.indexOf(nq) > 0) score = 2;
      if (score) out.push({ song: it.song, score: score });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    var seen = {};
    return out.filter(function (o) {
      var k = norm(o.song.title) + '|' + norm(o.song.artist);
      if (seen[k]) return false;
      seen[k] = 1;
      return true;
    }).slice(0, 4).map(function (o) { return o.song; });
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
      return '<li role="option" id="sg' + i + '" class="sg' + (i === state.suggestIndex ? ' on' : '') +
        '" data-i="' + i + '" aria-selected="' + (i === state.suggestIndex) + '">' +
        '<span class="st">' + esc(s.title) + '</span>' +
        '<span class="sa">' + esc(s.artist) + ' · ' + s.year + '</span></li>';
    }).join('');
    list.hidden = false;
    $('guess').setAttribute('aria-expanded', 'true');
    if (state.suggestIndex >= 0) $('guess').setAttribute('aria-activedescendant', 'sg' + state.suggestIndex);
    else $('guess').removeAttribute('aria-activedescendant');
  }

  function onSuggestPick(e) {
    var li = e.target.closest('[data-i]');
    if (!li) return;
    e.preventDefault();
    var song = state.suggestions[Number(li.dataset.i)];
    if (!song) return;
    $('guess').value = song.title;
    state.suggestIndex = -1;
    $('suggest').hidden = true;
    $('guess').setAttribute('aria-expanded', 'false');
    updateActionBtn();
    $('guess').focus();
  }
  $('suggest').addEventListener('mousedown', onSuggestPick);
  $('suggest').addEventListener('click', onSuggestPick);

  $('guess').addEventListener('input', function () {
    state.suggestIndex = -1;
    renderSuggestions();
    updateActionBtn();
  });

  $('guess').addEventListener('keydown', function (e) {
    e.stopPropagation();
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
        submitTyped($('guess').value.trim());
      }
    }
  });

  function submitTyped(raw) {
    if (raw.length < 2) return;
    var n = norm(raw);
    var hit = null;
    if (state.searchIndex) {
      for (var i = 0; i < state.searchIndex.length; i++) {
        if (state.searchIndex[i].t === n) { hit = state.searchIndex[i].song; break; }
      }
    }
    if (!hit && settings.suggest) {
      var partial = findSuggestions(raw);
      if (partial.length) hit = partial[0];
    }
    if (hit) submitGuess(hit);
    else submitGuess(null, raw);
  }

  function submitGuess(song, typed) {
    if (state.solved || state.loading) return;
    if (!song) {
      var raw = (typed || '').trim();
      if (raw.length < 2) return;
      if (state.triedNorm.indexOf(norm(raw)) !== -1) {
        toast('Judul itu sudah ditebak.');
        $('guess').value = '';
        updateActionBtn();
        return;
      }
      wrongGuess(raw, null);
      return;
    }
    if (song.id === state.song.id) { solveRound(); return; }
    if (state.triedIds.indexOf(song.id) !== -1 || state.triedNorm.indexOf(norm(song.title)) !== -1) {
      toast('Judul itu sudah ditebak.');
      $('guess').value = '';
      updateActionBtn();
      return;
    }
    wrongGuess(song.title, song);
  }

  function wrongGuess(label, song) {
    state.tried.push(label);
    state.triedNorm.push(norm(label));
    if (song) state.triedIds.push(song.id);
    renderTried();
    $('guess').value = '';
    $('suggest').hidden = true;
    $('guess').setAttribute('aria-expanded', 'false');
    updateActionBtn();
    beep('bad');
    buzz(25);

    if (state.stage >= STAGES.length - 1) { loseRound('wrong'); return; }
    state.stage++;
    syncStageUI();
    $('hintLine').textContent = 'Belum tepat. Potongan dibuka jadi ' + secLabel(STAGES[state.stage]) + '.';
    setTimeout(function () { if (!state.solved) playStage(); }, 320);
  }

  function renderTried() {
    $('tried').innerHTML = state.tried.slice(-4).map(function (t) {
      return '<li>' + esc(t) + '</li>';
    }).join('');
  }

  function solveRound() {
    state.solved = true;
    level.best = Math.max(level.best, level.current);
    level.current = level.best + 1;
    state.nextTier = nextTier(settings.tier);
    store.set('level', level);
    renderLevel();
    beep('good');
    buzz(20);
    Engine.stopClip();
    showReveal(true, 0);
  }

  function loseRound(reason) {
    if (state.solved) return;
    state.solved = true;
    level.best = Math.max(level.best, level.current);
    store.set('level', level);
    renderLevel();
    Engine.stopClip();
    showReveal(false, 0, reason);
  }

  /* ---------------- tombol aksi ---------------- */
  function updateActionBtn() {
    var b = $('btnAction');
    var hasText = $('guess').value.trim().length >= 2;
    var last = state.stage >= STAGES.length - 1;
    if (hasText) {
      b.textContent = 'Tebak';
      b.classList.add('primary');
    } else {
      b.textContent = last ? 'Nyerah' : 'Lewati ke ' + secLabel(STAGES[state.stage + 1]);
      b.classList.remove('primary');
    }
    b.disabled = !!state.solved || !!state.loading;
  }

  $('btnAction').addEventListener('click', function () {
    if (state.loading || state.solved) return;
    var raw = $('guess').value.trim();
    if (raw.length >= 2) { submitTyped(raw); return; }
    if (state.stage >= STAGES.length - 1) { loseRound('giveup'); return; }
    state.stage++;
    syncStageUI();
    $('hintLine').textContent = 'Potongan dibuka jadi ' + secLabel(STAGES[state.stage]) + '.';
    setTimeout(function () { if (!state.solved) playStage(); }, 260);
  });

  /* ---------------- slider tahap ---------------- */
  function syncStageUI() {
    var i = state.stage;
    $('stageRange').value = String(i);
    $('railFill').style.transition = 'width 180ms ease';
    $('railFill').style.width = ((i + 1) / STAGES.length) * 100 + '%';
    var pct = ((i + 1) / STAGES.length) * 100;
    var mark = $('railMark');
    mark.textContent = secLabel(STAGES[i]);
    mark.style.left = Math.min(100, Math.max(0, pct)) + '%';
    $('playSecs').textContent = secLabel(STAGES[i]);
    updateActionBtn();
  }

  $('stageRange').addEventListener('input', function () {
    var target = Number(this.value);
    if (state.solved) { this.value = String(state.stage); return; }
    if (target < state.stage) {
      this.value = String(state.stage);
      toast('Potongan tidak bisa dipendekkan lagi.');
      return;
    }
    if (target === state.stage) return;
    state.stage = target;
    syncStageUI();
    $('hintLine').textContent = 'Potongan dibuka jadi ' + secLabel(STAGES[state.stage]) + '.';
    if (!state.loading) playStage();
  });

  /* ---------------- putar ---------------- */
  function setPlayState(s) {
    var b = $('btnPlay');
    b.dataset.state = s;
    b.setAttribute('aria-label',
      s === 'loading' ? 'Memuat audio' : s === 'playing' ? 'Sedang memutar' : 'Putar potongan');
    updateActionBtn();
  }

  var playToken = 0;
  var playTimer = 0;

  function playStage() {
    if (!state.rec) return;
    var sec = STAGES[state.stage];
    var token = ++playToken;
    clearTimeout(playTimer);
    setPlayState('playing');

    /* hanya potongan terbaru yang boleh mengubah keadaan tombol */
    var done = function () {
      if (token !== playToken) return;
      clearTimeout(playTimer);
      $('trackWrap').classList.remove('playing');
      var f = $('railFill');
      f.style.transition = 'width 160ms ease';
      f.style.width = ((state.stage + 1) / STAGES.length) * 100 + '%';
      setPlayState('ready');
    };

    if (Engine.ctx && Engine.ctx.state !== 'running') {
      Engine.resume();
    }

    /* rail berjalan dari awal tahap ke akhir tahap selama cuplikan berbunyi */
    var segA = (state.stage / STAGES.length) * 100;
    var segB = ((state.stage + 1) / STAGES.length) * 100;
    var fill = $('railFill');
    $('trackWrap').classList.add('playing');
    fill.style.transition = 'none';
    fill.style.width = segA + '%';
    void fill.offsetWidth;
    fill.style.transition = 'width ' + sec + 's linear';
    fill.style.width = segB + '%';

    var clip = Engine.playClip(state.rec, sec);
    clip.ended.then(done);
    /* jaring pengaman: kalau audio gagal berbunyi, tombol tetap balik sendiri */
    playTimer = setTimeout(done, sec * 1000 + 400);
  }

  $('btnPlay').addEventListener('click', function () {
    if (state.loading) return;
    if ($('btnPlay').dataset.state === 'playing') {
      playToken++;
      clearTimeout(playTimer);
      Engine.stopClip();
      $('trackWrap').classList.remove('playing');
      var f = $('railFill');
      f.style.transition = 'width 160ms ease';
      f.style.width = ((state.stage + 1) / STAGES.length) * 100 + '%';
      setPlayState('ready');
      return;
    }
    Engine.resume().then(function () {
      if (state.solved) { toast('Lagu ini sudah selesai.'); return; }
      playStage();
    });
  });

  /* ---------------- reroll ---------------- */
  $('btnReroll').addEventListener('click', function () {
    if (state.solved) { startSong(); closeDrawers(); return; }
    if (state.tried.length || state.stage > settings.startStage) {
      toast('Sudah mulai menebak. Pakai Nyerah kalau mau ganti lagu.');
      return;
    }
    startSong();
    closeDrawers();
  });

  /* ---------------- layar jawaban ---------------- */
  var fullPlayer = null;
  var fullRaf = 0;

  function stopFullPlayer() {
    if (fullPlayer) { try { fullPlayer.stop(); } catch (e) {} fullPlayer = null; }
    cancelAnimationFrame(fullRaf);
  }

  /* Ulang Lah! = ulangi level yang sama dengan lagu acak baru */
  $('btnReplay').addEventListener('click', function () {
    showPlayView();
    startSong();
  });

  function showPlayView() {
    var r = $('resultView');
    if (r) r.hidden = true;
    var pv = $('playView');
    if (pv) pv.hidden = false;
    /* baris genre dan pil level kembali tampil */
    var nav = $('genreNav');
    if (nav) nav.hidden = false;
    var pills = $('tierPills');
    if (pills) pills.hidden = false;
  }

  function showResultView() {
    var pv = $('playView');
    if (pv) pv.hidden = true;
    var r = $('resultView');
    if (r) r.hidden = false;
    /* saat hasil tampil, baris genre dan pil level disembunyikan */
    var nav = $('genreNav');
    if (nav) nav.hidden = true;
    var pills = $('tierPills');
    if (pills) pills.hidden = true;
  }

  function renderLevel() {
    $('streakNow').textContent = level.current;
    $('bestNow').textContent = level.best;
    $('streakChip').classList.toggle('hot', level.current >= 3);
  }

  function showReveal(solved, seconds, reason) {
    Engine.stopClip();
    stopFullPlayer();
    var s = state.song;
    $('revTitle').textContent = s.title;
    $('revArtist').textContent = s.artist;
    $('revLine2').textContent = s.album ? s.album + ' (' + s.year + ')' : String(s.year);

    var cover = $('revCover');
    cover.innerHTML = s.art ? '<img alt="" src="' + esc(s.art) + '" loading="lazy">' : '<span class="ph"></span>';
    var img = cover.querySelector('img');
    if (img) img.addEventListener('error', function () { cover.innerHTML = '<span class="ph"></span>'; });

    var badge = $('revBadge');
    badge.textContent = solved ? 'Anjay Bener!' : (reason === 'giveup' ? 'Gitu aja nyerah!' : 'Salah Lo!');
    badge.className = 'badge' + (solved ? ' good' : '');

    var revStreak = $('revStreak');
    if (revStreak) {
      revStreak.textContent = 'Level ' + level.current;
      revStreak.classList.toggle('hot', level.current >= 3);
    }

    var apple = $('revApple');
    if (s.appleUrl) { apple.href = s.appleUrl; apple.hidden = false; } else { apple.hidden = true; }

    $('btnReplay').hidden = !!solved;
    $('btnNext').hidden = !solved;
    showResultView();

    if (solved) fireConfetti();

    /* lagunya langsung diputar supaya hasilnya terasa hidup */
    if (state.rec) {
      Engine.resume().then(function () {
        if (!state.rec) return;
        Engine.playFull(state.rec);
      }).catch(function () {});
    }
  }

  $('btnNext').addEventListener('click', function () {
    showPlayView();
    if (state.nextTier && state.nextTier !== settings.tier) {
      settings.tier = state.nextTier;
      saveSettings();
      state.nextTier = null;
      applyFilters();
      toast('Level ' + level.current + ' · ' + settings.tier.charAt(0).toUpperCase() + settings.tier.slice(1));
      return;
    }
    state.nextTier = null;
    startSong();
  });

  /* ---------------- confetti ---------------- */
  var CONF_COLORS = ['#F5863C', '#FFC08A', '#FCEBD9', '#C2591E', '#4E9E92'];
  var confRaf = 0;
  var confPieces = [];
  var confCtx = null;

  function fireConfetti() {
    if (document.documentElement.classList.contains('reduce-motion')) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var canvas = $('confetti');
    if (!canvas) return;
    canvas.classList.add('on');
    canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1);
    canvas.height = canvas.clientHeight * (window.devicePixelRatio || 1);
    confCtx = canvas.getContext('2d');
    confCtx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);

    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    var bx = w / 2;
    var by = h * 0.4;
    var pieces = [];
    var meledak = false;

    /* tahap satu: percikan meluncur dari bawah layar menuju titik tengah */
    for (var i = 0; i < 3; i++) {
      var sx = bx + (i - 1) * 52 + (Math.random() - 0.5) * 16;
      var speed = 900 + Math.random() * 160;
      var rise = h + 14 - by;
      pieces.push({
        rocket: true, x: sx, y: h + 14,
        vx: (bx - sx) / (rise / speed), vy: -speed,
        color: CONF_COLORS[i % CONF_COLORS.length]
      });
    }

    /* tahap dua: pecahan menyebar ke segala arah dari titik itu */
    function burst() {
      var n = 62;
      for (var i = 0; i < n; i++) {
        var a = (Math.PI * 2 * i) / n + Math.random() * 0.12;
        var sp = 180 + Math.random() * 420;
        pieces.push({
          rocket: false, x: bx, y: by,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.82 - 60,
          w: 4 + Math.random() * 5, h: 7 + Math.random() * 7,
          rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 12,
          color: CONF_COLORS[Math.floor(Math.random() * CONF_COLORS.length)],
          life: 0
        });
      }
    }

    var last = performance.now();
    var t0 = last;

    function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      confCtx.clearRect(0, 0, w, h);
      var alive = 0;

      for (var i = pieces.length - 1; i >= 0; i--) {
        var p = pieces[i];

        if (p.rocket) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          confCtx.globalAlpha = 0.5;
          confCtx.fillStyle = p.color;
          confCtx.fillRect(p.x - 1.5, p.y, 3, 22);
          confCtx.globalAlpha = 1;
          if (p.y <= by) {
            pieces.splice(i, 1);
            meledak = true;
            continue;
          }
          alive++;
          continue;
        }

        p.life += dt;
        p.vx *= 0.985;
        p.vy = p.vy * 0.995 + 760 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        var fade = Math.max(0, 1 - Math.max(0, p.life - 1.1) / 0.9);
        if (fade <= 0) { pieces.splice(i, 1); continue; }
        alive++;
        confCtx.save();
        confCtx.translate(p.x, p.y);
        confCtx.rotate(p.rot);
        confCtx.globalAlpha = fade;
        confCtx.fillStyle = p.color;
        confCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        confCtx.restore();
      }

      if (meledak) { burst(); meledak = false; alive = pieces.length; }

      if (alive > 0 && now - t0 < 3600) {
        confRaf = requestAnimationFrame(frame);
      } else {
        confCtx.clearRect(0, 0, w, h);
        canvas.classList.remove('on');
      }
    }
    cancelAnimationFrame(confRaf);
    confRaf = requestAnimationFrame(frame);
  }

  /* ---------------- bagikan hasil ---------------- */
  function shareText(solved) {
    var s = state.song;
    var lv = solved ? level.best : level.current;
    if (solved) {
      return 'Nebak "' + s.title + '" — ' + s.artist + ' cuma dari potongan pendek di Spekulasi, Level ' + lv + '.';
    }
    return 'Nyerah di "' + s.title + '" — ' + s.artist + ' (Level ' + lv + ') di Spekulasi. Coba kalahin.';
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        resolve();
      } catch (e) { reject(e); }
    });
  }

  $('btnShare').addEventListener('click', function () {
    if (!state.song) return;
    var solved = !!state.solved && $('revBadge').classList.contains('good');
    var text = shareText(solved);
    var url = location.href.split('?')[0];
    if (navigator.share) {
      navigator.share({ title: 'Spekulasi', text: text, url: url }).catch(function () {});
      return;
    }
    copyText(text + ' ' + url)
      .then(function () { toast('Hasil disalin, tinggal tempel.'); })
      .catch(function () { toast('Gagal menyalin. Salin manual: ' + url); });
  });

  /* ---------------- sheet tambahan ---------------- */
  document.querySelectorAll('[data-sheet]').forEach(function (b) {
    b.addEventListener('click', function () {
      var k = b.dataset.sheet;
      if (k === 'howto') openSheet($('sheetHowTo'));
      if (k === 'about') openSheet($('sheetAbout'));
      if (k === 'bank') { renderBank(''); openSheet($('sheetBank')); }
    });
  });
  $('btnHowTo').addEventListener('click', function () { openSheet($('sheetHowTo')); });

  function renderBank(q) {
    var nq = norm(q);
    var list = SONGS.filter(function (s) {
      if (!nq) return true;
      return norm(s.title).indexOf(nq) !== -1 || norm(s.artist).indexOf(nq) !== -1;
    }).slice(0, 60);
    $('bankList').innerHTML = list.map(function (s) {
      return '<button class="bankrow" data-play="' + esc(s.id) + '">' +
        '<span class="t"><b>' + esc(s.title) + '</b><span>' + esc(s.artist) + ' · ' + s.year +
        ' · ' + esc(s.genre) + '</span></span>' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.2v13.6a.7.7 0 0 0 1.07.6l10.2-6.8a.7.7 0 0 0 0-1.2L9.07 4.6A.7.7 0 0 0 8 5.2z"/></svg>' +
        '</button>';
    }).join('') || '<p style="font-size:12px;color:var(--muted)">Tidak ada yang cocok.</p>';
  }

  $('bankSearch').addEventListener('input', function () { renderBank(this.value); });

  $('bankList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-play]');
    if (!b) return;
    var song = SONGS.find(function (s) { return s.id === b.dataset.play; });
    if (!song) return;
    Engine.resume().then(function () { return Engine.load(song); })
      .then(function (rec) {
        Engine.stopAll();
        Engine.playFull(rec);
        toast('Memutar ' + song.title);
      })
      .catch(function () { toast('Gagal memuat lagu ini.'); });
  });

  /* ---------------- start ---------------- */
  applyFilters();
  renderStartGrid();
  renderSettingsUI();
  applyTheme();
  renderLevel();
  Engine.setVolume(settings.volume);
  startSong(true);

  window.SEPOTONG = {
    engine: Engine,
    state: state,
    stages: STAGES,
    tiers: TIERS,
    level: function () { return { current: level.current, best: level.best }; },
    streak: function () { return { current: level.current, best: level.best }; },
    setLevel: function (c, b) {
      level.current = c; level.best = b; store.set('level', level); renderLevel();
    },
    setStreak: function (c, b) {
      level.current = c; level.best = b; store.set('level', level); renderLevel();
    },
    pool: function () { return state.pool; },
    answer: function () { return state.song; },
    settings: function () { return settings; },
    tierOf: tierOf,
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
