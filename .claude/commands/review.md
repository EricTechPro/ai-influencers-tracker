---
description: Simplify and review the current changes against this project's invariants, then run its checks.
---

One trigger for both simplify and code review in this repo. Use the global `/simplify` or
`/code-review` only when this one is not enough.

## Scope

Uncommitted changes, or `$ARGUMENTS` if it names files, a path, or a commit range.

## 1. Simplify (apply directly)

Fix these without asking. Report the count, not the diff.

- Dead code, unused imports, unused exports, duplicated logic.
- A dependency that stdlib already covers. Standard library first.
- A number in `config/thresholds.json` that does not change what the dashboard tells you to do.
  It is a constant, move it into the code.
- Anything longer than it needs to be. Shortest version that still reads clearly.

## 2. Review (report, do not auto-fix)

Flag only real defects, most severe first. No style opinions, ruff owns those.

**Project invariants** (`CLAUDE.md`, `docs/system.md`):
- Layer direction is one way: `config/` → `_raw/` → `_synthesize/` → `_db/`. Never backwards.
  The pipeline never writes into hand-edited config.
- A skill imports `pipeline/`. `pipeline/` imports stdlib only, never a skill and never `web/`.
  A skill never imports another skill.
- Claim tiers never blend: Oracle (exact), Derived (shows its formula), Inference (rendered beside
  its evidence). An inference styled as a measurement is the failure mode.
- Missing data is a state, never a zero. Prefer omitting a claim over inventing one.
- Only childless topics are scoreable. `scoreable` is derived, never authored.
- `viewCount` is exact. `subscriberCount` is 3 significant figures. Deltas under 5x the bucket
  width render `< N`, never a bare number.
- GitHub repos key on numeric `id`, never on name.

**Anything that can render a wrong number** needs a test first. If the change has none, say so.

## 3. Verify

Run only what the change touched. Paste nothing, report pass or fail and the failing name.

```bash
pytest -q                                     # pipeline/ or scripts/ changed
ruff check pipeline test_anchors.py scripts   # any Python changed
cd web && npx vitest run                      # web/ changed
```

`test_anchors.py` enforces the import rules above. A failure there is an architecture break, not a
test bug.

## 4. Report

Phone-friendly. Outcome on line 1, then what was simplified (counts), then defects worth acting on,
then one `👉` ask. Skip empty sections.
