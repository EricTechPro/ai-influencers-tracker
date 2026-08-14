#!/usr/bin/env python3
"""Classify candidate videos on the Codex CLI instead of in the caller's context.

`pipeline/classify.py` deliberately holds no model call: a skill or workflow writes
`_synthesize/classifications/<date>.json` and the module validates it on the way in.
This is that writer, pointed at Codex so a backlog pass costs no Claude context.

Only `candidates()` are ever sent — videos a keyword hit already put on a shelf.
Classifying the rest of the corpus would be mostly waste, and the wrong assertions
only show where a membership is currently being claimed.

  # what would be sent, spending nothing
  codex_classify.py --dry-run

  # run it, 60 videos per Codex call
  codex_classify.py --batch 60

  # only the first N still-unclassified candidates
  codex_classify.py --limit 120

Rows land through `classify.write_assignments()`, which refuses the whole pass if
any topic_id is not a leaf or any reason is empty. A partial run is safe: files are
dated and merged oldest-first, so re-running covers only what is still missing.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

from pipeline import classify, config, topics, util  # noqa: E402

FLOOR = 0.6  # topics.membership_min_confidence — title-strength hits only


def pending() -> list[dict]:
    videos = util.read_json(config.db_dir() / "videos.json")["videos"]
    by_video = {v["video_id"]: (v.get("topic_assignments") or []) for v in videos}
    done = classify.read_assignments()
    return [c for c in classify.candidates(videos, by_video, FLOOR)
            if c["video_id"] not in done]


def _prompt(batch: list[dict], leaf_ids: list[str]) -> str:
    return (
        "Assign ONE primary topic to each video below.\n\n"
        "Answer what the video is actually ABOUT, not which keywords appear in its title. "
        "A title saying 'OpenCode Full Tutorial: Free Models, Skills & MCPs' is about OpenCode, "
        "not about wiring MCP servers, even though the word MCP is present. That failure is the "
        "entire reason this job is not keyword matching.\n\n"
        "ALLOWED topic_id values (use these EXACTLY, nothing else):\n"
        + "\n".join(f"  {t}" for t in leaf_ids) +
        "\n\nIf no allowed topic genuinely fits, use null. null is a correct answer and is far "
        "better than forcing a bad shelf — a wrong assignment is worse than none, because the "
        "board renders it as a claim.\n\n"
        "`keyword_topics` is what the keyword matcher guessed. Treat it as a hint that is often "
        "wrong; you are the correction.\n\n"
        "Output ONLY a JSON array, one object per video, no prose and no code fence:\n"
        '[{"video_id": "...", "topic_id": "..." or null, "reason": "<8 words or fewer, '
        'what the video is about>"}]\n\n'
        "Every row needs a non-empty reason. Cover every video given, exactly once.\n\n"
        "VIDEOS:\n" + json.dumps(
            [{"video_id": v["video_id"], "title": v["title"],
              "keyword_topics": v["keyword_topics"]} for v in batch],
            ensure_ascii=False, indent=1)
    )


def _run_codex(prompt: str, timeout: int) -> list[dict]:
    """One Codex call. Returns [] on any failure — the caller keeps the other batches."""
    with tempfile.TemporaryDirectory() as td:
        out = pathlib.Path(td) / "out.json"
        full = f"{prompt}\n\nWrite the JSON array to {out} and print nothing else."
        proc = subprocess.run(
            ["codex", "exec", "-s", "workspace-write", "--skip-git-repo-check",
             "-C", str(ROOT), full],
            capture_output=True, text=True, timeout=timeout, check=False)
        if out.exists():
            try:
                return json.loads(out.read_text())
            except json.JSONDecodeError:
                pass
        # Fall back to the last JSON array printed on stdout.
        text = proc.stdout
        start, end = text.rfind("["), text.rfind("]")
        if 0 <= start < end:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                pass
    return []


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch", type=int, default=60)
    ap.add_argument("--limit", type=int, default=0, help="0 = every pending candidate")
    ap.add_argument("--timeout", type=int, default=900)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)

    todo = pending()
    if args.limit:
        todo = todo[:args.limit]
    leaf_ids = sorted(leaf.id for leaf in topics.leaves(topics.load()))

    print(f"pending candidates: {len(todo)} | leaves: {len(leaf_ids)} | batch: {args.batch}")
    if not todo:
        print("nothing to classify")
        return 0
    if args.dry_run:
        print(f"would make {(len(todo) + args.batch - 1) // args.batch} codex calls")
        print(_prompt(todo[:3], leaf_ids)[:900])
        return 0

    allowed = set(leaf_ids)
    rows, wanted = [], {v["video_id"] for v in todo}
    for i in range(0, len(todo), args.batch):
        batch = todo[i:i + args.batch]
        got = _run_codex(_prompt(batch, leaf_ids), args.timeout)
        kept = [r for r in got
                if isinstance(r, dict)
                and r.get("video_id") in wanted
                and (r.get("topic_id") is None or r.get("topic_id") in allowed)
                and str(r.get("reason") or "").strip()]
        rows.extend(kept)
        print(f"  batch {i // args.batch + 1}: sent {len(batch)}, kept {len(kept)}")

    # De-dup defensively: write_assignments rejects the whole pass on a repeat.
    seen, clean = set(), []
    for r in rows:
        if r["video_id"] in seen:
            continue
        seen.add(r["video_id"])
        clean.append(r)

    if not clean:
        print("no usable rows; nothing written")
        return 1

    # write_assignments writes <today>.json, so a second run on the same day would
    # replace the first rather than extend it. Carry the existing same-day rows in.
    today_path = config.synth_dir() / "classifications" / f"{util.date_str(util.today())}.json"
    if today_path.exists():
        prior = (util.read_json(today_path) or {}).get("assignments") or []
        for row in prior:
            if row.get("video_id") not in seen:
                seen.add(row["video_id"])
                clean.append(row)
        print(f"  merged {len(prior)} rows already written today")

    path = classify.write_assignments(clean)
    print(f"wrote {len(clean)} assignments -> {path}")
    print(f"still pending after this pass: {len(pending())}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
