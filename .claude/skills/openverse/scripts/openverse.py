"""Search and download openly licensed images and audio from Openverse.

Uses the public Openverse API (https://api.openverse.org) without a key.
Standard library only.

  python openverse.py search image "red fox" --license-type commercial --limit 10
  python openverse.py search audio "whoosh" --license cc0 --max-duration 5000
  python openverse.py download audio <id> [<id> ...] --out ./media
"""

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://api.openverse.org/v1"
USER_AGENT = "claude-openverse-skill/1.0"
TIMEOUT_S = 30
RETRIES = 3
ENDPOINT = {"image": "images", "audio": "audio"}


def _get(url, binary=False):
    last_error = None
    for attempt in range(RETRIES):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
                data = resp.read()
                return data if binary else json.loads(data.decode("utf-8"))
        except urllib.error.HTTPError as e:
            last_error = f"HTTP {e.code} for {url}"
            if e.code == 429:
                time.sleep(int(e.headers.get("Retry-After", "10")))
                continue
            if e.code < 500:
                break
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            last_error = f"{type(e).__name__}: {e}"
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(last_error or f"request failed: {url}")


def _summary(kind, r):
    item = {
        "id": r["id"],
        "title": r.get("title"),
        "creator": r.get("creator"),
        "license": f"{r.get('license')} {r.get('license_version') or ''}".strip(),
        "filetype": r.get("filetype"),
        "source": r.get("source") or r.get("provider"),
        "page": r.get("foreign_landing_url"),
    }
    if kind == "image":
        item["size"] = f"{r.get('width')}x{r.get('height')}"
    else:
        item["duration_s"] = round((r.get("duration") or 0) / 1000, 1)
    return item


def search(args):
    filtering = args.kind == "audio" and args.max_duration
    params = {"q": args.query, "page_size": 20 if filtering else args.limit, "mature": "false"}
    if args.license:
        params["license"] = args.license
    if args.license_type:
        params["license_type"] = args.license_type
    if args.kind == "image" and args.aspect_ratio:
        params["aspect_ratio"] = args.aspect_ratio
    if args.kind == "image" and args.size:
        params["size"] = args.size
    url = f"{API}/{ENDPOINT[args.kind]}/?{urllib.parse.urlencode(params)}"
    data = _get(url)
    results = [_summary(args.kind, r) for r in data.get("results", [])]
    if filtering:
        results = [r for r in results if 0 < r["duration_s"] * 1000 <= args.max_duration][: args.limit]
    print(json.dumps({"total": data.get("result_count"), "results": results}, ensure_ascii=False, indent=1))


def _safe_name(text, fallback):
    name = re.sub(r"[^\w\-]+", "_", text or "", flags=re.UNICODE).strip("_")[:60]
    return name or fallback


def download(args):
    out = Path(args.out).expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)
    credits_path = out / "CREDITS.md"
    saved = []
    for media_id in args.ids:
        if not re.fullmatch(r"[0-9a-fA-F-]{36}", media_id):
            print(f"skip {media_id}: not an Openverse id", file=sys.stderr)
            continue
        try:
            r = _get(f"{API}/{ENDPOINT[args.kind]}/{media_id}/")
            ext = (r.get("filetype") or Path(urllib.parse.urlparse(r["url"]).path).suffix.lstrip(".") or "bin").lower()
            path = out / f"{_safe_name(r.get('title'), media_id[:8])}_{media_id[:8]}.{ext}"
            fallback = False
            try:
                path.write_bytes(_get(r["url"], binary=True))
            except RuntimeError:
                if args.kind != "image" or not r.get("thumbnail"):
                    raise
                path.write_bytes(_get(r["thumbnail"], binary=True))
                fallback = True
        except (RuntimeError, KeyError, OSError) as e:
            print(f"failed {media_id}: {e}", file=sys.stderr)
            continue
        credit = r.get("attribution") or f"\"{r.get('title')}\" by {r.get('creator')} ({r.get('license')})"
        with credits_path.open("a", encoding="utf-8") as f:
            f.write(f"- `{path.name}` — {credit} Source: {r.get('foreign_landing_url')}\n")
        entry = {"id": media_id, "file": str(path), "license": r.get("license")}
        if fallback:
            entry["note"] = "original host unreachable; saved Openverse thumbnail (smaller size)"
        saved.append(entry)
    print(json.dumps({"saved": saved, "credits": str(credits_path)}, ensure_ascii=False, indent=1))
    return 0 if saved else 1


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("search")
    s.add_argument("kind", choices=ENDPOINT)
    s.add_argument("query")
    s.add_argument("--limit", type=int, default=10, choices=range(1, 21), metavar="1-20")
    s.add_argument("--license", help="comma list: cc0,by,by-sa,by-nd,by-nc,by-nc-sa,by-nc-nd,pdm")
    s.add_argument("--license-type", choices=["commercial", "modification", "all-cc", "all"])
    s.add_argument("--aspect-ratio", choices=["tall", "wide", "square"])
    s.add_argument("--size", choices=["small", "medium", "large"])
    s.add_argument("--max-duration", type=int, help="audio only, milliseconds")

    d = sub.add_parser("download")
    d.add_argument("kind", choices=ENDPOINT)
    d.add_argument("ids", nargs="+")
    d.add_argument("--out", default="openverse_media")

    args = p.parse_args()
    try:
        if args.cmd == "search":
            search(args)
            return 0
        return download(args)
    except RuntimeError as e:
        print(f"Openverse request failed: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
