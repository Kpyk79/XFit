/* ============================================================
   XFit — віртуальна карта клієнта.
   XFitCard.render(el, member) малює карту (лицьова: логотип, чип,
   номер, власник, дійсна до; зворотна: QR-код і штрих-код).
   На сторінці card.html карта відкривається за особистим посиланням
   card.html?c=<код>: дані беруться з Supabase і зберігаються на
   телефоні, щоб карта показувалась і без інтернету.
   ============================================================ */
(function (root) {
  // iPhone: Safari показує натискання (:active) лише коли сторінка слухає дотики
  document.addEventListener('touchstart', () => {}, { passive: true });
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DAY = 86400000;

  function todayISO() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / DAY);

  // Внутрішній номер карти (16 цифр, контрольна цифра Луна): зашитий у штрих-код і для пошуку в адмінці, клієнту не показується
  function luhnDigit(digits) {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      let d = Number(digits[digits.length - 1 - i]);
      if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
    }
    return String((10 - (sum % 10)) % 10);
  }
  function newCardNumber() {
    const rnd = new Uint32Array(3);
    crypto.getRandomValues(rnd);
    const body = String(new Date().getFullYear()) + Array.from(rnd).map((n) => String(n % 10000).padStart(4, '0')).join('').slice(0, 11);
    return body + luhnDigit(body);
  }
  function newToken() {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  /* ---------- Штрихкод EAN-13, як на пластикових картах XFit (2 500000 005053) ---------- */
  function eanCheck(d12) {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (i % 2 ? 3 : 1);
    return String((10 - (sum % 10)) % 10);
  }
  // Карти залу — внутрішня нумерація магазинів/закладів, вона починається з «2»
  const isBarcode = (code) => /^2\d{12}$/.test(String(code || '')) && eanCheck(code) === String(code)[12];
  // Карти з додатку — окремий діапазон «251…», щоб не перетнутися з пластиковими «2500000…»
  function newBarcode() {
    const rnd = new Uint32Array(1);
    crypto.getRandomValues(rnd);
    const d12 = '251' + String(rnd[0] % 1e9).padStart(9, '0');
    return d12 + eanCheck(d12);
  }
  // Порядковий номер, надрукований на пластиковій карті: 2500000 00505 3 → 505
  const plasticNo = (code) => (/^2500000\d{6}$/.test(String(code || '')) ? String(Number(String(code).slice(7, 12))) : '');
  const fmtBarcode = (code) => String(code || '').replace(/^(\d)(\d{6})(\d{6})$/, '$1 $2 $3');
  const groupNumber = (n) => String(n || '').replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');
  function maskPhone(p) {
    const d = String(p || '').replace(/\D/g, '');
    if (d.length < 7) return p || '—';
    return '+' + d.slice(0, 3) + ' •• ••• ' + d.slice(-4, -2) + ' ' + d.slice(-2);
  }
  const fmtDate = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');
  const fmtShortDate = (iso) => (iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4) : '—');
  const fmtMMYY = (iso) => (iso ? iso.slice(5, 7) + '/' + iso.slice(2, 4) : '—');

  function stateOf(m) {
    if (m.status === 'pending' && !m.valid_to) return { state: 'pending', label: 'Очікує активації', left: 0 };
    if (!m.valid_to) return { state: 'expired', label: 'Неактивна', left: 0 };
    const left = daysBetween(todayISO(), m.valid_to);
    if (left < 0) return { state: 'expired', label: 'Неактивна', left };
    if (left <= 5) return { state: 'soon', label: 'Закінчується', left };
    return { state: 'active', label: 'Активна', left };
  }

  function cardUrl(token) {
    const base = location.origin && location.origin !== 'null' ? location.origin + location.pathname.replace(/[^/]*$/, '') : 'https://xfit.com.ua/';
    return base + 'card.html?c=' + encodeURIComponent(token);
  }

  function qrSvg(text) {
    if (typeof qrcode !== 'function') return '';
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  }

  const LOGO = '<svg class="xcard__logo" viewBox="314 60 792 435" aria-label="XFit" role="img"><use class="m" href="#xfMark"/><use class="w" href="#xfWord"/></svg>';

  // Контакти залу — на звороті, як на пластиковій карті
  const GYMS = {
    'Подільськ': ['(050) 011 88 00', 'вул. Соборна 72, корпус Б'],
    'Балта': ['', 'Балта · скоро відкриття'],
  };
  // Візерунок пластикової карти: контурні шеврони й великий «X» (координати — у пропорції карти 1586×1000)
  const chevron = (x, y, w, h, t) => `<path d="M${x} ${y}h${t}l${w - t} ${h / 2}l${-(w - t)} ${h / 2}h${-t}l${w - t} ${-h / 2}z"/>`;
  const bigX = (cx, cy, s, t) => `<path d="M${cx - s + t} ${cy - s}L${cx} ${cy - t}L${cx + s - t} ${cy - s}L${cx + s} ${cy - s + t}L${cx + t} ${cy}L${cx + s} ${cy + s - t}L${cx + s - t} ${cy + s}L${cx} ${cy + t}L${cx - s + t} ${cy + s}L${cx - s} ${cy + s - t}L${cx - t} ${cy}L${cx - s} ${cy - s + t}z"/>`;
  const DECO_FRONT = `<svg class="xc-deco" viewBox="0 0 1586 1000" preserveAspectRatio="none" aria-hidden="true">
    ${[0, 1, 2, 3].map((i) => chevron(1090 + i * 105, 30, 150, 190, 46)).join('')}
    ${chevron(-70, 330, 190, 300, 60)}
    ${bigX(1440, 930, 230, 70)}
  </svg>`;
  const DECO_BACK = `<svg class="xc-deco" viewBox="0 0 1586 1000" preserveAspectRatio="none" aria-hidden="true">
    ${[0, 1, 2].map((i) => chevron(860 + i * 115, 380, 160, 230, 48)).join('')}
    ${chevron(-60, 470, 150, 230, 48)}
  </svg>`;

  // Назва абонемента в один рядок: якщо не вміщається — зменшуємо шрифт (не менше 16px)
  function fitPlan(card) {
    const el = card.querySelector('.xcard__plan');
    if (!el || !el.clientWidth) return;
    el.style.fontSize = '';
    let size = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > el.clientWidth + 1 && size > 16) {
      size -= 1;
      el.style.fontSize = size + 'px';
    }
  }

  function render(el, m) {
    const st = stateOf(m);
    el.classList.add('xcard');
    el.dataset.state = st.state;
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'Карта клієнта XFit. Натисни, щоб перевернути');
    const pending = st.state === 'pending';
    // на карті — лише назва абонемента («PRO»), ціна — у деталях під картою
    const planName = String(m.plan || m.desired_plan || '').split(' — ')[0].trim();
    // на лицьовому боці над назвою вже написано «Абонемент» — не повторюємо його: «Абонемент Місячний» → «Місячний»
    const planShort = planName.replace(/^абонемент\s+/i, '') || planName;
    const no = plasticNo(m.barcode);
    const gym = GYMS[m.gym] || GYMS['Подільськ'];
    const meta = pending ? `${esc(planShort || 'Абонемент')} · чекає оплати` : `${esc(planShort || 'Абонемент')} · до ${esc(fmtShortDate(m.valid_to))}`;
    el.innerHTML = `
      <div class="xcard__inner">
        <div class="xcard__face xcard__front">
          <span class="xc-light" aria-hidden="true"></span>
          ${DECO_FRONT}
          <span class="xcard__status">${st.label}</span>
          <div class="xc-center">${LOGO}<span class="xc-tagline">Твоя нова спортсім'я</span></div>
          <div class="xc-bottom"><span class="xc-meta">${meta}</span>${no ? `<b class="xcard__no">${no}</b>` : ''}</div>
        </div>
        <div class="xcard__face xcard__back">
          <span class="xc-light" aria-hidden="true"></span>
          ${DECO_BACK}
          <div class="xc-back">
            <div class="xcard__qr">${m.token ? qrSvg(cardUrl(m.token)) : ''}</div>
            <div class="xcard__info"><div class="xcard__field"><b>${esc(m.full_name || '—')}</b></div></div>
            ${gym[0] ? `<p class="xc-line"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>${esc(gym[0])}</p>` : ''}
            <p class="xc-line"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>${esc(gym[1])}</p>
          </div>
          <div class="xcard__barcode xc-vbar"><div class="xc-vbar__in"><svg class="xcard__barsvg"></svg>${isBarcode(m.barcode) ? `<span class="xcard__digits">${fmtBarcode(m.barcode)}</span>` : ''}</div></div>
        </div>
      </div>`;
    fitPlan(el);
    const bar = el.querySelector('.xcard__barsvg');
    const ean = isBarcode(m.barcode) ? m.barcode : null;
    if (typeof JsBarcode === 'function' && (ean || m.card_number)) {
      try {
        // EAN-13 — той самий формат, що на пластикових картах (сканер на рецепції читає обидва)
        // білі поля з боків (≥ 11 ширин смужки) — без них сканери не читають код
        JsBarcode(bar, ean || String(m.card_number), { format: ean ? 'EAN13' : 'CODE128', flat: true, displayValue: false, height: 60, margin: 0, marginLeft: 24, marginRight: 24, background: '#ffffff', lineColor: '#060706' });
        bar.removeAttribute('width'); bar.removeAttribute('height'); bar.setAttribute('preserveAspectRatio', 'none');
      } catch (e) { /* штрих-код не намалювався — лишаємо QR */ }
    }
    if (!el.dataset.bound) {
      el.dataset.bound = '1';
      // карта змінює розмір (поворот екрана, поява з прихованого стану) — підганяємо назву ще раз
      if (window.ResizeObserver) new ResizeObserver(() => fitPlan(el)).observe(el);
      // фірмовий шрифт довантажується пізніше й ширший за запасний — підганяємо ще раз
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitPlan(el));
      if (document.fonts) document.fonts.addEventListener('loadingdone', () => fitPlan(el));
      const flip = () => el.classList.toggle('is-flipped');
      el.addEventListener('click', (e) => {
        // на звороті торкання QR чи штрих-коду відкриває його на весь екран
        const code = el.classList.contains('is-flipped') && e.target.closest('.xcard__qr, .xcard__barcode');
        if (code) { openZoom(el, code.classList.contains('xcard__qr') ? 'qr' : 'bar'); return; }
        flip();
      });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
      // блиск за пальцем
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', ((e.clientX - r.left) / r.width) * 100 + '%');
        el.style.setProperty('--my', ((e.clientY - r.top) / r.height) * 100 + '%');
      });
    }
    return st;
  }

  // Режим сканування: білий екран на весь дисплей, великі QR і штрихкод, екран не гасне.
  // Яскравість екрана сайт змінити не може (браузери не дають такого доступу) — біле тло світить найсильніше.
  let scanLock = null;
  function closeZoom() {
    const box = document.getElementById('xcardZoom');
    if (!box || box.hidden) return;
    box.hidden = true;
    document.body.classList.remove('scan-open');
    document.documentElement.classList.remove('no-scroll');
    if (scanLock) scanLock.release().catch(() => {});
    scanLock = null;
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }
  function openZoom(cardEl, kind) {
    let box = document.getElementById('xcardZoom');
    if (!box) {
      box = document.createElement('div');
      box.id = 'xcardZoom';
      box.className = 'xcard-zoom';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', 'Карта для сканування');
      document.body.appendChild(box);
      box.addEventListener('click', closeZoom);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeZoom(); });
      document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && !box.hidden && box.dataset.fs === '1') closeZoom(); });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && !box.hidden && 'wakeLock' in navigator) navigator.wakeLock.request('screen').then((l) => { scanLock = l; }).catch(() => {});
      });
    }
    // та сама карта, лише велика; головне — штрихкод (QR лишається на звороті звичайної карти)
    const bar = cardEl.querySelector('.xcard__barcode');
    const name = (cardEl.querySelector('.xcard__info .xcard__field b') || {}).textContent || '';
    const no = cardEl.querySelector('.xcard__no') ? '№ ' + cardEl.querySelector('.xcard__no').textContent : '';
    const useQr = !bar || !bar.querySelector('rect, path');
    const svg = bar && bar.querySelector('.xcard__barsvg');
    const digits = bar && bar.querySelector('.xcard__digits');
    const code = useQr ? `<div class="scan-card__qr">${(cardEl.querySelector('.xcard__qr') || {}).innerHTML || ''}</div>` : `<div class="xcard__barcode scan-card__bar">${svg.outerHTML}${digits ? digits.outerHTML : ''}</div>`;
    box.innerHTML = `
      <div class="scan-card" data-state="${esc(cardEl.dataset.state || '')}">
        <div class="xcard__face scan-card__face">
          <div class="xcard__grid"></div>
          ${DECO_FRONT}
          <div class="scan-card__top">${LOGO}<span class="scan-card__name">${esc(name)}${no ? `<small>${esc(no)}</small>` : ''}</span></div>
          ${code}
          <p class="scan-card__tip">Підніми яскравість екрана · торкнись, щоб закрити</p>
        </div>
      </div>`;
    box.hidden = false;
    document.body.classList.add('scan-open');
    document.documentElement.classList.add('no-scroll'); // Safari: блокуємо прокрутку й на <html>
    box.dataset.fs = '0';
    if (box.requestFullscreen && !document.fullscreenElement) {
      box.requestFullscreen({ navigationUI: 'hide' }).then(() => { box.dataset.fs = '1'; }).catch(() => {});
    }
    if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then((l) => { scanLock = l; }).catch(() => {});
  }

  root.XFitCard = { openZoom, render, stateOf, newCardNumber, newToken, groupNumber, maskPhone, fmtDate, cardUrl, todayISO, daysBetween, isBarcode, newBarcode, fmtBarcode, plasticNo };

  /* ============================================================
     Сторінка card.html
     ============================================================ */
  const page = document.getElementById('cardPage');
  if (!page) return;

  const CACHE_KEY = 'xfit_card_v1';
  const params = new URLSearchParams(location.search);
  const token = params.get('c');
  const demo = params.has('demo');

  const DEMO = {
    token: 'demo', card_number: '2026408153371829', barcode: '2510000042156', full_name: 'Олена Коваленко', phone: '+380671234567',
    plan: 'Повний', valid_from: todayISO(), valid_to: new Date(Date.now() + 23 * DAY).toISOString().slice(0, 10), gym: 'Подільськ',
  };

  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { return null; }
  }
  function writeCache(m) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...m, fetched_at: Date.now() })); } catch (e) { /* ignore */ }
  }

  function show(m, opts = {}) {
    const cardEl = document.getElementById('xcard');
    const st = render(cardEl, m);
    const wrap = document.getElementById('cardWrap');
    wrap.dataset.state = st.state;
    wrap.hidden = false;
    document.querySelector('.card-flip-hint').hidden = false;
    document.getElementById('scanModeBtn').hidden = false;
    document.getElementById('cardState').hidden = true;
    document.getElementById('regForm').hidden = true;
    document.getElementById('loginForm').hidden = true;
    document.getElementById('shareLink').hidden = !!opts.demo || !m.token;
    const details = document.getElementById('cardDetails');
    details.hidden = false;
    // кнопки таймера й «Моїх тренувань»: відкриваються з активною картою
    const apps = document.getElementById('cardApps');
    apps.hidden = false;
    // пластикову карту можна додати до віртуальної (крім демо й уже доданої)
    shownMember = m;
    const plasticLink = document.getElementById('plasticLink');
    plasticLink.hidden = !!opts.demo || !m.token || m.barcode_source === 'plastic';
    if (plasticLink.hidden && linkPlastic) linkPlastic.stop();
    apps.classList.toggle('is-locked', st.state !== 'active');
    const note = document.getElementById('cardNote');
    if (st.state === 'pending') {
      details.innerHTML = `
        <div class="card-row"><span>Статус</span><b>Чекає оплати на рецепції</b></div>
        <div class="card-row"><span>Обраний абонемент</span><b>${esc(m.desired_plan || m.plan || '—')}</b></div>
        ${m.gym ? `<div class="card-row"><span>Зал</span><b>${esc(m.gym)}</b></div>` : ''}`;
      note.textContent = opts.offline ? 'Немає з\'єднання — показано збережену карту.' : 'Оплати абонемент на рецепції XFit (готівкою або карткою) — адміністратор активує карту, і тут з\'являться дати абонемента. Після активації відкриються таймер і «Мої тренування».';
      document.getElementById('demoBadge').hidden = !opts.demo;
      return;
    }
    const total = m.valid_from && m.valid_to ? Math.max(1, daysBetween(m.valid_from, m.valid_to)) : 1;
    const leftPct = Math.max(0, Math.min(100, (st.left / total) * 100));
    details.innerHTML = `
      <div class="card-progress">
        <div class="card-progress__label"><span>${st.state === 'expired' ? 'Абонемент закінчився' : 'Залишилось'}</span><b>${st.state === 'expired' ? fmtDate(m.valid_to) : st.left + ' ' + plural(st.left, ['день', 'дні', 'днів'])}</b></div>
        <div class="card-progress__bar"><i style="width:${leftPct}%"></i></div>
      </div>
      <div class="card-row"><span>Абонемент</span><b>${esc(m.plan || '—')}</b></div>
      <div class="card-row"><span>Діє</span><b>${esc(fmtShortDate(m.valid_from))} — ${esc(fmtShortDate(m.valid_to))}</b></div>
      ${m.gym ? `<div class="card-row"><span>Зал</span><b>${esc(m.gym)}</b></div>` : ''}`;
    note.textContent = opts.offline
      ? 'Немає з\'єднання — показано збережену карту' + (m.fetched_at ? ' від ' + new Date(m.fetched_at).toLocaleDateString('uk-UA') : '') + '.'
      : st.state === 'expired' ? 'Щоб продовжити абонемент, звернись на рецепцію або залиш заявку на сайті.' : 'Збільш яскравість екрана, щоб QR-код легше сканувався.';
    document.getElementById('demoBadge').hidden = !opts.demo;
  }

  document.getElementById('scanModeBtn').addEventListener('click', () => openZoom(document.getElementById('xcard'), 'bar'));

  /* ---------- Повторний вхід (новий телефон, очищений браузер) ---------- */
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const loginPlastic = mountPlastic(document.getElementById('loginPlastic'));
  let loginWay = 'plastic';
  function switchForm(toLogin) {
    document.getElementById('regForm').hidden = toLogin;
    loginForm.hidden = !toLogin;
    if (!toLogin) loginPlastic.stop();
    regPlastic.stop();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  document.getElementById('toLogin').addEventListener('click', () => switchForm(true));
  document.getElementById('toReg').addEventListener('click', () => switchForm(false));
  loginForm.querySelectorAll('[data-way]').forEach((b) => b.addEventListener('click', () => {
    loginWay = b.dataset.way;
    loginForm.querySelectorAll('[data-way]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    document.getElementById('loginPlastic').hidden = loginWay !== 'plastic';
    document.getElementById('loginBirth').hidden = loginWay !== 'birth';
    if (loginWay !== 'plastic') loginPlastic.stop();
  }));
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const phone = normalizePhone(loginForm.elements.phone.value);
    const birth = loginForm.elements.birth_date.value;
    const code = loginWay === 'plastic' ? loginPlastic.value() : '';
    if (phone.length < 11 || phone.length > 13) { loginForm.elements.phone.focus(); loginError.textContent = 'Вкажи номер телефону, напр. +380 67 123 45 67.'; return; }
    if (loginWay === 'plastic' && !loginPlastic.valid()) { loginPlastic.focus(); loginError.textContent = 'Відскануй штрихкод пластикової карти або введи 13 цифр під ним.'; return; }
    if (loginWay === 'birth' && !birth) { loginForm.elements.birth_date.focus(); loginError.textContent = 'Вкажи дату народження.'; return; }
    const btn = document.getElementById('loginSubmit');
    btn.disabled = true;
    btn.textContent = 'Шукаємо карту…';
    try {
      let m = null;
      const url = window.XFIT_SUPABASE_URL || '';
      const key = window.XFIT_SUPABASE_ANON_KEY || '';
      if (window.supabase && url && key && !url.includes('YOUR-PROJECT')) {
        const sb = window.supabase.createClient(url, key);
        const { data, error } = await sb.rpc('restore_member_card', { p_phone: '+' + phone, p_barcode: code || null, p_birth_date: loginWay === 'birth' ? birth : null });
        if (error) {
          if (/too_many_attempts/.test(error.message)) throw new Error('Забагато спроб. Спробуй завтра або звернись на рецепцію XFit.');
          throw new Error('Не вдалося перевірити дані. Перевір інтернет і спробуй ще раз.');
        }
        if (data) m = (await fetchRemote(data)).member;
      } else {
        const list = JSON.parse(localStorage.getItem('xfit_members_v1') || '[]');
        m = list.find((x) => String(x.phone || '').replace(/\D/g, '').slice(-9) === phone.slice(-9)
          && ((code && x.barcode === code) || (birth && x.birth_date === birth))) || null;
      }
      if (!m) throw new Error(loginWay === 'plastic'
        ? 'Карту з таким телефоном і штрихкодом не знайдено. Перевір номер телефону й цифри під штрихкодом.'
        : 'Карту з таким телефоном і датою народження не знайдено. Спробуй через пластикову карту або звернись на рецепцію.');
      writeCache(m);
      loginPlastic.stop();
      show(m);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      loginError.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Увійти';
    }
  });

  // Посилання на карту — щоб відкрити її на новому телефоні (надіслати собі в Telegram, Viber, нотатки)
  document.getElementById('shareLink').addEventListener('click', async (e) => {
    const m = shownMember;
    if (!m || !m.token) return;
    const link = cardUrl(m.token);
    const btn = e.currentTarget;
    if (navigator.share) {
      try { await navigator.share({ title: 'Моя карта XFit', text: 'Моя карта клієнта XFit — відкрий посилання на новому телефоні:', url: link }); return; } catch (err) { if (err && err.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(link); btn.textContent = 'Посилання скопійовано ✓'; }
    catch (err) { prompt('Скопіюй посилання на свою карту:', link); }
    setTimeout(() => { btn.textContent = 'Зберегти посилання на карту'; }, 2500);
  });

  /* ---------- Додати пластикову карту до вже створеної віртуальної ---------- */
  let shownMember = null;
  let linkPlastic = null;
  const linkBox = document.getElementById('linkPlastic');
  document.getElementById('plasticOpen').addEventListener('click', () => {
    if (!linkPlastic) {
      linkPlastic = mountPlastic(linkBox, { action: 'Додати карту' });
      linkBox.querySelector('.plastic__save').addEventListener('click', saveLink);
    }
    linkBox.hidden = !linkBox.hidden;
    if (linkBox.hidden) linkPlastic.stop();
  });
  async function saveLink() {
    const m = shownMember;
    const code = linkPlastic.value();
    const st = linkPlastic.status;
    if (!m || !linkPlastic.valid()) { st.className = 'plastic__status is-bad'; st.textContent = 'Відскануй штрихкод або введи 13 цифр під ним.'; return; }
    const btn = linkBox.querySelector('.plastic__save');
    btn.disabled = true;
    try {
      const url = window.XFIT_SUPABASE_URL || '';
      const key = window.XFIT_SUPABASE_ANON_KEY || '';
      let fresh;
      if (window.supabase && url && key && !url.includes('YOUR-PROJECT')) {
        const sb = window.supabase.createClient(url, key);
        const { error } = await sb.rpc('link_member_barcode', { p_token: m.token, p_barcode: code });
        if (error) {
          if (/barcode_exists/.test(error.message)) throw new Error('Ця пластикова карта вже додана в додаток іншим клієнтом. Звернись на рецепцію XFit.');
          if (/invalid_barcode/.test(error.message)) throw new Error('Номер не розпізнано — перевір 13 цифр під штрихкодом.');
          throw new Error('Не вдалося додати карту. Перевір інтернет і спробуй ще раз.');
        }
        const res = await fetchRemote(m.token);
        fresh = res.member || { ...m, barcode: code, barcode_source: 'plastic' };
      } else {
        const list = JSON.parse(localStorage.getItem('xfit_members_v1') || '[]');
        if (list.some((x) => x.barcode === code && x.token !== m.token)) throw new Error('Ця пластикова карта вже додана в додаток іншим клієнтом. Звернись на рецепцію XFit.');
        list.forEach((x) => { if (x.token === m.token) { x.barcode = code; x.barcode_source = 'plastic'; } });
        localStorage.setItem('xfit_members_v1', JSON.stringify(list));
        fresh = { ...m, barcode: code, barcode_source: 'plastic' };
      }
      writeCache(fresh);
      linkPlastic.stop();
      linkBox.hidden = true;
      show(fresh);
      document.getElementById('xcard').classList.add('is-flipped'); // показуємо зворот зі штрихкодом
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      st.className = 'plastic__status is-bad';
      st.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  }

  function plural(n, f) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return f[2];
    if (b > 1 && b < 5) return f[1];
    if (b === 1) return f[0];
    return f[2];
  }

  function showState(title, text, withForm) {
    document.getElementById('cardWrap').hidden = true;
    document.getElementById('cardDetails').hidden = true;
    document.getElementById('cardApps').hidden = true;
    document.querySelector('.card-flip-hint').hidden = true;
    document.getElementById('scanModeBtn').hidden = true;
    const box = document.getElementById('cardState');
    box.hidden = !title;
    if (title) box.innerHTML = `<h2>${esc(title)}</h2><p>${esc(text)}</p>`;
    document.getElementById('regForm').hidden = !withForm;
    document.getElementById('loginForm').hidden = true;
    document.getElementById('shareLink').hidden = true;
  }

  async function fetchRemote(t) {
    const url = window.XFIT_SUPABASE_URL || '';
    const key = window.XFIT_SUPABASE_ANON_KEY || '';
    if (!window.supabase || !url || !key || url.includes('YOUR-PROJECT')) return { unavailable: true };
    const sb = window.supabase.createClient(url, key);
    const { data, error } = await sb.rpc('get_member_card', { p_token: t });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return row ? { member: { ...row, token: t } } : { member: null };
  }

  function fromLocalAdmin(t) {
    // локальний режим адмінки (без Supabase): клієнти лежать у цьому ж браузері
    try {
      const list = JSON.parse(localStorage.getItem('xfit_members_v1') || '[]');
      return list.find((m) => m.token === t) || null;
    } catch (e) { return null; }
  }

  (async () => {
    if (demo) {
      show(params.get('demo') === 'pending' ? { ...DEMO, plan: '', valid_from: null, valid_to: null, status: 'pending' } : DEMO, { demo: true });
      return;
    }
    const cached = readCache();
    const t = token || (cached && cached.token);
    if (!t) {
      showState('', '', true);
      return;
    }
    if (cached && cached.token === t) show(cached, { offline: !navigator.onLine });
    try {
      const res = await fetchRemote(t);
      let m = res.member;
      if (res.unavailable) m = fromLocalAdmin(t);
      if (m) {
        writeCache(m);
        show(m);
        if (token) history.replaceState(null, '', 'card.html'); // посилання вже збережено — прибираємо код з адреси
      } else if (!(cached && cached.token === t)) {
        showState('Карту не знайдено', 'Посилання недійсне або карту видалено. Можеш зареєструватися заново нижче або звернутися на рецепцію XFit.', true);
      }
    } catch (e) {
      if (!(cached && cached.token === t)) showState('Немає з\'єднання', 'Відкрий карту, коли з\'явиться інтернет, — після цього вона працюватиме й офлайн.');
    }
  })();

  /* ---------- Абонементи для форми: ті самі, що в розділі «Абонементи» на сайті ---------- */
  async function loadPlans() {
    const select = document.getElementById('regPlan');
    if (!select) return;
    const DEFAULT_IDS = ['price1', 'price2', 'price3'];
    let ids = DEFAULT_IDS;
    let content = {};
    try {
      const lists = JSON.parse(localStorage.getItem('xfit_lists_v1') || '{}');
      if (Array.isArray(lists.pricing)) ids = lists.pricing;
      content = JSON.parse(localStorage.getItem('xfit_content_v1') || '{}');
    } catch (e) { /* ignore */ }
    const url = window.XFIT_SUPABASE_URL || '';
    const key = window.XFIT_SUPABASE_ANON_KEY || '';
    if (window.supabase && url && key && !url.includes('YOUR-PROJECT')) {
      try {
        const sb = window.supabase.createClient(url, key);
        const lst = await sb.from('site_settings').select('value').eq('key', 'list:pricing');
        if (!lst.error && lst.data && lst.data[0]) ids = JSON.parse(lst.data[0].value);
        const keys = ids.flatMap((id) => [id + '.name', id + '.amount', id + '.period']);
        const rows = await sb.from('site_content').select('key,value').in('key', keys);
        if (!rows.error) rows.data.forEach((r) => { content[r.key] = r.value; });
      } catch (e) { /* лишаємо типові */ }
    }
    const DEFAULTS = { price1: ['Старт', '499₴'], price2: ['Повний', '799₴'], price3: ['PRO', '1299₴'] };
    const options = ids.map((id) => {
      const name = content[id + '.name'] || (DEFAULTS[id] || [])[0];
      const amount = content[id + '.amount'] || (DEFAULTS[id] || [])[1];
      // період як на сайті: «/міс», «/рік» або порожньо (разове тренування)
      const period = (id + '.period') in content ? content[id + '.period'] : '/міс';
      return name ? name + (amount ? ' — ' + amount + period : '') : null;
    }).filter(Boolean);
    if (!options.length) return;
    const prev = select.value;
    select.innerHTML = options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
    select.value = options.includes(prev) ? prev : (options[1] || options[0]);
  }
  loadPlans();

  /* ---------- Пластикова карта: сканування штрихкоду або ввід цифр ---------- */
  function mountPlastic(box, opts = {}) {
    box.innerHTML = `
      <p class="plastic__lead">Відскануй штрихкод на звороті пластикової карти або введи 13 цифр під ним.</p>
      <div class="plastic__cam" hidden><video aria-label="Камера"></video><span class="plastic__frame" aria-hidden="true"></span></div>
      <button type="button" class="btn btn--ghost btn--block plastic__scan">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 9v6M10 9v6M12.5 9v6M15 9v6M17 9v6"/></svg>
        <span>Сканувати камерою</span>
      </button>
      <label class="reg__field"><span>Цифри під штрихкодом</span><input class="plastic__input" inputmode="numeric" autocomplete="off" maxlength="15" placeholder="2 500000 005053"></label>
      <p class="plastic__status" role="status"></p>
      ${opts.action ? `<button type="button" class="btn btn--primary btn--block plastic__save">${esc(opts.action)}</button>` : ''}`;
    const input = box.querySelector('.plastic__input');
    const status = box.querySelector('.plastic__status');
    const cam = box.querySelector('.plastic__cam');
    const scanBtn = box.querySelector('.plastic__scan');
    let stopCam = null;
    const value = () => input.value.replace(/\D/g, '');
    function check() {
      const v = value();
      status.className = 'plastic__status';
      if (!v) { status.textContent = ''; return; }
      if (v.length < 13) { status.textContent = `Ще ${13 - v.length} ${plural(13 - v.length, ['цифра', 'цифри', 'цифр'])}`; return; }
      if (isBarcode(v)) { status.textContent = '✓ Карту розпізнано'; status.classList.add('is-ok'); }
      else { status.textContent = 'Цифри не сходяться — перевір ще раз. Номер карти XFit має 13 цифр і починається з 2.'; status.classList.add('is-bad'); }
    }
    function setValue(v) { input.value = fmtBarcode(v); check(); }
    function stop() {
      if (stopCam) stopCam();
      stopCam = null;
      cam.hidden = true;
      scanBtn.querySelector('span').textContent = 'Сканувати камерою';
    }
    input.addEventListener('input', () => {
      const d = value().slice(0, 13);
      input.value = d.length === 13 ? fmtBarcode(d) : d;
      check();
    });
    scanBtn.addEventListener('click', async () => {
      if (stopCam) { stop(); return; }
      if (!window.XFitScanner) { status.textContent = 'Сканер недоступний — введи цифри вручну.'; return; }
      cam.hidden = false;
      scanBtn.querySelector('span').textContent = 'Закрити камеру';
      status.className = 'plastic__status';
      status.textContent = 'Наведи камеру на штрихкод — він розпізнається сам';
      try {
        stopCam = await window.XFitScanner.start(cam.querySelector('video'), ['ean_13'], (code) => {
          const d = String(code).replace(/\D/g, '');
          if (!isBarcode(d)) return; // інший штрихкод (напр. товар) — чекаємо далі
          if (navigator.vibrate) navigator.vibrate(120);
          setValue(d);
          stop();
        });
      } catch (err) {
        stop();
        status.className = 'plastic__status is-bad';
        status.textContent = window.XFitScanner.errorText(err);
      }
    });
    return { value, valid: () => isBarcode(value()), stop, setValue, focus: () => input.focus(), status };
  }

  /* ---------- Реєстрація клієнта ---------- */
  const regForm = document.getElementById('regForm');
  const regError = document.getElementById('regError');
  const hasPlastic = document.getElementById('hasPlastic');
  const regPlasticBox = document.getElementById('regPlastic');
  const regPlastic = mountPlastic(regPlasticBox);
  hasPlastic.addEventListener('change', () => {
    regPlasticBox.hidden = !hasPlastic.checked;
    if (!hasPlastic.checked) regPlastic.stop();
  });
  function normalizePhone(v) {
    let d = String(v || '').replace(/\D/g, '');
    if (d.length === 10 && d[0] === '0') d = '38' + d;      // 067… → 38067…
    if (d.length === 9) d = '380' + d;                      // 67… → 38067…
    return d;
  }
  async function registerRemote(f) {
    const url = window.XFIT_SUPABASE_URL || '';
    const key = window.XFIT_SUPABASE_ANON_KEY || '';
    if (!window.supabase || !url || !key || url.includes('YOUR-PROJECT')) return null;
    const sb = window.supabase.createClient(url, key);
    const { data, error } = await sb.rpc('register_member', {
      p_full_name: f.full_name, p_phone: '+' + f.phone, p_gym: f.gym, p_birth_date: f.birth_date || null, p_email: f.email, p_plan: f.plan,
      p_barcode: f.barcode || null,
    });
    if (error) {
      if (/barcode_exists/.test(error.message)) throw new Error('Ця пластикова карта вже додана в додаток. Якщо це твоя карта — звернись на рецепцію XFit.');
      if (/invalid_barcode/.test(error.message)) throw new Error('Номер пластикової карти не розпізнано — перевір 13 цифр під штрихкодом.');
      if (/phone_exists/.test(error.message)) throw new Error('Цей номер уже зареєстровано. Якщо загубив посилання на свою карту — звернись на рецепцію XFit.');
      if (/too_many_requests/.test(error.message)) throw new Error('Зараз забагато реєстрацій. Спробуй за годину або звернись на рецепцію.');
      if (/invalid_data/.test(error.message)) throw new Error('Перевір імʼя та номер телефону.');
      throw new Error('Не вдалося зареєструватися. Спробуй ще раз трохи згодом.');
    }
    const row = Array.isArray(data) ? data[0] : data;
    const res = await fetchRemote(row.token);
    return res.member || { token: row.token, card_number: row.card_number, full_name: f.full_name, gym: f.gym, status: 'pending', desired_plan: f.plan };
  }
  function registerLocal(f) {
    // локальний режим (Supabase не налаштовано) — клієнт зберігається в цьому браузері
    let list = [];
    try { list = JSON.parse(localStorage.getItem('xfit_members_v1') || '[]'); } catch (e) { list = []; }
    if (list.some((m) => String(m.phone || '').replace(/\D/g, '').slice(-9) === f.phone.slice(-9))) throw new Error('Цей номер уже зареєстровано. Якщо загубив посилання на свою карту — звернись на рецепцію XFit.');
    if (f.barcode && list.some((m) => m.barcode === f.barcode)) throw new Error('Ця пластикова карта вже додана в додаток. Якщо це твоя карта — звернись на рецепцію XFit.');
    const m = {
      id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()), card_number: newCardNumber(), token: newToken() + newToken(),
      barcode: f.barcode || newBarcode(), barcode_source: f.barcode ? 'plastic' : 'app',
      full_name: f.full_name, phone: '+' + f.phone, gym: f.gym, birth_date: f.birth_date || null, email: f.email,
      plan: '', desired_plan: f.plan, valid_from: null, valid_to: null, status: 'pending', consent_at: new Date().toISOString(), created_at: new Date().toISOString(),
    };
    list.unshift(m);
    localStorage.setItem('xfit_members_v1', JSON.stringify(list));
    return m;
  }
  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    regError.textContent = '';
    const fd = new FormData(regForm);
    if (fd.get('website')) return; // бот заповнив приховане поле
    const f = {
      full_name: String(fd.get('full_name') || '').trim().replace(/\s+/g, ' '),
      phone: normalizePhone(fd.get('phone')),
      birth_date: String(fd.get('birth_date') || ''),
      email: String(fd.get('email') || '').trim(),
      gym: String(fd.get('gym') || ''),
      plan: String(fd.get('plan') || ''),
      barcode: hasPlastic.checked ? regPlastic.value() : '',
    };
    const bad = (name, msg) => { const el = regForm.elements[name]; el.setAttribute('aria-invalid', 'true'); el.focus(); regError.textContent = msg; };
    regForm.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    if (f.full_name.length < 3 || !/\s/.test(f.full_name)) return bad('full_name', 'Вкажи прізвище та імʼя.');
    if (f.phone.length < 11 || f.phone.length > 13) return bad('phone', 'Вкажи номер телефону, напр. +380 67 123 45 67.');
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return bad('email', 'Перевір email або залиш поле порожнім.');
    if (f.birth_date && (f.birth_date > todayISO() || f.birth_date < '1920-01-01')) return bad('birth_date', 'Перевір дату народження.');
    if (hasPlastic.checked && !regPlastic.valid()) { regPlastic.focus(); regError.textContent = 'Відскануй штрихкод пластикової карти або введи 13 цифр під ним.'; return; }
    if (!fd.get('consent')) { regError.textContent = 'Потрібна згода на обробку персональних даних.'; return; }
    const submit = document.getElementById('regSubmit');
    submit.disabled = true;
    submit.textContent = 'Створюємо карту…';
    try {
      const m = (await registerRemote(f)) || registerLocal(f);
      writeCache(m);
      document.getElementById('cardState').hidden = true;
      show(m);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      regError.textContent = err.message;
    } finally {
      submit.disabled = false;
      submit.textContent = 'Отримати карту';
    }
  });

  // Кнопка «Встановити»: Android/Chrome — системне вікно, iPhone — підказка
  const installBtn = document.querySelector('[data-install]');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let deferred = null;
  if (installBtn && !standalone) {
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; installBtn.hidden = false; });
    if (isIOS) installBtn.hidden = false;
    installBtn.addEventListener('click', async () => {
      if (deferred) {
        deferred.prompt();
        const { outcome } = await deferred.userChoice;
        deferred = null;
        if (outcome === 'accepted') installBtn.hidden = true;
      } else if (isIOS) {
        document.getElementById('cardNote').textContent = 'У Safari натисни «Поділитися» внизу екрана → «На екран "Додому"» → «Додати».';
      }
    });
  }

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {}));
  }
})(window);
