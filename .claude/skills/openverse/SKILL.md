---
name: openverse
description: Search and download openly licensed (Creative Commons / public domain) images and audio from Openverse — photos, illustrations, sound effects, music. Use when the user wants free, legally reusable media for a site, app, video or document, asks for CC0 / royalty-free / Creative Commons pictures or sounds, or says "знайди картинку/звук", "free stock image", "sound effect". Saves files plus a CREDITS.md with the required attribution.
---

# Openverse media

Script: `scripts/openverse.py` (Python 3, standard library, no API key).
Run it with the absolute path, e.g. `python ~/.claude/skills/openverse/scripts/openverse.py ...`.

## Workflow

1. **Search** and show the user a short list (title, creator, license, size/duration, page link):
   ```
   python openverse.py search image "mountain lake" --license-type commercial --limit 10
   python openverse.py search audio "whoosh" --license cc0 --max-duration 5000
   ```
   Options: `--license cc0,by,...`, `--license-type commercial|modification|all-cc`,
   images `--aspect-ratio tall|wide|square`, `--size small|medium|large`, audio `--max-duration MS`.
2. **Pick** — let the user choose, or pick the best matches yourself if they asked you to.
3. **Download** into the project folder the user wants (default `./openverse_media`):
   ```
   python openverse.py download image <id> <id> --out ./assets/images
   python openverse.py download audio <id> --out ./assets/sfx
   ```
   Each file is named `<title>_<id8>.<ext>`; attribution lines are appended to `CREDITS.md` in that folder.

## Licenses — tell the user

- `cc0`, `pdm`: free for anything, no credit needed.
- `by`, `by-sa`: credit required (CREDITS.md has it); `by-sa` derivatives must share alike.
- `by-nd`: no modifications. `by-nc*`: no commercial use.
- For a commercial project search with `--license-type commercial`; if the user will edit/remix, add `modification`.

## Notes

- Anonymous API: ~20 results per page, rate-limited. The script retries on 429/5xx; if it still fails, wait and retry.
- Openverse aggregates other sites (Flickr, Wikimedia, Freesound...): always keep the source page link.
- Never present a `by-nc` or `by-nd` item as fine for a commercial or edited use.
