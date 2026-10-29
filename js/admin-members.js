/* ============================================================
   XFit — адмінка: клієнти та віртуальні карти.
   Адмін створює клієнта (ПІБ, телефон, абонемент, дати) — система
   видає номер карти й особисте посилання card.html?c=<код>, яке
   надсилається клієнту. На рецепції карту перевіряють за QR-кодом,
   штрих-кодом або номером.
   Хмарний режим: таблиця members у Supabase (див. supabase-schema.sql).
   Локальний режим: клієнти зберігаються в цьому браузері.
   ============================================================ */
(function () {
  const btn = document.getElementById('adminMembersBtn');
  const modal = document.getElementById('adminMembersModal');
  const body = document.getElementById('adminMembersBody');
  if (!btn || !modal || !body) return;

  const A = () => window.XFitAdmin || {};
  const LOCAL_KEY = 'xfit_members_v1';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let members = [];
  let query = '';

  /* ---------- Ліниве завантаження карти (бібліотеки QR/штрих-коду) ---------- */
  let libsReady = null;
  function loadLibs() {
    if (libsReady) return libsReady;
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'css/card.css?v=1';
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
      .then(() => load('js/card.js?v=1'));
    return libsReady;
  }

  /* ---------- Дані ---------- */
  async function loadMembers() {
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
  }
  function saveLocal() { localStorage.setItem(LOCAL_KEY, JSON.stringify(members)); }

  async function upsertMember(m) {
    const { sb, isRemote } = A();
    m.updated_at = new Date().toISOString();
    if (isRemote) {
      const { data, error } = await sb.from('members').upsert(m).select().single();
      if (error) throw new Error('Не вдалося зберегти: ' + error.message);
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
  async function deleteMember(id) {
    const { sb, isRemote } = A();
    if (isRemote) {
      const { error } = await sb.from('members').delete().eq('id', id);
      if (error) throw new Error('Не вдалося видалити: ' + error.message);
    }
    members = members.filter((m) => m.id !== id);
    if (!isRemote) saveLocal();
  }

  /* ---------- Допоміжне ---------- */
  const C = () => window.XFitCard;
  const today = () => C().todayISO();
  function addMonths(iso, n) {
    const d = new Date(iso + 'T12:00:00');
    const day = d.getDate();
    d.setMonth(d.getMonth() + n);
    if (d.getDate() < day) d.setDate(0); // 31 січня + 1 міс → 28/29 лютого
    d.setDate(d.getDate() - 1); // абонемент на місяць: з 1-го по останній день включно
    return d.toISOString().slice(0, 10);
  }
  const plans = () => [...document.querySelectorAll('#pricing .price-card h3')].map((h) => h.textContent.trim()).filter(Boolean);
  const gyms = () => [...document.querySelectorAll('#locations .location-card h3')].map((h) => h.textContent.trim()).filter(Boolean);
  const statePill = (m) => {
    const st = C().stateOf(m);
    const text = st.state === 'expired' ? 'Неактивна' : st.state === 'soon' ? `Ще ${st.left} дн.` : 'Активна';
    return `<span class="mem-pill mem-pill--${st.state}">${text}</span>`;
  };
  const fmt = (iso) => (iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4) : '—');

  /* ---------- Екрани ---------- */
  function viewList() {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const list = members.filter((m) => !q
      || (m.full_name || '').toLowerCase().includes(q)
      || (digits.length >= 3 && ((m.phone || '').replace(/\D/g, '').includes(digits) || (m.card_number || '').includes(digits))));
    const active = members.filter((m) => C().stateOf(m).state !== 'expired').length;
    body.innerHTML = `
      <div class="mem-toolbar">
        <input type="search" id="memSearch" placeholder="Пошук: імʼя, телефон або номер карти" value="${esc(query)}" aria-label="Пошук клієнтів">
        <button type="button" class="btn btn--primary" data-act="new">+ Новий клієнт</button>
      </div>
      <div class="mem-toolbar mem-toolbar--sub">
        <span class="mem-count">${members.length} ${plural(members.length, ['клієнт', 'клієнти', 'клієнтів'])} · ${active} з активним абонементом</span>
        <button type="button" class="btn btn--ghost" data-act="check">Перевірити карту</button>
      </div>
      <div class="mem-list">${list.length ? list.map((m) => `
        <div class="mem-row" data-id="${esc(m.id)}">
          <div class="mem-row__main">
            <b>${esc(m.full_name || 'Без імені')}</b>
            <span>${esc(m.plan || '—')} · до ${fmt(m.valid_to)} · ${esc(C().groupNumber(m.card_number))}</span>
          </div>
          ${statePill(m)}
          <div class="mem-row__actions">
            <button type="button" data-act="card" title="Карта і посилання">Карта</button>
            <button type="button" data-act="renew" title="Продовжити на 1 місяць">+1 міс</button>
            <button type="button" data-act="edit" title="Редагувати">✎</button>
            <button type="button" data-act="del" class="is-danger" title="Видалити">✕</button>
          </div>
        </div>`).join('') : `<p class="admin-leads-empty">${members.length ? 'Нікого не знайдено.' : 'Клієнтів ще немає. Натисни «+ Новий клієнт», щоб видати першу карту.'}</p>`}
      </div>`;
    const search = body.querySelector('#memSearch');
    search.addEventListener('input', () => { query = search.value; const pos = search.selectionStart; viewList(); const s2 = body.querySelector('#memSearch'); s2.focus(); s2.setSelectionRange(pos, pos); });
  }

  function viewForm(m) {
    const isNew = !m;
    const start = (m && m.valid_from) || today();
    const p = plans();
    const g = gyms();
    body.innerHTML = `
      <form class="mem-form" id="memForm" autocomplete="off">
        <p class="mem-sub">${isNew ? 'Новий клієнт — після збереження зʼявиться карта й посилання для клієнта' : 'Редагування клієнта'}</p>
        <label>ПІБ<input name="full_name" required maxlength="80" value="${esc(m ? m.full_name : '')}" placeholder="Прізвище та імʼя"></label>
        <label>Телефон<input name="phone" type="tel" maxlength="20" value="${esc(m ? m.phone : '')}" placeholder="+380…"></label>
        <div class="mem-form__row">
          <label>Абонемент<input name="plan" list="memPlans" maxlength="40" value="${esc(m ? m.plan : (p[1] || p[0] || ''))}" required></label>
          <label>Зал<input name="gym" list="memGyms" maxlength="40" value="${esc(m ? m.gym : (g[0] || 'Подільськ'))}"></label>
        </div>
        <datalist id="memPlans">${p.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
        <datalist id="memGyms">${g.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
        <div class="mem-form__row">
          <label>Діє з<input name="valid_from" type="date" required value="${esc(start)}"></label>
          <label>Діє до<input name="valid_to" type="date" required value="${esc((m && m.valid_to) || addMonths(start, 1))}"></label>
        </div>
        <div class="mem-quick">${[1, 3, 6, 12].map((n) => `<button type="button" data-months="${n}">${n} міс</button>`).join('')}</div>
        <label>Нотатка (бачить лише адмін)<input name="notes" maxlength="200" value="${esc(m ? m.notes : '')}"></label>
        <p class="admin-modal__error" id="memError"></p>
        <div class="admin-modal__actions">
          <button type="button" class="btn btn--ghost" data-act="back">Скасувати</button>
          <button type="submit" class="btn btn--primary">${isNew ? 'Створити карту' : 'Зберегти'}</button>
        </div>
      </form>`;
    const form = body.querySelector('#memForm');
    form.querySelectorAll('[data-months]').forEach((b) => b.addEventListener('click', () => {
      form.valid_to.value = addMonths(form.valid_from.value || today(), Number(b.dataset.months));
    }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form).entries());
      if (f.valid_to < f.valid_from) { form.querySelector('#memError').textContent = 'Дата «до» раніша за дату «з».'; return; }
      const rec = { ...(m || {}), ...f };
      if (isNew) { rec.card_number = uniqueNumber(); rec.token = C().newToken(); }
      try {
        const saved = await upsertMember(rec);
        A().showToast(isNew ? 'Карту створено ✓' : 'Збережено ✓');
        viewCard(saved);
      } catch (err) {
        form.querySelector('#memError').textContent = err.message;
      }
    });
    form.full_name.focus();
  }

  function uniqueNumber() {
    let n;
    do { n = C().newCardNumber(); } while (members.some((m) => m.card_number === n));
    return n;
  }

  function viewCard(m) {
    const url = C().cardUrl(m.token);
    body.innerHTML = `
      <div class="mem-card">
        <div id="memCardPreview"></div>
        <p class="mem-sub">Надішли клієнту це посилання (Viber, Telegram, SMS). Відкривши його, клієнт побачить свою карту, а встановивши додаток XFit — матиме її завжди під рукою, навіть без інтернету.</p>
        <div class="mem-link"><input readonly value="${esc(url)}" id="memLink" aria-label="Посилання на карту"><button type="button" class="btn btn--primary" data-act="copy">Копіювати</button></div>
        <div class="mem-card__actions">
          ${navigator.share ? '<button type="button" class="btn btn--ghost" data-act="share">Поділитися</button>' : ''}
          <a class="btn btn--ghost" href="${esc(url)}" target="_blank" rel="noopener">Відкрити карту</a>
          <button type="button" class="btn btn--ghost" data-act="back">До списку</button>
        </div>
      </div>`;
    C().render(body.querySelector('#memCardPreview'), m);
    body.dataset.current = m.id;
  }

  /* ---------- Перевірка карти на рецепції ---------- */
  let stream = null;
  function stopCamera() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  function findByCode(raw) {
    const text = String(raw || '').trim();
    let token = null;
    try { token = new URL(text).searchParams.get('c'); } catch (e) { /* не посилання */ }
    const digits = text.replace(/\D/g, '');
    return members.find((m) => (token && m.token === token) || (digits.length >= 8 && m.card_number === digits)) || null;
  }
  function showCheckResult(m, raw) {
    const box = body.querySelector('#memResult');
    if (!m) {
      box.className = 'mem-result mem-result--expired';
      box.innerHTML = `<b>Карту не знайдено</b><span>${esc(raw)}</span>`;
      return;
    }
    const st = C().stateOf(m);
    box.className = 'mem-result mem-result--' + st.state;
    box.innerHTML = `<b>${st.state === 'expired' ? '✕ Абонемент неактивний' : '✓ Абонемент активний'}</b>
      <span class="mem-result__name">${esc(m.full_name)}</span>
      <span>${esc(m.plan)} · до ${fmt(m.valid_to)}${st.state !== 'expired' ? ` · ще ${st.left} ${plural(st.left, ['день', 'дні', 'днів'])}` : ''}</span>
      <button type="button" class="btn btn--ghost" data-act="open" data-id="${esc(m.id)}">Відкрити клієнта</button>`;
  }
  function viewCheck() {
    const canScan = 'BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    body.innerHTML = `
      <div class="mem-check">
        ${canScan ? '<div class="mem-scan"><video id="memVideo" playsinline muted></video><span class="mem-scan__frame"></span></div><button type="button" class="btn btn--primary" data-act="scan">Сканувати камерою</button>' : '<p class="mem-sub">Цей браузер не вміє сканувати коди камерою (наприклад, Safari на iPhone). Введи номер карти вручну або відскануй QR звичайною камерою телефона — відкриється карта клієнта з її статусом.</p>'}
        <form class="mem-link" id="memCheckForm"><input id="memCheckInput" inputmode="numeric" placeholder="Номер карти" aria-label="Номер карти"><button type="submit" class="btn btn--ghost">Перевірити</button></form>
        <div id="memResult" class="mem-result" aria-live="polite"></div>
        <div class="admin-modal__actions"><button type="button" class="btn btn--ghost" data-act="back">До списку</button></div>
      </div>`;
    body.querySelector('#memCheckForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = body.querySelector('#memCheckInput').value;
      showCheckResult(findByCode(v), v);
    });
  }
  async function startScan() {
    const video = body.querySelector('#memVideo');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch (e) {
      A().showToast('Немає доступу до камери');
      return;
    }
    video.srcObject = stream;
    await video.play();
    const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128'] });
    const tick = async () => {
      if (!stream || !document.body.contains(video)) return stopCamera();
      try {
        const codes = await detector.detect(video);
        if (codes.length) {
          const raw = codes[0].rawValue;
          if (navigator.vibrate) navigator.vibrate(120);
          showCheckResult(findByCode(raw), raw);
          stopCamera();
          return;
        }
      } catch (e) { /* кадр не розпізнано */ }
      requestAnimationFrame(tick);
    };
    tick();
  }

  /* ---------- Події ---------- */
  body.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const row = el.closest('.mem-row');
    const m = row ? members.find((x) => x.id === row.dataset.id) : null;
    if (act === 'new') viewForm(null);
    else if (act === 'back') { stopCamera(); viewList(); }
    else if (act === 'check') viewCheck();
    else if (act === 'scan') startScan();
    else if (act === 'card' && m) viewCard(m);
    else if (act === 'edit' && m) viewForm(m);
    else if (act === 'open') { const x = members.find((y) => y.id === el.dataset.id); if (x) viewCard(x); }
    else if (act === 'renew' && m) {
      const from = m.valid_to && m.valid_to >= today() ? addDays(m.valid_to, 1) : today();
      try {
        await upsertMember({ ...m, valid_from: m.valid_to && m.valid_to >= today() ? m.valid_from : today(), valid_to: addMonths(from, 1) });
        A().showToast('Продовжено до ' + fmt(members.find((x) => x.id === m.id).valid_to));
        viewList();
      } catch (err) { A().showToast(err.message); }
    } else if (act === 'del' && m) {
      if (!confirm(`Видалити клієнта «${m.full_name}»? Його карта перестане працювати.`)) return;
      try { await deleteMember(m.id); A().showToast('Клієнта видалено'); viewList(); } catch (err) { A().showToast(err.message); }
    } else if (act === 'copy') {
      const input = body.querySelector('#memLink');
      try { await navigator.clipboard.writeText(input.value); A().showToast('Посилання скопійовано'); }
      catch (err) { input.select(); document.execCommand('copy'); A().showToast('Посилання скопійовано'); }
    } else if (act === 'share') {
      const x = members.find((y) => y.id === body.dataset.current);
      navigator.share({ title: 'Твоя карта XFit', text: `${x ? x.full_name + ', т' : 'Т'}воя карта клієнта XFit:`, url: body.querySelector('#memLink').value }).catch(() => {});
    }
  });
  function addDays(iso, n) {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function plural(n, f) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return f[2];
    if (b > 1 && b < 5) return f[1];
    if (b === 1) return f[0];
    return f[2];
  }

  function close() { stopCamera(); modal.classList.remove('open'); }
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.getElementById('adminMembersClose').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('open')) close(); });

  btn.addEventListener('click', async () => {
    modal.classList.add('open');
    body.innerHTML = '<p class="admin-leads-empty">Завантаження…</p>';
    try {
      await loadLibs();
      await loadMembers();
      viewList();
    } catch (err) {
      body.innerHTML = `<p class="admin-leads-empty">${esc(err.message)}</p>`;
    }
  });
})();
