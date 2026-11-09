/* ============================================================
   XFit — нативні можливості в мобільному додатку (Android / iOS, Capacitor).
   Підключається лише у збірці додатку (app/scripts/build-www.mjs); на сайті не потрібен.
   - режим сканування карти: максимальна яскравість, екран не гасне;
   - вібрація (Haptics), системне «Поділитися», екран не гасне під час таймера;
   - посилання на сайт та Instagram відкриваються в браузері, кнопка «Назад» на Android.
   ============================================================ */
(function (root) {
  const cap = root.Capacitor;
  if (!cap || !(cap.isNativePlatform ? cap.isNativePlatform() : cap.isNative)) return;
  const P = (name) => (cap.Plugins && cap.Plugins[name]) || (cap.registerPlugin ? cap.registerPlugin(name) : null);
  const call = (name, method, args) => { try { const p = P(name); return p && p[method] ? Promise.resolve(p[method](args)).catch(() => {}) : Promise.resolve(); } catch (e) { return Promise.resolve(); } };
  const SITE = 'https://xfit.com.ua/';
  const BUNDLED = ['card.html', 'train.html', 'privacy.html'];

  document.documentElement.classList.add('is-native');
  document.documentElement.dataset.platform = cap.getPlatform ? cap.getPlatform() : '';

  // Верхня панель телефону — у кольорах XFit
  call('StatusBar', 'setStyle', { style: 'DARK' });
  if (cap.getPlatform && cap.getPlatform() === 'android') call('StatusBar', 'setBackgroundColor', { color: '#060706' });
  const hideSplash = () => call('SplashScreen', 'hide', { fadeOutDuration: 250 });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hideSplash); else hideSplash();

  // Вібрація → нативний відгук (на iPhone navigator.vibrate не працює взагалі)
  navigator.vibrate = function (pattern) {
    const ms = Array.isArray(pattern) ? pattern.reduce((a, b) => a + b, 0) : Number(pattern) || 0;
    if (ms <= 0) return true;
    if (ms <= 150) call('Haptics', 'impact', { style: 'MEDIUM' });
    else call('Haptics', 'vibrate', { duration: Math.min(ms, 1000) });
    return true;
  };

  // «Поділитися» — системне вікно (у WebView Android navigator.share немає)
  navigator.share = function (data) {
    return P('Share').share({ title: data && data.title, text: data && data.text, url: data && data.url, dialogTitle: 'Поділитися' })
      .catch((e) => { const err = new Error(e && e.message || 'Share cancelled'); err.name = 'AbortError'; throw err; });
  };

  // Екран не гасне (таймер, режим сканування) — замість Wake Lock API
  let awake = 0;
  const lock = () => ({ released: false, addEventListener() {}, removeEventListener() {}, release() { if (this.released) return Promise.resolve(); this.released = true; awake = Math.max(0, awake - 1); return awake ? Promise.resolve() : call('KeepAwake', 'allowSleep'); } });
  try {
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request() { awake += 1; return call('KeepAwake', 'keepAwake').then(lock); } } });
  } catch (e) { /* ignore */ }

  // Режим сканування карти на рецепції: яскравість на максимум, потім повертаємо як було
  let savedBrightness = null;
  root.XFitNative = {
    platform: cap.getPlatform ? cap.getPlatform() : '',
    scanMode(on) {
      const SB = P('ScreenBrightness');
      if (!SB) return;
      if (on) {
        Promise.resolve(SB.getBrightness()).then((r) => { if (savedBrightness === null) savedBrightness = r && typeof r.brightness === 'number' ? r.brightness : null; })
          .catch(() => {}).then(() => SB.setBrightness({ brightness: 1 })).catch(() => {});
      } else {
        const back = savedBrightness;
        savedBrightness = null;
        Promise.resolve(SB.setBrightness({ brightness: back === null || back < 0 ? -1 : back })).catch(() => {});
      }
    },
  };

  // Посилання: сторінки сайту, Instagram — у браузері; карта, таймер, політика — всередині додатку
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || /^(tel|sms|mailto):/i.test(href)) return;
    let url;
    try { url = new URL(href, location.href); } catch (err) { return; }
    let target = null;
    if (url.origin !== location.origin) target = url.href;
    else {
      const file = url.pathname.split('/').pop();
      if (!BUNDLED.includes(file)) target = SITE + (file && file !== 'index.html' ? file : '') + url.search.replace(/[?&]source=app/, '') + url.hash;
    }
    if (!target) return;
    e.preventDefault();
    call('Browser', 'open', { url: target, presentationStyle: 'popover', toolbarColor: '#060706' });
  }, true);

  // Кнопка «Назад» на Android: закрити режим сканування → назад по сторінках → вийти
  const App = P('App');
  if (App && App.addListener) {
    App.addListener('backButton', ({ canGoBack }) => {
      const zoom = document.getElementById('xcardZoom');
      if (zoom && !zoom.hidden) { zoom.click(); return; }
      if (canGoBack) history.back(); else call('App', 'exitApp');
    });
  }
})(window);
