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

  /* ---------- Синхронізація "з хмари" при завантаженні сторінки ---------- */
  async function syncFromRemote() {
    if (!isRemote) return;
    try {
      const [content, photos, announcements] = await Promise.all([
        remotePullContent(), remotePullPhotos(), remotePullAnnouncements(),
      ]);
      if (content) localStorage.setItem(STORAGE_CONTENT_KEY, JSON.stringify(content));
      if (photos) localStorage.setItem(PHOTO_STORAGE_KEY, JSON.stringify(photos));
      if (announcements) localStorage.setItem(ANNOUNCEMENTS_KEY, JSON.stringify(announcements));
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
    showToast(isRemote ? 'Адмін-режим активовано (хмара Supabase)' : 'Адмін-режим активовано (локальний режим)');
  }

  async function exitAdminMode() {
    setEditing(false);
    adminBar.classList.remove('open');
    document.body.classList.remove('admin-mode');
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

  document.querySelectorAll('[data-photo-input]').forEach((input) => {
    input.addEventListener('change', async (e) => {
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
    });
  });

  document.querySelectorAll('[data-photo-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
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
    deleteBtn.className = 'announcement-card__delete';
    deleteBtn.title = 'Видалити оголошення';
    deleteBtn.textContent = '🗑';
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
