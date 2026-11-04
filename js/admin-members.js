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
    css.href = 'css/card.css?v=13';
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
      .then(() => load('js/card.js?v=15'))
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
      const { data, error } = await sb.from('members').upsert(m).select().single();
      if (error) {
        if (/barcode/.test(error.message) && /duplicate|unique/i.test(error.message)) throw new Error('Цей штрихкод уже має інший клієнт.');
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

  /* ---------- Абонементи й зали з розділів сайту ---------- */
  // Назва й тривалість за підписом ціни (/міс, /6 міс, /рік, порожньо — разове)
  function planInfo() {
    return [...document.querySelectorAll('#pricing .price-card')].map((card) => {
      const name = ((card.querySelector('h3') || {}).textContent || '').trim();
      const period = ((card.querySelector('.price-card__period') || {}).textContent || '').trim().toLowerCase();
      const n = parseInt(period.replace(/\D/g, ''), 10);
      const months = !period ? 0 : /рік/.test(period) ? 12 * (n || 1) : /міс/.test(period) ? (n || 1) : 1;
      return { name, months };
    }).filter((x) => x.name);
  }
  const gyms = () => [...document.querySelectorAll('#locations .location-card h3')].map((h) => h.textContent.trim()).filter(Boolean);
  // «Повний — 799₴/міс» → «Повний», якщо такий абонемент є в розділі «Абонементи»
  function matchPlan(desired) {
    if (!desired) return '';
    const name = desired.split(' — ')[0].trim();
    return planInfo().map((x) => x.name).find((x) => x.toLowerCase() === name.toLowerCase()) || name;
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
    loadLibs, load, upsert, remove, renew, addMonths, addDays, planInfo, gyms, matchPlan, uniqueBarcode, uniqueNumber, findByCode,
    list: () => members,
    get: (id) => members.find((m) => m.id === id) || null,
  };
})();
