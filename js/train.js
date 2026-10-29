/* ============================================================
   XFit — «Тренування»: інтервальний таймер і щоденник.
   Працює повністю на пристрої: налаштування й записи — в localStorage,
   без інтернету сторінку віддає service worker.
   ============================================================ */
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const store = {
    get(key, fallback) {
      try {
        const v = JSON.parse(localStorage.getItem(key));
        return v == null ? fallback : v;
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    },
  };

  const toastEl = $('#trainToast');
  let toastTimer = null;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  /* ---------- Вкладки ---------- */
  const tabs = $$('.train-tab');
  function showTab(name) {
    tabs.forEach((t) => {
      const on = t.dataset.tab === name;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $('#' + t.getAttribute('aria-controls')).hidden = !on;
    });
    if (name === 'log') renderLog();
  }
  tabs.forEach((t) => t.addEventListener('click', () => {
    history.replaceState(null, '', '#' + t.dataset.tab);
    showTab(t.dataset.tab);
  }));
  window.addEventListener('hashchange', () => showTab(location.hash === '#log' ? 'log' : 'timer'));

  /* ============================================================
     ТАЙМЕР
     ============================================================ */
  const SETTINGS_KEY = 'xfit_timer_v1';
  const DEFAULTS = {
    mode: 'tabata',
    tabata: { work: 20, rest: 10, rounds: 8 },
    intervals: { work: 40, rest: 20, rounds: 10 },
    emom: { interval: 60, rounds: 10 },
    rest: { rest: 90 },
    sound: true,
    vibrate: true,
    prep: true,
  };
  const LIMITS = { work: [5, 600], rest: [5, 600], interval: [15, 600], rounds: [1, 99] };
  const PREP_SECONDS = 5;

  const saved = store.get(SETTINGS_KEY, {});
  const cfg = {
    ...DEFAULTS,
    ...saved,
    tabata: { ...DEFAULTS.tabata, ...(saved.tabata || {}) },
    intervals: { ...DEFAULTS.intervals, ...(saved.intervals || {}) },
    emom: { ...DEFAULTS.emom, ...(saved.emom || {}) },
    rest: { ...DEFAULTS.rest, ...(saved.rest || {}) },
  };
  const saveCfg = () => store.set(SETTINGS_KEY, cfg);

  const timerEl = $('#timer');
  const phaseEl = $('#timerPhase');
  const timeEl = $('#timerTime');
  const roundEl = $('#timerRound');
  const totalEl = $('#timerTotal');
  const progressEl = $('#timerProgress');
  const startBtn = $('#timerStart');
  const resetBtn = $('#timerReset');
  const skipBtn = $('#timerSkip');
  const lapsEl = $('#laps');
  const RING = 2 * Math.PI * 116;
  progressEl.style.strokeDasharray = String(RING);

  const fmt = (sec) => {
    const s = Math.max(0, Math.ceil(sec - 1e-6));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };
  const fmtPrecise = (ms) => {
    const t = Math.max(0, ms);
    const m = Math.floor(t / 60000);
    const s = Math.floor((t % 60000) / 1000);
    const cs = Math.floor((t % 1000) / 10);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(cs).padStart(2, '0');
  };
  const fmtSetting = (sec) => (sec >= 60 ? Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0') : sec + ' с');

  const PHASE_NAMES = { prep: 'Приготуйся', work: 'Робота', rest: 'Відпочинок', done: 'Готово!', idle: 'Готовий?' };

  // Послідовність фаз для поточного режиму
  function buildPhases() {
    const m = cfg.mode;
    const phases = [];
    if (cfg.prep && m !== 'rest') phases.push({ type: 'prep', dur: PREP_SECONDS });
    if (m === 'tabata' || m === 'intervals') {
      const c = cfg[m];
      for (let r = 1; r <= c.rounds; r++) {
        phases.push({ type: 'work', dur: c.work, round: r, rounds: c.rounds });
        if (r < c.rounds) phases.push({ type: 'rest', dur: c.rest, round: r, rounds: c.rounds });
      }
    } else if (m === 'emom') {
      for (let r = 1; r <= cfg.emom.rounds; r++) phases.push({ type: 'work', dur: cfg.emom.interval, round: r, rounds: cfg.emom.rounds });
    } else if (m === 'rest') {
      phases.push({ type: 'rest', dur: cfg.rest.rest });
    }
    return phases;
  }

  const t = {
    phases: [],
    idx: 0,
    running: false,
    phaseStart: 0,   // performance.now() початку фази (з поправкою на паузи)
    pausedAt: 0,
    lastBeep: null,
    swStart: 0,      // секундомір
    swElapsed: 0,
    laps: [],
    raf: null,
    interval: null,
  };

  /* ---------- Звук (WebAudio) ---------- */
  let audio = null;
  function ensureAudio() {
    if (!cfg.sound) return;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch (e) { audio = null; }
  }
  function beep(freq, dur, delay = 0, vol = 0.25) {
    if (!cfg.sound || !audio) return;
    const at = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(vol, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }
  const vibrate = (pattern) => { if (cfg.vibrate && navigator.vibrate) navigator.vibrate(pattern); };
  const sounds = {
    tick() { beep(880, 0.12); vibrate(60); },
    work() { beep(1320, 0.45); vibrate([220]); },
    rest() { beep(660, 0.45); vibrate([120, 80, 120]); },
    done() { beep(1320, 0.18); beep(1320, 0.18, 0.25); beep(1760, 0.5, 0.5); vibrate([300, 120, 300, 120, 500]); },
  };

  /* ---------- Екран не гасне, поки таймер іде ---------- */
  let wakeLock = null;
  async function lockScreen() {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch (e) { /* не підтримується або відмовлено — таймер однаково працює */ }
  }
  function unlockScreen() {
    if (wakeLock) wakeLock.release().catch(() => {});
    wakeLock = null;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && t.running) lockScreen();
  });

  /* ---------- Відображення ---------- */
  function setPhase(type) {
    if (timerEl.dataset.phase !== type) {
      timerEl.dataset.phase = type;
      timerEl.classList.remove('is-flash');
      void timerEl.offsetWidth;
      timerEl.classList.add('is-flash');
    }
    phaseEl.textContent = PHASE_NAMES[type];
  }
  function setProgress(frac) {
    progressEl.style.strokeDashoffset = String(RING * (1 - Math.min(1, Math.max(0, frac))));
  }
  function totalRemaining(now) {
    let sum = 0;
    for (let i = t.idx; i < t.phases.length; i++) sum += t.phases[i].dur;
    if (t.phases[t.idx]) sum -= elapsedInPhase(now);
    return sum;
  }
  function elapsedInPhase(now) {
    return ((t.running ? now : t.pausedAt) - t.phaseStart) / 1000;
  }

  function renderIdle() {
    timerEl.classList.remove('is-running');
    lapsEl.hidden = cfg.mode !== 'stopwatch' || !t.laps.length;
    if (cfg.mode === 'stopwatch') {
      setPhase('idle');
      phaseEl.textContent = 'Секундомір';
      timeEl.textContent = fmtPrecise(t.swElapsed);
      roundEl.textContent = t.laps.length ? 'Кіл: ' + t.laps.length : '';
      totalEl.textContent = '';
      setProgress(0);
      skipBtn.setAttribute('aria-label', 'Коло');
      return;
    }
    skipBtn.setAttribute('aria-label', 'Наступна фаза');
    const phases = buildPhases();
    const first = phases.find((p) => p.type !== 'prep') || phases[0];
    setPhase('idle');
    timeEl.textContent = fmt(first ? first.dur : 0);
    if (cfg.mode === 'rest') roundEl.textContent = 'Відпочинок між підходами';
    else roundEl.textContent = (first && first.rounds) + ' ' + plural(first && first.rounds, ['раунд', 'раунди', 'раундів']);
    const total = phases.reduce((s, p) => s + p.dur, 0);
    totalEl.textContent = cfg.mode === 'rest' ? '' : 'Усього: ' + fmt(total);
    setProgress(1);
  }

  function plural(n, forms) {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }

  function renderRunning(now) {
    if (cfg.mode === 'stopwatch') {
      const ms = t.swElapsed + (t.running ? now - t.swStart : 0);
      timeEl.textContent = fmtPrecise(ms);
      setProgress((ms % 60000) / 60000);
      return;
    }
    const p = t.phases[t.idx];
    if (!p) return;
    const el = elapsedInPhase(now);
    const left = p.dur - el;
    setPhase(p.type);
    timeEl.textContent = fmt(left);
    setProgress(left / p.dur);
    roundEl.textContent = p.rounds ? `Раунд ${p.round} / ${p.rounds}` : (p.type === 'prep' ? 'Старт за мить' : '');
    totalEl.textContent = cfg.mode === 'rest' ? '' : 'Залишилось: ' + fmt(totalRemaining(now));
  }

  /* ---------- Двигун ---------- */
  function step() {
    const now = performance.now();
    if (cfg.mode !== 'stopwatch' && t.running) {
      let p = t.phases[t.idx];
      // перехід фаз за реальним часом (не пропускає фази навіть у фоні)
      while (p && elapsedInPhase(now) >= p.dur) {
        t.phaseStart += p.dur * 1000;
        t.idx += 1;
        t.lastBeep = null;
        p = t.phases[t.idx];
        if (!p) return finish();
        if (p.type === 'work') sounds.work();
        else if (p.type === 'rest') sounds.rest();
      }
      if (p) {
        const leftWhole = Math.ceil(p.dur - elapsedInPhase(now));
        if (leftWhole <= 3 && leftWhole >= 1 && t.lastBeep !== leftWhole) {
          t.lastBeep = leftWhole;
          sounds.tick();
        }
      }
    }
    renderRunning(now);
  }
  function loop() {
    step();
    t.raf = t.running ? requestAnimationFrame(loop) : null;
  }

  function start() {
    ensureAudio();
    const now = performance.now();
    if (cfg.mode === 'stopwatch') {
      t.swStart = now;
    } else if (!t.phases.length) {
      t.phases = buildPhases();
      t.idx = 0;
      t.phaseStart = now;
      t.lastBeep = null;
      const first = t.phases[0];
      if (first.type === 'work') sounds.work();
      else if (first.type === 'rest') sounds.rest();
    } else {
      t.phaseStart += now - t.pausedAt; // продовжуємо після паузи
    }
    t.running = true;
    timerEl.classList.add('is-running');
    startBtn.setAttribute('aria-label', 'Пауза');
    lockScreen();
    clearInterval(t.interval);
    t.interval = setInterval(step, 250); // працює й тоді, коли вкладка у фоні
    loop();
  }
  function pause() {
    const now = performance.now();
    if (cfg.mode === 'stopwatch') t.swElapsed += now - t.swStart;
    t.pausedAt = now;
    t.running = false;
    clearInterval(t.interval);
    timerEl.classList.remove('is-running');
    startBtn.setAttribute('aria-label', 'Продовжити');
    unlockScreen();
    renderRunning(now);
  }
  function reset() {
    t.running = false;
    clearInterval(t.interval);
    cancelAnimationFrame(t.raf);
    t.phases = [];
    t.idx = 0;
    t.swElapsed = 0;
    t.laps = [];
    lapsEl.innerHTML = '';
    startBtn.setAttribute('aria-label', 'Старт');
    unlockScreen();
    renderIdle();
  }
  function finish() {
    t.running = false;
    clearInterval(t.interval);
    sounds.done();
    unlockScreen();
    t.phases = [];
    timerEl.classList.remove('is-running');
    setPhase('done');
    timeEl.textContent = '00:00';
    roundEl.textContent = cfg.mode === 'rest' ? 'Час для наступного підходу' : 'Тренування завершено 💪';
    totalEl.textContent = '';
    setProgress(1);
    startBtn.setAttribute('aria-label', 'Старт');
  }
  function skip() {
    if (cfg.mode === 'stopwatch') {
      if (!t.running && !t.swElapsed) return;
      const now = performance.now();
      const total = t.swElapsed + (t.running ? now - t.swStart : 0);
      const prev = t.laps.length ? t.laps[t.laps.length - 1] : 0;
      t.laps.push(total);
      const li = document.createElement('li');
      li.innerHTML = `<span>Коло ${t.laps.length}</span><b>${fmtPrecise(total - prev)}</b>`;
      lapsEl.prepend(li);
      lapsEl.hidden = false;
      return;
    }
    if (!t.phases.length) return;
    if (t.running) {
      // фаза «закінчилась» зараз — двигун сам перейде до наступної
      t.phaseStart = performance.now() - t.phases[t.idx].dur * 1000;
      step();
      return;
    }
    // на паузі: переходимо на початок наступної фази й лишаємось на паузі
    t.idx += 1;
    t.lastBeep = null;
    if (!t.phases[t.idx]) { finish(); return; }
    t.phaseStart = t.pausedAt;
    renderRunning(t.pausedAt);
  }

  startBtn.addEventListener('click', () => (t.running ? pause() : start()));
  resetBtn.addEventListener('click', reset);
  skipBtn.addEventListener('click', skip);

  /* ---------- Налаштування ---------- */
  const settingsEl = $('#settings');
  const FIELDS_BY_MODE = {
    tabata: ['work', 'rest', 'rounds'],
    intervals: ['work', 'rest', 'rounds'],
    emom: ['interval', 'rounds'],
    rest: ['rest', 'restPreset'],
    stopwatch: [],
  };

  function renderSettings() {
    $$('.mode').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === cfg.mode)));
    const fields = FIELDS_BY_MODE[cfg.mode];
    $$('.setting', settingsEl).forEach((row) => {
      const f = row.dataset.field;
      row.hidden = !fields.includes(f);
      const out = $('[data-value]', row);
      if (out && fields.includes(f)) {
        const v = cfg[cfg.mode][f];
        out.textContent = f === 'rounds' ? String(v) : fmtSetting(v);
      }
    });
    const roundsLabel = $('[data-rounds-label]', settingsEl);
    if (roundsLabel) roundsLabel.textContent = cfg.mode === 'emom' ? 'Хвилин / раундів' : 'Раунди';
    $$('.presets button', settingsEl).forEach((b) => b.classList.toggle('is-active', cfg.mode === 'rest' && Number(b.dataset.preset) === cfg.rest.rest));
    $('#optSound').checked = cfg.sound;
    $('#optVibrate').checked = cfg.vibrate;
    $('#optPrep').checked = cfg.prep;
    $('#optPrep').closest('.toggle').hidden = cfg.mode === 'rest' || cfg.mode === 'stopwatch';
    $('#optVibrate').closest('.toggle').hidden = !('vibrate' in navigator);
  }

  $$('.mode').forEach((b) => b.addEventListener('click', () => {
    if (t.running) return;
    cfg.mode = b.dataset.mode;
    saveCfg();
    reset();
    renderSettings();
  }));
  $$('.stepper [data-step]', settingsEl).forEach((btn) => btn.addEventListener('click', () => {
    const f = btn.closest('.setting').dataset.field;
    const [lo, hi] = LIMITS[f];
    const c = cfg[cfg.mode];
    c[f] = Math.min(hi, Math.max(lo, c[f] + Number(btn.dataset.step)));
    saveCfg();
    reset();
    renderSettings();
  }));
  $$('.presets button', settingsEl).forEach((b) => b.addEventListener('click', () => {
    cfg.rest.rest = Number(b.dataset.preset);
    saveCfg();
    reset();
    renderSettings();
  }));
  [['optSound', 'sound'], ['optVibrate', 'vibrate'], ['optPrep', 'prep']].forEach(([id, key]) => {
    $('#' + id).addEventListener('change', (e) => {
      cfg[key] = e.target.checked;
      saveCfg();
      if (key === 'prep') reset();
    });
  });

  /* ============================================================
     ЩОДЕННИК
     ============================================================ */
  const LOG_KEY = 'xfit_log_v1';
  const COMMON_EXERCISES = [
    'Жим лежачи', 'Присідання зі штангою', 'Станова тяга', 'Жим стоячи', 'Підтягування', 'Віджимання на брусах',
    'Тяга штанги в нахилі', 'Тяга верхнього блока', 'Жим ногами', 'Випади', 'Румунська тяга',
    'Згинання рук зі штангою', 'Французький жим', 'Розведення гантелей', 'Жим гантелей сидячи', 'Гіперекстензія',
  ];
  let log = store.get(LOG_KEY, { v: 1, sets: [] });
  if (!log || !Array.isArray(log.sets)) log = { v: 1, sets: [] };
  const saveLog = () => {
    if (!store.set(LOG_KEY, log)) toast('Не вдалося зберегти — пам\'ять браузера переповнена');
  };

  // Просимо браузер не видаляти дані сайту при нестачі місця
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  const todayISO = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  const dayDiff = (iso) => Math.round((new Date(todayISO()) - new Date(iso)) / 86400000);
  const fmtDay = (iso) => {
    const diff = dayDiff(iso);
    if (diff === 0) return 'Сьогодні';
    if (diff === 1) return 'Вчора';
    return new Date(iso + 'T12:00:00').toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'long' });
  };
  const fmtShort = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
  const fmtKg = (n) => (Math.round(n * 10) / 10).toLocaleString('uk-UA');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const form = $('#logForm');
  const exInput = $('#logExercise');
  const dateInput = $('#logDate');
  const weightInput = $('#logWeight');
  const repsInput = $('#logReps');
  dateInput.value = todayISO();
  dateInput.max = todayISO();

  function exercisesByRecency() {
    const seen = new Map();
    [...log.sets].sort((a, b) => b.t - a.t).forEach((s) => { if (!seen.has(s.ex)) seen.set(s.ex, s); });
    return [...seen.keys()];
  }

  function renderDatalist() {
    const mine = exercisesByRecency();
    const all = [...mine, ...COMMON_EXERCISES.filter((e) => !mine.includes(e))];
    $('#exerciseList').innerHTML = all.map((e) => `<option value="${esc(e)}"></option>`).join('');
  }

  // Вибрав вправу — підставляємо вагу й повтори з останнього разу
  exInput.addEventListener('change', () => {
    const name = exInput.value.trim();
    const last = [...log.sets].filter((s) => s.ex.toLowerCase() === name.toLowerCase()).sort((a, b) => b.t - a.t)[0];
    if (last) {
      exInput.value = last.ex;
      weightInput.value = last.w;
      repsInput.value = last.r;
    }
  });

  $$('.stepper--input [data-for]', form).forEach((btn) => btn.addEventListener('click', () => {
    const input = $('#' + btn.dataset.for);
    const min = Number(input.min);
    const max = Number(input.max);
    const v = Math.min(max, Math.max(min, (parseFloat(input.value) || 0) + Number(btn.dataset.step)));
    input.value = String(Math.round(v * 10) / 10);
  }));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const ex = exInput.value.trim().replace(/\s+/g, ' ');
    const w = Math.max(0, parseFloat(String(weightInput.value).replace(',', '.')) || 0);
    const r = Math.max(1, parseInt(repsInput.value, 10) || 0);
    const d = dateInput.value || todayISO();
    if (!ex) { exInput.focus(); return; }
    // одна назва вправи без різниці у великих/малих літерах
    const existing = exercisesByRecency().find((x) => x.toLowerCase() === ex.toLowerCase());
    log.sets.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), d, ex: existing || ex, w, r, t: Date.now() });
    saveLog();
    toast(`Додано: ${existing || ex} — ${fmtKg(w)} кг × ${r}`);
    progressExercise = existing || ex;
    renderLog();
  });

  function deleteSet(id) {
    log.sets = log.sets.filter((s) => s.id !== id);
    saveLog();
    renderLog();
    toast('Підхід видалено');
  }

  /* ---------- Підсумки ---------- */
  function renderStats() {
    const week = log.sets.filter((s) => dayDiff(s.d) < 7);
    const days = new Set(week.map((s) => s.d)).size;
    const tonnage = week.reduce((sum, s) => sum + s.w * s.r, 0);
    $('#logStats').innerHTML = `
      <div class="stat-tile"><b>${days}</b><span>${plural(days, ['тренування', 'тренування', 'тренувань'])} за 7 днів</span></div>
      <div class="stat-tile"><b>${week.length}</b><span>${plural(week.length, ['підхід', 'підходи', 'підходів'])}</span></div>
      <div class="stat-tile"><b>${fmtKg(tonnage)}</b><span>кг піднято</span></div>`;
  }

  /* ---------- Історія ---------- */
  let historyDays = 7;
  function renderHistory() {
    const box = $('#logHistory');
    if (!log.sets.length) {
      box.innerHTML = '<p class="history-empty">Тут з\'являться твої тренування. Додай перший підхід вище.</p>';
      return;
    }
    const byDay = new Map();
    [...log.sets].sort((a, b) => (b.d === a.d ? a.t - b.t : b.d < a.d ? -1 : 1)).forEach((s) => {
      if (!byDay.has(s.d)) byDay.set(s.d, []);
      byDay.get(s.d).push(s);
    });
    const days = [...byDay.keys()];
    box.innerHTML = days.slice(0, historyDays).map((d) => {
      const sets = byDay.get(d);
      const byEx = new Map();
      sets.forEach((s) => { if (!byEx.has(s.ex)) byEx.set(s.ex, []); byEx.get(s.ex).push(s); });
      const tonnage = sets.reduce((sum, s) => sum + s.w * s.r, 0);
      return `<div class="day">
        <div class="day__head"><span class="day__date">${esc(fmtDay(d))}</span><span class="day__meta">${sets.length} ${plural(sets.length, ['підхід', 'підходи', 'підходів'])} · ${fmtKg(tonnage)} кг</span></div>
        ${[...byEx.entries()].map(([ex, list]) => `<div class="ex">
          <div class="ex__name">${esc(ex)}<small>макс ${fmtKg(Math.max(...list.map((s) => s.w)))} кг</small></div>
          <div class="sets">${list.map((s) => `<span class="set-chip">${fmtKg(s.w)} кг × ${s.r}<button type="button" data-del="${s.id}" aria-label="Видалити підхід ${fmtKg(s.w)} кг × ${s.r}">×</button></span>`).join('')}</div>
        </div>`).join('')}
      </div>`;
    }).join('') + (days.length > historyDays ? '<button type="button" class="btn btn--ghost history-more" id="historyMore">Показати ще</button>' : '');
    $$('[data-del]', box).forEach((b) => b.addEventListener('click', () => deleteSet(b.dataset.del)));
    const more = $('#historyMore');
    if (more) more.addEventListener('click', () => { historyDays += 14; renderHistory(); });
  }

  /* ---------- Прогрес: найкраща вага по днях ---------- */
  let progressExercise = null;
  let range = store.get('xfit_log_range', 30);
  const progressSelect = $('#progressExercise');

  function renderProgress() {
    const exercises = exercisesByRecency();
    if (!progressExercise || !exercises.includes(progressExercise)) progressExercise = exercises[0] || null;
    progressSelect.innerHTML = exercises.length
      ? exercises.map((e) => `<option${e === progressExercise ? ' selected' : ''}>${esc(e)}</option>`).join('')
      : '<option>Ще немає вправ</option>';
    progressSelect.disabled = !exercises.length;
    $$('.ranges button').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.range) === range)));

    const chart = $('#progressChart');
    const statsBox = $('#progressStats');
    const sets = log.sets.filter((s) => s.ex === progressExercise && (range === 0 || dayDiff(s.d) < range));
    const byDay = new Map();
    sets.forEach((s) => {
      const cur = byDay.get(s.d) || { best: 0, volume: 0 };
      cur.best = Math.max(cur.best, s.w);
      cur.volume += s.w * s.r;
      byDay.set(s.d, cur);
    });
    const points = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, v]) => ({ d, ...v }));

    if (!progressExercise) {
      chart.innerHTML = '<div class="chart-empty">Додай підходи — тут з\'явиться графік прогресу.</div>';
      statsBox.innerHTML = '';
      return;
    }
    const allTimeBest = Math.max(...log.sets.filter((s) => s.ex === progressExercise).map((s) => s.w));
    const volume = points.reduce((s, p) => s + p.volume, 0);
    const change = points.length > 1 ? points[points.length - 1].best - points[0].best : 0;
    statsBox.innerHTML = `
      <div><b>${fmtKg(allTimeBest)} кг</b><span>рекорд</span></div>
      <div><b>${change > 0 ? '+' : ''}${fmtKg(change)} кг</b><span>за період</span></div>
      <div><b>${fmtKg(volume)}</b><span>кг об'єм</span></div>`;

    if (points.length < 2) {
      chart.innerHTML = `<div class="chart-empty">${points.length ? 'Ще одне тренування з цією вправою — і з\'явиться графік.' : 'За цей період немає записів цієї вправи.'}</div>`;
      return;
    }
    drawLine(chart, points);
  }

  function niceStep(span) {
    const raw = span / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const n = raw / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }

  function drawLine(box, points) {
    const W = Math.max(280, box.clientWidth || 600);
    const H = 220;
    const pad = { l: 40, r: 14, t: 14, b: 26 };
    const vals = points.map((p) => p.best);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (hi === lo) { lo -= 5; hi += 5; }
    const stepY = niceStep(hi - lo);
    lo = Math.max(0, Math.floor(lo / stepY) * stepY);
    hi = Math.ceil(hi / stepY) * stepY;
    const t0 = new Date(points[0].d).getTime();
    const t1 = new Date(points[points.length - 1].d).getTime();
    const x = (d) => pad.l + ((new Date(d).getTime() - t0) / (t1 - t0 || 1)) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);

    const ticks = [];
    for (let v = lo; v <= hi + 1e-9; v += stepY) ticks.push(v);
    const xLabels = [points[0], points[Math.floor((points.length - 1) / 2)], points[points.length - 1]]
      .filter((p, i, arr) => arr.findIndex((q) => q.d === p.d) === i);
    const path = points.map((p, i) => (i ? 'L' : 'M') + x(p.d).toFixed(1) + ' ' + y(p.best).toFixed(1)).join(' ');
    const area = path + ` L ${x(points[points.length - 1].d).toFixed(1)} ${H - pad.b} L ${x(points[0].d).toFixed(1)} ${H - pad.b} Z`;

    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Найкраща вага по днях: ${esc(progressExercise)}">
      <defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22b04a" stop-opacity=".28"/><stop offset="1" stop-color="#22b04a" stop-opacity="0"/></linearGradient></defs>
      <g class="grid">${ticks.map((v) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/>`).join('')}</g>
      <g class="axis">${ticks.map((v) => `<text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${fmtKg(v)}</text>`).join('')}
        ${xLabels.map((p, i) => `<text x="${x(p.d)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'}">${esc(fmtShort(p.d))}</text>`).join('')}</g>
      <path class="area" d="${area}"/>
      <path class="line" d="${path}"/>
      <line class="cross" id="chartCross" y1="${pad.t}" y2="${H - pad.b}" visibility="hidden"/>
      ${points.map((p, i) => `<circle class="dot${i === points.length - 1 ? ' dot--last' : ''}" cx="${x(p.d)}" cy="${y(p.best)}" r="${i === points.length - 1 ? 5 : 4}"/>`).join('')}
      <rect class="hit" x="${pad.l}" y="0" width="${W - pad.l - pad.r}" height="${H}"/>
    </svg><div class="chart-tip" id="chartTip" hidden></div>`;

    // Підказка: найближча точка до пальця / курсора
    const svg = $('svg', box);
    const tip = $('#chartTip', box);
    const cross = $('#chartCross', box);
    const show = (clientX) => {
      const rect = svg.getBoundingClientRect();
      const sx = ((clientX - rect.left) / rect.width) * W;
      let best = points[0];
      points.forEach((p) => { if (Math.abs(x(p.d) - sx) < Math.abs(x(best.d) - sx)) best = p; });
      const px = x(best.d);
      cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
      tip.hidden = false;
      tip.innerHTML = `${fmtKg(best.best)} кг<span>${esc(fmtShort(best.d))} · об'єм ${fmtKg(best.volume)} кг</span>`;
      tip.style.left = Math.min(Math.max((px / W) * rect.width, 60), rect.width - 60) + 'px';
      tip.style.top = (y(best.best) / H) * rect.height + 'px';
    };
    const hide = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); };
    svg.addEventListener('pointermove', (e) => show(e.clientX));
    svg.addEventListener('pointerdown', (e) => show(e.clientX));
    svg.addEventListener('pointerleave', hide);
  }

  progressSelect.addEventListener('change', () => { progressExercise = progressSelect.value; renderProgress(); });
  $$('.ranges button').forEach((b) => b.addEventListener('click', () => {
    range = Number(b.dataset.range);
    store.set('xfit_log_range', range);
    renderProgress();
  }));
  let chartResize = null;
  window.addEventListener('resize', () => {
    clearTimeout(chartResize);
    chartResize = setTimeout(() => { if (!$('#panelLog').hidden) renderProgress(); }, 200);
  });

  /* ---------- Резервна копія ---------- */
  const note = $('#backupNote');
  $('#logExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(log, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `xfit-shchodennyk-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    note.textContent = `Копію збережено (${log.sets.length} ${plural(log.sets.length, ['підхід', 'підходи', 'підходів'])}).`;
  });
  $('#logImport').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.sets)) throw new Error('bad');
      const valid = data.sets.filter((s) => s && typeof s.ex === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.d) && isFinite(s.w) && isFinite(s.r));
      const ids = new Set(log.sets.map((s) => s.id));
      const added = valid.filter((s) => !ids.has(s.id)).map((s) => ({ id: String(s.id || Math.random().toString(36).slice(2)), d: s.d, ex: s.ex.slice(0, 60), w: Number(s.w), r: Number(s.r), t: Number(s.t) || Date.parse(s.d) }));
      log.sets.push(...added);
      saveLog();
      renderLog();
      note.textContent = added.length ? `Відновлено ${added.length} ${plural(added.length, ['підхід', 'підходи', 'підходів'])}.` : 'Усі записи з цього файлу вже є.';
    } catch (err) {
      note.textContent = 'Це не схоже на файл копії щоденника XFit.';
    }
  });

  function renderLog() {
    renderStats();
    renderDatalist();
    renderProgress();
    renderHistory();
  }

  /* ---------- Старт ---------- */
  renderSettings();
  renderIdle();
  showTab(location.hash === '#log' ? 'log' : 'timer');

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {}));
  }
})();
