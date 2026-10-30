#!/usr/bin/env node
/* ============================================================
   Глобальне встановлення агентів, команд, навичок, правил і хуків
   у ~/.claude, щоб вони працювали в усіх проєктах Claude Code.

   Запуск:  node .claude/install-global.js
   Повторний запуск безпечний: файли оновлюються, хуки не дублюються.
   Перезаписані файли й старий settings.json зберігаються в
   ~/.claude/backups/agents-<дата>/.
   ============================================================ */
const fs = require('fs');
const os = require('os');
const path = require('path');

const SRC = __dirname;                                   // папка .claude з репозиторію
const DEST = path.join(os.homedir(), '.claude');         // глобальна папка Claude Code
const DIRS = ['agents', 'commands', 'skills', 'rules', 'contexts', 'scripts', 'hooks'];
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const BACKUP = path.join(DEST, 'backups', 'agents-' + STAMP);

let copied = 0;
let replaced = 0;

function backup(file) {
  const rel = path.relative(DEST, file);
  const to = path.join(BACKUP, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(file, to);
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) { copyDir(a, b); continue; }
    if (!entry.isFile()) continue;
    if (fs.existsSync(b)) {
      if (fs.readFileSync(a).equals(fs.readFileSync(b))) continue; // вже такий самий
      backup(b);
      replaced++;
    }
    fs.copyFileSync(a, b);
    if (/\.(sh|js)$/.test(entry.name)) { try { fs.chmodSync(b, 0o755); } catch (e) { /* Windows */ } }
    copied++;
  }
}

function count(dir) {
  try { return fs.readdirSync(path.join(DEST, dir)).filter((n) => !n.startsWith('.')).length; } catch (e) { return 0; }
}

// ---------- 1. Файли ----------
for (const d of DIRS) {
  const from = path.join(SRC, d);
  if (fs.existsSync(from)) copyDir(from, path.join(DEST, d));
}

// ---------- 2. Хуки в ~/.claude/settings.json ----------
// У проєкті хуки посилаються на "$CLAUDE_PROJECT_DIR"/.claude/...; глобально — на ~/.claude/...
const homeClaude = DEST.split(path.sep).join('/');
// весь шлях береться в лапки — працює і з пробілами в імені користувача на Windows
const fixPath = (cmd) => cmd.replace(/"\$CLAUDE_PROJECT_DIR"\/\.claude\/(\S+)/g, (m, rest) => `"${homeClaude}/${rest}"`);

const src = JSON.parse(fs.readFileSync(path.join(SRC, 'settings.json'), 'utf8'));
const settingsFile = path.join(DEST, 'settings.json');
let settings = {};
if (fs.existsSync(settingsFile)) {
  const raw = fs.readFileSync(settingsFile, 'utf8');
  try {
    settings = raw.trim() ? JSON.parse(raw) : {};
  } catch (e) {
    console.error(`✖ ${settingsFile} містить помилку JSON — виправ або видали його і запусти ще раз.`);
    process.exit(1);
  }
  backup(settingsFile);
}
settings.hooks = settings.hooks || {};
let hooksAdded = 0;
for (const [event, groups] of Object.entries(src.hooks || {})) {
  const target = (settings.hooks[event] = settings.hooks[event] || []);
  const existing = new Set(target.flatMap((g) => (g.hooks || []).map((h) => `${g.matcher || ''}\u0000${h.command}`)));
  for (const group of groups) {
    const hooks = (group.hooks || [])
      .map((h) => ({ ...h, command: fixPath(h.command) }))
      .filter((h) => !existing.has(`${group.matcher || ''}\u0000${h.command}`));
    if (!hooks.length) continue;
    target.push({ ...group, hooks });
    hooksAdded += hooks.length;
  }
}
if (!settings.$schema && src.$schema) settings = { $schema: src.$schema, ...settings };
fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n');

// ---------- 3. Підсумок ----------
console.log('\n✔ Готово. Встановлено в ' + DEST);
console.log(`  агенти: ${count('agents')}, команди: ${count('commands')}, навички: ${count('skills')}, правила: ${count('rules')}`);
console.log(`  файлів скопійовано: ${copied}${replaced ? ` (з них оновлено ${replaced})` : ''}`);
console.log(`  хуків додано в settings.json: ${hooksAdded}${hooksAdded ? '' : ' (уже були)'}`);
if (fs.existsSync(BACKUP)) console.log('  резервна копія попередніх файлів: ' + BACKUP);
console.log('\nПерезапусти Claude Code. Перевір: /agents — список агентів, / — команди.\n');
