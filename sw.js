/* XFit — service worker: робить сайт встановлюваним додатком і дає
   йому працювати без інтернету (показує останню завантажену версію).
   Сторінка береться з мережі в першу чергу, щоб зміни з адмінки
   з'являлись одразу; файли сайту — з кешу з оновленням у фоні.
   Запити до Supabase, EmailJS та інших сайтів не чіпаємо. */
const CACHE = 'xfit-v3'; // змінюй версію, коли міняються файли без ?v= (іконки, логотип)
const CORE = [
  './',
  'index.html',
  'manifest.webmanifest?v=2',
  'assets/favicon.svg?v=2',
  'assets/logo.svg',
  'assets/icon-192.png?v=2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  // Бібліотеки з CDN (three.js тощо) теж кешуємо, щоб 3D-фон працював офлайн
  const cdn = /^(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com)$/.test(url.hostname);
  if (!sameOrigin && !cdn) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put('index.html', copy));
          return res;
        })
        .catch(() => caches.match('index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
