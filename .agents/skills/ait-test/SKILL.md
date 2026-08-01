---
name: ait-test
description: Run the AI influencers tracker checks (projects/ai-influencers-tracker) — the pipeline pytest suite, the import anchors, ruff, the web vitest suite, and the coverage report. Use when Eric says "ait-test", "run the tests", "test the tracker", "check coverage", "run coverage on the AI tracker", or asks whether the tracker is still green.
---

# ait-test

Writes nothing. Runs the checks and reports what passed. The layer-free sibling of `ait-dashboard`.

Run from `projects/ai-influencers-tracker/`. Everything here is read-only: no sweep, no API call,
no credit spent, and nothing under `_raw/`, `_synthesize/`, or `_db/` is touched.

## The four checks

```bash
pytest -q                                   # pipeline suite + test_anchors.py, ~1s
ruff check pipeline test_anchors.py scripts # style, line-length 100
cd web && npx vitest run                    # the dashboard suite, ~7s
scripts/coverage.sh                         # pytest again, plus a source-only coverage report
```

`pytest -q` already includes `test_anchors.py` — `testpaths` in `pyproject.toml` is
`["pipeline", "."]`, so the import-direction rule is enforced by the same command. Do not run it
separately and report it as a fifth check.

**Run only what the change touched.** A `pipeline/` edit does not need vitest. A `web/` edit does
not need pytest or ruff. Run all four when asked for a full green check, before a commit that spans
both, or when Eric asks whether the tracker is still green.

## Coverage

```bash
scripts/coverage.sh          # term report, source only, worst-covered first
scripts/coverage.sh --html   # also writes htmlcov/index.html
```

It needs `uv` (`brew install uv`). `pytest-cov` is deliberately not installed: rule 4 governs
`pipeline/`, and a coverage plugin is a dev tool no shipped code imports, so the script builds a
throwaway env with `uv run --no-project`. Nothing lands in the system Python, which PEP 668 blocks
anyway, or in this repo. It writes `.coverage`, which is gitignored.

The report omits the test files and sorts worst-covered first, because the useful answer is which
module is thin, not the total.

## Reading the coverage number

Read it against rule 5: *test-first for anything that can render a wrong number.* Coverage is not
the target and a rising total is not the goal.

- **Growth math, the measurement floor, scoring, topic matching, comment lag, verdict bands** —
  these can render a wrong number, so anything under 100% here is worth a look. They sit at 100%
  today.
- **API clients, CLI parsing, layout** — `youtube.py`, `vidiq.py`, `github.py`, `firecrawl.py`,
  `avatars.py` live in the low 80s and that is the intended shape, not a gap to close. Their
  uncovered lines are retry and error paths.
- `scripts/audit_data.py` is at 0% with no test file at all. That is the one real hole.

Report the module, never a bare percentage. "The scoring core is 100%, the API clients are low-80s
by design" is the useful sentence; "84% overall" is not.

## What a green run looks like

520 Python tests, 269 web tests, ruff clean. Quote the counts you actually saw. If a suite fails,
name the test and whether it is pre-existing — check with `git stash` before blaming the change.

## Do not

- Do not `pip install pytest-cov`. The system Python is PEP 668 managed and the install fails;
  `scripts/coverage.sh` exists so it never has to be installed.
- Do not add `--cov` to `addopts` in `pyproject.toml`. It would break the bare `pytest -q` run,
  which is the fast path and the one CLAUDE.md documents.
- Do not run `npm run build` in `web/` as a test. `npx vitest run` is the suite; a production build
  answers a different question and takes minutes.
- Do not chase the coverage total upward by testing API clients. Rule 5 excludes them on purpose.
- Do not run any `pipeline.snapshot` or `pipeline.outliers` command here. Those spend quota and
  credits and belong to `ait-ingest` and `ait-refresh`.
