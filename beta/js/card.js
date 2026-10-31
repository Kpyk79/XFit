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
    el.innerHTML = `
      <div class="xcard__inner">
        <div class="xcard__face xcard__front">
          <div class="xcard__grid"></div>
          <span class="xcard__band" aria-hidden="true"></span>
          <svg class="xcard__watermark" viewBox="314 60 540 430" aria-hidden="true"><use href="#xfMark"/></svg>
          <div class="xcard__top">${LOGO}<span class="xcard__status">${st.label}</span></div>
          <div class="xcard__plan-block">
            <span class="xcard__kicker">${pending ? 'Обраний абонемент' : 'Абонемент'}</span>
            <b class="xcard__plan">${esc(planShort || (pending ? 'Ще не обрано' : '—'))}</b>
          </div>
          <div class="xcard__bottom">
            <div class="xcard__field"><span>Клієнт XFit</span><b>${esc(m.full_name || '—')}</b></div>
            <div class="xcard__field xcard__field--right"><span>${pending ? 'Активація' : 'Діє до'}</span><b>${pending ? 'після оплати' : esc(fmtShortDate(m.valid_to))}</b></div>
          </div>
        </div>
        <div class="xcard__face xcard__back">
          <div class="xcard__grid"></div>
          <div class="xcard__backbody">
            <div class="xcard__qr">${m.token ? qrSvg(cardUrl(m.token)) : ''}</div>
            <div class="xcard__info">
              <div class="xcard__field"><span>Клієнт</span><b>${esc(m.full_name || '—')}</b></div>
              <div class="xcard__field"><span>${pending ? 'Обрано' : 'Абонемент'}</span><b>${esc(planName || '—')}</b></div>
              <p class="xcard__hint">${pending ? 'Оплати абонемент на рецепції — адміністратор активує карту' : 'Покажи QR-код або штрих-код на рецепції'}</p>
            </div>
          </div>
          <div class="xcard__barcode"><svg class="xcard__barsvg"></svg></div>
        </div>
      </div>`;
    fitPlan(el);
    const bar = el.querySelector('.xcard__barsvg');
    if (typeof JsBarcode === 'function' && m.card_number) {
      try {
        JsBarcode(bar, String(m.card_number), { format: 'CODE128', displayValue: false, height: 60, margin: 0, background: '#ffffff', lineColor: '#060706' });
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
    document.querySelector('.card-flip-hint').hidden = false;
    document.getElementById('cardState').hidden = true;
    document.getElementById('regForm').hidden = true;
    const details = document.getElementById('cardDetails');
    details.hidden = false;
    // кнопки таймера й «Моїх тренувань»: відкриваються з активною картою
    const apps = document.getElementById('cardApps');
    apps.hidden = false;
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
    const box = document.getElementById('cardState');
    box.hidden = !title;
    if (title) box.innerHTML = `<h2>${esc(title)}</h2><p>${esc(text)}</p>`;
    document.getElementById('regForm').hidden = !withForm;
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

  /* ---------- Реєстрація клієнта ---------- */
  const regForm = document.getElementById('regForm');
  const regError = document.getElementById('regError');
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
    });
    if (error) {
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
    const m = {
      id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()), card_number: newCardNumber(), token: newToken() + newToken(),
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
    };
    const bad = (name, msg) => { const el = regForm.elements[name]; el.setAttribute('aria-invalid', 'true'); el.focus(); regError.textContent = msg; };
    regForm.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    if (f.full_name.length < 3 || !/\s/.test(f.full_name)) return bad('full_name', 'Вкажи прізвище та імʼя.');
    if (f.phone.length < 11 || f.phone.length > 13) return bad('phone', 'Вкажи номер телефону, напр. +380 67 123 45 67.');
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return bad('email', 'Перевір email або залиш поле порожнім.');
    if (f.birth_date && (f.birth_date > todayISO() || f.birth_date < '1920-01-01')) return bad('birth_date', 'Перевір дату народження.');
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
