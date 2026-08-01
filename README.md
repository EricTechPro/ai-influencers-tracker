# ai-influencers-tracker

Ingests what the AI niche publishes, synthesizes it into a knowledge base, and serves it as a dashboard.

> **Spec stage. No code yet.** Everything below is designed and decided. None of it runs.

## The goal

Three things people want from a feed nobody can keep up with.

**1. Stay on top of AI.** 72 channels, read as one page. You end up knowing what was said and where
things are heading, without the afternoon of watching.

**2. Keep track of specific creators.** Pick the ones who matter to you. See what they cover, how it
performed against their own baseline, and what their audience keeps asking them for.

**3. Spot demand.** The questions people ask over and over that nobody has answered yet. Whether
that feeds your next video, a product, or a startup, it is the same signal underneath.

## The idea

**Two feeds, read against each other.** GitHub shows what people are building. YouTube shows what
people are asking for. Either one alone is noise. Side by side, they show demand forming before it
arrives.

The timing is the whole trick. Star velocity runs ahead of YouTube coverage: a repo climbs, creators
find it, videos land weeks later. By the time a video exists, someone already got there first. Every
YouTube signal is lagging by construction, and GitHub is the only leading one in here. That gap is
what this measures.

**The third feed sits underneath the videos.** Comments are where people say what they could not get
working, what they still want, and what nobody covered. That is demand, written down, already
attached to the topic it belongs to.

## It is a knowledge base, not a scraper

This is the part that outlives any one dashboard.

Every run appends to a knowledge base you own. Raw API responses are kept exactly as they came back
and never corrected. Whatever cost money to compute is cached beside them. The dashboard is one read
over the result, not the result itself.

That ordering is why deleting `_db/` has to be boring: one rebuild recreates it byte for byte from
data you already hold. The expensive layers stay put. The view is cheap and disposable. If deleting
it is ever scary, something upstream is broken.

```
config/         humans write                 roster, topics, thresholds
pipeline/       all the Python
_raw/           as the API returned it       append-only, never corrected
_synthesize/    what cost money to compute   extractions, classifications
_db/            what the dashboard reads     safe to delete
web/            Next.js on 3002
```

One direction, never backwards. An underscore means a data layer, not code. It copies the `_raw` →
`_context` → `_research` shape EricOS already uses, so a second brain built here reads the same way
as the rest of the system. Full map in [docs/system.md](docs/system.md) §2.

## How it decides

Topic is the primary object. The creator is a lens onto it. A topic is worth making when the field
still has not settled on an answer, so **"is there room for me?"** reduces to **"is this topic still
forked?"** One data structure, two answers.

The bar is comprehension, not ranking: *I do not have to watch the videos any more.*

## Pages

```
/                  top-5 leaderboard + opportunity table
/leaderboard       all 72, four rank modes, niche filter
/topics/[id]       fork first, then the path, trunk collapsed
/channels/[id]     profile → charts → comments
/compare           topic gaps first, stats below
```

## Rules

Six, and they exist because each one prevents a specific way this rots.

**1. Data flows one direction. Nothing writes backwards.**
`config/` → `_raw/` → `_synthesize/` → `_db/` → `web/`. Humans write `config/`. The snapshot job is
the only writer of `_raw/`. `build_data.py` only ever writes `_db/`.

**2. Imports go one way too.**
A skill imports `pipeline/`. `pipeline/` imports the standard library. **A skill never imports
another skill**, and `pipeline/` never imports a skill or anything under `web/`. `test_anchors.py`
walks every import and fails the build, so this cannot rot quietly.

**3. A number only earns a place in `thresholds.json` if changing it would change what the dashboard
tells you to do.** Everything else is a constant in code. Otherwise the config file becomes a
junk drawer of every magic number and stops meaning anything.

**4. Standard library first.**
Every call here is an HTTP GET returning JSON, which `urllib` already does. A dependency has to save
real work to earn an install step. `web/` keeps normal npm dependencies.

**5. Test-first for anything that can render a wrong number.**
Growth math, the measurement floor, scoring, topic matching, comment lag. Not API clients, not CLI
parsing, not layout. The question is never coverage percentage; it is *can this lie to me*. Use the
`superpowers:test-driven-development` skill.

**6. Missing is a state, never a zero.**
A subscriber delta that cannot clear its channel's floor renders `< 5,000`. An incomplete window
renders `building, 6 of 7` and no number. A topic with one video renders `1 video, need 3`. Nothing
is ever silently rounded, defaulted, or hidden.

## Docs

| File | What it is |
|---|---|
| `docs/spec.md` | **The contract.** What it is, what it answers. Start here. |
| `docs/system.md` | **The data flow.** Folders, schemas, every API call, costs, tests. |
| `docs/wireframes.md` | **The UI.** All five pages in ASCII. |
| `docs/decisions.md` | **The reasoning.** Why each call went that way, and what was rejected. |
| `docs/CONTEXT.md` | The terminology, and which words to avoid. |
| `docs/initial-prompt.md` | **The seed prompt.** The brief the grill ran on, and how to reuse it. |

## Quick start (once step 9 lands)

```bash
cd web && npm install && npm run dev    # → http://localhost:3002
```

Port 3002, because 3001 is social-invest and both run at once.

## Tests

```bash
pytest -q                 # every pipeline test, ~1s
scripts/coverage.sh       # the same run, plus a source-only coverage report
scripts/coverage.sh --html   # also writes htmlcov/index.html
```

`pytest-cov` is deliberately not installed. Rule 4 governs `pipeline/`, and a coverage plugin is a
dev tool no shipped code imports, so `scripts/coverage.sh` builds a throwaway env with
`uv run --no-project` instead. Nothing lands in the system Python or in this repo. It needs `uv`
(`brew install uv`) and writes `.coverage`, which is gitignored.

The report omits the test files and sorts worst-covered first, because the number that matters is
which module is thin, not the total. Read it against rule 5: an API client sitting at 81% is the
intended shape, and a scoring module dropping below 100% is the thing to look at.

## Cost

One paid dependency. YouTube's API is free and carries almost everything, including all comments, at
~176 of 10,000 daily quota units. GitHub and Firecrawl are free. vidIQ runs ~663 of 2,000 monthly
credits and survives on two calls nothing else sells: purchased daily history, and keyword volume.

ViewStats, TubeBuddy and every Apify actor were checked and rejected, because they read the same
YouTube API and `viewCount` is already exact.

## Blocked on

1. `config/topics.json`: 25 leaves drafted from 1,889 real titles, needs a human pass.
2. `config/channels.json`: needs `channel_id` and `niche` columns.
3. `GITHUB_TOKEN`: not in `.env` yet.

Copy `config/channels.example.json` to start your own roster. It stays gitignored.
