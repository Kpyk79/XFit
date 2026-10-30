# Агенти Claude Code — встановлення на ПК для всіх проєктів

Встановлює в домашню папку `~/.claude` (Windows: `C:\Users\<ім'я>\.claude`):
12 агентів, 15 команд, 56 навичок, 8 правил і 14 хуків. Після цього вони
доступні в будь-якому проєкті Claude Code.

Потрібно: [Git](https://git-scm.com), [Node.js](https://nodejs.org) 18+ і Claude Code.

## Windows (PowerShell)

```powershell
$d="$env:TEMP\xfit-agents"; if (Test-Path $d) { Remove-Item $d -Recurse -Force }; git clone --depth 1 -b claude-agents https://github.com/Kpyk79/XFit.git $d; node "$d\.claude\install-global.js"
```

## Mac / Linux (Terminal)

```bash
rm -rf /tmp/xfit-agents && git clone --depth 1 -b claude-agents https://github.com/Kpyk79/XFit.git /tmp/xfit-agents && node /tmp/xfit-agents/.claude/install-global.js
```

Потім перезапусти Claude Code і перевір: `/agents` — список агентів, `/` — команди.

- Повторний запуск оновлює файли й не дублює хуки.
- Твої налаштування в `~/.claude/settings.json` зберігаються; хуки додаються до них.
- Перезаписані файли й старий `settings.json` копіюються в `~/.claude/backups/agents-<дата>/`.
