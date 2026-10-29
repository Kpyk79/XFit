/* ============================================================
   XFit — блок «Ми в Instagram»: Reels через готовий віджет
   (Behold, Elfsight або SnapWidget). Адмін вставляє код вбудовування,
   який дав сервіс, — сайт розпізнає сервіс та ID і сам підключає
   офіційний код віджета (довільні скрипти не виконуються).
   Налаштування: site_settings → reels_widget (або localStorage у
   локальному режимі). Поки віджет не підключено, відвідувачі блоку
   не бачать.
   ============================================================ */
(function () {
  const section = document.getElementById('reels');
  const mount = document.getElementById('reelsWidget');
  const setup = document.getElementById('reelsSetup');
  if (!section || !mount || !setup) return;

  const KEY = 'reels_widget';
  const LOCAL_KEY = 'xfit_reels_widget_v1';
  const LINKS_KEY = 'reels_links';
  const LOCAL_LINKS_KEY = 'xfit_reels_links_v1';
  const strip = document.getElementById('reelsStrip');
  const track = document.getElementById('reelsTrack');
  const DEFAULT_LINKS = track ? String(track.dataset.defaultReels || '').split(/\s+/).filter(Boolean) : [];
  const A = () => window.XFitAdmin || {};

  const PROVIDERS = {
    behold: { name: 'Behold', script: { src: 'https://w.behold.so/widget.js', module: true } },
    elfsight: { name: 'Elfsight', script: { src: 'https://static.elfsight.com/platform/platform.js' } },
    snapwidget: { name: 'SnapWidget', script: { src: 'https://snapwidget.com/js/snapwidget.js' } },
  };

  // Розпізнаємо сервіс і ID з коду вбудовування (або просто з ID)
  function parse(code) {
    const t = String(code || '').trim();
    let m;
    if ((m = t.match(/feed-id=["']?([A-Za-z0-9_-]{6,})/)) || (m = t.match(/data-behold-id=["']?([A-Za-z0-9_-]{6,})/)) || (m = t.match(/behold\.so\/[^"'\s]*?([A-Za-z0-9]{12,})/))) return { provider: 'behold', id: m[1] };
    if ((m = t.match(/elfsight-app-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i))) return { provider: 'elfsight', id: m[1].toLowerCase() };
    if ((m = t.match(/snapwidget\.com\/embed\/([A-Za-z0-9_-]+)/))) return { provider: 'snapwidget', id: m[1] };
    return null;
  }

  // Посилання на Reels/пост → канонічне https://www.instagram.com/reel/<код>/
  function normalizeLinks(text) {
    const out = [];
    String(text || '').split(/[\s,]+/).forEach((part) => {
      const m = part.match(/instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(reels?|p|tv)\/([A-Za-z0-9_-]{5,})/);
      if (m) {
        const url = `https://www.instagram.com/${m[1] === 'p' ? 'p' : 'reel'}/${m[2]}/`;
        if (!out.includes(url)) out.push(url);
      }
    });
    return out;
  }
  let links = DEFAULT_LINKS;
  function renderLinks() {
    if (!strip || !track) return;
    const show = !current && links.length > 0;
    strip.hidden = !show;
    if (!show) { track.innerHTML = ''; return; }
    track.innerHTML = links.map((u) => `<div class="reel"><blockquote class="instagram-media" data-instgrm-permalink="${u}" data-instgrm-version="14" data-instgrm-captioned><a href="${u}" target="_blank" rel="noopener">Дивитися Reels в Instagram</a></blockquote></div>`).join('');
    const go = () => { if (window.instgrm && window.instgrm.Embeds) window.instgrm.Embeds.process(); };
    if (window.instgrm) go();
    else {
      loadScript({ src: 'https://www.instagram.com/embed.js' });
      const s = document.querySelector('script[src="https://www.instagram.com/embed.js"]');
      if (s) s.addEventListener('load', go, { once: true });
    }
  }
  if (strip) {
    strip.addEventListener('click', (e) => {
      const b = e.target.closest('[data-reels-scroll]');
      if (!b) return;
      track.scrollBy({ left: Number(b.dataset.reelsScroll) * Math.max(track.clientWidth * 0.8, 300), behavior: 'smooth' });
    });
  }

  function loadScript({ src, module }) {
    if (document.querySelector(`script[src="${src}"]`)) return;
    const s = document.createElement('script');
    s.src = src;
    if (module) s.type = 'module';
    s.async = true;
    document.body.appendChild(s);
  }

  function renderWidget(cfg) {
    mount.innerHTML = '';
    if (!cfg || !PROVIDERS[cfg.provider]) return;
    const id = String(cfg.id).replace(/[^A-Za-z0-9_-]/g, '');
    if (cfg.provider === 'behold') {
      const el = document.createElement('behold-widget');
      el.setAttribute('feed-id', id);
      mount.appendChild(el);
    } else if (cfg.provider === 'elfsight') {
      const el = document.createElement('div');
      el.className = 'elfsight-app-' + id;
      el.setAttribute('data-elfsight-app-lazy', '');
      mount.appendChild(el);
    } else if (cfg.provider === 'snapwidget') {
      const f = document.createElement('iframe');
      f.src = 'https://snapwidget.com/embed/' + id;
      f.className = 'snapwidget-widget';
      f.title = 'Instagram XFit';
      f.loading = 'lazy';
      f.setAttribute('allowtransparency', 'true');
      f.style.cssText = 'border:none;overflow:hidden;width:100%;min-height:480px';
      mount.appendChild(f);
    }
    loadScript(PROVIDERS[cfg.provider].script);
  }

  let current = null;
  function apply(cfg) {
    current = cfg;
    section.classList.toggle('is-configured', !!cfg || links.length > 0);
    renderSetup();
    if (!cfg) { mount.innerHTML = ''; lazy(renderLinks); return; }
    if (strip) { strip.hidden = true; track.innerHTML = ''; }
    lazy(() => renderWidget(current));
  }

  // віджет / Reels вантажимо, коли блок наближається до екрана, — головна лишається швидкою
  function lazy(fn) {
    if (!('IntersectionObserver' in window)) { fn(); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); fn(); }
    }, { rootMargin: '600px 0px' });
    io.observe(section);
  }

  function renderSetup() {
    const linksForm = `
      <form class="reels-setup__form" id="reelsLinksForm">
        <label for="reelsLinks">Reels на сайті — посилання з Instagram, по одному на рядок</label>
        <textarea id="reelsLinks" rows="4">${links.join('\n')}</textarea>
        <p class="reels-setup__error" id="reelsLinksError" role="alert"></p>
        <button type="submit" class="btn btn--primary">Зберегти Reels</button>
      </form>`;
    setup.innerHTML = current
      ? `<p class="reels-setup__status">Підключено: <b>${PROVIDERS[current.provider].name}</b> · ID ${current.id}</p>
         <div class="reels-setup__actions"><button type="button" class="btn btn--ghost" data-reels="change">Змінити віджет</button><button type="button" class="btn btn--ghost reels-setup__off" data-reels="off">Вимкнути блок</button></div>`
      : (links.length ? `<p class="reels-setup__status">Показано <b>${links.length}</b> Reels за посиланнями. Підключи віджет, якщо хочеш, щоб нові Reels з'являлись автоматично.</p>` : `<p class="reels-setup__status">Блок приховано від відвідувачів: додай посилання на Reels або підключи віджет.</p>`) + linksForm;
    setup.insertAdjacentHTML('beforeend', `
      <form class="reels-setup__form" id="reelsForm" ${current ? 'hidden' : ''}>
        <label for="reelsCode">Або підключи віджет: встав код вбудовування з Behold, Elfsight чи SnapWidget</label>
        <textarea id="reelsCode" rows="3" placeholder="&lt;behold-widget feed-id=&quot;…&quot;&gt;… або &lt;div class=&quot;elfsight-app-…&quot;&gt; або посилання snapwidget.com/embed/…"></textarea>
        <p class="reels-setup__error" id="reelsError" role="alert"></p>
        <button type="submit" class="btn btn--primary">Підключити</button>
      </form>`);
    const lf = setup.querySelector('#reelsLinksForm');
    if (lf) lf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const raw = setup.querySelector('#reelsLinks').value;
      const list = normalizeLinks(raw);
      if (raw.trim() && !list.length) { setup.querySelector('#reelsLinksError').textContent = 'Не знайшов посилань на Instagram. Скопіюй посилання на Reels: «⋯» → «Копіювати посилання».'; return; }
      try { await saveLinks(list); links = list; apply(current); A().showToast && A().showToast(list.length ? `Збережено ${list.length} Reels ✓` : 'Reels прибрано'); }
      catch (ex) { setup.querySelector('#reelsLinksError').textContent = ex.message; }
    });
    const form = setup.querySelector('#reelsForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cfg = parse(setup.querySelector('#reelsCode').value);
      const err = setup.querySelector('#reelsError');
      if (!cfg) { err.textContent = 'Не вдалося розпізнати код. Скопіюй код вбудовування повністю з кабінету Behold, Elfsight або SnapWidget.'; return; }
      try { await save(cfg); apply(cfg); A().showToast && A().showToast(PROVIDERS[cfg.provider].name + ' підключено ✓'); }
      catch (ex) { err.textContent = ex.message; }
    });
  }

  setup.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-reels]');
    if (!b) return;
    if (b.dataset.reels === 'change') { setup.querySelector('#reelsForm').hidden = false; setup.querySelector('#reelsCode').focus(); }
    if (b.dataset.reels === 'off') {
      if (!confirm('Прибрати блок Instagram із сайту?')) return;
      try { await save(null); apply(null); A().showToast && A().showToast('Блок Instagram вимкнено'); }
      catch (ex) { A().showToast && A().showToast(ex.message); }
    }
  });

  async function save(cfg) {
    const { sb, isRemote } = A();
    if (isRemote) {
      const { error } = cfg
        ? await sb.from('site_settings').upsert({ key: KEY, value: JSON.stringify(cfg) })
        : await sb.from('site_settings').delete().eq('key', KEY);
      if (error) throw new Error('Не вдалося зберегти в хмарі: ' + error.message);
    }
    try { cfg ? localStorage.setItem(LOCAL_KEY, JSON.stringify(cfg)) : localStorage.removeItem(LOCAL_KEY); } catch (e) { /* ignore */ }
  }

  async function saveLinks(list) {
    const { sb, isRemote } = A();
    if (isRemote) {
      const { error } = await sb.from('site_settings').upsert({ key: LINKS_KEY, value: JSON.stringify(list) });
      if (error) throw new Error('Не вдалося зберегти в хмарі: ' + error.message);
    }
    try { localStorage.setItem(LOCAL_LINKS_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
  }

  async function load() {
    try { const l = JSON.parse(localStorage.getItem(LOCAL_LINKS_KEY) || 'null'); if (Array.isArray(l)) links = l; } catch (e) { /* ignore */ }
    let cfg = null;
    try { cfg = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch (e) { cfg = null; }
    apply(cfg);
    const { sb, isRemote } = A();
    if (!isRemote) return;
    try {
      const { data, error } = await sb.from('site_settings').select('key,value').in('key', [KEY, LINKS_KEY]);
      if (error) return;
      const row = (k) => (data || []).find((r) => r.key === k);
      if (row(LINKS_KEY)) {
        const l = JSON.parse(row(LINKS_KEY).value);
        if (Array.isArray(l) && JSON.stringify(l) !== JSON.stringify(links)) {
          links = l;
          try { localStorage.setItem(LOCAL_LINKS_KEY, JSON.stringify(l)); } catch (e) { /* ignore */ }
          apply(cfg);
        }
      }
      const remote = row(KEY) ? JSON.parse(row(KEY).value) : null;
      if (JSON.stringify(remote) !== JSON.stringify(cfg)) {
        try { remote ? localStorage.setItem(LOCAL_KEY, JSON.stringify(remote)) : localStorage.removeItem(LOCAL_KEY); } catch (e) { /* ignore */ }
        apply(remote);
      }
    } catch (e) { /* немає мережі — лишаємо збережене */ }
  }

  window.XFitReels = { parse, normalizeLinks };
  load();
})();
