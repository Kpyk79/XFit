/* ============================================================
   XFit — «Командний центр» адміністратора.
   Відкривається після входу в адмін-режим поверх сайту:
   Огляд · Клієнти · Заявки · Сайт · Оголошення · Налаштування,
   швидкий пошук Ctrl+K (або «/»), бічна панель на ПК / лист знизу на телефоні.
   Дані: window.XFitAdmin (js/admin.js) і window.XFitMembers (js/admin-members.js).
   ============================================================ */
(function () {
  const A = () => window.XFitAdmin || {};
  const M = () => window.XFitMembers;
  const C = () => window.XFitCard;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const desktop = () => matchMedia('(min-width: 861px)').matches;
  const store = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  };

  const IC = {
    home: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3.5 7l8.5 6 8.5-6"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    mega: '<path d="M3 11v2a2 2 0 0 0 2 2h1l4 4V5L6 9H5a2 2 0 0 0-2 2z"/><path d="M15 8a5 5 0 0 1 0 8M18 5a9 9 0 0 1 0 14"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 9v6M11 9v6M13.5 9v6M16 9v6"/>',
    card: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 9.5h19M6 15h4"/>',
    bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
    phone: '<path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    out: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10"/>',
    site: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
    share: '<path d="M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1"/>',
    msg: '<path d="M4 5h16v11H8l-4 4z"/>',
    img: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 9"/>',
  };
  const ic = (n) => `<svg class="xi" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;
  const LOGO = '<svg class="xc-logo" viewBox="314 60 792 435" role="img" aria-label="XFit"><use href="#xfMark" fill="#39ff6a"/><use href="#xfWord" fill="#f2f5f2"/></svg>';
  const COLORS = ['linear-gradient(140deg,#9ef0b4,#39ff6a)', 'linear-gradient(140deg,#c9d2ff,#7a8cff)', 'linear-gradient(140deg,#ffd9a0,#ffb020)', 'linear-gradient(140deg,#ffc2d1,#ff6b9a)', 'linear-gradient(140deg,#b8f1ff,#3ec8ff)'];
  const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const initials = (n) => String(n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const avatar = (key, name) => `<div class="xc-av" style="background:${COLORS[hash(key) % COLORS.length]}">${esc(initials(name))}</div>`;
  function plural(n, f) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return f[2];
    if (b > 1 && b < 5) return f[1];
    if (b === 1) return f[0];
    return f[2];
  }
  const fmtD = (iso) => (iso ? new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: iso.slice(0, 4) === String(new Date().getFullYear()) ? undefined : 'numeric' }) : '—');
  function ago(iso) {
    const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 6e4));
    if (min < 2) return 'щойно';
    if (min < 60) return min + ' хв';
    const h = Math.round(min / 60);
    if (h < 24) return h + ' год';
    const d = Math.round(h / 24);
    return d < 30 ? d + ' дн' : fmtD(iso);
  }

  /* ---------- Стан ---------- */
  let built = false;
  let current = store.get('xc_section') || 'overview';
  let loaded = false;
  let loadError = '';
  let leads = [];
  let leadsError = '';
  const filter = { clients: 'all' };
  const query = { clients: '' };
  const pendingLeadDeletes = new Map();
  const HANDLED_KEY = 'xfit_leads_handled_v1';
  const localHandled = () => { try { return new Set(JSON.parse(localStorage.getItem(HANDLED_KEY) || '[]')); } catch (e) { return new Set(); } };
  const members = () => (M() ? M().list() : []);
  const stateOf = (m) => C().stateOf(m);
  const isHandled = (l) => !!l.handled_at || localHandled().has(l.id);
  const visibleLeads = () => leads.filter((l) => !pendingLeadDeletes.has(l.id));

  const SECTIONS = [['overview', 'Огляд', 'home'], ['clients', 'Клієнти', 'users', 'pending'], ['leads', 'Заявки', 'mail', 'newLeads'], ['site', 'Сайт', 'globe'], ['news', 'Оголошення', 'mega'], ['prefs', 'Налаштування', 'gear']];
  const counts = () => {
    const ms = members();
    return {
      newLeads: visibleLeads().filter((l) => !isHandled(l)).length,
      pending: ms.filter((m) => stateOf(m).state === 'pending').length,
      active: ms.filter((m) => ['active', 'soon'].includes(stateOf(m).state)).length,
      soon: ms.filter((m) => stateOf(m).state === 'soon').length,
    };
  };

  /* ---------- Розмітка ---------- */
  function build() {
    if (built) return;
    built = true;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="xc" id="xc" hidden>
        <aside class="xc-side" aria-label="Розділи адмінки">
          <div class="xc-brand">${LOGO}<span>ADMIN</span></div>
          <nav id="xcSideNav"></nav>
          <div class="xc-side-foot">
            <button type="button" class="xc-btn xc-btn--sm xc-btn--ghost" data-act="search">${ic('search')}Пошук<span class="xc-kbd" style="margin-left:auto">Ctrl K</span></button>
            <button type="button" class="xc-btn xc-btn--sm xc-btn--ghost" data-act="toSite">${ic('site')}Перейти на сайт</button>
            <button type="button" class="xc-btn xc-btn--sm xc-btn--ghost xc-mut" data-act="logout">${ic('out')}Вийти</button>
          </div>
        </aside>
        <main class="xc-main" id="xcMain">
          <div class="xc-mtop">${LOGO}
            <button type="button" class="xc-btn xc-btn--sm xc-btn--icon" data-act="search" aria-label="Пошук">${ic('search')}</button>
            <button type="button" class="xc-btn xc-btn--sm" data-act="toSite" aria-label="Перейти на сайт">${ic('site')}Сайт</button>
          </div>
          <div class="xc-page"><div id="xcView"></div></div>
        </main>
      </div>
      <nav class="xc-tabbar xc-layer" id="xcTabbar" aria-label="Розділи" hidden></nav>
      <div class="xc-scrim xc-layer" id="xcScrim" hidden></div>
      <section class="xc-drawer xc-layer" id="xcDrawer" hidden role="dialog" aria-modal="true" aria-labelledby="xcDTitle">
        <div class="xc-dh"><div class="xc-handle" id="xcHandle"><span></span></div><div style="flex:1;min-width:0" id="xcDHead"></div><button type="button" class="xc-btn xc-btn--sm xc-btn--icon" data-act="close" aria-label="Закрити">${ic('close')}</button></div>
        <div class="xc-db" id="xcDBody"></div>
        <div class="xc-df" id="xcDFoot"></div>
      </section>
      <section class="xc-pal xc-layer" id="xcPal" hidden role="dialog" aria-modal="true" aria-label="Пошук">
        <label class="xc-search">${ic('search')}<input id="xcPalInput" type="search" placeholder="Знайти клієнта, заявку або дію…" autocomplete="off" enterkeyhint="go"><span class="xc-kbd">Esc</span></label>
        <div class="xc-res" id="xcPalRes"></div>
        <div class="xc-pal-foot"><span><span class="xc-kbd">↑↓</span> вибір</span><span><span class="xc-kbd">↵</span> відкрити</span><span style="margin-left:auto">Ctrl K — з будь-якого місця</span></div>
      </section>
      <div class="xc-fab xc-layer" id="xcFab" hidden></div>
      <div class="xc-toasts xc-layer" id="xcToasts" aria-live="polite"></div>`);
    bindGlobal();
  }

  /* ---------- Відкрити / закрити ---------- */
  const root = () => $('#xc');
  let opened = false;
  const isOpen = () => built && opened;
  function open(section) {
    build();
    if (section) current = section;
    const r = root();
    opened = true;
    r.hidden = false;
    $('#xcTabbar').hidden = false;
    document.documentElement.classList.add('no-scroll');
    document.body.classList.add('xc-open');
    requestAnimationFrame(() => r.classList.add('is-on'));
    store.set('xc_closed', '');
    renderFab();
    go(current, !loaded);
    if (!loaded) loadAll();
    else refreshLeads();
  }
  function close() {
    if (!built) return;
    closePal(); closeDrawer();
    opened = false;
    const r = root();
    r.classList.remove('is-on');
    $('#xcTabbar').hidden = true;
    document.body.classList.remove('xc-open');
    document.documentElement.classList.remove('no-scroll');
    setTimeout(() => { if (!opened) r.hidden = true; }, 300);
    store.set('xc_closed', '1');
    renderFab();
  }

  /* ---------- Дані ---------- */
  let loadingP = null;
  function loadAll() { if (!loadingP) loadingP = doLoad().finally(() => { loadingP = null; }); return loadingP; }
  async function doLoad() {
    loadError = '';
    try {
      await M().loadLibs();
      await Promise.all([M().load(), loadLeads()]);
      loaded = true;
    } catch (err) {
      loadError = err.message || 'Не вдалося завантажити дані';
    }
    renderNav();
    render();
  }
  async function loadLeads() {
    const { sb, isRemote } = A();
    leadsError = '';
    if (!isRemote) { leads = []; leadsError = 'Заявки з сайту доступні, коли сайт підключено до бази даних.'; return; }
    const { data, error } = await sb.from('leads').select('*').order('created_at', { ascending: false });
    if (error) { leadsError = 'Не вдалося завантажити заявки. Перевір інтернет і спробуй ще раз.'; return; }
    leads = data || [];
  }
  let refreshing = false;
  async function refreshLeads() {
    if (refreshing || !loaded) return;
    refreshing = true;
    const before = new Set(leads.map((l) => l.id));
    const was = counts().newLeads;
    try { await loadLeads(); } catch (e) { /* ignore */ }
    refreshing = false;
    const fresh = leads.filter((l) => !before.has(l.id));
    renderNav();
    if (fresh.length) {
      if (['overview', 'leads'].includes(current) && !$('#xcDrawer').classList.contains('is-on')) {
        render();
        fresh.forEach((l) => { const r = $(`#xcView [data-lead="${CSS.escape(l.id)}"]`); if (r) r.classList.add('is-new'); });
      }
      if (counts().newLeads > was) bump('newLeads');
      toast(fresh.length === 1 ? `Нова заявка: ${fresh[0].name || 'без імені'}` : `Нових заявок: ${fresh.length}`);
    }
  }

  /* ---------- Навігація ---------- */
  function renderNav() {
    if (!built) return;
    const c = counts();
    const badge = (k) => (k && c[k] ? `<span class="xc-cnt xc-num" data-cnt="${k}">${c[k]}</span>` : '');
    $('#xcSideNav').innerHTML = SECTIONS.map(([id, t, i, k]) => `<button type="button" class="xc-nav" data-go="${id}" ${id === current ? 'aria-current="page"' : ''}>${ic(i)}${t}${badge(k)}</button>`).join('');
    const tabs = [['overview', 'Огляд', 'home'], ['clients', 'Клієнти', 'users', 'pending'], ['leads', 'Заявки', 'mail', 'newLeads'], ['site', 'Сайт', 'globe'], ['more', 'Ще', 'more']];
    $('#xcTabbar').innerHTML = tabs.map(([id, t, i, k]) => `<button type="button" class="xc-tab" data-go="${id}" ${(id === current || (id === 'more' && ['news', 'prefs'].includes(current))) ? 'aria-current="page"' : ''}>${ic(i)}${t}${badge(k)}</button>`).join('');
  }
  function bump(k) {
    requestAnimationFrame(() => $$(`[data-cnt="${k}"]`).forEach((el) => { el.classList.remove('is-bump'); void el.offsetWidth; el.classList.add('is-bump'); }));
  }
  function go(id, skeleton) {
    if (id === 'more') { openMore(); return; }
    if (!SECTIONS.some((s) => s[0] === id)) id = 'overview';
    current = id;
    store.set('xc_section', id);
    renderNav();
    const v = $('#xcView');
    if (skeleton || !loaded) {
      v.innerHTML = `<div class="xc-top"><div><div class="xc-eyebrow">&nbsp;</div><div class="xc-h1 xc-disp">${esc(SECTIONS.find((s) => s[0] === id)[1])}</div></div></div>${'<div class="xc-skel"></div>'.repeat(4)}`;
      if (loaded) setTimeout(() => { if (current === id) render(); }, 220);
    } else render();
    $('#xcMain').scrollTo({ top: 0 });
  }
  function render() {
    if (!built) return;
    const v = $('#xcView');
    if (loadError) {
      v.innerHTML = `<div class="xc-view"><div class="xc-top"><div><h1 class="xc-h1 xc-disp">Не вдалося завантажити</h1></div></div><section class="xc-panel"><p class="xc-mut" style="margin:0 0 14px">${esc(loadError)}</p><button type="button" class="xc-btn xc-btn--pri" data-act="reload">Спробувати ще раз</button></section></div>`;
      return;
    }
    if (!loaded) return;
    v.innerHTML = `<div class="xc-view">${VIEWS[current]()}</div>`;
    bindView();
  }

  /* ---------- Розділи ---------- */
  const DAY = 864e5;
  const dayISO = (t) => { const d = new Date(t); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  function series(fn) { const out = []; for (let i = 13; i >= 0; i--) out.push(fn(dayISO(Date.now() - i * DAY))); return out; }
  function spark(vals, col = '#39ff6a') {
    const max = Math.max(1, ...vals), min = Math.min(...vals);
    const span = Math.max(1, max - min);
    const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * 120},${(30 - ((v - min) / span) * 26).toFixed(1)}`).join(' ');
    const id = 'xcg' + col.slice(1);
    return `<svg class="sp" viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".25"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs><polygon points="0,34 ${pts} 120,34" fill="url(#${id})"/><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
  }
  const memberSub = (m) => {
    const st = stateOf(m);
    const card = m.barcode ? (C().plasticNo(m.barcode) ? ' · 🪪 №' + esc(C().plasticNo(m.barcode)) : '') : '';
    return (st.state === 'pending' ? 'Обрав: ' + esc(m.desired_plan || 'абонемент не вказано') : esc(m.plan || '—') + ' · до ' + fmtD(m.valid_to)) + card;
  };
  const pillText = (st) => (st.state === 'pending' ? 'Нова реєстрація' : st.state === 'expired' ? 'Неактивна' : st.state === 'soon' ? (st.left === 0 ? 'Останній день' : `Ще ${st.left} ${plural(st.left, ['день', 'дні', 'днів'])}`) : 'Активна');
  const pill = (m) => { const st = stateOf(m); return `<span class="xc-pill xc-st-${st.state}">${pillText(st)}</span>`; };
  const memberRow = (m) => `<div class="xc-row xc-row--m" data-member="${esc(m.id)}" role="button" tabindex="0">${avatar(m.id, m.full_name)}<div class="t"><div class="n">${esc(m.full_name || 'Без імені')}</div><div class="s">${memberSub(m)}</div></div>${pill(m)}${stateOf(m).state === 'pending' ? `<button type="button" class="xc-btn xc-btn--sm xc-btn--pri" data-activate="${esc(m.id)}">Активувати</button>` : `<button type="button" class="xc-btn xc-btn--sm" data-renew="${esc(m.id)}">+1 міс</button>`}</div>`;
  const leadRow = (l) => `<div class="xc-row${isHandled(l) ? ' is-done' : ''}" data-lead="${esc(l.id)}" role="button" tabindex="0"><div class="xc-av" style="background:${COLORS[hash(l.id) % COLORS.length]}">${esc(initials(l.name))}</div><div class="t"><div class="n">${esc(l.name || 'Без імені')} <span class="xc-mut" style="font-weight:500">· <span class="xc-num">${esc(l.phone)}</span></span></div><div class="s">${esc(l.message || '—')}</div></div><span class="when">${ago(l.created_at)}</span></div>`;
  const top = (eyebrow, title, acts = '') => `<div class="xc-top"><div><div class="xc-eyebrow">${eyebrow}</div><h1 class="xc-h1 xc-disp">${title}</h1></div>${acts ? `<div class="xc-acts">${acts}</div>` : ''}</div>`;
  const localNote = () => (A().isRemote ? '' : '<div class="xc-note">Локальний режим: зміни зберігаються лише в цьому браузері.</div>');

  const VIEWS = {
    overview() {
      const c = counts();
      const ms = members();
      const attention = ms.filter((m) => ['pending', 'soon'].includes(stateOf(m).state))
        .sort((a, b) => (stateOf(a).state === 'pending' ? -1 : 0) - (stateOf(b).state === 'pending' ? -1 : 0) || (a.valid_to || '').localeCompare(b.valid_to || ''));
      const vl = visibleLeads();
      const todayKey = dayISO(Date.now());
      const leadsToday = vl.filter((l) => dayISO(l.created_at) === todayKey).length;
      const activeOn = (d) => ms.filter((m) => m.valid_from && m.valid_to && m.valid_from <= d && m.valid_to >= d).length;
      const activeWeek = c.active - activeOn(dayISO(Date.now() - 7 * DAY));
      const h = new Date().getHours();
      const hi = h < 5 ? 'Доброї ночі' : h < 12 ? 'Доброго ранку' : h < 18 ? 'Доброго дня' : 'Доброго вечора';
      const date = new Date().toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
      return top(esc(date), hi + ' 👋', `<button type="button" class="xc-search" data-act="search">${ic('search')}<span>Пошук по клієнтах і заявках</span><span class="xc-kbd">Ctrl K</span></button><button type="button" class="xc-btn xc-btn--pri" data-act="new">${ic('plus')}Новий клієнт</button>`)
        + localNote()
        + `<div class="xc-stats">
          <button type="button" class="xc-stat" data-go="leads"><div class="k">${ic('mail')}Нові заявки</div><div class="v xc-num">${c.newLeads}</div><div class="d">${leadsToday ? '+' + leadsToday + ' за сьогодні' : 'сьогодні ще немає'}</div>${spark(series((d) => vl.filter((l) => dayISO(l.created_at) === d).length))}</button>
          <button type="button" class="xc-stat" data-go="clients" data-filter="pending"><div class="k">${ic('users')}Нові реєстрації</div><div class="v xc-num">${c.pending}</div><div class="d">${c.pending ? 'чекають активації' : 'усіх активовано'}</div>${spark(series((d) => ms.filter((m) => m.created_at && dayISO(m.created_at) === d).length))}</button>
          <button type="button" class="xc-stat" data-go="clients" data-filter="active"><div class="k">${ic('card')}Активні абонементи</div><div class="v xc-num">${c.active}</div><div class="d">${activeWeek > 0 ? '+' + activeWeek + ' за тиждень' : activeWeek < 0 ? activeWeek + ' за тиждень' : 'як і тиждень тому'}</div>${spark(series(activeOn))}</button>
          <button type="button" class="xc-stat xc-stat--warn" data-go="clients" data-filter="soon"><div class="k">${ic('bolt')}Закінчуються ≤ 5 днів</div><div class="v xc-num">${c.soon}</div><div class="d">${c.soon ? 'нагадай клієнтам' : 'нікому не треба нагадувати'}</div>${spark(series((d) => ms.filter((m) => m.valid_to && m.valid_to >= d && (new Date(m.valid_to) - new Date(d)) / DAY <= 5).length), '#ffb020')}</button>
        </div>
        <div class="xc-grid2">
          <section class="xc-panel"><div class="xc-ph"><h2>Потребує уваги</h2><button type="button" class="xc-link" data-go="clients" data-filter="all">Усі клієнти →</button></div><div class="xc-list">${attention.slice(0, 6).map(memberRow).join('') || '<div class="xc-empty">Усе під контролем ✓</div>'}</div></section>
          <section class="xc-panel"><div class="xc-ph"><h2>Останні заявки</h2><button type="button" class="xc-link" data-go="leads">Усі →</button></div><div class="xc-list">${leadsError ? `<div class="xc-empty">${esc(leadsError)}</div>` : vl.filter((l) => !isHandled(l)).slice(0, 4).map(leadRow).join('') || '<div class="xc-empty">Нових заявок немає</div>'}</div></section>
        </div>`;
    },
    clients() {
      const f = filter.clients;
      const q = query.clients.trim().toLowerCase();
      const qd = q.replace(/\D/g, '');
      const ms = members();
      const inF = (m, k) => k === 'all' || stateOf(m).state === k || (k === 'active' && stateOf(m).state === 'soon');
      const list = ms.filter((m) => inF(m, f) && (!q || (m.full_name || '').toLowerCase().includes(q)
        || (qd.length >= 3 && ((m.phone || '').replace(/\D/g, '').includes(qd) || (m.barcode || '').includes(qd) || (m.card_number || '').includes(qd)))));
      const n = (k) => ms.filter((m) => inF(m, k)).length;
      return top(`${ms.length} ${plural(ms.length, ['клієнт', 'клієнти', 'клієнтів'])}`, 'Клієнти', `<button type="button" class="xc-btn" data-act="check">${ic('scan')}Перевірити карту</button><button type="button" class="xc-btn xc-btn--pri" data-act="new">${ic('plus')}Новий клієнт</button>`)
        + localNote()
        + `<section class="xc-panel"><label class="xc-search">${ic('search')}<input id="xcCq" type="search" placeholder="Імʼя, телефон або штрихкод" value="${esc(query.clients)}" autocomplete="off" aria-label="Пошук клієнтів"></label>
        <div class="xc-chips">${[['all', 'Усі'], ['pending', 'Нові'], ['active', 'Активні'], ['soon', 'Закінчуються'], ['expired', 'Неактивні']].map(([k, t]) => `<button type="button" class="xc-chip" data-filter="${k}" aria-pressed="${f === k}">${t} · ${n(k)}</button>`).join('')}</div>
        <div class="xc-list" style="margin-top:8px">${list.map(memberRow).join('') || `<div class="xc-empty">${ms.length ? 'Нікого не знайдено. Спробуй інше імʼя чи номер.' : 'Клієнтів ще немає. Натисни «Новий клієнт», щоб видати першу карту.'}</div>`}</div></section>`;
    },
    leads() {
      const vl = visibleLeads();
      const fresh = vl.filter((l) => !isHandled(l)).length;
      return top(leadsError ? '&nbsp;' : `${fresh} ${plural(fresh, ['нова', 'нові', 'нових'])}`, 'Заявки з сайту', `<button type="button" class="xc-btn" data-act="refresh">Оновити</button>`)
        + `<section class="xc-panel"><div class="xc-list">${leadsError ? `<div class="xc-empty">${esc(leadsError)}</div>` : vl.map(leadRow).join('') || '<div class="xc-empty">Заявок поки немає</div>'}</div></section>
        <p class="xc-mut" style="text-align:center;font-size:13px;margin-top:14px">Натисни на заявку, щоб подзвонити, позначити як оброблену або видалити.</p>`;
    },
    site() {
      const cards = $$('#pricing .price-card');
      const field = (el, cls) => (el && el.dataset.editKey ? `<span class="${cls}" contenteditable="true" spellcheck="false" data-k="${esc(el.dataset.editKey)}">${esc(el.textContent.trim())}</span>` : '');
      const plans = cards.map((card) => {
        const name = card.querySelector('h3[data-edit-key]');
        const amount = card.querySelector('.price-card__price [data-edit-key]:not(.price-card__period)');
        const period = card.querySelector('.price-card__period');
        return `<div class="xc-plan${card.classList.contains('price-card--featured') ? ' is-hot' : ''}"><div class="pn">${field(name, '')}</div><div class="pp"><b>${field(amount, '')}</b><span>${field(period, '')}</span></div></div>`;
      }).join('');
      const tile = (sel, title, sub, icon) => `<button type="button" class="xc-tile" data-edit-section="${sel}"><div class="xc-av xc-av--plain">${ic(icon)}</div><div><b>${title}</b><small>${sub}</small></div></button>`;
      return top('xfit.com.ua', 'Сайт', `<button type="button" class="xc-btn xc-btn--pri" data-edit-section="#home">${ic('edit')}Редагувати сторінку</button>`)
        + localNote()
        + `<section class="xc-panel"><div class="xc-ph"><h2>Абонементи й ціни</h2></div><p class="xc-mut" style="margin:0 0 14px;font-size:13.5px">Натисни на назву, ціну чи період і зміни текст. Період («/міс», «/6 міс», «/рік») визначає, на скільки активується абонемент клієнта.</p>
          <div class="xc-prev"><div class="xc-plans">${plans || '<div class="xc-empty">Абонементів не знайдено</div>'}</div></div>
          <div class="xc-bar" id="xcPriceBar" hidden><span class="dot"></span><span>Є незбережені зміни</span><span class="sp"><button type="button" class="xc-btn xc-btn--sm" data-act="priceCancel">Скасувати</button><button type="button" class="xc-btn xc-btn--sm xc-btn--pri" data-act="priceSave">${ic('check')}Зберегти</button></span></div></section>
        <div class="xc-tiles">
          ${tile('#home', 'Головний екран', 'Заголовок, опис, цифри', 'home')}
          ${tile('#programs', 'Програми', 'Напрями тренувань', 'bolt')}
          ${tile('#trainers', 'Тренери', 'Фото, імена, ролі', 'users')}
          ${tile('#gallery', 'Галерея', 'Фото залу', 'img')}
          ${tile('#pricing', 'Абонементи', 'Переваги кожного плану', 'card')}
          ${tile('#contact', 'Контакти й розклад', 'Телефони, адреси, години', 'phone')}
        </div>
        <p class="xc-mut" style="text-align:center;font-size:13px;margin-top:14px">Фото й тексти решти сторінки редагуються прямо на сайті — натисни на розділ.</p>`;
    },
    news() {
      const st = A().announcements();
      const items = [...st.items].sort((a, b) => (b.sortOrder || 0) - (a.sortOrder || 0));
      return top(st.enabled ? 'Показуються на сайті' : 'Сховано з сайту', 'Оголошення', `<button type="button" class="xc-btn xc-btn--pri" data-act="addNews">${ic('plus')}Нове оголошення</button>`)
        + localNote()
        + `<section class="xc-panel" style="display:flex;align-items:center;gap:14px"><div style="flex:1"><b>Розділ «Анонси» на сайті</b><div class="xc-mut" style="font-size:13px">${st.enabled ? 'Відвідувачі бачать оголошення й пункт «Анонси» в меню' : 'Увімкни, щоб відвідувачі побачили оголошення'}</div></div><button type="button" class="xc-switch" role="switch" aria-checked="${st.enabled}" aria-label="Показувати оголошення на сайті" data-act="newsToggle"></button></section>
        <div class="xc-news${st.enabled ? '' : ' xc-off'}">${items.map((n) => `<article class="xc-ncard">${n.image ? `<img src="${esc(n.image)}" alt="" loading="lazy">` : ''}<span class="xc-mut" style="font-size:12px">${esc(n.date || '')}</span><h4>${esc(n.title || 'Без заголовка')}</h4><p>${esc(n.text || '')}</p><div class="xc-quick" style="margin-top:auto"><button type="button" class="xc-btn xc-btn--sm" data-news-edit="${esc(n.id)}">${ic('edit')}Змінити</button><button type="button" class="xc-btn xc-btn--sm xc-btn--ghost xc-btn--danger" data-news-del="${esc(n.id)}">${ic('trash')}Видалити</button></div></article>`).join('') || '<div class="xc-empty">Оголошень ще немає</div>'}</div>
        <p class="xc-mut" style="text-align:center;font-size:13px;margin-top:14px">Афішу (фото) до оголошення можна додати на сайті — <button type="button" class="xc-link" data-edit-section="#announcements">відкрити розділ</button>.</p>`;
    },
    prefs() {
      return top('Обліковий запис і сайт', 'Налаштування')
        + localNote()
        + `<div class="xc-grid2" style="margin-top:0">
          <section class="xc-panel"><div class="xc-ph"><h2>Пароль адміністратора</h2></div><form class="xc-form" id="xcPw" novalidate><label class="xc-field"><span>Поточний пароль</span><input name="cur" type="password" autocomplete="current-password" required></label><label class="xc-field"><span>Новий пароль</span><input name="next" type="password" autocomplete="new-password" minlength="6" placeholder="щонайменше 6 символів" required></label><p class="xc-err" id="xcPwErr"></p><button class="xc-btn xc-btn--pri" type="submit">Оновити пароль</button></form></section>
          <section class="xc-panel xc-danger"><div class="xc-ph"><h2>Небезпечна зона</h2></div><p class="xc-mut" style="margin:0 0 12px;font-size:13.5px">Скидання поверне тексти, фото, тренерів та оголошення сайту до початкових${A().isRemote ? ' — для всіх відвідувачів' : ''}. Клієнтів і заявки не зачепить.</p><div id="xcResetBox"><button type="button" class="xc-btn xc-btn--danger" data-act="reset">${ic('trash')}Скинути зміни сайту</button></div>
          <div style="height:1px;background:var(--xc-line);margin:18px 0"></div><button type="button" class="xc-btn" data-act="logout">${ic('out')}Вийти з адмін-режиму</button></section>
        </div>`;
    },
  };

  function bindView() {
    const cq = $('#xcCq');
    if (cq) cq.addEventListener('input', () => { query.clients = cq.value; const pos = cq.selectionStart; render(); const n = $('#xcCq'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* type=search */ } });
    $$('.xc-plan [data-k]').forEach((el) => el.addEventListener('input', () => { $('#xcPriceBar').hidden = false; }));
    $$('.xc-plan [data-k]').forEach((el) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } }));
    const pw = $('#xcPw');
    if (pw) pw.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = pw.querySelector('button[type=submit]');
      btn.disabled = true;
      const err = await A().changePassword(pw.cur.value, pw.next.value);
      btn.disabled = false;
      $('#xcPwErr').textContent = err;
      if (!err) { pw.reset(); toast('Пароль оновлено'); }
    });
  }

  /* ---------- Бічна панель / лист знизу ---------- */
  let lastFocus = null;
  let onDrawerClose = null;
  function openDrawer(head, body, foot, onClose) {
    if (onDrawerClose) { const f = onDrawerClose; onDrawerClose = null; f(); }
    onDrawerClose = onClose || null;
    const d = $('#xcDrawer');
    if (d.hidden) lastFocus = document.activeElement;
    $('#xcDHead').innerHTML = head;
    $('#xcDBody').innerHTML = body;
    $('#xcDFoot').innerHTML = foot || '';
    $('#xcDFoot').hidden = !foot;
    $('#xcDBody').scrollTop = 0;
    d.hidden = false; $('#xcScrim').hidden = false;
    d.style.transform = '';
    requestAnimationFrame(() => { d.classList.add('is-on'); $('#xcScrim').classList.add('is-on'); });
    setTimeout(() => { const f = d.querySelector('.xc-db input:not([readonly]), .xc-db select'); if (f && desktop()) f.focus(); }, 320);
  }
  function closeDrawer() {
    const d = $('#xcDrawer');
    if (!d || d.hidden) return;
    if (onDrawerClose) { const f = onDrawerClose; onDrawerClose = null; f(); }
    d.classList.remove('is-on'); $('#xcScrim').classList.remove('is-on'); d.style.transform = '';
    setTimeout(() => { if (!d.classList.contains('is-on')) { d.hidden = true; if ($('#xcPal').hidden) $('#xcScrim').hidden = true; } }, 420);
    if (lastFocus && lastFocus.focus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
  }
  // тягнути лист униз, щоб закрити (телефон)
  function bindDrag() {
    const h = $('#xcHandle'), d = $('#xcDrawer');
    let drag = null;
    h.addEventListener('pointerdown', (e) => { drag = { y: e.clientY }; d.style.transition = 'none'; h.setPointerCapture(e.pointerId); });
    h.addEventListener('pointermove', (e) => { if (drag) d.style.transform = `translateY(${Math.max(0, e.clientY - drag.y)}px)`; });
    const end = (e) => { if (!drag) return; const dy = e.clientY - drag.y; drag = null; d.style.transition = ''; if (dy > 110) closeDrawer(); else d.style.transform = ''; };
    h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
  }

  const memberHead = (m) => `<div style="display:flex;align-items:center;gap:12px">${avatar(m.id, m.full_name)}<div style="min-width:0"><div class="xc-title" id="xcDTitle">${esc(m.full_name || 'Без імені')}</div><div style="margin-top:4px">${pill(m)}</div></div></div>`;
  function memberDrawer(id) {
    const m = M().get(id);
    if (!m) return;
    const st = stateOf(m);
    const url = C().cardUrl(m.token);
    const total = m.valid_from && m.valid_to ? Math.max(1, C().daysBetween(m.valid_from, m.valid_to) + 1) : 1;
    const left = Math.max(0, st.left || 0);
    const plastic = m.barcode && C().plasticNo(m.barcode);
    const sms = m.phone ? `sms:${esc(String(m.phone).replace(/[^+\d]/g, ''))}?&body=${encodeURIComponent('XFit: твоя карта клієнта — відкрий посилання й збережи карту на телефоні: ' + url)}` : '';
    openDrawer(memberHead(m), `
      <dl class="xc-kv"><dt>Телефон</dt><dd class="xc-num">${m.phone ? `<a href="tel:${esc(String(m.phone).replace(/[^+\d]/g, ''))}" style="color:inherit">${esc(m.phone)}</a>` : '—'}</dd>
        <dt>Абонемент</dt><dd>${st.state === 'pending' ? 'обрав: ' + esc(m.desired_plan || '—') : esc(m.plan || '—')}</dd>
        <dt>Діє</dt><dd class="xc-num">${m.valid_to ? fmtD(m.valid_from) + ' — ' + fmtD(m.valid_to) : 'після оплати'}</dd>
        ${m.gym ? `<dt>Зал</dt><dd>${esc(m.gym)}</dd>` : ''}
        <dt>Карта</dt><dd class="xc-num">${plastic ? '🪪 №' + esc(plastic) + ' · ' : ''}${esc(m.barcode ? C().fmtBarcode(m.barcode) : C().groupNumber(m.card_number))}</dd>
        ${m.birth_date ? `<dt>Народження</dt><dd class="xc-num">${fmtD(m.birth_date)}</dd>` : ''}
        ${m.notes ? `<dt>Нотатка</dt><dd>${esc(m.notes)}</dd>` : ''}</dl>
      ${m.valid_to && st.state !== 'pending' ? `<div class="xc-prog"><i data-w="${Math.min(100, (left / total) * 100)}"></i></div><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-top:6px"><span class="xc-mut">${st.state === 'expired' ? 'Абонемент закінчився' : 'Залишилось'}</span><b class="xc-num">${st.state === 'expired' ? fmtD(m.valid_to) : left + ' ' + plural(left, ['день', 'дні', 'днів'])}</b></div>` : ''}
      <div class="xc-actions">
        <button type="button" class="xc-btn xc-btn--sm" data-copy="${esc(url)}">${ic('copy')}Посилання на карту</button>
        ${sms ? `<a class="xc-btn xc-btn--sm" href="${sms}">${ic('msg')}SMS клієнту</a>` : ''}
        ${navigator.share ? `<button type="button" class="xc-btn xc-btn--sm" data-act="share" data-id="${esc(m.id)}">${ic('share')}Поділитися</button>` : ''}
        <button type="button" class="xc-btn xc-btn--sm" data-act="edit" data-id="${esc(m.id)}">${ic('edit')}Змінити</button>
        <button type="button" class="xc-btn xc-btn--sm xc-btn--ghost xc-btn--danger" data-act="askDel" data-id="${esc(m.id)}">${ic('trash')}Видалити</button>
      </div><div id="xcDelBox"></div>
      <div class="xc-cardbox"><div class="xc-ph"><h2>Карта клієнта</h2><a class="xc-link" href="${esc(url)}" target="_blank" rel="noopener">Відкрити ↗</a></div><div id="xcCardPreview"></div></div>`,
    st.state === 'pending'
      ? `<button type="button" class="xc-btn xc-btn--pri" data-activate="${esc(m.id)}">${ic('check')}Активувати карту</button>`
      : `<button type="button" class="xc-btn" data-renew="${esc(m.id)}">+1 місяць</button><button type="button" class="xc-btn xc-btn--pri" data-act="edit" data-id="${esc(m.id)}">Продовжити</button>`);
    try { C().render($('#xcCardPreview'), m); } catch (e) { /* карта не обовʼязкова */ }
    setTimeout(() => { const b = $('#xcDrawer .xc-prog i'); if (b) b.style.width = b.dataset.w + '%'; }, 260);
  }

  const OTHER = '__other__';
  function memberForm(m, prefill) {
    const isNew = !m;
    const activating = m && stateOf(m).state === 'pending';
    const today = C().todayISO();
    const info = M().planInfo();
    const names = info.map((x) => x.name);
    const curPlan = (m && m.plan) || (m && M().matchPlan(m.desired_plan)) || names[1] || names[0] || '';
    const planList = curPlan && !names.includes(curPlan) ? [curPlan, ...names] : names;
    const g = M().gyms();
    const gymList = g.length ? g : ['Подільськ', 'Балта'];
    const curGym = (m && m.gym) || gymList[0];
    const from = (m && !activating && m.valid_from) || today;
    const months = (info.find((x) => x.name === curPlan) || { months: 1 }).months;
    const to = (m && !activating && m.valid_to) || (months ? M().addMonths(from, months) : from);
    const v = (k) => esc((m && m[k]) || (prefill && prefill[k]) || '');
    const head = m ? memberHead(m) : '<div class="xc-title" id="xcDTitle">Новий клієнт</div><div class="xc-mut" style="font-size:13px">Після збереження зʼявиться карта й посилання для клієнта</div>';
    openDrawer(head, `<form class="xc-form" id="xcMemForm" autocomplete="off" novalidate>
      ${activating ? '<p class="xc-mut" style="margin:0;font-size:13.5px">Клієнт оплатив на рецепції? Обери абонемент — дата закінчення поставиться сама.</p>' : ''}
      <label class="xc-field"><span>Прізвище та імʼя</span><input name="full_name" maxlength="80" value="${v('full_name')}" placeholder="Напр. Олена Коваленко"></label>
      <label class="xc-field"><span>Телефон</span><input name="phone" type="tel" maxlength="20" value="${v('phone')}" placeholder="+380…"></label>
      <div class="xc-two">
        <label class="xc-field"><span>Абонемент${m && m.desired_plan && !m.plan ? ` <small>обрав: ${esc(m.desired_plan)}</small>` : ''}</span><select name="plan">${planList.map((x) => `<option${x === curPlan ? ' selected' : ''}>${esc(x)}</option>`).join('')}<option value="${OTHER}">✎ Інший…</option></select></label>
        <label class="xc-field"><span>Зал</span><select name="gym">${(curGym && !gymList.includes(curGym) ? [curGym, ...gymList] : gymList).map((x) => `<option${x === curGym ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      </div>
      <label class="xc-field" id="xcPlanOther" hidden><span>Назва абонемента</span><input name="plan_other" maxlength="40" placeholder="Напр. Студентський"></label>
      <div class="xc-two">
        <label class="xc-field"><span>Діє з</span><input name="valid_from" type="date" value="${esc(from)}"></label>
        <label class="xc-field"><span>Діє до</span><input name="valid_to" type="date" value="${esc(to)}"></label>
      </div>
      <div class="xc-quick">${[1, 3, 6, 12].map((n) => `<button type="button" class="xc-btn xc-btn--sm" data-months="${n}">${n} міс</button>`).join('')}</div>
      <div class="xc-two">
        <label class="xc-field"><span>Дата народження</span><input name="birth_date" type="date" value="${v('birth_date')}"></label>
        <label class="xc-field"><span>Email</span><input name="email" type="email" maxlength="120" value="${v('email')}"></label>
      </div>
      <label class="xc-field"><span>Штрихкод карти <small>пластикова карта — 13 цифр; порожнє — згенерується</small></span><input name="barcode" inputmode="numeric" maxlength="15" value="${v('barcode')}" placeholder="2 500000 000000"></label>
      <label class="xc-field"><span>Нотатка (бачить лише адмін)</span><input name="notes" maxlength="200" value="${v('notes')}"></label>
      <p class="xc-err" id="xcMemErr"></p>
    </form>`, `<button type="button" class="xc-btn" data-act="${m ? 'openMember' : 'close'}" data-id="${m ? esc(m.id) : ''}">Скасувати</button><button type="button" class="xc-btn xc-btn--pri" data-act="saveMember" data-id="${m ? esc(m.id) : ''}">${ic('check')}${isNew ? 'Створити карту' : activating ? 'Активувати карту' : 'Зберегти'}</button>`);
    const f = $('#xcMemForm');
    const recalc = () => {
      const i = M().planInfo().find((x) => x.name === f.plan.value);
      if (i) f.valid_to.value = i.months ? M().addMonths(f.valid_from.value || today, i.months) : (f.valid_from.value || today);
    };
    f.plan.addEventListener('change', () => {
      const other = f.plan.value === OTHER;
      $('#xcPlanOther').hidden = !other;
      if (other) f.plan_other.focus(); else recalc();
    });
    f.valid_from.addEventListener('change', recalc);
    $$('[data-months]', f).forEach((b) => b.addEventListener('click', () => { f.valid_to.value = M().addMonths(f.valid_from.value || today, Number(b.dataset.months)); }));
    f.addEventListener('submit', (e) => { e.preventDefault(); saveMember(m ? m.id : ''); });
  }
  async function saveMember(id) {
    const f = $('#xcMemForm');
    const err = (t, field) => { $('#xcMemErr').textContent = t; if (field) f[field].focus(); };
    const m = id ? M().get(id) : null;
    const d = Object.fromEntries(new FormData(f).entries());
    d.full_name = d.full_name.trim();
    if (d.full_name.length < 3) return err('Вкажи прізвище та імʼя.', 'full_name');
    if (d.plan === OTHER) { d.plan = (d.plan_other || '').trim(); if (!d.plan) return err('Вкажи назву абонемента.', 'plan_other'); }
    delete d.plan_other;
    if (!d.valid_from || !d.valid_to) return err('Вкажи дати абонемента.', 'valid_from');
    if (d.valid_to < d.valid_from) return err('Дата «до» раніша за дату «з».', 'valid_to');
    d.barcode = String(d.barcode || '').replace(/\D/g, '');
    if (d.barcode && !C().isBarcode(d.barcode)) return err('Штрихкод має 13 цифр, починається з 2, і контрольна цифра має сходитись — перевір ще раз.', 'barcode');
    if (d.barcode && members().some((x) => x.barcode === d.barcode && (!m || x.id !== m.id))) return err('Цей штрихкод уже має інший клієнт.', 'barcode');
    const wasPending = m && stateOf(m).state === 'pending';
    const rec = { ...(m || {}), ...d, birth_date: d.birth_date || null, status: 'active' };
    if (!rec.barcode) rec.barcode = M().uniqueBarcode();
    rec.barcode_source = rec.barcode.startsWith('251') ? 'app' : 'plastic';
    if (!m) { rec.card_number = M().uniqueNumber(); rec.token = C().newToken(); }
    const btn = $('#xcDFoot [data-act="saveMember"]');
    btn.disabled = true;
    try {
      const saved = await M().upsert(rec);
      toast(!m ? `Карту створено: ${saved.full_name}` : wasPending ? `Карту активовано: ${saved.full_name}` : 'Збережено');
      render(); renderNav();
      if (wasPending) bump('pending');
      memberDrawer(saved.id);
    } catch (e) {
      btn.disabled = false;
      err(e.message);
    }
  }

  function leadDrawer(id) {
    const l = leads.find((x) => x.id === id);
    if (!l) return;
    const tel = String(l.phone || '').replace(/[^+\d]/g, '');
    const done = isHandled(l);
    openDrawer(`<div class="xc-title" id="xcDTitle">Заявка: ${esc(l.name || 'без імені')}</div><div class="xc-mut" style="font-size:13px">${new Date(l.created_at).toLocaleString('uk-UA', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}${done ? ' · оброблено' : ''}</div>`,
      `<dl class="xc-kv"><dt>Телефон</dt><dd class="xc-num">${esc(l.phone || '—')}</dd><dt>Повідомлення</dt><dd class="full">${esc(l.message || '—')}</dd></dl>
      <div class="xc-actions">${tel ? `<a class="xc-btn xc-btn--sm xc-btn--pri" href="tel:${esc(tel)}">${ic('phone')}Подзвонити</a>` : ''}<button type="button" class="xc-btn xc-btn--sm" data-copy="${esc(l.phone || '')}">${ic('copy')}Скопіювати номер</button><button type="button" class="xc-btn xc-btn--sm xc-btn--ghost xc-btn--danger" data-act="delLead" data-id="${esc(l.id)}">${ic('trash')}Видалити</button></div>`,
      `<button type="button" class="xc-btn" data-act="leadToMember" data-id="${esc(l.id)}">${ic('plus')}Клієнт</button><button type="button" class="xc-btn xc-btn--pri" data-act="leadDone" data-id="${esc(l.id)}">${ic('check')}${done ? 'У нові' : 'Оброблено'}</button>`);
  }
  let handledWarned = false;
  async function toggleHandled(id) {
    const l = leads.find((x) => x.id === id);
    if (!l) return;
    const next = !isHandled(l);
    const set = localHandled();
    let ok = false;
    if (A().isRemote && 'handled_at' in l) {
      const { error } = await A().sb.from('leads').update({ handled_at: next ? new Date().toISOString() : null }).eq('id', id);
      ok = !error;
      if (ok) { l.handled_at = next ? new Date().toISOString() : null; set.delete(id); }
    }
    if (!ok) {
      if (next) set.add(id); else set.delete(id);
      l.handled_at = null;
      if (A().isRemote && !handledWarned) { handledWarned = true; setTimeout(() => toast('Позначка збережена лише на цьому пристрої — виконай supabase-update-leads.sql, щоб вона була всюди'), 2800); }
    }
    try { localStorage.setItem(HANDLED_KEY, JSON.stringify([...set])); } catch (e) { /* ignore */ }
    closeDrawer(); render(); renderNav();
    bump('newLeads');
    toast(next ? 'Позначено як оброблену' : 'Повернуто в нові');
  }
  // Видалення з можливістю «Повернути»: справжнє видалення — через 5 секунд
  function deleteLead(id) {
    const timer = setTimeout(async () => {
      pendingLeadDeletes.delete(id);
      const { error } = await A().sb.from('leads').delete().eq('id', id);
      if (error) { toast('Не вдалося видалити заявку'); render(); renderNav(); return; }
      leads = leads.filter((l) => l.id !== id);
    }, 5000);
    pendingLeadDeletes.set(id, timer);
    closeDrawer(); render(); renderNav();
    toast('Заявку видалено', () => { clearTimeout(pendingLeadDeletes.get(id)); pendingLeadDeletes.delete(id); render(); renderNav(); });
  }
  addEventListener('pagehide', () => pendingLeadDeletes.forEach((t, id) => { clearTimeout(t); A().sb && A().sb.from('leads').delete().eq('id', id); }));

  /* ---------- Перевірка карти на рецепції ---------- */
  let stopScan = null;
  function stopCamera() { if (stopScan) stopScan(); stopScan = null; }
  function checkDrawer() {
    const canScan = !!(window.XFitScanner && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    openDrawer('<div class="xc-title" id="xcDTitle">Перевірити карту</div><div class="xc-mut" style="font-size:13px">Відскануй сканером, камерою або введи номер</div>',
      `<div class="xc-form">${canScan ? '<div class="xc-scan"><video id="xcVideo" playsinline muted></video><span></span></div><button type="button" class="xc-btn xc-btn--pri" data-act="scan">' + ic('scan') + 'Сканувати камерою</button>' : '<p class="xc-mut" style="margin:0;font-size:13.5px">Цей браузер не вміє сканувати коди камерою. Введи номер вручну.</p>'}
      <form class="xc-two" id="xcCheckForm" style="grid-template-columns:minmax(0,1fr) auto"><label class="xc-field"><input id="xcCheckInput" inputmode="numeric" placeholder="Штрихкод або номер карти" aria-label="Штрихкод або номер карти"></label><button type="submit" class="xc-btn" style="height:46px">Перевірити</button></form>
      <div id="xcResult" aria-live="polite"></div>
      <p class="xc-mut" style="margin:0;font-size:12.5px">Порада: сканер на рецепції працює з будь-якого розділу адмінки — просто відскануй карту, і тут одразу зʼявиться клієнт.</p></div>`, '', stopCamera);
    $('#xcCheckForm').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#xcCheckInput').value; showCheck(M().findByCode(v), v); });
  }
  function showCheck(m, raw) {
    const box = $('#xcResult');
    if (!box) return;
    if (!m) { box.innerHTML = `<div class="xc-result xc-result--none"><b>Карту не знайдено</b><span class="xc-mut xc-num">${esc(raw)}</span></div>`; return; }
    const st = stateOf(m);
    box.innerHTML = `<div class="xc-result xc-result--${st.state}"><b>${st.state === 'expired' || st.state === 'pending' ? '✕ Абонемент неактивний' : '✓ Абонемент активний'}</b><span style="font-size:18px;font-weight:800">${esc(m.full_name)}</span><span class="xc-mut">${esc(m.plan || m.desired_plan || '—')}${m.valid_to ? ' · до ' + fmtD(m.valid_to) : ''}${['active', 'soon'].includes(st.state) ? ` · ще ${st.left} ${plural(st.left, ['день', 'дні', 'днів'])}` : ''}</span><button type="button" class="xc-btn xc-btn--sm" style="margin-top:8px" data-act="openMember" data-id="${esc(m.id)}">Відкрити клієнта</button></div>`;
  }
  async function startScan() {
    const video = $('#xcVideo');
    stopCamera();
    try {
      stopScan = await window.XFitScanner.start(video, ['ean_13', 'qr_code', 'code_128'], (raw) => {
        if (navigator.vibrate) navigator.vibrate(120);
        showCheck(M().findByCode(raw), raw);
        stopCamera();
      });
    } catch (err) { toast(window.XFitScanner.errorText(err)); }
  }

  function newsDrawer(id) {
    const n = A().announcements().items.find((x) => x.id === id);
    if (!n) return;
    openDrawer('<div class="xc-title" id="xcDTitle">Оголошення</div>', `<form class="xc-form" id="xcNewsForm"><label class="xc-field"><span>Заголовок</span><input name="title" maxlength="120" value="${esc(n.title)}"></label><label class="xc-field"><span>Текст</span><textarea name="text" rows="5" maxlength="2000">${esc(n.text)}</textarea></label><label class="xc-field"><span>Дата або підпис</span><input name="date" maxlength="40" value="${esc(n.date)}" placeholder="Напр. 12 грудня"></label></form>`,
      `<button type="button" class="xc-btn" data-act="close">Скасувати</button><button type="button" class="xc-btn xc-btn--pri" data-act="saveNews" data-id="${esc(id)}">${ic('check')}Зберегти</button>`);
  }
  function openMore() {
    openDrawer('<div class="xc-title" id="xcDTitle">Ще</div>', `<div class="xc-list">${[['news', 'Оголошення', 'mega'], ['prefs', 'Налаштування', 'gear']].map(([id, t, i]) => `<button type="button" class="xc-row" data-go="${id}"><div class="xc-av xc-av--plain">${ic(i)}</div><div class="t"><div class="n">${t}</div></div>›</button>`).join('')}
      <button type="button" class="xc-row" data-act="search"><div class="xc-av xc-av--plain">${ic('search')}</div><div class="t"><div class="n">Пошук</div></div>›</button>
      <button type="button" class="xc-row" data-act="toSite"><div class="xc-av xc-av--plain">${ic('site')}</div><div class="t"><div class="n">Перейти на сайт</div></div>›</button>
      <button type="button" class="xc-row" data-act="logout"><div class="xc-av xc-av--plain xc-mut">${ic('out')}</div><div class="t"><div class="n xc-mut">Вийти з адмін-режиму</div></div></button></div>`);
  }

  /* ---------- Сканер штрихкодів на рецепції ----------
     USB/Bluetooth-сканер «друкує» код дуже швидко (мілісекунди між символами) і натискає Enter.
     Коли адмінка відкрита і курсор не в полі вводу — ловимо такий потік і одразу показуємо клієнта. */
  const SHIFT_DIGITS = ')!@#$%^&*(';
  const CODE_CHARS = { Slash: '/?', Period: '.>', Semicolon: ';:', Minus: '-_', Equal: '=+', Comma: ',<', Quote: '\'"', BracketLeft: '[{', BracketRight: ']}', Backslash: '\\|', Backquote: '`~', NumpadDecimal: '..', NumpadDivide: '//', NumpadSubtract: '--', NumpadAdd: '++', NumpadMultiply: '**' };
  // символ за фізичною клавішею — незалежно від розкладки клавіатури
  function keyChar(e) {
    const c = e.code || '';
    const k = e.key && e.key.length === 1 && e.key.charCodeAt(0) < 128 ? e.key : '';
    // [без Shift, з Shift] для цієї клавіші; якщо розкладка англійська — e.key вже один із них
    const pair = /^Digit\d$/.test(c) ? c[5] + SHIFT_DIGITS[+c[5]]
      : /^Numpad\d$/.test(c) ? c[6] + c[6]
      : /^Key[A-Z]$/.test(c) ? c[3].toLowerCase() + c[3]
      : CODE_CHARS[c] || '';
    if (!pair) return k;
    if (k && pair.includes(k)) return k;
    return pair[e.shiftKey ? 1 : 0];
  }
  const scan = { buf: '', t: 0, timer: null };
  const scanReset = () => { scan.buf = ''; clearTimeout(scan.timer); };
  // true — натискання належить сканеру і далі не обробляється
  function scanKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const ae = document.activeElement;
    // у полі «Штрихкод або номер карти» сканер теж перехоплюємо — щоб кожне сканування замінювало попередній код
    if (ae && ae.id !== 'xcCheckInput' && (/INPUT|TEXTAREA|SELECT/.test(ae.tagName) || ae.isContentEditable)) { scanReset(); return false; }
    const now = performance.now();
    const fast = now - scan.t < 60;
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (scan.buf.length >= 8 && fast) { e.preventDefault(); scanDone(); return true; }
      scanReset();
      return false;
    }
    const ch = keyChar(e);
    if (!ch) return false;
    if (scan.buf && !fast) scan.buf = '';
    const mine = !!scan.buf; // перший символ ще може бути звичайним натисканням
    scan.buf += ch; scan.t = now;
    clearTimeout(scan.timer);
    // сканер без Enter у кінці: код завершено, якщо пауза
    scan.timer = setTimeout(() => { if (scan.buf.length >= 8) scanDone(); else scanReset(); }, 160);
    if (mine) e.preventDefault();
    return mine;
  }
  async function scanDone() {
    const code = scan.buf;
    scanReset();
    if (!isOpen()) open();
    if (!loaded) await loadAll();
    if (!loaded) return;
    closePal();
    if (!$('#xcResult') || !$('#xcDrawer').classList.contains('is-on')) checkDrawer();
    if (document.activeElement && document.activeElement.id === 'xcCheckInput') document.activeElement.blur();
    $('#xcCheckInput').value = code;
    const m = M().findByCode(code);
    showCheck(m, code);
    if (navigator.vibrate) navigator.vibrate(m ? 80 : [60, 60, 60]);
    beep(!!m && ['active', 'soon'].includes(stateOf(m).state));
  }
  // короткий сигнал: високий — абонемент активний, низький — ні
  let audio = null;
  function beep(ok) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = ok ? 1320 : 300;
      g.gain.setValueAtTime(0.12, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + (ok ? 0.15 : 0.35));
      o.connect(g); g.connect(audio.destination);
      o.start(); o.stop(audio.currentTime + (ok ? 0.15 : 0.35));
    } catch (e) { /* без звуку */ }
  }

  /* ---------- Пошук Ctrl+K ---------- */
  let palItems = [], palSel = 0;
  function hl(text, q) {
    text = String(text || '');
    if (!q) return esc(text);
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    return i < 0 ? esc(text) : esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
  }
  function renderPal() {
    const q = $('#xcPalInput').value.trim(), ql = q.toLowerCase(), qd = q.replace(/\D/g, '');
    const ms = !loaded ? [] : members().filter((m) => !q || (m.full_name || '').toLowerCase().includes(ql) || (qd.length >= 3 && ((m.phone || '').replace(/\D/g, '').includes(qd) || (m.barcode || '').includes(qd) || (m.card_number || '').includes(qd))))
      .sort((a, b) => (stateOf(a).state === 'pending' ? -1 : 0) - (stateOf(b).state === 'pending' ? -1 : 0)).slice(0, q ? 6 : 3);
    const ls = !q ? [] : visibleLeads().filter((l) => (l.name || '').toLowerCase().includes(ql) || (l.message || '').toLowerCase().includes(ql) || (qd.length >= 3 && (l.phone || '').replace(/\D/g, '').includes(qd))).slice(0, 4);
    const acts = [
      ['Новий клієнт', 'plus', () => memberForm(null)],
      ['Перевірити карту', 'scan', () => checkDrawer()],
      ['Нове оголошення', 'mega', () => addNews()],
      ['Редагувати сторінку сайту', 'edit', () => editSite('#home')],
      ...SECTIONS.map(([id, t, i]) => ['Перейти: ' + t, i, () => go(id)]),
      ['Перейти на сайт', 'site', () => close()],
    ].filter(([t]) => !q || t.toLowerCase().includes(ql)).slice(0, q ? 5 : 4);
    palItems = [...ms.map((m) => ['m', m]), ...ls.map((l) => ['l', l]), ...acts.map((a) => ['a', a])];
    palSel = Math.min(palSel, Math.max(0, palItems.length - 1));
    let i = 0;
    const sec = (title, arr, fn) => (arr.length ? `<div class="xc-grp">${title}</div>` + arr.map((x) => fn(x, i++)).join('') : '');
    $('#xcPalRes').innerHTML = sec('Клієнти', ms, (m, k) => `<div class="xc-row${k === palSel ? ' is-sel' : ''}" data-pi="${k}">${avatar(m.id, m.full_name)}<div class="t"><div class="n">${hl(m.full_name, q)}</div><div class="s">${memberSub(m)}</div></div>${stateOf(m).state === 'pending' ? '<span class="xc-pill xc-st-pending">Активувати ↵</span>' : pill(m)}</div>`)
      + sec('Заявки', ls, (l, k) => `<div class="xc-row${k === palSel ? ' is-sel' : ''}" data-pi="${k}"><div class="xc-av" style="background:${COLORS[hash(l.id) % COLORS.length]}">${esc(initials(l.name))}</div><div class="t"><div class="n">${hl(l.name, q)} · <span class="xc-num">${esc(l.phone)}</span></div><div class="s">${hl(l.message, q)}</div></div><span class="when">${ago(l.created_at)}</span></div>`)
      + sec('Дії', acts, (a, k) => `<div class="xc-row${k === palSel ? ' is-sel' : ''}" data-pi="${k}"><div class="xc-av xc-av--plain">${ic(a[1])}</div><div class="t"><div class="n">${hl(a[0], q)}</div></div></div>`)
      || `<div class="xc-empty">Нічого не знайдено за «${esc(q)}»</div>`;
    const sel = $('#xcPalRes .is-sel');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }
  function openPal() {
    if (!isOpen()) open();
    closeDrawer();
    const p = $('#xcPal');
    p.hidden = false; $('#xcScrim').hidden = false;
    $('#xcPalInput').value = ''; palSel = 0; renderPal();
    $('#xcPalInput').focus();
    requestAnimationFrame(() => { p.classList.add('is-on'); $('#xcScrim').classList.add('is-on'); });
  }
  function closePal() {
    const p = $('#xcPal');
    if (!p || p.hidden) return;
    p.classList.remove('is-on');
    if ($('#xcDrawer').hidden) $('#xcScrim').classList.remove('is-on');
    setTimeout(() => { if (!p.classList.contains('is-on')) { p.hidden = true; if ($('#xcDrawer').hidden) $('#xcScrim').hidden = true; } }, 250);
  }
  function runPal(k) {
    const it = palItems[k];
    if (!it) return;
    closePal();
    setTimeout(() => {
      if (it[0] === 'm') { if (stateOf(it[1]).state === 'pending') memberForm(it[1]); else memberDrawer(it[1].id); }
      else if (it[0] === 'l') leadDrawer(it[1].id);
      else it[1][2]();
    }, 180);
  }

  /* ---------- Сповіщення ---------- */
  function toast(text, undo) {
    build();
    const t = document.createElement('div');
    t.className = 'xc-toast';
    t.innerHTML = `<i>✓</i><span>${esc(text)}</span>${undo ? '<button type="button" class="xc-btn xc-btn--sm" style="margin-left:auto">Повернути</button>' : ''}`;
    $('#xcToasts').appendChild(t);
    const kill = () => { t.classList.add('is-out'); setTimeout(() => t.remove(), 300); };
    if (undo) t.querySelector('button').addEventListener('click', () => { undo(); t.remove(); });
    setTimeout(kill, undo ? 5000 : 2800);
  }

  /* ---------- Плаваюча панель на сайті ---------- */
  function renderFab() {
    if (!built) return;
    const fab = $('#xcFab');
    const admin = A().isAdmin && A().isAdmin();
    if (!admin || isOpen()) { fab.hidden = true; return; }
    const editing = A().isEditing && A().isEditing();
    fab.innerHTML = editing
      ? `<span class="xc-fab__dot"></span><span class="xc-fab__txt">Редагування</span><button type="button" class="xc-btn xc-btn--sm" data-act="editCancel">Скасувати</button><button type="button" class="xc-btn xc-btn--sm xc-btn--pri" data-act="editSave">${ic('check')}Зберегти</button><button type="button" class="xc-btn xc-btn--sm xc-btn--icon" data-act="openConsole" aria-label="Командний центр">${ic('grid')}</button>`
      : `<span class="xc-fab__dot"></span><span class="xc-fab__txt">Адмін</span><button type="button" class="xc-btn xc-btn--sm" data-act="editStart">${ic('edit')}Редагувати</button><button type="button" class="xc-btn xc-btn--sm xc-btn--pri" data-act="openConsole">${ic('grid')}Панель</button>`;
    fab.hidden = false;
  }
  function editSite(sel) {
    close();
    A().setEditing(true);
    const target = sel && document.querySelector(sel);
    setTimeout(() => { if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' }); else scrollTo({ top: 0, behavior: 'smooth' }); }, 60);
    toast('Натискай на текст, щоб змінити. Фото — кнопками на них.');
  }
  async function addNews() {
    if (current !== 'news') go('news');
    const item = await A().addAnnouncement();
    render();
    newsDrawer(item.id);
    setTimeout(() => { const t = $('#xcNewsForm [name=title]'); if (t) { t.focus(); t.select(); } }, 350);
  }

  /* ---------- Події ---------- */
  function bindGlobal() {
    bindDrag();
    $('#xcScrim').addEventListener('click', () => { closeDrawer(); closePal(); });
    $('#xcPalInput').addEventListener('input', () => { palSel = 0; renderPal(); });
    $('#xcPalInput').addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); palSel = Math.min(palItems.length - 1, palSel + 1); renderPal(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); palSel = Math.max(0, palSel - 1); renderPal(); }
      else if (e.key === 'Enter') { e.preventDefault(); runPal(palSel); }
    });
    $('#xcPalRes').addEventListener('click', (e) => { const r = e.target.closest('[data-pi]'); if (r) runPal(+r.dataset.pi); });

    document.addEventListener('click', onClick);
    document.addEventListener('keydown', (e) => {
      if (!A().isAdmin || !A().isAdmin()) return;
      if (isOpen() && scanKey(e)) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#xcPal').hidden ? openPal() : closePal(); return; }
      if (!isOpen()) return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(tag) && !document.activeElement.isContentEditable) { e.preventDefault(); openPal(); }
      else if (e.key === 'Escape') { if (!$('#xcPal').hidden) closePal(); else if (!$('#xcDrawer').hidden) closeDrawer(); }
      else if (e.key === 'Enter' && e.target.matches && e.target.matches('.xc-row[data-member], .xc-row[data-lead]')) e.target.click();
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && isOpen()) refreshLeads(); });
    setInterval(() => { if (isOpen() && !document.hidden) refreshLeads(); }, 60000);
  }

  async function onClick(e) {
    const el = e.target.closest('[data-go], [data-act], [data-member], [data-lead], [data-activate], [data-renew], [data-filter], [data-copy], [data-news-edit], [data-news-del], [data-edit-section]');
    if (!el || !el.closest('.xc, .xc-layer')) return;
    const d = el.dataset;
    if (d.activate) { e.stopPropagation(); const m = M().get(d.activate); if (m) memberForm(m); return; }
    if (d.renew) {
      e.stopPropagation();
      const m = M().get(d.renew);
      if (!m) return;
      el.disabled = true;
      try {
        const saved = await M().renew(m);
        render(); renderNav();
        if (!$('#xcDrawer').hidden && $('#xcDrawer').classList.contains('is-on')) memberDrawer(saved.id);
        toast(`${saved.full_name}: продовжено до ${fmtD(saved.valid_to)}`);
      } catch (err) { el.disabled = false; toast(err.message); }
      return;
    }
    if (d.copy !== undefined) {
      try { await navigator.clipboard.writeText(d.copy); toast('Скопійовано'); }
      catch (err) { const i = document.createElement('input'); i.value = d.copy; document.body.appendChild(i); i.select(); document.execCommand('copy'); i.remove(); toast('Скопійовано'); }
      return;
    }
    if (d.newsEdit) { newsDrawer(d.newsEdit); return; }
    if (d.newsDel) { await A().deleteAnnouncement(d.newsDel); render(); return; }
    if (d.editSection) { editSite(d.editSection); return; }
    if (d.filter && el.classList.contains('xc-chip')) { filter.clients = d.filter; render(); return; }
    if (d.go) {
      if (el.closest('#xcDrawer')) closeDrawer();
      if (d.filter) filter.clients = d.filter;
      go(d.go, true);
      return;
    }
    if (d.member) { memberDrawer(d.member); return; }
    if (d.lead) { leadDrawer(d.lead); return; }
    const id = d.id;
    switch (d.act) {
      case 'search': openPal(); break;
      case 'close': closeDrawer(); break;
      case 'reload': loadAll(); go(current, true); break;
      case 'refresh': await refreshLeads(); render(); toast('Оновлено'); break;
      case 'new': memberForm(null); break;
      case 'check': checkDrawer(); break;
      case 'scan': startScan(); break;
      case 'edit': memberForm(M().get(id)); break;
      case 'openMember': memberDrawer(id); break;
      case 'saveMember': saveMember(id); break;
      case 'share': {
        const m = M().get(id);
        if (m) navigator.share({ title: 'Твоя карта XFit', text: `${m.full_name}, твоя карта клієнта XFit:`, url: C().cardUrl(m.token) }).catch(() => {});
        break;
      }
      case 'askDel': {
        const m = M().get(id);
        $('#xcDelBox').innerHTML = `<div class="xc-confirm"><b>Видалити клієнта «${esc(m.full_name)}»?</b><span class="xc-mut" style="font-size:13.5px">Його карта перестане працювати на рецепції. Цю дію не можна скасувати.</span><div class="xc-quick"><button type="button" class="xc-btn xc-btn--sm" data-act="noDel">Ні</button><button type="button" class="xc-btn xc-btn--sm xc-btn--solid-danger" data-act="doDel" data-id="${esc(id)}">Так, видалити</button></div></div>`;
        $('#xcDelBox').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        break;
      }
      case 'noDel': $('#xcDelBox').innerHTML = ''; break;
      case 'doDel': {
        const m = M().get(id);
        el.disabled = true;
        try { await M().remove(id); closeDrawer(); render(); renderNav(); toast(`${m ? m.full_name : 'Клієнта'}: видалено`); } catch (err) { el.disabled = false; toast(err.message); }
        break;
      }
      case 'leadDone': toggleHandled(id); break;
      case 'delLead': deleteLead(id); break;
      case 'leadToMember': { const l = leads.find((x) => x.id === id); memberForm(null, l ? { full_name: l.name, phone: l.phone } : null); break; }
      case 'priceSave': {
        $$('.xc-plan [data-k]').forEach((x) => { const t = document.querySelector(`[data-edit-key="${CSS.escape(x.dataset.k)}"]`); const v = x.textContent.trim(); if (t && v) t.textContent = v; });
        el.disabled = true;
        const ok = await A().saveContent();
        el.disabled = false;
        if (ok) render();
        break;
      }
      case 'priceCancel': render(); toast('Зміни скасовано'); break;
      case 'addNews': addNews(); break;
      case 'saveNews': {
        const f = $('#xcNewsForm');
        el.disabled = true;
        const ok = await A().saveAnnouncement(id, { title: f.title.value.trim() || 'Без заголовка', text: f.text.value.trim(), date: f.date.value.trim() });
        closeDrawer(); render();
        toast(ok ? 'Оголошення збережено' : 'Не вдалося зберегти. Перевір інтернет.');
        break;
      }
      case 'newsToggle': await A().setAnnouncementsEnabled(el.getAttribute('aria-checked') !== 'true'); render(); break;
      case 'reset':
        $('#xcResetBox').innerHTML = `<div class="xc-confirm"><b>Точно скинути зміни сайту?</b><label class="xc-field"><span>Щоб підтвердити, введи СКИНУТИ</span><input id="xcRsIn" autocomplete="off" autocapitalize="characters"></label><div class="xc-quick"><button type="button" class="xc-btn xc-btn--sm" data-act="noReset">Скасувати</button><button type="button" class="xc-btn xc-btn--sm xc-btn--solid-danger" data-act="doReset">Скинути</button></div></div>`;
        $('#xcRsIn').focus();
        break;
      case 'noReset': render(); break;
      case 'doReset':
        if ($('#xcRsIn').value.trim().toUpperCase() !== 'СКИНУТИ') { $('#xcRsIn').style.borderColor = 'var(--xc-bad)'; $('#xcRsIn').focus(); break; }
        el.disabled = true;
        await A().resetAll();
        break;
      case 'toSite': close(); break;
      case 'openConsole': open(); break;
      case 'editStart': A().setEditing(true); toast('Натискай на текст, щоб змінити. Фото — кнопками на них.'); break;
      case 'editCancel': A().setEditing(false, true); toast('Зміни скасовано'); break;
      case 'editSave': el.disabled = true; if (await A().saveContent()) A().setEditing(false); else el.disabled = false; break;
      case 'logout': close(); await A().logout(); break;
    }
  }

  /* ---------- Звʼязок з js/admin.js ---------- */
  function onAdmin(quiet) {
    build();
    if (store.get('xc_closed') === '1') { renderFab(); if (!quiet) toast('Адмін-режим увімкнено'); } else open();
  }
  document.addEventListener('xfit:admin', (e) => {
    if (e.detail.on) onAdmin();
    else {
      loaded = false; leads = [];
      if (built) { close(); store.set('xc_closed', ''); $('#xcFab').hidden = true; }
    }
  });
  document.addEventListener('xfit:editing', () => renderFab());
  document.addEventListener('xfit:announcements', () => { if (isOpen() && current === 'news' && $('#xcDrawer').hidden) render(); });

  window.XFitConsole = { open, close, toast };
  // адмін-режим міг увімкнутись ще до завантаження цього файлу (збережений вхід)
  if (A().isAdmin && A().isAdmin()) onAdmin(true);
})();
