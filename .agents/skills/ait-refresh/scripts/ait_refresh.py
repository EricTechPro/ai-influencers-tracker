#!/usr/bin/env python3
"""Run a metered ait-refresh job end to end: preview, spend, rebuild, prove the ledger.

Why this exists: the refresh was four hand-typed `python3 -c` one-liners whose order
mattered, and whose last step -- checking that the credits actually spent match the
credits previewed -- was the one people skipped. Here it is a single command that
cannot skip it.

WHAT IS AND IS NOT DELEGATED
  The preview is free and always runs. Choosing to spend is Eric's, never this
  script's and never Codex's: `--sweep` / `--backfill` must be passed explicitly, and
  no flag means dry run. `--codex` only changes WHERE an already-approved job runs, the
  same way si-refresh hands Codex a price block it is forbidden to fetch. There is
  deliberately no --approve, no --yes and no "pick the due job for me".

  # free, spends nothing: both jobs, plus what is already done
  ait_refresh.py

  # run the weekly sweep locally
  ait_refresh.py --sweep

  # same job, on the Codex CLI so it costs no Claude context and survives the session
  ait_refresh.py --sweep --codex

The guard still refuses anything that breaks the 200-credit reserve or exceeds 400 in
one run; this script never raises either limit.
"""
from __future__ import annotations

import argparse
import datetime as dt
import glob
import json
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

from pipeline import build_data, config, topics, util, vidiq  # noqa: E402


def state() -> dict:
    """What a run would actually be buying. Free -- reads disk only.

    The backfill is a build step, not a cadence: re-running it costs 370 credits to
    re-fetch history the merge already prefers from our own snapshots. So the useful
    fact is not "when did it last run" but "is any channel still missing".
    """
    roster = config.roster()
    have = {pathlib.Path(p).stem for p in glob.glob(str(config.raw_dir() / "backfill" / "*.json"))}
    missing = [c["channel_id"] for c in roster if c["channel_id"] not in have]

    sweeps = sorted(pathlib.Path(p).stem
                    for p in glob.glob(str(config.raw_dir() / "keywords" / "*.json")))
    last = sweeps[-1] if sweeps else None
    age = (util.today() - dt.date.fromisoformat(last)).days if last else None
    return {"roster": len(roster), "backfill_missing": missing,
            "last_sweep": last, "sweep_age_days": age}


def _guard(balance: int) -> vidiq.CostGuard:
    return vidiq.CostGuard(balance, vidiq.DEFAULT_RESERVE, vidiq.DEFAULT_CEILING)


def preview(client, balance: int) -> None:
    st = state()
    leaves = topics.leaves(topics.load())
    n_missing = len(st["backfill_missing"])

    print(f"balance {balance} credits | roster {st['roster']} channels | {len(leaves)} leaves")
    print()
    print(_guard(balance).preview([
        (f"vidiq_channel_stats x{st['roster']}", vidiq.CHANNEL_STATS_COST * st["roster"]),
        (f"vidiq_keyword_research x{len(leaves)}", vidiq.KEYWORD_COST * len(leaves)),
    ]))
    print()
    print("--- what is actually due ---")
    if n_missing:
        print(f"backfill:  {n_missing} channel(s) MISSING history -> a run would buy real data")
        for cid in st["backfill_missing"][:10]:
            print(f"             {cid}")
    else:
        print("backfill:  complete, 0 missing -> DO NOT RUN, it would re-buy known history")
    age = st["sweep_age_days"]
    print(f"sweep:     last {st['last_sweep']}"
          + (f", {age}d ago -> {'due' if age is None or age >= 7 else 'not due yet'}"
             if age is not None else " (never run) -> due"))


