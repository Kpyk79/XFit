/* ============================================================
   XFit — адмінка: дані клієнтів і віртуальних карт.
   Інтерфейс — у js/admin-console.js; тут лише робота з даними.
   Хмарний режим: таблиця members у Supabase (див. supabase-schema.sql).
   Локальний режим: клієнти зберігаються в цьому браузері.
   ============================================================ */
(function () {
  const A = () => window.XFitAdmin || {};
  const C = () => window.XFitCard;
  const LOCAL_KEY = 'xfit_members_v1';
  let members = [];

  /* ---------- Ліниве завантаження карти (бібліотеки QR/штрих-коду) ---------- */
  let libsReady = null;
  function loadLibs() {
    if (libsReady) return libsReady;
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'css/card.css?v=16';
    document.head.appendChild(css);
    const load = (src) => new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error('Не вдалося завантажити ' + src));
      document.body.appendChild(s);
    });
    libsReady = load('js/vendor/qrcode-generator-1.4.4.js')
      .then(() => load('js/vendor/jsbarcode-3.11.6.min.js'))
      .then(() => load('js/scanner.js?v=2'))
      .then(() => load('js/card.js?v=18'))
      .catch((e) => { libsReady = null; throw e; });
    return libsReady;
  }

  async function load() {
    const { sb, isRemote } = A();
    if (isRemote) {
      const { data, error } = await sb.from('members').select('*').order('created_at', { ascending: false });
      if (error) throw new Error(error.message.includes('does not exist') || error.code === '42P01'
        ? 'Таблиці members ще немає в Supabase — виконай оновлений supabase-schema.sql.'
        : 'Не вдалося завантажити клієнтів: ' + error.message);
      members = data || [];
    } else {
      try { members = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch (e) { members = []; }
    }
    return members;
  }
  function saveLocal() { localStorage.setItem(LOCAL_KEY, JSON.stringify(members)); }

  async function upsert(m) {
    const { sb, isRemote } = A();
    m.updated_at = new Date().toISOString();
    if (isRemote) {
      const { data: sess } = await sb.auth.getSession();
      if (!sess || !sess.session) throw new Error('Сесія адміністратора завершилась. Вийди з адмін-режиму й увійди знову.');
      const { data, error } = await sb.from('members').upsert(m).select().single();
      if (error) {
        if (/row-level security/i.test(error.message)) throw new Error('Немає прав зберегти клієнта для цього залу. Перевір, що ти увійшов під своїм акаунтом адміністратора.');
        if (/barcode/.test(error.message) && /duplicate|unique/i.test(error.message)) throw new Error('Цей штрихкод уже має інший клієнт.');
        if (/phone9/.test(error.message)) throw new Error('Клієнт із таким номером телефону вже є.');
        throw new Error('Не вдалося зберегти: ' + error.message);
      }
      const i = members.findIndex((x) => x.id === data.id);
      if (i >= 0) members[i] = data; else members.unshift(data);
      return data;
    }
    if (!m.id) { m.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()); m.created_at = new Date().toISOString(); }
    const i = members.findIndex((x) => x.id === m.id);
    if (i >= 0) members[i] = m; else members.unshift(m);
    saveLocal();
    return m;
  }

  async function remove(id) {
    const { sb, isRemote } = A();
    if (isRemote) {
      const { error } = await sb.from('members').delete().eq('id', id);
      if (error) throw new Error('Не вдалося видалити: ' + error.message);
    }
    members = members.filter((m) => m.id !== id);
    if (!isRemote) saveLocal();
  }

  /* ---------- Дати ---------- */
  function addMonths(iso, n) {
    const d = new Date(iso + 'T12:00:00');
    const day = d.getDate();
    d.setMonth(d.getMonth() + n);
    if (d.getDate() < day) d.setDate(0); // 31 січня + 1 міс → 28/29 лютого
    d.setDate(d.getDate() - 1); // абонемент на місяць: з 1-го по останній день включно
    return d.toISOString().slice(0, 10);
  }
  function addDays(iso, n) {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  // Продовжити на 1 місяць: від завтрашнього дня після кінця чинного абонемента або від сьогодні
  async function renew(m) {
    const today = C().todayISO();
    const running = m.valid_to && m.valid_to >= today;
    const from = running ? addDays(m.valid_to, 1) : today;
    return upsert({ ...m, status: 'active', valid_from: running ? m.valid_from : today, valid_to: addMonths(from, 1) });
  }

  /* ---------- Зали й абонементи ---------- */
  // Два зали; у кожного свої абонементи — на його сторінці (podilsk.html / balta.html),
  // у базі з префіксом ключа 'podilsk:' / 'balta:'.
  const GYMS = [{ slug: 'podilsk', name: 'Подільськ' }, { slug: 'balta', name: 'Балта' }];
  const gymSlug = (name) => (GYMS.find((g) => g.name === name || g.slug === name) || GYMS[0]).slug;
  const gymName = (slug) => (GYMS.find((g) => g.slug === slug || g.name === slug) || { name: '' }).name;
  const gyms = () => GYMS.map((g) => g.name);
  const DEFAULT_PLANS = [['price1', 'Старт', '499₴', '/міс'], ['price2', 'Повний', '799₴', '/міс'], ['price3', 'PRO', '1299₴', '/міс']];
  let plans = {};
  // тривалість за підписом ціни: /міс, /6 міс, /рік; порожньо — разове
  const monthsOf = (period) => {
    const p = String(period || '').trim().toLowerCase();
    const n = parseInt(p.replace(/\D/g, ''), 10);
    return !p ? 0 : /рік/.test(p) ? 12 * (n || 1) : /міс/.test(p) ? (n || 1) : 1;
  };
  async function loadPlans() {
    const { sb, isRemote } = A();
    const next = {};
    for (const g of GYMS) {
      const PFX = g.slug + ':';
      let ids = DEFAULT_PLANS.map((x) => x[0]);
      const content = {};
      try {
        const lists = JSON.parse(localStorage.getItem('xfit_lists_v1_' + g.slug) || '{}');
        if (Array.isArray(lists.pricing)) ids = lists.pricing;
        Object.assign(content, JSON.parse(localStorage.getItem('xfit_content_v1_' + g.slug) || '{}'));
      } catch (e) { /* ignore */ }
      if (isRemote) {
        const lst = await sb.from('site_settings').select('value').eq('key', PFX + 'list:pricing');
        if (!lst.error && lst.data && lst.data[0]) { try { ids = JSON.parse(lst.data[0].value); } catch (e) { /* ignore */ } }
        const keys = ids.flatMap((id) => [id + '.name', id + '.amount', id + '.period']).map((k) => PFX + k);
        const rows = await sb.from('site_content').select('key,value').in('key', keys);
        if (!rows.error) rows.data.forEach((r) => { content[r.key.slice(PFX.length)] = r.value; });
      }
      next[g.slug] = ids.map((id) => {
        const d = DEFAULT_PLANS.find((x) => x[0] === id) || [id, '', '', '/міс'];
        const name = content[id + '.name'] != null ? content[id + '.name'] : d[1];
        const amount = content[id + '.amount'] != null ? content[id + '.amount'] : d[2];
        const period = content[id + '.period'] != null ? content[id + '.period'] : d[3];
        return { id, name: String(name).trim(), amount, period, months: monthsOf(period) };
      }).filter((x) => x.name);
    }
    plans = next;
    return plans;
  }
  // Абонементи залу (назва або slug); без залу — усі без повторів
  function planInfo(gym) {
    if (gym) return plans[gymSlug(gym)] || [];
    const seen = new Set();
    return Object.values(plans).flat().filter((p) => !seen.has(p.name) && seen.add(p.name));
  }
  // Зберегти назви/ціни/періоди абонементів залу: { 'price1.amount': '850₴', … }
  async function savePlans(gym, changes) {
    const { sb, isRemote } = A();
    const slug = gymSlug(gym);
    if (isRemote) {
      const rows = Object.entries(changes).map(([key, value]) => ({ key: slug + ':' + key, value }));
      const { error } = await sb.from('site_content').upsert(rows);
      if (error) throw new Error('Не вдалося зберегти ціни: ' + error.message);
    }
    try {
      const k = 'xfit_content_v1_' + slug;
      localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) || '{}'), ...changes }));
    } catch (e) { /* ignore */ }
    await loadPlans();
  }
  // «Повний — 799₴/міс» → «Повний», якщо такий абонемент є в розділі «Абонементи»
  function matchPlan(desired, gym) {
    if (!desired) return '';
    const name = desired.split(' — ')[0].trim();
    return planInfo(gym).map((x) => x.name).find((x) => x.toLowerCase() === name.toLowerCase()) || name;
  }

  function uniqueBarcode() {
    let n;
    do { n = C().newBarcode(); } while (members.some((m) => m.barcode === n));
    return n;
  }
  function uniqueNumber() {
    let n;
    do { n = C().newCardNumber(); } while (members.some((m) => m.card_number === n));
    return n;
  }
  // Сканер працює як клавіатура: якщо на компʼютері увімкнена українська (чи російська) розкладка,
  // посилання з QR-коду «надрукується» кирилицею — повертаємо латинські символи за положенням клавіш
  const US = "qwertyuiop[]asdfghjkl;'zxcvbnm,./QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>?";
  const UA = 'йцукенгшщзхїфівапролджєячсмитьбю.ЙЦУКЕНГШЩЗХЇФІВАПРОЛДЖЄЯЧСМИТЬБЮ,';
  const RU = 'йцукенгшщзхъфывапролджэячсмитьбю.ЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ,';
  function fromLayout(text) {
    if (!/[а-яіїєґё]/i.test(text)) return text;
    return [...text].map((ch) => { let i = UA.indexOf(ch); if (i < 0) i = RU.indexOf(ch); return i < 0 ? ch : US[i]; }).join('');
  }
  // Пошук за відсканованим кодом: посилання на карту, штрихкод або номер карти
  function findByCode(raw) {
    const text = fromLayout(String(raw || '').trim());
    let token = null;
    try { token = new URL(text).searchParams.get('c'); } catch (e) { /* не посилання */ }
    const digits = text.replace(/\D/g, '');
    return members.find((m) => (token && m.token === token) || (digits.length >= 8 && (m.card_number === digits || m.barcode === digits))) || null;
  }

  window.XFitMembers = {
    loadLibs, load, upsert, remove, renew, addMonths, addDays, planInfo, loadPlans, savePlans, gyms, gymSlug, gymName, GYMS, matchPlan, uniqueBarcode, uniqueNumber, findByCode,
    list: () => members,
    get: (id) => members.find((m) => m.id === id) || null,
  };
})();
