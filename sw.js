/* XFit — service worker: робить сайт встановлюваним додатком і дає
   йому працювати без інтернету (показує останню завантажену версію).
   Коли інтернет є, сторінка і файли сайту завжди перевіряються на
   свіжість (кеш — лише запасний варіант офлайн), тож оновлення сайту
   видно одразу. Бібліотеки з CDN мають версію в адресі — їх беремо з
   кешу. Запити до Supabase, EmailJS та інших сайтів не чіпаємо. */
const CACHE = 'xfit-v16'; // змінюй версію, коли міняєш сам sw.js
const CORE = [
  './',
  'index.html',
  'train.html',
  'css/style.css?v=35',
  'css/train.css?v=4',
  'js/train.js?v=3',
  'card.html',
  'css/card.css?v=3',
  'js/card.js?v=5',
  'js/gallery.js?v=1',
  'js/vendor/qrcode-generator-1.4.4.js',
  'js/vendor/jsbarcode-3.11.6.min.js',
  'manifest.webmanifest?v=3',
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
      // чистимо лише старі кеші основного сайту (xfit-v…), кеш тестової версії /beta/ не чіпаємо
      .then((keys) => Promise.all(keys.filter((k) => /^xfit-v\d+$/.test(k) && k !== CACHE).map((k) => caches.delete(k))))
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

  // Сторінка і файли сайту: спершу мережа з перевіркою свіжості (no-cache
  // = браузер питає сервер, чи файл змінився; якщо ні — відповідь миттєва)
  if (sameOrigin) {
    const isPage = req.mode === 'navigate';
    // кожна сторінка кешується окремо (без ?source=… та #…)
    const page = url.pathname.split('/').pop() || 'index.html';
    const key = isPage ? page : req;
    event.respondWith(
      fetch(isPage ? req.url : req, { cache: 'no-cache', credentials: 'same-origin' })
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(key, copy));
          }
          return res;
        })
        .catch(() => caches.match(key).then((cached) => cached || (isPage ? caches.match('index.html') : undefined)))
    );
    return;
  }

  // CDN: з кешу, з оновленням у фоні
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
