(function () {
  "use strict";

  const STEPS = [
    { sec: 0.1, label: "0,1", pts: 100 },
    { sec: 0.5, label: "0,5", pts: 75 },
    { sec: 2, label: "2", pts: 50 },
    { sec: 8, label: "8", pts: 30 },
    { sec: 15, label: "15", pts: 15 }
  ];

  const ERAS = [
    { id: "all", label: "Semua" },
    { id: 1990, label: "90-an" },
    { id: 2000, label: "00-an" },
    { id: 2010, label: "10-an" },
    { id: 2020, label: "20-an" }
  ];

  const GENRES = [
    { id: "all", label: "Semua" },
    { id: "pop", label: "Pop" },
    { id: "rock", label: "Rock" },
    { id: "folk", label: "Folk" },
    { id: "dangdut", label: "Dangdut" }
  ];

  const ROUNDS = 10;
  const BEST_KEY = "sepotong.best.v1";

  const $ = (sel) => document.querySelector(sel);

  const el = {
    start: $("#screen-start"),
    play: $("#screen-play"),
    end: $("#screen-end"),
    pillsEra: $("#pills-era"),
    pillsGenre: $("#pills-genre"),
    pool: $("#poolcount"),
    startBtn: $("#btn-start"),
    dots: $("#dots"),
    roundLabel: $("#round-label"),
    score: $("#score"),
    demoBtn: $("#btn-demo"),
    demoDisc: $("#demo-disc"),
    statYears: $("#stat-years"),
    disc: $("#disc"),
    discNum: $("#disc-num"),
    playBtn: $("#btn-play"),
    wave: $("#wave"),
    ladder: $("#ladder"),
    ladderNote: $("#ladder-note"),
    streak: $("#streak"),
    options: $("#options"),
    reveal: $("#reveal"),
    revealArt: $("#reveal-art"),
    revealVerdict: $("#reveal-verdict"),
    revealTitle: $("#reveal-title"),
    revealMeta: $("#reveal-meta"),
    revealPoints: $("#reveal-points"),
    revealLen: $("#reveal-len"),
    previewBtn: $("#btn-preview"),
    nextBtn: $("#btn-next"),
    endScore: $("#end-score"),
    endLine: $("#end-line"),
    endCorrect: $("#end-correct"),
    endStreak: $("#end-streak"),
    endAvg: $("#end-avg"),
    endBest: $("#end-best"),
    endKicker: $("#end-kicker"),
    again: $("#btn-again"),
    settings: $("#btn-settings"),
    how: $("#how"),
    howBtn: $("#btn-how")
  };

  const audio = new Audio();
  audio.preload = "auto";
  audio.id = "player";
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(audio));

  const demo = new Audio();
  demo.preload = "auto";
  let demoBusy = false;

  const state = {
    era: "all",
    genre: "all",
    pool: [],
    queue: [],
    rounds: ROUNDS,
    i: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
    correct: 0,
    step: 0,
    offset: 8,
    options: [],
    song: null,
    answered: false,
    burst: null,
    mode: null,
    refreshing: false
  };

  const norm = (s) =>
    (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const rnd = (min, max) => min + Math.random() * (max - min);

  function inEra(song) {
    return state.era === "all" || (song.year >= state.era && song.year < state.era + 10);
  }

  function buildPool() {
    return (window.SONGS || []).filter(
      (s) => inEra(s) && (state.genre === "all" || s.genre === state.genre)
    );
  }

  function fmtDur(sec) {
    return String(sec).replace(".", ",");
  }

  /* ---------------- setup ---------------- */

  function renderPills() {
    el.pillsEra.innerHTML = "";
    ERAS.forEach((era) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pill";
      b.textContent = era.label;
      b.dataset.id = era.id;
      b.setAttribute("aria-pressed", String(state.era === era.id));
      b.addEventListener("click", () => {
        state.era = era.id;
        renderPills();
        refreshPool();
      });
      el.pillsEra.appendChild(b);
    });

    el.pillsGenre.innerHTML = "";
    GENRES.forEach((g) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pill";
      b.textContent = g.label;
      b.dataset.id = g.id;
      b.setAttribute("aria-pressed", String(state.genre === g.id));
      b.addEventListener("click", () => {
        state.genre = g.id;
        renderPills();
        refreshPool();
      });
      el.pillsGenre.appendChild(b);
    });
  }

  function refreshPool() {
    const pool = buildPool();
    const rounds = Math.min(ROUNDS, pool.length);
    el.startBtn.innerHTML =
      'Mulai <span class="btn-sep">·</span> ' + rounds + " soal";
    el.startBtn.disabled = pool.length < 4;
    el.pool.textContent =
      pool.length < 4
        ? "kombinasi ini kosong — coba filter lain"
        : pool.length + " lagu di bank";
  }

  function initStats() {
    const songs = window.SONGS || [];
    if (!songs.length) return;
    const years = songs.map((s) => s.year).filter((y) => y > 1900);
    el.statYears.textContent = Math.min.apply(null, years) + "–" + Math.max.apply(null, years);
  }

  function playDemo() {
    if (demoBusy) return;
    const pool = window.SONGS || [];
    if (!pool.length) return;
    const song = pool[Math.floor(Math.random() * pool.length)];
    demoBusy = true;
    el.demoBtn.textContent = "Memutar…";
    el.demoDisc.classList.add("spin");

    const done = () => {
      demoBusy = false;
      el.demoBtn.textContent = "Dengar lagi";
      el.demoDisc.classList.remove("spin");
    };

    demo.oncanplay = () => {
      demo.oncanplay = null;
      const dur = demo.duration || 30;
      const start = Math.max(0, Math.min(rnd(3, 13), dur - 0.35));
      try {
        demo.currentTime = start;
      } catch (e) {}
      demo.play().catch(done);
      setTimeout(done, 180);
    };
    demo.onerror = done;
    demo.src = song.preview;
    demo.load();
  }

  function buildWave(seed) {
    el.wave.innerHTML = "";
    let x = seed * 9301 + 49297;
    const next = () => {
      x = (x * 9301 + 49297) % 233280;
      return x / 233280;
    };
    const n = 44;
    for (let i = 0; i < n; i++) {
      const bar = document.createElement("i");
      const mid = 1 - Math.abs(i - n / 2) / (n / 2);
      const h = 8 + mid * 26 * (0.35 + next() * 0.9);
      bar.style.setProperty("--h", Math.round(Math.min(h, 42)) + "px");
      bar.style.setProperty("--d", (i * 18) + "ms");
      el.wave.appendChild(bar);
    }
  }

  /* ---------------- round ---------------- */

  function startGame() {
    state.pool = buildPool();
    state.rounds = Math.min(ROUNDS, state.pool.length);
    state.queue = shuffle(state.pool).slice(0, state.rounds);
    state.i = 0;
    state.score = 0;
    state.streak = 0;
    state.bestStreak = 0;
    state.correct = 0;

    el.start.hidden = true;
    el.end.hidden = true;
    el.play.hidden = false;
    el.dots.innerHTML = "";
    for (let i = 0; i < state.rounds; i++) {
      const d = document.createElement("span");
      d.className = "dot";
      el.dots.appendChild(d);
    }
    renderRound();
  }

  function renderRound() {
    const song = state.queue[state.i];
    state.song = song;
    state.step = 0;
    state.answered = false;
    state.options = buildOptions(song);
    state.offset = rnd(3, 13);

    el.score.textContent = state.score;
    el.discNum.textContent = String(state.i + 1);
    el.roundLabel.textContent = "Soal " + (state.i + 1) + "/" + state.rounds;
    el.streak.textContent = state.streak > 1 ? state.streak + " benar beruntun" : "";
    el.streak.classList.toggle("on", state.streak > 1);
    el.ladderNote.textContent = "0,1 detik";
    el.reveal.hidden = true;
    el.options.hidden = false;
    el.options.classList.remove("answered");
    el.playBtn.classList.remove("playing");
    el.disc.classList.remove("spin");
    el.wave.classList.remove("live");
    el.previewBtn.textContent = "Putar 30 detik";

    buildWave(state.i + 3);
    renderLadder();
    renderOptions();

    audio.src = song.preview;
    audio.load();
    armAutoPlay();
    if (window.matchMedia("(max-width: 820px)").matches && state.i > 0) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function renderLadder() {
    el.ladder.innerHTML = "";
    STEPS.forEach((st, idx) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "step";
      if (idx < state.step) b.classList.add("done");
      if (idx === state.step) b.classList.add("at");
      if (idx > state.step) b.classList.add("locked");
      if (state.answered) b.disabled = true;
      b.innerHTML =
        '<span class="t">' + st.label + 's</span>' +
        '<span class="p">' + st.pts + " poin</span>";
      b.setAttribute("aria-label", "Buka potongan " + st.label + " detik, " + st.pts + " poin");
      b.addEventListener("click", () => {
        if (state.answered || idx === state.step) {
          if (!state.answered) replay();
          return;
        }
        state.step = idx;
        el.ladderNote.textContent = st.label + " detik";
        renderLadder();
        playBurst(st.sec);
      });
      el.ladder.appendChild(b);
    });
  }

  function renderOptions() {
    el.options.innerHTML = "";
    state.options.forEach((opt, idx) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "opt";
      b.dataset.id = opt.id;
      b.innerHTML =
        '<span class="idx">' + (idx + 1) + "</span>" +
        '<span class="txt"><span class="t">' + escapeHtml(opt.title) + "</span>" +
        '<span class="a">' + escapeHtml(opt.artist) + "</span></span>";
      b.addEventListener("click", () => answer(opt.id));
      el.options.appendChild(b);
    });
  }

  function buildOptions(song) {
    const seen = new Set([norm(song.title) + "|" + norm(song.artist)]);
    const same = state.pool.filter(
      (s) => s.id !== song.id && !seen.has(norm(s.title) + "|" + norm(s.artist))
    );
    const others = (window.SONGS || []).filter(
      (s) => s.id !== song.id && !seen.has(norm(s.title) + "|" + norm(s.artist))
    );
    const pick = [];
    const tryAdd = (list) => {
      for (const cand of shuffle(list)) {
        if (pick.length >= 3) return;
        if (cand.id === song.id) continue;
        if (pick.some((p) => norm(p.title) === norm(cand.title))) continue;
        pick.push(cand);
      }
    };
    tryAdd(same);
    tryAdd(others);
    return shuffle([song, ...pick.slice(0, 3)]);
  }

  /* ---------------- audio ---------------- */

  function armAutoPlay() {
    const go = () => {
      audio.removeEventListener("loadedmetadata", go);
      playBurst(STEPS[state.step].sec);
    };
    if (audio.readyState >= 1) {
      go();
    } else {
      audio.addEventListener("loadedmetadata", go);
    }
  }

  function stopBurst() {
    if (state.burst) {
      cancelAnimationFrame(state.burst.raf);
      state.burst = null;
    }
    if (state.mode === "burst") {
      audio.pause();
      state.mode = null;
    }
    el.playBtn.classList.remove("playing");
    el.disc.classList.remove("spin");
    el.wave.classList.remove("live");
  }

  function playBurst(sec) {
    if (!audio.src) return;
    stopBurst();
    const dur = audio.duration || 30;
    const start = Math.max(0, Math.min(state.offset, dur - sec - 0.25));
    try {
      audio.currentTime = start;
    } catch (e) {
      /* metadata belum siap */
    }
    state.mode = "burst";
    el.playBtn.classList.add("playing");
    el.disc.classList.add("spin");
    el.wave.classList.add("live");

    const token = { raf: 0 };
    state.burst = token;
    const t0 = performance.now();
    const tick = () => {
      if (state.burst !== token) return;
      if (performance.now() - t0 >= sec * 1000) {
        stopBurst();
        return;
      }
      token.raf = requestAnimationFrame(tick);
    };
    const p = audio.play();
    if (p && p.catch) p.catch(() => stopBurst());
    token.raf = requestAnimationFrame(tick);
  }

  function replay() {
    if (state.answered) return;
    playBurst(STEPS[state.step].sec);
  }

  function toggleFullPreview() {
    if (state.mode === "full") {
      audio.pause();
      state.mode = null;
      el.previewBtn.textContent = "Putar 30 detik";
      el.playBtn.classList.remove("playing");
      el.disc.classList.remove("spin");
      el.wave.classList.remove("live");
      return;
    }
    stopBurst();
    state.mode = "full";
    try {
      audio.currentTime = 0;
    } catch (e) {}
    audio.play().catch(() => {});
    el.previewBtn.textContent = "Jeda";
    el.playBtn.classList.add("playing");
    el.disc.classList.add("spin");
    el.wave.classList.add("live");
  }

  audio.addEventListener("ended", () => {
    state.mode = null;
    el.previewBtn.textContent = "Putar 30 detik";
    el.playBtn.classList.remove("playing");
    el.disc.classList.remove("spin");
    el.wave.classList.remove("live");
  });

  audio.addEventListener("error", () => {
    if (state.refreshing) return;
    state.refreshing = true;
    el.ladderNote.textContent = "audio diambil ulang…";
    refreshPreview(state.song).then((ok) => {
      state.refreshing = false;
      if (ok) {
        el.ladderNote.textContent = STEPS[state.step].label + " detik";
        armAutoPlay();
      } else {
        el.ladderNote.textContent = "audio gagal dimuat";
      }
    });
  });

  function refreshPreview(song) {
    const q = encodeURIComponent(song.artist + " " + song.title);
    const url =
      "https://itunes.apple.com/search?term=" + q + "&entity=song&limit=8&country=ID";
    return fetch(url)
      .then((r) => r.json())
      .then((data) => {
        const hit = (data.results || []).find(
          (x) => x.previewUrl && norm(x.trackName).indexOf(norm(song.title).slice(0, 12)) === 0
        );
        const alt = hit || (data.results || []).find((x) => x.previewUrl);
        if (!alt) return false;
        song.preview = alt.previewUrl;
        audio.src = alt.previewUrl;
        audio.load();
        return true;
      })
      .catch(() => false);
  }

  /* ---------------- answer ---------------- */

  function answer(id) {
    if (state.answered) return;
    stopBurst();
    state.answered = true;
    state.mode = null;
    el.previewBtn.textContent = "Putar 30 detik";

    const song = state.song;
    const right = id === song.id;
    const pts = right ? STEPS[state.step].pts : 0;

    if (right) {
      state.score += pts;
      state.correct += 1;
      state.streak += 1;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
    } else {
      state.streak = 0;
    }

    el.options.classList.add("answered");
    Array.from(el.options.children).forEach((btn) => {
      const bid = Number(btn.dataset.id);
      btn.disabled = true;
      if (bid === song.id) btn.classList.add("correct");
      else if (bid === id) btn.classList.add("wrong");
      else btn.classList.add("dim");
    });

    const dot = el.dots.children[state.i];
    if (dot) dot.className = "dot " + (right ? "ok" : "no");

    el.score.textContent = state.score;
    el.streak.textContent =
      state.streak > 1 ? state.streak + " benar beruntun" : "";
    el.streak.classList.toggle("on", state.streak > 1);

    el.revealVerdict.textContent = right ? "Benar" : "Salah";
    el.revealVerdict.classList.toggle("no", !right);
    el.revealTitle.textContent = song.title;
    const metaBits = [song.artist, String(song.year)];
    if (song.album && norm(song.album) !== norm(song.artist) && norm(song.album) !== norm(song.title)) {
      metaBits.push(song.album);
    }
    el.revealMeta.textContent = metaBits.join(" · ");
    el.revealPoints.textContent = right ? "+" + pts : "0";
    el.revealPoints.style.color = right ? "var(--amber)" : "var(--dim)";
    el.revealLen.textContent = "dari " + STEPS[state.step].label + " detik";
    el.revealArt.src = song.art || "";
    el.revealArt.alt = "Sampul " + song.title;
    el.reveal.hidden = false;
    el.nextBtn.focus({ preventScroll: true });
    el.nextBtn.textContent =
      state.i + 1 >= state.rounds ? "Lihat hasil →" : "Lanjut →";
    if (window.matchMedia("(max-width: 820px)").matches) {
      el.reveal.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function next() {
    if (!state.answered) return;
    state.i += 1;
    if (state.i >= state.rounds) {
      finish();
      return;
    }
    renderRound();
  }

  function finish() {
    stopBurst();
    audio.pause();
    el.play.hidden = true;
    el.end.hidden = false;

    const best = loadBest();
    const key = state.era + "|" + state.genre;
    const prevBest = best[key] || 0;
    const record = Math.max(prevBest, state.score);
    if (state.score > prevBest) {
      best[key] = state.score;
      saveBest(best);
    }

    el.endScore.textContent = state.score;
    el.endCorrect.textContent = state.correct + "/" + state.rounds;
    el.endStreak.textContent = state.bestStreak;
    el.endAvg.textContent = Math.round(state.score / state.rounds);
    el.endBest.textContent = record;
    el.endKicker.textContent =
      state.score > prevBest ? "Rekor baru" : "Sesi selesai";

    const pct = state.score / (state.rounds * 100);
    let line;
    if (pct >= 0.9) line = "Kuping lu kamus lagu Indonesia. Jawab dari 0,1 detik terus.";
    else if (pct >= 0.7) line = "Solid. Cuma beberapa yang kelewat.";
    else if (pct >= 0.45) line = "Lumayan. Sebagian besar kebantu buka potongan.";
    else if (pct >= 0.2) line = "Masih goyang. Coba filter era yang lu hafal dulu.";
    else line = "Berat, ya. Coba mulai dari 20-an atau 00-an, terus naikin.";
    el.endLine.textContent = line;
  }

  function loadBest() {
    try {
      return JSON.parse(localStorage.getItem(BEST_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveBest(obj) {
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(obj));
    } catch (e) {}
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }

  /* ---------------- wiring ---------------- */

  el.startBtn.addEventListener("click", startGame);
  el.demoBtn.addEventListener("click", playDemo);
  el.playBtn.addEventListener("click", () => {
    if (state.answered) return;
    replay();
  });
  el.nextBtn.addEventListener("click", next);
  el.previewBtn.addEventListener("click", toggleFullPreview);
  el.again.addEventListener("click", startGame);
  el.settings.addEventListener("click", () => {
    el.end.hidden = true;
    el.start.hidden = false;
    refreshPool();
  });
  el.howBtn.addEventListener("click", () => el.how.showModal());

  document.addEventListener("keydown", (e) => {
    if (el.how.open) return;
    if (!el.play.hidden) {
      if (e.key >= "1" && e.key <= "4" && !state.answered) {
        const idx = Number(e.key) - 1;
        if (state.options[idx]) answer(state.options[idx].id);
      } else if (e.code === "Space") {
        e.preventDefault();
        replay();
      } else if (e.key === "Enter" && state.answered) {
        e.preventDefault();
        next();
      }
    } else if (e.key === "Enter" && !el.start.hidden) {
      startGame();
    }
  });

  renderPills();
  refreshPool();
  initStats();
  el.startBtn.focus({ preventScroll: true });
})();
