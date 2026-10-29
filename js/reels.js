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
    section.classList.toggle('is-configured', !!cfg);
    renderSetup();
    if (!cfg) { mount.innerHTML = ''; return; }
    // віджет вантажимо, коли блок наближається до екрана, — головна лишається швидкою
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { io.disconnect(); renderWidget(current); }
      }, { rootMargin: '600px 0px' });
      io.observe(section);
    } else {
      renderWidget(cfg);
    }
  }

  function renderSetup() {
    setup.innerHTML = current
      ? `<p class="reels-setup__status">Підключено: <b>${PROVIDERS[current.provider].name}</b> · ID ${current.id}</p>
         <div class="reels-setup__actions"><button type="button" class="btn btn--ghost" data-reels="change">Змінити віджет</button><button type="button" class="btn btn--ghost reels-setup__off" data-reels="off">Вимкнути блок</button></div>`
      : `<p class="reels-setup__status">Блок приховано від відвідувачів, доки не підключено віджет.</p>`;
    setup.insertAdjacentHTML('beforeend', `
      <form class="reels-setup__form" id="reelsForm" ${current ? 'hidden' : ''}>
        <label for="reelsCode">Встав код вбудовування з Behold, Elfsight або SnapWidget</label>
        <textarea id="reelsCode" rows="3" placeholder="&lt;behold-widget feed-id=&quot;…&quot;&gt;… або &lt;div class=&quot;elfsight-app-…&quot;&gt; або посилання snapwidget.com/embed/…"></textarea>
        <p class="reels-setup__error" id="reelsError" role="alert"></p>
        <button type="submit" class="btn btn--primary">Підключити</button>
      </form>`);
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

  async function load() {
    let cfg = null;
    try { cfg = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch (e) { cfg = null; }
    apply(cfg);
    const { sb, isRemote } = A();
    if (!isRemote) return;
    try {
      const { data, error } = await sb.from('site_settings').select('value').eq('key', KEY);
      if (error) return;
      const remote = data && data[0] ? JSON.parse(data[0].value) : null;
      if (JSON.stringify(remote) !== JSON.stringify(cfg)) {
        try { remote ? localStorage.setItem(LOCAL_KEY, JSON.stringify(remote)) : localStorage.removeItem(LOCAL_KEY); } catch (e) { /* ignore */ }
        apply(remote);
      }
    } catch (e) { /* немає мережі — лишаємо збережене */ }
  }

  window.XFitReels = { parse };
  load();
})();
