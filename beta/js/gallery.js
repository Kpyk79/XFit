/* ============================================================
   XFit — перегляд фото галереї на весь екран.
   Торкання фото в центрі колеса (або будь-якого фото, коли колеса
   немає) відкриває його на весь екран; стрілки, свайп і клавіші
   ← → гортають фото по колу, Esc або ✕ закривають.
   ============================================================ */
(function () {
  const root = document.getElementById('galleryCarousel');
  const track = document.getElementById('galleryTrack');
  if (!root || !track) return;

  const ICON = {
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  };

  const box = document.createElement('div');
  box.className = 'lightbox';
  box.hidden = true;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Фото галереї');
  box.innerHTML = `
    <img class="lightbox__img" alt="">
    <button type="button" class="lightbox__btn lightbox__prev" aria-label="Попереднє фото">${ICON.prev}</button>
    <button type="button" class="lightbox__btn lightbox__next" aria-label="Наступне фото">${ICON.next}</button>
    <button type="button" class="lightbox__btn lightbox__close" aria-label="Закрити">${ICON.close}</button>
    <span class="lightbox__count" aria-live="polite"></span>`;
  document.body.appendChild(box);
  const img = box.querySelector('.lightbox__img');
  const count = box.querySelector('.lightbox__count');

  let photos = [];
  let index = 0;
  let lastFocus = null;

  // Фото — це плитки галереї з завантаженим зображенням, у порядку на сайті
  function collect() {
    return Array.from(track.querySelectorAll('.gallery-tile.has-photo .photo-img'))
      .filter((el) => el.getAttribute('src'))
      .map((el) => ({ src: el.getAttribute('src'), alt: el.alt || 'Фото залу XFit' }));
  }

  function show(i, dir) {
    if (!photos.length) return;
    index = ((i % photos.length) + photos.length) % photos.length;
    const p = photos[index];
    const swap = () => {
      img.src = p.src;
      img.alt = p.alt;
      img.classList.remove('is-switching');
    };
    if (dir && !img.classList.contains('is-switching')) {
      img.classList.add('is-switching');
      setTimeout(swap, 150);
    } else {
      swap();
    }
    count.textContent = photos.length > 1 ? `${index + 1} / ${photos.length}` : '';
    box.querySelector('.lightbox__prev').hidden = photos.length < 2;
    box.querySelector('.lightbox__next').hidden = photos.length < 2;
  }

  function open(src) {
    photos = collect();
    if (!photos.length) return;
    lastFocus = document.activeElement;
    const start = Math.max(0, photos.findIndex((p) => p.src === src));
    box.hidden = false;
    document.body.style.overflow = 'hidden';
    show(start);
    box.querySelector('.lightbox__close').focus({ preventScroll: true });
  }

  function close() {
    box.hidden = true;
    document.body.style.overflow = '';
    img.removeAttribute('src');
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  // Торкання фото: у колесі — лише центральне (бічне колесо спершу докручує в центр)
  track.addEventListener('click', (e) => {
    if (document.body.classList.contains('admin-editing')) return; // в адмінці фото завантажують/видаляють
    if (e.target.closest('button, label, input')) return;
    const tile = e.target.closest('.gallery-tile.has-photo');
    if (!tile) return;
    if (root.classList.contains('is-wheel') && !tile.classList.contains('is-front')) return;
    const el = tile.querySelector('.photo-img');
    if (el && el.getAttribute('src')) open(el.getAttribute('src'));
  });

  box.querySelector('.lightbox__prev').addEventListener('click', (e) => { e.stopPropagation(); show(index - 1, -1); });
  box.querySelector('.lightbox__next').addEventListener('click', (e) => { e.stopPropagation(); show(index + 1, 1); });
  box.querySelector('.lightbox__close').addEventListener('click', close);
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  document.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(index - 1, -1);
    else if (e.key === 'ArrowRight') show(index + 1, 1);
  });

  // Свайп вліво/вправо — наступне/попереднє фото, вниз — закрити
  let sx = null;
  let sy = 0;
  box.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    sx = e.clientX;
    sy = e.clientY;
  });
  box.addEventListener('pointerup', (e) => {
    if (sx === null) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) close();
  });

  window.XFitLightbox = { open, close };
})();