def run_job(job: str, client, balance: int) -> dict:
    """Spend. Only reached when Eric passed --sweep or --backfill explicitly."""
    guard = _guard(balance)
    today = util.today()
    if job == "sweep":
        leaves = topics.leaves(topics.load())
        return vidiq.keyword_sweep(leaves, client, guard, today, dry_run=False)
    return vidiq.backfill(config.roster(), client, guard, dry_run=False)


def verify_ledger(client, before: int, expected: int) -> bool:
    """balance before minus balance after must equal the previewed number.

    A mismatch is worth failing loudly on: it means a call was billed that the preview
    never showed Eric, which is the one thing the preview exists to prevent.
    """
    after = vidiq.balance(client)["totalCredits"]
    delta = before - after
    ok = delta == expected
    print(f"\nledger: {before} -> {after} = {delta} spent, previewed {expected} "
          f"[{'PASS' if ok else 'MISMATCH'}]")
    if not ok:
        print("  a call was billed that the preview did not show -- investigate before re-running")
    return ok


def via_codex(job: str, timeout: int) -> int:
    """Run the approved job in a Codex headless session.

    Codex re-enters this same script with the job Eric already approved, so the guard,
    the ledger check and the rebuild are the identical code path -- Codex is the shell
    the work runs in, never a second opinion about whether to spend.
    """
    if not _which("codex"):
        print("codex CLI not installed", file=sys.stderr)
        return 127
    prompt = (
        f"Run exactly this one command from {ROOT} and nothing else:\n\n"
        f"    python3 .agents/skills/ait-refresh/scripts/ait_refresh.py --{job}\n\n"
        "It is a metered job Eric has already approved, so do not re-preview it, do not "
        "ask for confirmation, and do not edit any file. Stream its output. When it "
        "finishes, print the ledger line it emitted and the exit code, nothing else."
    )
    proc = subprocess.run(
        ["codex", "exec", "-s", "workspace-write", "--skip-git-repo-check",
         "-C", str(ROOT), prompt],
        text=True, timeout=timeout, check=False)
    return proc.returncode


def _which(cmd: str) -> bool:
    return any(os.access(os.path.join(p, cmd), os.X_OK)
               for p in os.environ.get("PATH", "").split(os.pathsep) if p)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--sweep", action="store_true", help="run the weekly keyword sweep (~125)")
    ap.add_argument("--backfill", action="store_true",
                    help="run the channel-history backfill (~370) -- build step, not a cadence")
    ap.add_argument("--codex", action="store_true",
                    help="run the approved job in a Codex headless session")
    ap.add_argument("--no-build", action="store_true", help="skip the bundle rebuild")
    ap.add_argument("--timeout", type=int, default=3600)
    args = ap.parse_args(argv)

    if args.sweep and args.backfill:
        print("pick one job per run -- the ceiling is 400 credits", file=sys.stderr)
        return 2
    job = "sweep" if args.sweep else "backfill" if args.backfill else None

    if job is None and args.codex:
        print("--codex needs a job: pass --sweep or --backfill. Codex never picks "
              "what to spend.", file=sys.stderr)
        return 2

    # Every refusal is settled from disk before a single billable call is made, so a
    # rejected run costs nothing and stays testable without a network or an API key.
    if job == "backfill" and not state()["backfill_missing"]:
        print("refusing: every roster channel already has backfill history, so this would "
              "spend ~370 credits re-buying it. Delete the stale files first if you really "
              "mean to refetch.", file=sys.stderr)
        return 2

    if job and args.codex:
        return via_codex(job, args.timeout)

    client = vidiq.client_from_env()
    balance = vidiq.balance(client)["totalCredits"]

    if job is None:
        preview(client, balance)
        print("\nnothing spent. Re-run with --sweep or --backfill to buy.")
        return 0

    result = run_job(job, client, balance)
    print(f"\n{job}: {json.dumps(result)}")

    ok = verify_ledger(client, balance, result["credits"])

    if not args.no_build:
        meta = build_data.build()
        print(f"rebuilt bundles: {json.dumps(meta)[:400]}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
