/* ============================================================
   XFit — адмін-панель.

   Є два режими роботи:
   1) "Хмара" (Supabase) — якщо в js/supabase-config.js вказані
      реальні URL/ключ проєкту. Тоді контент, фото та оголошення
      читаються з бази даних Supabase і бачать їх УСІ відвідувачі
      сайту, з будь-якого пристрою. Вхід адміна відбувається через
      справжню автентифікацію Supabase Auth.
   2) "Локальний" (запасний варіант) — якщо Supabase не налаштований.
      Дані зберігаються тільки в localStorage цього браузера, як
      було раніше. Пароль перевіряється на клієнті (це не є
      повноцінним захистом).
   ============================================================ */
(function () {
  const STORAGE_CONTENT_KEY = 'xfit_content_v1';
  const STORAGE_PASSWORD_KEY = 'xfit_admin_password';
  const SESSION_FLAG_KEY = 'xfit_admin_session';
  const DEFAULT_PASSWORD = 'xfit2026';
  const PHOTO_STORAGE_KEY = 'xfit_photos_v1';
  const ANNOUNCEMENTS_KEY = 'xfit_announcements_v1';
  const TRAINERS_KEY = 'xfit_trainers_v1';
  const LISTS_KEY = 'xfit_lists_v1';
  const MAX_PHOTO_DIMENSION = 1000;
  const PHOTO_QUALITY = 0.82;

  const $ = (sel) => document.querySelector(sel);

  const toast = $('#adminToast');
  const loginModal = $('#adminLoginModal');
  const loginForm = $('#adminLoginForm');
  const emailInput = $('#adminEmailInput');
  const loginInput = $('#adminPasswordInput');
  const loginError = $('#adminLoginError');
  const loginCancel = $('#adminLoginCancel');
  const syncStatusEl = $('#adminSyncStatus');
  const adminBar = $('#adminBar');
  const adminBarSync = $('#adminBarSync');
  const adminBarCollapseToggle = $('#adminBarCollapseToggle');
  const editToggleBtn = $('#adminEditToggle');
  const saveBtn = $('#adminSaveBtn');
  const resetBtn = $('#adminResetBtn');
  const passwordBtn = $('#adminPasswordBtn');
  const logoutBtn = $('#adminLogoutBtn');
  const secretTrigger = $('#secretTrigger');
  const announcementsToggleBtn = $('#adminAnnouncementsToggle');
  const addAnnouncementBtn = $('#addAnnouncementBtn');
  const announcementsGrid = $('#announcementsGrid');
  const announcementsSection = $('#announcements');
  const navAnnounceLink = $('#navAnnounceLink');
  const mobileAnnounceLink = $('#mobileAnnounceLink');
  const leadsBtn = $('#adminLeadsBtn');
  const leadsModal = $('#adminLeadsModal');
  const leadsList = $('#adminLeadsList');
  const leadsClose = $('#adminLeadsClose');
  const trainersCarousel = $('#trainersCarousel');
  const trainersTrack = $('#trainersTrack');
  const addTrainerBtn = $('#addTrainerBtn');

  const ICON_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  const ICON_CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  let editing = false;
  let toastTimer = null;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  /* ============================================================
     Шар "Remote" — підключення до Supabase (якщо налаштовано)
     ============================================================ */
  const SUPABASE_URL = window.XFIT_SUPABASE_URL || '';
  const SUPABASE_ANON_KEY = window.XFIT_SUPABASE_ANON_KEY || '';
  const DEFAULT_ADMIN_EMAIL = window.XFIT_ADMIN_EMAIL || '';
  const LAST_EMAIL_KEY = 'xfit_admin_last_email';
  const isRemote = !!(
    window.supabase &&
    SUPABASE_URL && SUPABASE_ANON_KEY &&
    !SUPABASE_URL.includes('YOUR-PROJECT') &&
    !SUPABASE_ANON_KEY.includes('YOUR-ANON')
  );
  const sb = isRemote ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

  function updateSyncBadges() {
    const label = isRemote ? '☁ Хмара (Supabase)' : '💾 Локальний режим (тільки цей браузер)';
    const cls = isRemote ? 'is-cloud' : 'is-local';
    [syncStatusEl, adminBarSync].forEach((el) => {
      if (!el) return;
      el.textContent = label;
      el.classList.remove('is-cloud', 'is-local');
      el.classList.add(cls);
    });
  }
  updateSyncBadges();

  // Доступ для інших модулів адмінки (напр. «Клієнти»)
  window.XFitAdmin = {
    sb,
    isRemote,
    showToast: (m) => showToast(m),
    isAdmin: () => document.body.classList.contains('admin-mode'),
  };

  async function hasRemoteSession() {
    if (!isRemote) return false;
    const { data } = await sb.auth.getSession();
    return !!(data && data.session);
  }

  /* ---------- Локальний пароль (запасний режим) ---------- */
  function getStoredPassword() {
    return localStorage.getItem(STORAGE_PASSWORD_KEY) || DEFAULT_PASSWORD;
  }

  /* ---------- Застосування даних з localStorage-кешу до сторінки ---------- */
  function applySavedContent() {
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_CONTENT_KEY) || '{}');
    } catch (e) {
      saved = {};
    }
    document.querySelectorAll('[data-edit-key]').forEach((el) => {
      const key = el.dataset.editKey;
      if (!(key in saved)) return;
      const value = saved[key];
      if (el.dataset.editType === 'number') {
        const num = parseFloat(value);
        if (!Number.isNaN(num)) {
          el.dataset.count = String(num);
          el.textContent = String(num);
        }
      } else {
        el.textContent = value;
      }
    });
    syncInstagramLinks();
    syncStructuredData();
  }

  /* Структуровані дані для Google (schema.org у <head>): телефон, адреса й
     години роботи беруться з тих самих текстів, що редагує адмін.
     Заглушки на кшталт «000-00-00» чи «уточнюйте» не передаються. */
  const DAY_CODES = [
    [/^пн|^понед/, 'Monday'], [/^вт|^вівт/, 'Tuesday'], [/^ср|^серед/, 'Wednesday'], [/^чт|^четв/, 'Thursday'],
    [/^пт|^п.ятн/, 'Friday'], [/^сб|^субот/, 'Saturday'], [/^нд|^неділ/, 'Sunday'],
  ];
  const WEEK = DAY_CODES.map((d) => d[1]);

  function parseDays(text) {
    const parts = text.toLowerCase().split(/\s*[—–-]\s*/).map((t) => t.trim());
    const idx = parts.map((t) => DAY_CODES.findIndex(([re]) => re.test(t)));
    if (idx.some((i) => i < 0)) return null;
    if (idx.length === 1) return [WEEK[idx[0]]];
    if (idx.length === 2 && idx[1] >= idx[0]) return WEEK.slice(idx[0], idx[1] + 1);
    return null;
  }

  function editText(key) {
    const el = document.querySelector(`[data-edit-key="${key}"]`);
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function syncStructuredData() {
    const script = document.getElementById('structuredData');
    if (!script) return;
    let data;
    try { data = JSON.parse(script.textContent); } catch (e) { return; }
    const gym = (data['@graph'] || []).find((n) => n['@type'] === 'ExerciseGym');
    if (!gym) return;

    const phone = editText('location1.phone');
    if (/\d{3}/.test(phone) && !/000-00-00|\(00\)/.test(phone)) gym.telephone = phone;
    else delete gym.telephone;

    const street = editText('location1.address');
    if (street && !/уточн/i.test(street)) gym.address.streetAddress = street;
    else delete gym.address.streetAddress;
    const city = editText('location1.city');
    if (city) gym.address.addressLocality = city;

    const rows = Array.from(document.querySelectorAll('[data-list="schedule"] > [data-list-item]'));
    const hours = rows.map((row) => {
      const spans = row.querySelectorAll('[data-edit-key]');
      if (spans.length < 2) return null;
      const days = parseDays(spans[0].textContent.trim());
      const times = spans[1].textContent.match(/(\d{1,2}):(\d{2})\D+(\d{1,2}):(\d{2})/);
      if (!days || !times) return null;
      const t = (h, m) => `${h.padStart(2, '0')}:${m}`;
      return { '@type': 'OpeningHoursSpecification', dayOfWeek: days.length === 1 ? days[0] : days, opens: t(times[1], times[2]), closes: t(times[3], times[4]) };
    });
    if (hours.length && hours.every(Boolean)) gym.openingHoursSpecification = hours;

    script.textContent = JSON.stringify(data, null, 2);
  }

  // Посилання на Instagram беруть адресу з редагованого @нікнейму в картках локацій
  function instagramUrl(handle) {
    const name = (handle || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '');
    return name ? 'https://instagram.com/' + encodeURIComponent(name) : null;
  }

  function syncInstagramLinks() {
    document.querySelectorAll('a[data-edit-key$=".instagram"]').forEach((a) => {
      const url = instagramUrl(a.textContent);
      if (url) a.href = url;
    });
    document.querySelectorAll('[data-ig-handle-key]').forEach((a) => {
      const source = document.querySelector(`[data-edit-key="${a.dataset.igHandleKey}"]`);
      const url = source && instagramUrl(source.textContent);
      if (!url) return;
      a.href = url;
      const handleEl = a.querySelector('[data-ig-handle-text]');
      if (handleEl) handleEl.textContent = '@' + decodeURIComponent(url.split('/').pop());
    });
  }

  function getPhotoStore() {
    try {
      return JSON.parse(localStorage.getItem(PHOTO_STORAGE_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function applySavedPhotos() {
    const photos = getPhotoStore();
    document.querySelectorAll('[data-photo-key]').forEach((img) => {
      const key = img.dataset.photoKey;
      const slot = img.closest('.photo-slot');
      if (photos[key]) {
        img.src = photos[key];
        if (slot) slot.classList.add('has-photo');
      } else if (slot) {
        slot.classList.remove('has-photo');
      }
    });
    refreshTrainerClones();
  }

  function getAnnouncementsStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ANNOUNCEMENTS_KEY) || 'null');
      if (parsed && Array.isArray(parsed.items)) return parsed;
    } catch (e) { /* ignore */ }
    return { enabled: false, items: [] };
  }

  function saveAnnouncementsStoreLocal(store) {
    try {
      localStorage.setItem(ANNOUNCEMENTS_KEY, JSON.stringify(store));
      return true;
    } catch (e) {
      showToast('Забракло місця в браузері. Спробуй менше афіш або легші фото.');
      return false;
    }
  }

  /* ---------- Запити до Supabase ---------- */
  async function remotePullContent() {
    const { data, error } = await sb.from('site_content').select('key,value');
    if (error) return null;
    const map = {};
    data.forEach((row) => { map[row.key] = row.value; });
    return map;
  }

  async function remotePushContent(dataMap) {
    const rows = Object.entries(dataMap).map(([key, value]) => ({ key, value }));
    if (!rows.length) return true;
    const { error } = await sb.from('site_content').upsert(rows);
    return !error;
  }

  async function remotePullPhotos() {
    const { data, error } = await sb.from('site_photos').select('key,data_url');
    if (error) return null;
    const map = {};
    data.forEach((row) => { map[row.key] = row.data_url; });
    return map;
  }

  async function remotePushPhoto(key, dataUrl) {
    const { error } = await sb.from('site_photos').upsert({ key, data_url: dataUrl });
    return !error;
  }

  async function remoteDeletePhoto(key) {
    const { error } = await sb.from('site_photos').delete().eq('key', key);
    return !error;
  }

  async function remotePullAnnouncements() {
    const [itemsRes, settingsRes] = await Promise.all([
      sb.from('announcements').select('*').order('sort_order', { ascending: false }),
      sb.from('site_settings').select('key,value').eq('key', 'announcements_enabled'),
    ]);
    if (itemsRes.error || settingsRes.error) return null;
    const enabled = settingsRes.data && settingsRes.data[0] ? settingsRes.data[0].value === 'true' : false;
    const items = (itemsRes.data || []).map((r) => ({
      id: r.id, title: r.title, text: r.body, date: r.date_label, image: r.image_url, sortOrder: r.sort_order,
    }));
    return { enabled, items };
  }

  async function remotePushAnnouncementsEnabled(enabled) {
    const { error } = await sb.from('site_settings').upsert({ key: 'announcements_enabled', value: String(enabled) });
    return !error;
  }

  async function remoteUpsertAnnouncement(item) {
    const { error } = await sb.from('announcements').upsert({
      id: item.id,
      title: item.title || '',
      body: item.text || '',
      date_label: item.date || '',
      image_url: item.image || null,
      sort_order: item.sortOrder || Date.now(),
    });
    return !error;
  }

  async function remoteDeleteAnnouncement(id) {
    const { error } = await sb.from('announcements').delete().eq('id', id);
    return !error;
  }

  async function remotePullTrainers() {
    const { data, error } = await sb.from('site_settings').select('key,value').eq('key', 'trainers_list');
    if (error) return null;
    if (!data || !data[0]) return undefined;
    try {
      const ids = JSON.parse(data[0].value);
      return Array.isArray(ids) ? ids : undefined;
    } catch (e) {
      return undefined;
    }
  }

  async function remotePushTrainers(ids) {
    const { error } = await sb.from('site_settings').upsert({ key: 'trainers_list', value: JSON.stringify(ids) });
    return !error;
  }

  async function remotePullLists() {
    const { data, error } = await sb.from('site_settings').select('key,value').like('key', 'list:%');
    if (error) return null;
    const lists = {};
    (data || []).forEach((row) => {
      try {
        const ids = JSON.parse(row.value);
        if (Array.isArray(ids)) lists[row.key.slice(5)] = ids;
      } catch (e) { /* ignore */ }
    });
    return lists;
  }

  async function remotePushList(name, ids) {
    const { error } = await sb.from('site_settings').upsert({ key: 'list:' + name, value: JSON.stringify(ids) });
    return !error;
  }

  async function remoteDeleteListSettings(names) {
    if (!names.length) return true;
    const { error } = await sb.from('site_settings').delete().in('key', names.map((n) => 'list:' + n));
    return !error;
  }

  async function remoteDeletePhotos(keys) {
    if (!keys.length) return true;
    const { error } = await sb.from('site_photos').delete().in('key', keys);
    return !error;
  }

  async function remoteDeleteContentKeys(keys) {
    const { error } = await sb.from('site_content').delete().in('key', keys);
    return !error;
  }

  /* ---------- Синхронізація "з хмари" при завантаженні сторінки ---------- */
  async function syncFromRemote() {
    if (!isRemote) return;
    try {
      const [content, photos, announcements, trainers, lists] = await Promise.all([
        remotePullContent(), remotePullPhotos(), remotePullAnnouncements(), remotePullTrainers(), remotePullLists(),
      ]);
      if (lists) localStorage.setItem(LISTS_KEY, JSON.stringify(lists));
      if (content) localStorage.setItem(STORAGE_CONTENT_KEY, JSON.stringify(content));
      if (photos) localStorage.setItem(PHOTO_STORAGE_KEY, JSON.stringify(photos));
      if (announcements) localStorage.setItem(ANNOUNCEMENTS_KEY, JSON.stringify(announcements));
      if (trainers) localStorage.setItem(TRAINERS_KEY, JSON.stringify(trainers));
      else if (trainers === undefined) localStorage.removeItem(TRAINERS_KEY);
      renderTrainers();
      renderAllLists();
      applySavedContent();
      applySavedPhotos();
      renderAnnouncements();
    } catch (e) {
      // Немає з'єднання з Supabase — просто лишаємось на локальному кеші
    }
  }

  /* ---------- Секретний тригер: 5 кліків по лого за 2с ---------- */
  (function setupSecretTrigger() {
    if (!secretTrigger) return;
    let clicks = 0;
    let resetTimer = null;

    secretTrigger.addEventListener('click', (e) => {
      clicks += 1;
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => { clicks = 0; }, 2000);

      if (clicks >= 5) {
        e.preventDefault();
        clicks = 0;
        openLogin();
      }
    });
  })();

  // Альтернативний тригер: Ctrl+Shift+A
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      openLogin();
    }
  });

  async function openLogin() {
    if (isRemote) {
      if (await hasRemoteSession()) {
        enterAdminMode();
        return;
      }
    } else if (sessionStorage.getItem(SESSION_FLAG_KEY) === '1') {
      enterAdminMode();
      return;
    }
    loginError.textContent = '';
    loginInput.value = '';
    emailInput.hidden = !isRemote;
    emailInput.required = isRemote;
    if (isRemote) {
      emailInput.value = localStorage.getItem(LAST_EMAIL_KEY) || DEFAULT_ADMIN_EMAIL || '';
    }
    loginModal.classList.add('open');
    setTimeout(() => (isRemote && !emailInput.value ? emailInput : loginInput).focus(), 50);
  }

  function closeLogin() {
    loginModal.classList.remove('open');
  }

  loginCancel.addEventListener('click', closeLogin);
  loginModal.addEventListener('click', (e) => {
    if (e.target === loginModal) closeLogin();
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = loginInput.value;

    if (isRemote) {
      const email = emailInput.value.trim();
      if (!email) {
        loginError.textContent = 'Введи email адміністратора.';
        emailInput.focus();
        return;
      }
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        loginError.textContent = 'Невірний email або пароль (або акаунт адміністратора ще не створений у Supabase).';
        loginInput.value = '';
        loginInput.focus();
        return;
      }
      localStorage.setItem(LAST_EMAIL_KEY, email);
      closeLogin();
      enterAdminMode();
      return;
    }

    if (password === getStoredPassword()) {
      sessionStorage.setItem(SESSION_FLAG_KEY, '1');
      closeLogin();
      enterAdminMode();
    } else {
      loginError.textContent = 'Невірний пароль. Спробуй ще раз.';
      loginInput.value = '';
      loginInput.focus();
    }
  });

  /* ---------- Режим адміністратора ---------- */
  function enterAdminMode() {
    adminBar.classList.add('open');
    document.body.classList.add('admin-mode');
    renderAnnouncements();
    carousel.restartAutoplay();
    showToast(isRemote ? 'Адмін-режим активовано (хмара Supabase)' : 'Адмін-режим активовано (локальний режим)');
  }

  async function exitAdminMode() {
    setEditing(false);
    adminBar.classList.remove('open');
    document.body.classList.remove('admin-mode');
    carousel.restartAutoplay();
    if (isRemote) {
      await sb.auth.signOut();
    } else {
      sessionStorage.removeItem(SESSION_FLAG_KEY);
    }
    renderAnnouncements();
    showToast('Вихід з адмін-режиму');
  }

  function setEditing(on) {
    editing = on;
    document.body.classList.toggle('admin-editing', editing);
    editToggleBtn.classList.toggle('is-active', editing);
    editToggleBtn.textContent = editing ? 'Завершити редагування' : 'Редагувати';
    document.querySelectorAll('[data-edit-key]').forEach((el) => {
      el.setAttribute('contenteditable', editing ? 'true' : 'false');
      el.spellcheck = false;
    });
    document.querySelectorAll('.announcement-card [data-field]').forEach((el) => {
      el.setAttribute('contenteditable', editing ? 'true' : 'false');
      el.spellcheck = false;
    });
  }

  editToggleBtn.addEventListener('click', () => setEditing(!editing));

  if (adminBarCollapseToggle) {
    adminBarCollapseToggle.addEventListener('click', () => {
      adminBar.classList.toggle('is-collapsed');
    });
  }

  function collectContent() {
    const data = {};
    document.querySelectorAll('[data-edit-key]').forEach((el) => {
      const key = el.dataset.editKey;
      data[key] = el.textContent.trim();
    });
    return data;
  }

  saveBtn.addEventListener('click', async () => {
    const data = collectContent();
    localStorage.setItem(STORAGE_CONTENT_KEY, JSON.stringify(data));
    if (isRemote) {
      showToast('Зберігаємо в хмару…');
      const ok = await remotePushContent(data);
      showToast(ok ? 'Зміни збережено в хмарі ✓ (видно всім відвідувачам)' : 'Не вдалося зберегти в хмарі. Перевір з\'єднання/вхід.');
    } else {
      showToast('Зміни збережено в цьому браузері ✓ (локальний режим)');
    }
  });

  resetBtn.addEventListener('click', async () => {
    if (!confirm('Скинути весь контент, фото та оголошення до початкових значень? Це стосується ' + (isRemote ? 'бази даних Supabase (усі відвідувачі).' : 'лише цього браузера.'))) return;
    localStorage.removeItem(STORAGE_CONTENT_KEY);
    localStorage.removeItem(PHOTO_STORAGE_KEY);
    localStorage.removeItem(ANNOUNCEMENTS_KEY);
    localStorage.removeItem(TRAINERS_KEY);
    localStorage.removeItem(LISTS_KEY);
    if (isRemote) {
      try {
        await Promise.all([
          sb.from('site_content').delete().neq('key', ''),
          sb.from('site_photos').delete().neq('key', ''),
          sb.from('announcements').delete().neq('id', ''),
          sb.from('site_settings').delete().neq('key', ''),
        ]);
      } catch (e) { /* ignore */ }
    }
    showToast('Скинуто. Перезавантаження…');
    setTimeout(() => location.reload(), 600);
  });

  passwordBtn.addEventListener('click', async () => {
    const current = prompt('Введи поточний пароль:');
    if (current === null) return;
    const next = prompt('Новий пароль (мін. 4 символи):');
    if (!next || next.trim().length < 4) {
      showToast('Пароль занадто короткий');
      return;
    }

    if (isRemote) {
      const { data: userData } = await sb.auth.getUser();
      const currentEmail = userData && userData.user ? userData.user.email : DEFAULT_ADMIN_EMAIL;
      const { error: reauthError } = await sb.auth.signInWithPassword({ email: currentEmail, password: current });
      if (reauthError) {
        showToast('Поточний пароль невірний');
        return;
      }
      const { error } = await sb.auth.updateUser({ password: next.trim() });
      showToast(error ? 'Не вдалося оновити пароль: ' + error.message : 'Пароль оновлено ✓');
      return;
    }

    if (current !== getStoredPassword()) {
      showToast('Поточний пароль невірний');
      return;
    }
    localStorage.setItem(STORAGE_PASSWORD_KEY, next.trim());
    showToast('Пароль оновлено');
  });

  logoutBtn.addEventListener('click', exitAdminMode);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && loginModal.classList.contains('open')) closeLogin();
  });

  /* ============================================================
     Фото тренерів та галереї залу
     ============================================================ */
  function compressImage(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        reject(new Error('Обери файл зображення'));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Не вдалося прочитати файл'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Не вдалося обробити зображення'));
        img.onload = () => {
          let { width, height } = img;
          if (width > MAX_PHOTO_DIMENSION || height > MAX_PHOTO_DIMENSION) {
            const scale = MAX_PHOTO_DIMENSION / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', PHOTO_QUALITY));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function savePhotoLocal(key, dataUrl) {
    const photos = getPhotoStore();
    photos[key] = dataUrl;
    try {
      localStorage.setItem(PHOTO_STORAGE_KEY, JSON.stringify(photos));
      return true;
    } catch (e) {
      showToast('Забракло місця в браузері для цього фото. Спробуй менше зображення.');
      return false;
    }
  }

  // Делегування: працює і для карток, доданих пізніше (нові тренери)
  document.addEventListener('change', async (e) => {
    const input = e.target.closest && e.target.closest('[data-photo-input]');
    if (!input) return;
    {
      const key = input.dataset.photoInput;
      const file = e.target.files[0];
      if (!file) return;
      showToast('Обробка фото…');
      try {
        const dataUrl = await compressImage(file);
        if (savePhotoLocal(key, dataUrl)) {
          applySavedPhotos();
          if (isRemote) {
            const ok = await remotePushPhoto(key, dataUrl);
            showToast(ok ? 'Фото збережено в хмарі ✓' : 'Фото збережено локально, але не вдалось завантажити в хмару');
          } else {
            showToast('Фото збережено ✓ (локальний режим)');
          }
        }
      } catch (err) {
        showToast(err.message || 'Помилка завантаження фото');
      } finally {
        input.value = '';
      }
    }
  });

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest && e.target.closest('[data-photo-remove]');
    if (!btn) return;
    const key = btn.dataset.photoRemove;
    const photos = getPhotoStore();
    if (!photos[key]) return;
    if (!confirm('Видалити це фото?')) return;
    delete photos[key];
    localStorage.setItem(PHOTO_STORAGE_KEY, JSON.stringify(photos));
    applySavedPhotos();
    if (isRemote) await remoteDeletePhoto(key);
    showToast('Фото видалено');
  });

  /* ============================================================
     Оголошення та афіші
     ============================================================ */
  function todayLabel() {
    return new Date().toLocaleDateString('uk-UA', { day: '2-digit', month: 'long' });
  }

  async function updateAnnouncementField(id, field, value) {
    const store = getAnnouncementsStore();
    const item = store.items.find((i) => i.id === id);
    if (!item) return;
    item[field] = value;
    saveAnnouncementsStoreLocal(store);
    if (isRemote) await remoteUpsertAnnouncement(item);
  }

  async function deleteAnnouncement(id) {
    if (!confirm('Видалити це оголошення?')) return;
    const store = getAnnouncementsStore();
    store.items = store.items.filter((i) => i.id !== id);
    saveAnnouncementsStoreLocal(store);
    renderAnnouncements();
    if (isRemote) await remoteDeleteAnnouncement(id);
    showToast('Оголошення видалено');
  }

  async function setAnnouncementImage(id, dataUrl) {
    const store = getAnnouncementsStore();
    const item = store.items.find((i) => i.id === id);
    if (!item) return;
    item.image = dataUrl;
    saveAnnouncementsStoreLocal(store);
    renderAnnouncements();
    if (isRemote) await remoteUpsertAnnouncement(item);
  }

  async function removeAnnouncementImage(id) {
    if (!confirm('Видалити афішу цього оголошення?')) return;
    const store = getAnnouncementsStore();
    const item = store.items.find((i) => i.id === id);
    if (!item) return;
    item.image = null;
    saveAnnouncementsStoreLocal(store);
    renderAnnouncements();
    if (isRemote) await remoteUpsertAnnouncement(item);
  }

  function buildAnnouncementCard(item) {
    const card = document.createElement('article');
    card.className = 'announcement-card reveal is-visible';
    card.dataset.id = item.id;

    const poster = document.createElement('div');
    poster.className = 'announcement-card__poster photo-slot' + (item.image ? ' has-photo' : '');

    const img = document.createElement('img');
    img.className = 'photo-img';
    img.alt = item.title || 'Афіша';
    if (item.image) img.src = item.image;

    const label = document.createElement('label');
    label.className = 'photo-upload';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.hidden = true;
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      showToast('Обробка афіші…');
      try {
        const dataUrl = await compressImage(file);
        await setAnnouncementImage(item.id, dataUrl);
        showToast(isRemote ? 'Афішу збережено в хмарі ✓' : 'Афішу збережено ✓');
      } catch (err) {
        showToast(err.message || 'Помилка завантаження афіші');
      }
    });
    const uploadBtnSpan = document.createElement('span');
    uploadBtnSpan.className = 'photo-upload__btn';
    uploadBtnSpan.textContent = '📷 Афіша';
    label.appendChild(input);
    label.appendChild(uploadBtnSpan);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'photo-remove';
    removeBtn.title = 'Видалити афішу';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => removeAnnouncementImage(item.id));

    poster.appendChild(img);
    poster.appendChild(label);
    if (item.image) poster.appendChild(removeBtn);

    const body = document.createElement('div');
    body.className = 'announcement-card__body';

    const dateEl = document.createElement('p');
    dateEl.className = 'announcement-card__date';
    dateEl.dataset.field = 'date';
    dateEl.textContent = item.date || todayLabel();

    const titleEl = document.createElement('h3');
    titleEl.className = 'announcement-card__title';
    titleEl.dataset.field = 'title';
    titleEl.textContent = item.title || 'Нове оголошення';

    const textEl = document.createElement('p');
    textEl.className = 'announcement-card__text';
    textEl.dataset.field = 'text';
    textEl.textContent = item.text || 'Опис події, акції чи анонсу…';

    [dateEl, titleEl, textEl].forEach((el) => {
      el.setAttribute('contenteditable', editing ? 'true' : 'false');
      el.spellcheck = false;
      el.addEventListener('blur', () => updateAnnouncementField(item.id, el.dataset.field, el.textContent.trim()));
    });

    body.appendChild(dateEl);
    body.appendChild(titleEl);
    body.appendChild(textEl);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'announcement-card__delete admin-round-btn admin-round-btn--remove';
    deleteBtn.title = 'Видалити оголошення';
    deleteBtn.setAttribute('aria-label', 'Видалити оголошення');
    deleteBtn.innerHTML = ICON_CROSS;
    deleteBtn.addEventListener('click', () => deleteAnnouncement(item.id));

    card.appendChild(poster);
    card.appendChild(body);
    card.appendChild(deleteBtn);
    return card;
  }

  function renderAnnouncements() {
    if (!announcementsSection || !announcementsGrid) return;
    const store = getAnnouncementsStore();
    const isAdmin = document.body.classList.contains('admin-mode');

    announcementsSection.classList.toggle('is-active', store.enabled);
    announcementsGrid.innerHTML = '';
    store.items.forEach((item) => announcementsGrid.appendChild(buildAnnouncementCard(item)));

    if (announcementsToggleBtn) {
      announcementsToggleBtn.textContent = `Оголошення: ${store.enabled ? 'Увімкнено' : 'Вимкнено'}`;
      announcementsToggleBtn.classList.toggle('is-active', store.enabled);
    }
    [navAnnounceLink, mobileAnnounceLink].forEach((link) => {
      if (link) link.classList.toggle('is-visible', store.enabled);
    });
    if (!store.enabled && !isAdmin) {
      announcementsSection.style.display = 'none';
    } else {
      announcementsSection.style.display = '';
    }
  }

  if (announcementsToggleBtn) {
    announcementsToggleBtn.addEventListener('click', async () => {
      const store = getAnnouncementsStore();
      store.enabled = !store.enabled;
      saveAnnouncementsStoreLocal(store);
      renderAnnouncements();
      if (isRemote) await remotePushAnnouncementsEnabled(store.enabled);
      showToast(store.enabled ? 'Розділ оголошень увімкнено для відвідувачів' : 'Розділ оголошень приховано від відвідувачів');
    });
  }

  if (addAnnouncementBtn) {
    addAnnouncementBtn.addEventListener('click', async () => {
      const store = getAnnouncementsStore();
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const newItem = { id, title: 'Нове оголошення', text: 'Опис події, акції чи анонсу…', date: todayLabel(), image: null, sortOrder: Date.now() };
      store.items.unshift(newItem);
      saveAnnouncementsStoreLocal(store);
      renderAnnouncements();
      const firstTitle = announcementsGrid.querySelector('.announcement-card__title');
      if (firstTitle) {
        firstTitle.focus();
        document.execCommand('selectAll', false, null);
      }
      if (isRemote) await remoteUpsertAnnouncement(newItem);
      showToast('Оголошення додано — заповни деталі');
    });
  }

  /* ============================================================
     Тренери: додавання / видалення + безкінечна карусель
     ============================================================ */
  // Початкові тренери беруться з HTML-розмітки
  const trainerDefaults = {};
  const defaultTrainerIds = [];
  document.querySelectorAll('#trainersTrack .trainer-card[data-trainer-id]').forEach((card) => {
    const id = card.dataset.trainerId;
    const photo = card.querySelector('.trainer-card__photo');
    defaultTrainerIds.push(id);
    trainerDefaults[id] = {
      name: card.querySelector('h3').textContent.trim(),
      role: card.querySelector('.trainer-card__role').textContent.trim(),
      hue: photo ? parseInt(photo.style.getPropertyValue('--hue'), 10) : 140,
    };
  });

  function getContentCache() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_CONTENT_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  async function saveContentKey(key, value) {
    const cache = getContentCache();
    if (cache[key] === value) return;
    cache[key] = value;
    localStorage.setItem(STORAGE_CONTENT_KEY, JSON.stringify(cache));
    if (isRemote) await remotePushContent({ [key]: value });
  }

  function getTrainerIds() {
    try {
      const ids = JSON.parse(localStorage.getItem(TRAINERS_KEY) || 'null');
      if (Array.isArray(ids)) return ids;
    } catch (e) { /* ignore */ }
    return defaultTrainerIds.slice();
  }

  async function saveTrainerIds(ids) {
    localStorage.setItem(TRAINERS_KEY, JSON.stringify(ids));
    if (isRemote) {
      const ok = await remotePushTrainers(ids);
      if (!ok) showToast('Не вдалося зберегти список тренерів у хмарі');
    }
  }

  function trainerHue(id) {
    if (trainerDefaults[id]) return trainerDefaults[id].hue;
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
    return 95 + (h % 70); // зелені відтінки, як у решти карток
  }

  function buildTrainerCard(id, content, photos) {
    const defaults = trainerDefaults[id] || { name: 'Новий тренер', role: 'Напрям тренувань' };
    const name = content[id + '.name'] != null ? content[id + '.name'] : defaults.name;
    const role = content[id + '.role'] != null ? content[id + '.role'] : defaults.role;

    const card = document.createElement('article');
    card.className = 'trainer-card';
    card.dataset.trainerId = id;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'trainer-card__delete admin-round-btn admin-round-btn--remove';
    del.title = 'Видалити тренера';
    del.setAttribute('aria-label', 'Видалити тренера');
    del.innerHTML = ICON_CROSS;
    del.addEventListener('click', () => deleteTrainer(id));

    const photo = document.createElement('div');
    photo.className = 'trainer-card__photo photo-slot' + (photos[id] ? ' has-photo' : '');
    photo.style.setProperty('--hue', trainerHue(id));

    const img = document.createElement('img');
    img.className = 'photo-img';
    img.dataset.photoKey = id;
    img.alt = name;
    if (photos[id]) img.src = photos[id];

    const label = document.createElement('label');
    label.className = 'photo-upload';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.hidden = true;
    input.dataset.photoInput = id;
    const uploadBtn = document.createElement('span');
    uploadBtn.className = 'photo-upload__btn';
    uploadBtn.textContent = '📷 Фото';
    label.appendChild(input);
    label.appendChild(uploadBtn);

    const removePhoto = document.createElement('button');
    removePhoto.type = 'button';
    removePhoto.className = 'photo-remove';
    removePhoto.dataset.photoRemove = id;
    removePhoto.title = 'Видалити фото';
    removePhoto.textContent = '✕';

    photo.appendChild(img);
    photo.appendChild(label);
    photo.appendChild(removePhoto);

    const nameEl = document.createElement('h3');
    nameEl.dataset.editKey = id + '.name';
    nameEl.textContent = name;

    const roleEl = document.createElement('span');
    roleEl.className = 'trainer-card__role';
    roleEl.dataset.editKey = id + '.role';
    roleEl.textContent = role;

    // Instagram тренера: відвідувачі бачать рядок, лише коли нік вписаний
    const ig = document.createElement('a');
    ig.className = 'trainer-card__ig';
    ig.target = '_blank';
    ig.rel = 'noopener';
    ig.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle class="ig-dot" cx="17.3" cy="6.7" r="1.1"/></svg>';
    const igHandle = document.createElement('span');
    igHandle.className = 'trainer-card__ig-handle';
    igHandle.dataset.editKey = id + '.instagram';
    igHandle.textContent = content[id + '.instagram'] || '';
    ig.appendChild(igHandle);
    updateTrainerInstagram(ig);

    [nameEl, roleEl, igHandle].forEach((el) => {
      el.setAttribute('contenteditable', editing ? 'true' : 'false');
      el.spellcheck = false;
    });

    card.appendChild(del);
    card.appendChild(photo);
    card.appendChild(nameEl);
    card.appendChild(roleEl);
    card.appendChild(ig);
    return card;
  }

  function updateTrainerInstagram(link) {
    const handleEl = link.querySelector('.trainer-card__ig-handle');
    const raw = handleEl.textContent.trim();
    const url = instagramUrl(raw);
    link.classList.toggle('is-empty', !url);
    if (url) {
      link.href = url;
      link.setAttribute('aria-label', 'Instagram тренера: ' + raw);
    } else {
      link.removeAttribute('href');
      link.removeAttribute('aria-label');
    }
  }

  function renderTrainers() {
    if (!trainersTrack) return;
    const content = getContentCache();
    const photos = getPhotoStore();
    trainersTrack.innerHTML = '';
    getTrainerIds().forEach((id) => trainersTrack.appendChild(buildTrainerCard(id, content, photos)));
    carousel.setup();
  }

  function refreshTrainerClones() {
    carousel.refresh();
  }

  async function deleteTrainer(id) {
    const nameEl = trainersTrack.querySelector(`[data-edit-key="${id}.name"]`);
    const name = nameEl ? nameEl.textContent.trim() : 'цього тренера';
    if (!confirm(`Видалити тренера «${name}»?`)) return;

    await saveTrainerIds(getTrainerIds().filter((t) => t !== id));

    const photos = getPhotoStore();
    if (photos[id]) {
      delete photos[id];
      localStorage.setItem(PHOTO_STORAGE_KEY, JSON.stringify(photos));
    }
    const keys = [id + '.name', id + '.role', id + '.instagram'];
    const cache = getContentCache();
    keys.forEach((k) => delete cache[k]);
    localStorage.setItem(STORAGE_CONTENT_KEY, JSON.stringify(cache));
    renderTrainers();
    if (isRemote) await Promise.all([remoteDeletePhoto(id), remoteDeleteContentKeys(keys)]);
    showToast('Тренера видалено');
  }

  if (addTrainerBtn) {
    addTrainerBtn.addEventListener('click', async () => {
      const id = 'trainer_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      const ids = getTrainerIds();
      ids.push(id);
      await saveTrainerIds(ids);
      if (!editing) setEditing(true);
      renderTrainers();
      carousel.showOriginal(ids.length - 1);
      const nameEl = trainersTrack.querySelector(`[data-edit-key="${id}.name"]`);
      if (nameEl) {
        nameEl.focus({ preventScroll: true });
        document.execCommand('selectAll', false, null);
      }
      showToast('Тренера додано — введи імʼя, напрям і завантаж фото');
    });
  }

  if (trainersTrack) {
    // Зміни імені/напряму тренера зберігаються одразу, як і в оголошеннях
    trainersTrack.addEventListener('focusout', (e) => {
      const el = e.target.closest('[data-edit-key]');
      if (!el || !editing) return;
      const value = el.textContent.trim();
      saveContentKey(el.dataset.editKey, value);
      if (el.tagName === 'H3') {
        const img = el.closest('.trainer-card').querySelector('.photo-img');
        if (img) img.alt = value;
      }
      const igLink = el.closest('.trainer-card__ig');
      if (igLink) {
        // нормалізуємо: «xfit_coach», посилання чи «@xfit_coach» → «@xfit_coach»
        const url = instagramUrl(value);
        const handle = url ? '@' + decodeURIComponent(url.split('/').pop()) : '';
        if (handle !== value) {
          el.textContent = handle;
          saveContentKey(el.dataset.editKey, handle);
        }
        updateTrainerInstagram(igLink);
      }
      refreshTrainerClones();
    });
    // Під час редагування клік по рядку Instagram не відкриває посилання
    trainersTrack.addEventListener('click', (e) => {
      if (editing && e.target.closest('.trainer-card__ig')) e.preventDefault();
    });
  }

  // «Колесо»: картки стоять на 3D-барабані, видно кілька (5 на комп'ютері, 3 на телефоні),
  // барабан крутиться свайпом з інерцією і нескінченно
  const carousel = (function () {
    const root = trainersCarousel;
    const track = trainersTrack;
    const viewport = root ? root.querySelector('.trainers__viewport') : null;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const AUTOPLAY_MS = 4500;
    const STIFFNESS = 0.075;
    const DAMPING = 0.8;
    let active = false;
    let cards = [];
    let count = 0;
    let half = 2;       // скільки карток видно з кожного боку від центральної
    let step = 34;      // кут між сусідніми картками, градуси
    let radius = 0;
    let pos = 0;        // поточна позиція барабана в картках (дробова)
    let target = 0;
    let velocity = 0;
    let raf = null;
    let timer = null;
    let hovering = false;
    let dragging = false;

    const noop = { setup() {}, refresh() {}, showOriginal() {}, restartAutoplay() {} };
    if (!root || !track || !viewport) return noop;

    const mod = (n, m) => ((n % m) + m) % m;

    function frontIndex() {
      return mod(Math.round(target), count);
    }

    function render() {
      cards.forEach((card, i) => {
        // зсув картки від центру по найкоротшому шляху по колу
        let rel = mod(i - pos + count / 2, count) - count / 2;
        const dist = Math.abs(rel);
        const hidden = dist > half + 0.5;
        let opacity = 1 - Math.min(dist, half) * 0.14;
        if (dist > half) opacity *= Math.max(0, 1 - (dist - half) * 2);
        card.style.transform = `rotateY(${(rel * step).toFixed(3)}deg) translateZ(${radius}px)`;
        card.style.opacity = hidden ? '0' : opacity.toFixed(3);
        card.style.filter = dist > 0.05 ? `brightness(${Math.max(0.4, 1 - dist * 0.24).toFixed(3)})` : '';
        card.style.visibility = hidden ? 'hidden' : '';
        card.style.zIndex = String(100 - Math.round(dist * 10));
        const front = dist < 0.5;
        card.classList.toggle('is-front', front);
        card.setAttribute('aria-hidden', front ? 'false' : 'true');
      });
    }

    function tick() {
      raf = null;
      if (dragging) return;
      velocity = velocity * DAMPING + (target - pos) * STIFFNESS;
      pos += velocity;
      if (Math.abs(target - pos) < 0.001 && Math.abs(velocity) < 0.001) {
        pos = target;
        velocity = 0;
        render();
        return;
      }
      render();
      raf = requestAnimationFrame(tick);
    }

    function animate() {
      if (reducedMotion) {
        pos = target;
        velocity = 0;
        render();
        return;
      }
      if (!raf) raf = requestAnimationFrame(tick);
    }

    function go(delta) {
      if (!active) return;
      target = Math.round(target) + delta;
      animate();
    }

    function spinTo(i) {
      let diff = mod(i - Math.round(target), count);
      if (diff > count / 2) diff -= count;
      go(diff);
    }

    function measure() {
      if (!active) return;
      const cardW = cards[0] ? cards[0].offsetWidth : 260;
      radius = Math.round((cardW / 2 + cardW * 0.08) / Math.tan((step * Math.PI) / 360));
      track.style.transform = `translateZ(${-radius}px)`;
      track.style.height = Math.max(...cards.map((c) => c.offsetHeight)) + 'px';
      render();
    }

    function setup() {
      const keep = active ? frontIndex() : 0;
      const css = getComputedStyle(root);
      const perView = parseInt(css.getPropertyValue('--per-view'), 10) || 1;
      const visible = parseInt(css.getPropertyValue('--wheel-visible'), 10) || 5;
      step = parseFloat(css.getPropertyValue('--wheel-step')) || 34;
      cards = Array.from(track.querySelectorAll('.trainer-card'));
      count = cards.length;
      active = count > perView;
      half = Math.floor((Math.min(visible, count) - 1) / 2);
      root.classList.toggle('is-wheel', active);
      if (active) {
        target = pos = Math.min(keep, count - 1);
        velocity = 0;
        measure();
      } else {
        track.style.transform = '';
        track.style.height = '';
        cards.forEach((card) => {
          ['transform', 'opacity', 'filter', 'visibility', 'zIndex'].forEach((k) => { card.style[k] = ''; });
          card.classList.remove('is-front');
          card.removeAttribute('aria-hidden');
        });
      }
      restartAutoplay();
    }

    function showOriginal(i) {
      if (!active) return;
      target = pos = i;
      velocity = 0;
      render();
    }

    function restartAutoplay() {
      clearInterval(timer);
      timer = null;
      if (!active || reducedMotion || document.body.classList.contains('admin-mode')) return;
      timer = setInterval(() => {
        if (hovering || dragging || document.hidden || root.contains(document.activeElement)) return;
        go(1);
      }, AUTOPLAY_MS);
    }

    const prevBtn = document.getElementById('trainersPrev');
    const nextBtn = document.getElementById('trainersNext');
    if (prevBtn) prevBtn.addEventListener('click', () => go(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => go(1));
    root.addEventListener('mouseenter', () => { hovering = true; });
    root.addEventListener('mouseleave', () => { hovering = false; });

    // Свайп: тягнеш — барабан крутиться за пальцем, відпускаєш — котиться за інерцією
    let startX = 0;
    let startPos = 0;
    let lastX = 0;
    let lastT = 0;
    let dragVelocity = 0; // карток за мс
    let moved = false;
    let pressedCard = null;

    function cardsPerPx() {
      return 1 / ((cards[0] && cards[0].offsetWidth) || 260);
    }

    viewport.addEventListener('pointerdown', (e) => {
      if (!active || e.button !== 0) return;
      if (e.target.closest('[contenteditable="true"], button, label, input')) return;
      dragging = true;
      moved = false;
      startX = lastX = e.clientX;
      lastT = performance.now();
      startPos = pos;
      dragVelocity = 0;
      velocity = 0;
      pressedCard = e.target.closest('.trainer-card');
    });
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > 6) {
        moved = true;
        root.classList.add('is-dragging');
      }
      if (!moved) return;
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      const v = -(e.clientX - lastX) * cardsPerPx() / dt;
      dragVelocity = dragVelocity * 0.6 + v * 0.4;
      lastX = e.clientX;
      lastT = now;
      pos = startPos - dx * cardsPerPx();
      target = pos;
      render();
    }, { passive: true });
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      root.classList.remove('is-dragging');
      if (!moved) {
        // клік по боковій картці — докручуємо її в центр
        if (pressedCard && !pressedCard.classList.contains('is-front')) spinTo(cards.indexOf(pressedCard));
        return;
      }
      if (performance.now() - lastT > 120) dragVelocity = 0;
      // інерція: чим швидше свайп, тим далі прокрутиться колесо
      target = Math.round(pos + dragVelocity * 380);
      velocity = dragVelocity * 16;
      animate();
    }
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    viewport.addEventListener('click', (e) => {
      const card = e.target.closest('.trainer-card');
      if (moved || (active && card && !card.classList.contains('is-front') && !e.target.closest('button'))) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    }, true);
    viewport.addEventListener('scroll', () => { viewport.scrollLeft = 0; });

    let resizeTimer = null;
    let lastWidth = window.innerWidth;
    window.addEventListener('resize', () => {
      // на телефонах resize спрацьовує і від ховання адресного рядка — реагуємо лише на зміну ширини
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(setup, 150);
    });

    return { setup, refresh: measure, showOriginal, restartAutoplay };
  })();

  /* ============================================================
     Редаговані списки: програми, переваги, галерея, абонементи,
     розклад, локації, пункти списків. Адмін додає «+» і видаляє «×».
     Розмітка: контейнер [data-list="назва"], елементи [data-list-item="id"].
     Ключі контенту/фото елемента — це його id або id + '.щось'.
     ============================================================ */
  const lists = {}; // назва → { el, template, templateId, defaults, addWrap }

  function getListsStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LISTS_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function listItems(list) {
    return Array.from(list.el.children).filter((c) => c.hasAttribute('data-list-item'));
  }

  function ownsKey(id, key) {
    return key === id || key.startsWith(id + '.');
  }

  // Перейменовує всі ключі всередині копії елемента: program1.title → programs_ab12.title
  function renameKeys(root, oldId, newId) {
    const attrs = ['data-list-item', 'data-list', 'data-edit-key', 'data-photo-key', 'data-photo-input', 'data-photo-remove'];
    [root, ...root.querySelectorAll('*')].forEach((el) => {
      attrs.forEach((a) => {
        const v = el.getAttribute(a);
        if (v && ownsKey(oldId, v)) el.setAttribute(a, newId + v.slice(oldId.length));
      });
    });
  }

  function placeholderFor(el) {
    if (el.dataset.editType === 'number') return '0';
    if (/^H[1-6]$/.test(el.tagName)) return 'Нова назва';
    if (el.tagName === 'LI' || el.parentElement.tagName === 'LI') return 'Новий пункт';
    if (el.tagName === 'P') return 'Короткий опис';
    return null; // лишаємо текст шаблону (час, ціна, статус…)
  }

  function addRemoveButton(item, name) {
    if (item.querySelector(':scope > .list-item__remove')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'list-item__remove admin-round-btn admin-round-btn--remove';
    btn.title = 'Видалити';
    btn.setAttribute('aria-label', 'Видалити');
    btn.innerHTML = ICON_CROSS;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteListItem(name, item.dataset.listItem);
    });
    item.appendChild(btn);
  }

  function registerLists(root) {
    root.querySelectorAll('[data-list]').forEach((el) => {
      const name = el.dataset.list;
      if (lists[name] && lists[name].el === el) return;
      const items = Array.from(el.children).filter((c) => c.hasAttribute('data-list-item'));
      if (!items.length && !lists[name]) return;
      const prev = lists[name];
      const template = prev ? prev.template : items[0].cloneNode(true);
      const templateId = prev ? prev.templateId : items[0].dataset.listItem;
      if (!prev) {
        template.classList.remove('is-visible');
        template.querySelectorAll('.list-item__remove, .list-add').forEach((b) => b.remove());
      }

      const style = el.dataset.listStyle || 'card';
      const addWrap = document.createElement('div');
      addWrap.className = 'list-add list-add--' + style;
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'admin-round-btn admin-round-btn--add' + (style === 'card' ? '' : ' admin-round-btn--small');
      addBtn.title = 'Додати';
      addBtn.setAttribute('aria-label', 'Додати');
      addBtn.innerHTML = ICON_PLUS;
      addBtn.addEventListener('click', () => addListItem(name));
      addWrap.appendChild(addBtn);
      el.insertAdjacentElement('afterend', addWrap);

      lists[name] = { el, template, templateId, defaults: items.map((i) => i.dataset.listItem), addWrap };
      renderList(name);
    });
  }

  function createListItem(name, id) {
    const list = lists[name];
    const item = list.template.cloneNode(true);
    renameKeys(item, list.templateId, id);
    item.classList.add('is-visible');
    item.querySelectorAll('.is-visible').forEach((c) => c.classList.remove('is-visible'));
    item.querySelectorAll('[data-edit-key]').forEach((el) => {
      const text = placeholderFor(el);
      if (text !== null) el.textContent = text;
      if (el.dataset.editType === 'number') el.dataset.count = '0';
      el.setAttribute('contenteditable', editing ? 'true' : 'false');
      el.spellcheck = false;
    });
    item.querySelectorAll('.photo-slot, [data-list-item]').forEach((c) => c.classList.remove('has-photo'));
    item.classList.remove('has-photo', 'price-card--featured');
    item.querySelectorAll('.price-card__badge').forEach((b) => b.remove());
    item.querySelectorAll('img.photo-img').forEach((img) => img.removeAttribute('src'));
    return item;
  }

  function renderList(name) {
    const list = lists[name];
    if (!list) return;
    const stored = getListsStore()[name];
    const order = Array.isArray(stored) ? stored : list.defaults;
    const current = {};
    listItems(list).forEach((item) => { current[item.dataset.listItem] = item; });

    order.forEach((id) => {
      const item = current[id] || createListItem(name, id);
      delete current[id];
      list.el.appendChild(item); // переносить наявний вузол у правильне місце
      addRemoveButton(item, name);
    });
    Object.values(current).forEach((item) => item.remove());

    list.el.querySelectorAll(':scope > [data-list-item] [data-list-number]').forEach((el, i) => {
      el.textContent = String(i + 1).padStart(2, '0');
    });
    registerLists(list.el);
  }

  function renderAllLists() {
    Object.keys(lists).forEach(renderList);
  }

  async function saveListOrder(name, ids) {
    const store = getListsStore();
    store[name] = ids;
    localStorage.setItem(LISTS_KEY, JSON.stringify(store));
    if (isRemote) {
      const ok = await remotePushList(name, ids);
      if (!ok) showToast('Не вдалося зберегти зміни в хмарі');
    }
  }

  async function addListItem(name) {
    const list = lists[name];
    const id = name + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const ids = listItems(list).map((i) => i.dataset.listItem);
    ids.push(id);
    if (!editing) setEditing(true);
    await saveListOrder(name, ids);
    renderList(name);
    const item = list.el.querySelector(`:scope > [data-list-item="${id}"]`);
    // пункти вкладених списків нового елемента теж фіксуємо, щоб вони збереглися
    if (item) {
      for (const nested of item.querySelectorAll('[data-list]')) {
        const nestedName = nested.dataset.list;
        await saveListOrder(nestedName, Array.from(nested.children)
          .filter((c) => c.hasAttribute('data-list-item')).map((c) => c.dataset.listItem));
      }
      const first = item.querySelector('[data-edit-key]');
      if (first) {
        first.focus({ preventScroll: true });
        document.execCommand('selectAll', false, null);
      }
      item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    showToast('Додано — заповни текст' + (item && item.querySelector('[data-photo-input]') ? ' і завантаж фото' : ''));
  }

  async function deleteListItem(name, id) {
    const list = lists[name];
    const item = list.el.querySelector(`:scope > [data-list-item="${id}"]`);
    if (!item) return;
    if (!confirm('Видалити цей елемент?')) return;

    const contentKeys = Array.from(item.querySelectorAll('[data-edit-key]')).map((el) => el.dataset.editKey);
    if (item.dataset.editKey) contentKeys.push(item.dataset.editKey);
    const photoKeys = Array.from(item.querySelectorAll('[data-photo-key]')).map((el) => el.dataset.photoKey);
    const nestedLists = Array.from(item.querySelectorAll('[data-list]')).map((el) => el.dataset.list);

    await saveListOrder(name, listItems(list).map((i) => i.dataset.listItem).filter((x) => x !== id));
    renderList(name);

    const cache = getContentCache();
    contentKeys.forEach((k) => delete cache[k]);
    localStorage.setItem(STORAGE_CONTENT_KEY, JSON.stringify(cache));
    const photos = getPhotoStore();
    photoKeys.forEach((k) => delete photos[k]);
    localStorage.setItem(PHOTO_STORAGE_KEY, JSON.stringify(photos));
    const store = getListsStore();
    nestedLists.forEach((n) => { delete store[n]; delete lists[n]; });
    localStorage.setItem(LISTS_KEY, JSON.stringify(store));

    if (isRemote) {
      await Promise.all([
        remoteDeleteContentKeys(contentKeys), remoteDeletePhotos(photoKeys), remoteDeleteListSettings(nestedLists),
      ]);
    }
    showToast('Видалено');
  }

  // Текст у доданих елементах зберігається одразу після редагування
  document.addEventListener('focusout', (e) => {
    if (!editing || !e.target.closest) return;
    const el = e.target.closest('[data-edit-key]');
    if (!el || !el.closest('[data-list-item]')) return;
    saveContentKey(el.dataset.editKey, el.textContent.trim());
    if (el.dataset.editType === 'number') {
      const num = parseFloat(el.textContent);
      if (!Number.isNaN(num)) el.dataset.count = String(num);
    }
  });

  /* ============================================================
     Перегляд заявок з контактної форми (тільки для адміна)
     ============================================================ */
  function formatLeadDate(iso) {
    try {
      return new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return iso;
    }
  }

  async function loadLeads() {
    if (!isRemote) {
      leadsList.innerHTML = '<p class="admin-leads-empty">Заявки доступні лише в хмарному режимі (Supabase не налаштований).</p>';
      return;
    }
    leadsList.innerHTML = '<p class="admin-leads-empty">Завантаження…</p>';
    const { data, error } = await sb.from('leads').select('*').order('created_at', { ascending: false });
    if (error) {
      leadsList.innerHTML = '<p class="admin-leads-empty">Не вдалося завантажити заявки. Переконайся, що ти залогінений.</p>';
      return;
    }
    if (!data || !data.length) {
      leadsList.innerHTML = '<p class="admin-leads-empty">Поки що немає заявок.</p>';
      return;
    }
    leadsList.innerHTML = '';
    data.forEach((lead) => {
      const card = document.createElement('div');
      card.className = 'admin-lead-card';

      const date = document.createElement('p');
      date.className = 'admin-lead-card__date';
      date.textContent = formatLeadDate(lead.created_at);

      const nameRow = document.createElement('p');
      nameRow.className = 'admin-lead-card__row';
      nameRow.innerHTML = '<b>Ім\'я:</b> ';
      nameRow.appendChild(document.createTextNode(lead.name || '—'));

      const phoneRow = document.createElement('p');
      phoneRow.className = 'admin-lead-card__row';
      phoneRow.innerHTML = '<b>Телефон:</b> ';
      phoneRow.appendChild(document.createTextNode(lead.phone || '—'));

      const msgRow = document.createElement('p');
      msgRow.className = 'admin-lead-card__row';
      msgRow.innerHTML = '<b>Повідомлення:</b> ';
      msgRow.appendChild(document.createTextNode(lead.message || '—'));

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'admin-lead-card__delete';
      del.title = 'Видалити заявку';
      del.textContent = '✕';
      del.addEventListener('click', async () => {
        if (!confirm('Видалити цю заявку?')) return;
        await sb.from('leads').delete().eq('id', lead.id);
        loadLeads();
      });

      card.appendChild(date);
      card.appendChild(nameRow);
      card.appendChild(phoneRow);
      card.appendChild(msgRow);
      card.appendChild(del);
      leadsList.appendChild(card);
    });
  }

  if (leadsBtn) {
    leadsBtn.addEventListener('click', () => {
      leadsModal.classList.add('open');
      loadLeads();
    });
  }
  if (leadsClose) {
    leadsClose.addEventListener('click', () => leadsModal.classList.remove('open'));
  }
  if (leadsModal) {
    leadsModal.addEventListener('click', (e) => {
      if (e.target === leadsModal) leadsModal.classList.remove('open');
    });
  }

  /* ---------- Ініціалізація ---------- */
  renderTrainers();
  registerLists(document);
  applySavedContent();
  applySavedPhotos();
  renderAnnouncements();

  (async () => {
    await syncFromRemote();
    if (isRemote) {
      if (await hasRemoteSession()) enterAdminMode();
    } else if (sessionStorage.getItem(SESSION_FLAG_KEY) === '1') {
      enterAdminMode();
    }
  })();
})();
