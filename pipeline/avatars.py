"""Channel avatar downloader. A network fetch, so it lives beside snapshot.py as its own
entry point rather than inside build_data, which must stay pure arithmetic over _raw/ and
_synthesize/. _db/assets/ is regenerable like every other _db/ path: safe to delete, this
module rebuilds it, and the web route reads it straight off disk.

Idempotent + cheap: a channel whose file already exists is skipped unless --force is passed,
so a re-run only pays for channels that failed or are new.
"""
from __future__ import annotations

import argparse
import os
import pathlib
import urllib.error
import urllib.request

from . import config, util, youtube

_SIZES = ("medium", "high", "default")   # medium (240x240) is closest to card size


def assets_dir() -> pathlib.Path:
    return config.db_dir() / "assets" / "channels"


def avatar_path(channel_id: str) -> pathlib.Path:
    return assets_dir() / f"{channel_id}.jpg"


def thumbnail_url(item: dict) -> str | None:
    """The channel's thumbnail closest to 240px. None when the reply carries none at all."""
    thumbs = item.get("snippet", {}).get("thumbnails", {})
    for size in _SIZES:
        url = thumbs.get(size, {}).get("url")
        if url:
            return url
    return None


def _default_download(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"Accept": "image/*"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def _write_atomic(path: pathlib.Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def sync(roster: list[dict], fetched: dict[str, dict], force: bool = False,
        download=None) -> dict:
    """One outcome per roster channel: written, skipped (file already present), or failed
    (no fetch, no thumbnail, or the download itself errored). A failure is a state, never
    a crash, so one bad channel never stops the rest of the roster."""
    download = download or _default_download
    written, skipped, failed = [], [], []
    for row in roster:
        channel_id = row["channel_id"]
        path = avatar_path(channel_id)
        if path.exists() and not force:
            skipped.append(channel_id)
            continue
        item = fetched.get(channel_id)
        url = thumbnail_url(item) if item else None
        if not url:
            failed.append(channel_id)
            continue
        try:
            data = download(url)
        except (urllib.error.URLError, OSError):
            failed.append(channel_id)
            continue
        _write_atomic(path, data)
        written.append(channel_id)
    return {"written": written, "skipped": skipped, "failed": failed}


def run(today=None, dry_run: bool = False, force: bool = False) -> dict:
    today = today or util.today()
    date_string = util.date_str(today)
    roster = config.roster()
    if dry_run:
        return {"date": date_string, "channels": len(roster),
                "would_spend_units": -(-len(roster) // youtube.BATCH)}

    ledger = youtube.QuotaLedger(youtube.ledger_path_for(date_string))
    api = youtube.YouTube(config.require_env("YOUTUBE_API_KEY"), ledger=ledger)
    fetched = api.channels([row["channel_id"] for row in roster])
    result = sync(roster, fetched, force=force, download=_default_download)
    ledger.save()
    return {"date": date_string, "written": len(result["written"]),
            "skipped": len(result["skipped"]), "failed": result["failed"],
            "units": ledger.total}


def main() -> int:
    parser = argparse.ArgumentParser(description="download roster channel avatar thumbnails")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true",
                        help="re-download even when the file already exists")
    parser.add_argument("--date", help="YYYY-MM-DD, defaults to today UTC (for the quota ledger)")
    args = parser.parse_args()
    day = util.parse_date(args.date) if args.date else None
    summary = run(today=day, dry_run=args.dry_run, force=args.force)
    for key, value in summary.items():
        print(f"{key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
