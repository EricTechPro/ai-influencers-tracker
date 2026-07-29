Tracks 72 AI/automation YouTube channels and answers what to make next.

**Build steps 0 to 11 are done.** `pipeline/`, its tests, and `_db/` all run for real today.
`web/` is the Next.js dashboard on port 3002 (`cd web && npm run dev`; predev rebuilds `_db/`;
`npx vitest run` from `web/` for the web tests). Channel pages, comment tables, and /compare are
live; comments are read as per-route slices from `_db/comments/`. Comment classification
(step 12) and the reply queue are the next phase.

```bash
pytest -q                                          # every pipeline test
ruff check pipeline test_anchors.py scripts        # style, line-length 100
python3 -m pipeline.snapshot --dry-run             # what the daily sweep would cost, writes nothing
python3 -m pipeline.snapshot                       # the real sweep; launchd runs it at 09:00 once installed
python3 -m pipeline.build_data                      # rebuild _db/ from _raw/ and _synthesize/
python3 -m pipeline.outliers                       # what the vidIQ outlier sweep would cost, writes nothing
python3 -m pipeline.outliers --no-dry-run          # the real sweep, 30 credits, writes _synthesize/outliers/
```

Keys live in the repo-root `.env`. `GITHUB_TOKEN` is present; the GitHub sweep runs authenticated
rather than at the anonymous rate limit. The launchd agent (`scripts/ait-snapshot.plist`) is
**installed and loaded** as `ca.erictech.ait-snapshot`, so the sweep runs itself at 09:00;
`launchctl list | grep ait` confirms it and `scripts/install_ait_snapshot_launchd.sh` reinstalls it.

`/topics` opens with the **recent feed**: vidIQ's breakout score over the roster, one sweep per
day into `_synthesize/outliers/<date>.json`, read by `_db/recent.json`. The score is `vendor`
tier — vidIQ's number, never recomputed (decision 0012). Pattern rows underneath read
`_synthesize/patterns/<date>.json`, which no skill writes yet, so they render an honest empty
state.

**Next is step 12** (`docs/spec.md` §10): comment classification, then the reply queue. **Step 13
is a hard gate**: no extraction work begins until a 20-video manual spike measures artifact capture
against a 50% floor.

## The rule everything else serves

Never assert a step, number, or recommendation that nobody said or that no API returned.
Missing data is a state, never a zero. Prefer omitting a claim over inventing one.

Three claim tiers, never blended: **Oracle** (exact counts), **Derived** (computed, shows its
formula), **Inference** (LLM judgment, always rendered beside its evidence). An inference styled as
a measurement is the failure mode.

## Easy to break

- Only childless topics are scoreable. `scoreable` is derived, never authored.
- `viewCount` is exact. `subscriberCount` is rounded to 3 significant figures and no vendor sells
  better. Deltas below 5x a channel's bucket width render `< N`, never a bare number.
- GitHub repos key on numeric `id`. A rename forks the history and fakes a spike.
- The pipeline never writes into hand-edited config.
- The worked example must reproduce **71.9**.

## Where to look

| Need | File |
|---|---|
| What a term means, and which words to avoid | `docs/CONTEXT.md` |
| The seed prompt the whole spec was grilled out of | `docs/initial-prompt.md` |
| Why a decision went that way, and what was rejected | `docs/decisions.md` |
| What it is and what it answers | `docs/spec.md` |
| Bundle schemas, thresholds, tests, build tasks | `docs/system.md` |
| What each page contains, in ASCII | `docs/wireframes.md` |
| What the six `ait-*` skills each do | `.agents/skills/README.md` |
| Which API call runs when, and what it costs | `docs/system.md` |

Read `docs/CONTEXT.md` before naming anything. The terms are load-bearing and two have already drifted.

## Layers and the rules that hold them

`config/` humans write · `_raw/` as the API returned it · `_synthesize/` what cost money to compute
· `_db/` what the web reads, safe to delete. **One direction, never backwards.** Python lives in
`pipeline/`. Full map in `docs/system.md §2`.

- A skill imports `pipeline/`. `pipeline/` imports stdlib. **A skill never imports another skill**,
  and `pipeline/` never imports a skill or `web/`. `test_anchors.py` enforces it.
- A number belongs in `config/thresholds.json` only if changing it changes what the dashboard tells
  you to do. Everything else is a constant.
- Standard library first. A dependency must save real work to earn an install step.
- Test-first for anything that can render a wrong number. Use `superpowers:test-driven-development`.

Six `ait-*` skills sit in `.agents/skills/`, one directory each, all importing that one shared
`pipeline/`. `.claude/skills` symlinks there and `AGENTS.md` symlinks to this file — one source, two
names, in both cases.

## The sibling project

`projects/social-invest/` is the template, not a dependency. **Copy the shape, share no code** —
its chrome and CSS tokens port after a de-domaining pass, its P&L tokens are replaced by the three
trust tokens, and its `chain-map.tsx` and `sortable-table.tsx` are the two highest-value ports.
`docs/system.md` §11 has the file-by-file mapping and names what does *not* port clean.

## Conventions

Conventional commits: `feat` `fix` `docs` `refactor` `data` `chore` `test`.
Python tests live beside the code as `test_*.py`. Web tests use vitest.
`config/channels.json` is private and gitignored; never commit it. Reading it and `.env` is denied
in `.claude/settings.json` — that denial is deliberate, not a misconfiguration.
