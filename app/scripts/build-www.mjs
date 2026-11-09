// Збирає app/www — вбудовану версію «Моєї карти», таймера й «Моїх тренувань» для Capacitor.
// Джерело — файли сайту в корені репозиторію; запускати з папки app: npm run build
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.resolve(APP, '..');
const WWW = path.join(APP, 'www');
const NM = path.join(APP, 'node_modules');

fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });
const copy = (rel, to = rel) => fs.cpSync(path.join(SITE, rel), path.join(WWW, to), { recursive: true });

// 1. Сторінки, стилі, скрипти, іконки
['css/style.css', 'css/card.css', 'css/train.css',
 'js/supabase-config.js', 'js/native.js', 'js/scanner.js', 'js/card.js', 'js/train.js',
 'js/vendor/qrcode-generator-1.4.4.js', 'js/vendor/jsbarcode-3.11.6.min.js', 'js/vendor/zxing-library-0.21.3.min.js',
 'assets/favicon.svg', 'assets/logo.svg', 'assets/icon-192.png', 'assets/icon-512.png'].forEach((f) => copy(f));
fs.copyFileSync(path.join(NM, '@supabase/supabase-js/dist/umd/supabase.js'), path.join(WWW, 'js/vendor/supabase.js'));

// 2. Шрифти локально — додаток відкривається й без інтернету
fs.mkdirSync(path.join(WWW, 'fonts'), { recursive: true });
const SUBSETS = ['cyrillic-ext', 'cyrillic', 'latin-ext', 'latin'];
let fontCss = '';
for (const [pkg, weights] of [['inter', [400, 500, 600, 700, 800]], ['unbounded', [500, 700, 900]]]) {
  for (const w of weights) {
    const css = fs.readFileSync(path.join(NM, '@fontsource', pkg, `${w}.css`), 'utf8');
    for (const block of css.match(/@font-face\s*{[^}]*}/g) || []) {
      const file = (block.match(/files\/([a-z0-9-]+-normal)\.woff2/) || [])[1];
      if (!file || !SUBSETS.some((s) => file.includes(`-${s}-${w}-`))) continue;
      fs.copyFileSync(path.join(NM, '@fontsource', pkg, 'files', `${file}.woff2`), path.join(WWW, 'fonts', `${file}.woff2`));
      const range = (block.match(/unicode-range:\s*([^;]+);/) || [])[1];
      const family = pkg === 'inter' ? 'Inter' : 'Unbounded';
      fontCss += `@font-face{font-family:'${family}';font-style:normal;font-weight:${w};font-display:swap;src:url('../fonts/${file}.woff2') format('woff2');${range ? `unicode-range:${range};` : ''}}\n`;
    }
  }
}
fs.writeFileSync(path.join(WWW, 'css/fonts.css'), fontCss);

// 3. HTML: без CDN і Google Fonts, з нативним мостом; «на головну» в додатку — це «Моя карта»
function page(name, extra = (s) => s) {
  let s = fs.readFileSync(path.join(SITE, name), 'utf8');
  s = s.replace(/<link rel="preconnect"[^>]*>\n?/g, '')
    .replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>\n?/g, '<link rel="stylesheet" href="css/fonts.css">\n')
    .replace(/<link rel="manifest"[^>]*>\n?/g, '')
    .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2\/dist\/umd\/supabase\.js"><\/script>/, '<script src="js/vendor/supabase.js"></script>')
    .replace(/<meta charset="UTF-8">/, '<meta charset="UTF-8">\n<script src="js/native.js"></script>');
  s = extra(s);
  if (/fonts\.googleapis|cdn\.jsdelivr/.test(s)) throw new Error(`${name}: лишились зовнішні посилання`);
  fs.writeFileSync(path.join(WWW, name), s);
}
page('card.html', (s) => s.replace('<a href="./" aria-label="На головну XFit">', '<a href="card.html" aria-label="Моя карта">'));
page('train.html', (s) => s.replace('<a href="./" class="train-bar__back"', '<a href="card.html" class="train-bar__back"'));
page('privacy.html', (s) => s.replace('<a class="legal__back" href="./">← На сайт</a>', '<a class="legal__back" href="card.html">← Моя карта</a>').replace('<a href="./" aria-label="На головну XFit">', '<a href="card.html" aria-label="Моя карта">'));

// 4. Стартова сторінка — «Моя карта»
fs.writeFileSync(path.join(WWW, 'index.html'), `<!DOCTYPE html>
<html lang="uk"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>XFit</title><style>html,body{margin:0;height:100%;background:#060706}</style>
<script>location.replace('card.html' + location.search + location.hash);</script></head><body></body></html>
`);

const size = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? size(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
console.log(`www зібрано: ${(size(WWW) / 1024 / 1024).toFixed(1)} МБ`);
