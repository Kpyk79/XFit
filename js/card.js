/* ============================================================
   XFit — віртуальна карта клієнта.
   XFitCard.render(el, member) малює карту (лицьова: логотип, чип,
   номер, власник, дійсна до; зворотна: QR-код і штрих-код).
   На сторінці card.html карта відкривається за особистим посиланням
   card.html?c=<код>: дані беруться з Supabase і зберігаються на
   телефоні, щоб карта показувалась і без інтернету.
   ============================================================ */
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DAY = 86400000;

  function todayISO() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / DAY);

  // Номер карти: 16 цифр з контрольною цифрою Луна, як у банківських карт
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
  const NFC = '<svg class="xcard__nfc" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 7.5a6 6 0 0 1 0 9M12 5a9.5 9.5 0 0 1 0 14M15.5 2.5a13 13 0 0 1 0 19"/></svg>';

  function render(el, m) {
    const st = stateOf(m);
    el.classList.add('xcard');
    el.dataset.state = st.state;
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'Карта клієнта XFit. Натисни, щоб перевернути');
    el.innerHTML = `
      <div class="xcard__inner">
        <div class="xcard__face xcard__front">
          <div class="xcard__grid"></div>
          <svg class="xcard__watermark" viewBox="314 60 540 430" aria-hidden="true"><use href="#xfMark"/></svg>
          <div class="xcard__top">${LOGO}<span class="xcard__plan">${esc(m.plan || 'Абонемент')}</span></div>
          <div class="xcard__mid"><span class="xcard__chip"></span>${NFC}<span class="xcard__status" style="margin-left:auto">${st.label}</span></div>
          <div class="xcard__number">${esc(groupNumber(m.card_number))}</div>
          <div class="xcard__bottom">
            <div class="xcard__field"><span>Власник карти</span><b>${esc(m.full_name || '—')}</b></div>
            <div class="xcard__field xcard__field--right"><span>Дійсна до</span><b>${esc(fmtMMYY(m.valid_to))}</b></div>
          </div>
        </div>
        <div class="xcard__face xcard__back">
          <div class="xcard__grid"></div>
          <div class="xcard__stripe"></div>
          <div class="xcard__backbody">
            <div class="xcard__qr">${m.token ? qrSvg(cardUrl(m.token)) : ''}</div>
            <div class="xcard__info">
              <div class="xcard__field"><span>Власник</span><b>${esc(m.full_name || '—')}</b></div>
              <div class="xcard__field"><span>Телефон</span><b>${esc(m.phone_masked || maskPhone(m.phone))}</b></div>
              <p class="xcard__hint">Покажи QR-код або штрих-код на рецепції XFit</p>
            </div>
          </div>
          <div class="xcard__barcode"><svg class="xcard__barsvg"></svg><span class="xcard__barnum">${esc(m.card_number || '')}</span></div>
        </div>
      </div>`;
    const bar = el.querySelector('.xcard__barsvg');
    if (typeof JsBarcode === 'function' && m.card_number) {
      try {
        JsBarcode(bar, String(m.card_number), { format: 'CODE128', displayValue: false, height: 60, margin: 0, background: '#ffffff', lineColor: '#060706' });
        bar.removeAttribute('width'); bar.removeAttribute('height'); bar.setAttribute('preserveAspectRatio', 'none');
      } catch (e) { /* штрих-код не намалювався — лишаємо QR */ }
    }
    if (!el.dataset.bound) {
      el.dataset.bound = '1';
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

  // Великий код на білому тлі — легше сканувати на рецепції
  function openZoom(cardEl, kind) {
    let box = document.getElementById('xcardZoom');
    if (!box) {
      box = document.createElement('div');
      box.id = 'xcardZoom';
      box.className = 'xcard-zoom';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', 'Код карти');
      document.body.appendChild(box);
      box.addEventListener('click', () => { box.hidden = true; });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') box.hidden = true; });
    }
    const src = cardEl.querySelector(kind === 'qr' ? '.xcard__qr' : '.xcard__barcode');
    box.innerHTML = `<div class="xcard-zoom__sheet xcard-zoom__sheet--${kind}">${src.innerHTML}</div><p>Торкнись, щоб закрити</p>`;
    box.hidden = false;
  }

  root.XFitCard = { render, stateOf, newCardNumber, newToken, groupNumber, maskPhone, fmtDate, cardUrl, todayISO, daysBetween };

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
    token: 'demo', card_number: '2026408153371829', full_name: 'Олена Коваленко', phone: '+380671234567',
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
    document.getElementById('cardState').hidden = true;
    const total = m.valid_from && m.valid_to ? Math.max(1, daysBetween(m.valid_from, m.valid_to)) : 1;
    const leftPct = Math.max(0, Math.min(100, (st.left / total) * 100));
    document.getElementById('cardDetails').innerHTML = `
      <div class="card-progress">
        <div class="card-progress__label"><span>${st.state === 'expired' ? 'Абонемент закінчився' : 'Залишилось'}</span><b>${st.state === 'expired' ? fmtDate(m.valid_to) : st.left + ' ' + plural(st.left, ['день', 'дні', 'днів'])}</b></div>
        <div class="card-progress__bar"><i style="width:${leftPct}%"></i></div>
      </div>
      <div class="card-row"><span>Абонемент</span><b>${esc(m.plan || '—')}</b></div>
      <div class="card-row"><span>Діє</span><b>${esc(fmtShortDate(m.valid_from))} — ${esc(fmtShortDate(m.valid_to))}</b></div>
      <div class="card-row"><span>Номер карти</span><b>${esc(groupNumber(m.card_number))}</b></div>
      ${m.gym ? `<div class="card-row"><span>Зал</span><b>${esc(m.gym)}</b></div>` : ''}`;
    const note = document.getElementById('cardNote');
    note.textContent = opts.offline
      ? 'Немає з\'єднання — показано збережену карту' + (m.fetched_at ? ' від ' + new Date(m.fetched_at).toLocaleDateString('uk-UA') : '') + '.'
      : st.state === 'expired' ? 'Щоб продовжити абонемент, звернись на рецепцію або залиш заявку на сайті.' : 'Збільш яскравість екрана, щоб QR-код легше сканувався.';
    document.getElementById('demoBadge').hidden = !opts.demo;
  }

  function plural(n, f) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return f[2];
    if (b > 1 && b < 5) return f[1];
    if (b === 1) return f[0];
    return f[2];
  }

  function showState(title, text) {
    document.getElementById('cardWrap').hidden = true;
    const box = document.getElementById('cardState');
    box.hidden = false;
    box.innerHTML = `<h2>${esc(title)}</h2><p>${esc(text)}</p>`;
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
    if (demo) { show(DEMO, { demo: true }); return; }
    const cached = readCache();
    const t = token || (cached && cached.token);
    if (!t) {
      showState('Карти ще немає', 'Відкрий особисте посилання на карту, яке тобі надіслали в XFit, — і карта збережеться в додатку.');
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
        showState('Карту не знайдено', 'Посилання недійсне або карту видалено. Звернись на рецепцію XFit.');
      }
    } catch (e) {
      if (!(cached && cached.token === t)) showState('Немає з\'єднання', 'Відкрий карту, коли з\'явиться інтернет, — після цього вона працюватиме й офлайн.');
    }
  })();

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
