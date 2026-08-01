# ai-influencers-tracker

Tracks what 74 AI channels publish, scores every video against its own channel's normal, and tells you what is still worth making.

## Quick start

```bash
cd web
npm install        # first time only
npm run dev        # start → http://localhost:3002
```

`npm run dev` rebuilds the data first, then serves the dashboard. Press **Ctrl-C** to stop. That's the whole thing.

Port 3002, because 3001 is social-invest and both run at once.

## Skills — what to ask the agent

Six skills, grouped by what they do. Just say the trigger; the agent runs the skill.

| Say this | Skill | What it does |
|---|---|---|
| **"what would a refresh cost?"** | `ait-refresh` | The metered one. Prints the vidIQ cost preview first, then buys history or runs the keyword sweep and rebuilds. |
| **"run the sweep"** | `ait-ingest` | **Ingest.** The free daily sweep: channels, uploads, per-video counts, comments, GitHub velocity and trending. |
| **"which topics did this video match?"** | `ait-synthesize` | **Synthesize.** Topic matching and coverage, and why `coverage_rate` moved. |
| **"what should I make next?"** | `ait-opportunity` | Reads the board and explains one verdict or score line by line — velocity, indie share, what fired. |
| **"open the AI tracker dashboard"** | `ait-dashboard` | Starts the dev server on 3002 and opens the board (same as the quick start above). |
| **"run the tests"** | `ait-test` | pytest, the import anchors, ruff, vitest, and the coverage report. |

**The sweep runs itself.** `ait-ingest` is already installed under launchd as `ca.erictech.ait-snapshot` and fires at 09:00 daily, so the board is current without asking. Reach for `ait-refresh` only when you want the metered vidIQ calls on top.

## Pages

| Page | What it answers |
|---|---|
| `/` | Who is winning, and which topics are open |
| `/topics` | What went up recently, and how far past its channel's normal |
| `/topics/[id]` | Where creators disagree on one subject — the gap you can fill |
| `/channels/[id]` | One creator's profile, charts, and what their audience keeps asking |
| `/compare` | Two channels side by side, topic gaps first |

## Add or remove channels

Everyone tracked lives in one file. Edit it, save, and the next `refresh` picks it up — no code change.

```
projects/ai-influencers-tracker/config/channels.json
```

Each row is one channel:

```json
{ "handle": "example-creator", "name": "Example Creator", "channel_id": "UC...",
  "niche": "ai-coding", "lang": "en", "category": "creator", "tracked": true }
```

- **`channel_id`** — required. Without it the daily sweep costs one quota unit per channel instead of 2 for all of them, and a handle rename silently forks the growth history.
- **`category`** — exactly one row must be `own`. That is the baseline every comparison runs against.
- **To stop collecting:** set `tracked` to `false`. **To keep collecting but hide it from the board:** add the `channel_id` to `config/exclusions.json`.

The roster is yours, so `channels.json` is gitignored. Copy `config/channels.example.json` to start one.

## Muting a video

A card on `/topics` you have already made a video about: hover it, hit the **✕**. It leaves the grid and nothing else — the video stays in the corpus and in every count. The list is `config/muted.json`, and the `muted N` key in the format row puts anything back in one click.

## Cost

One paid dependency. YouTube's API is free and carries almost everything including comments, at ~176 of 10,000 daily quota units. GitHub and Firecrawl are free. vidIQ runs ~663 of 2,000 monthly credits for the two things nothing else sells: purchased daily history, and keyword volume.

## Docs

| File | What it is |
|---|---|
| `CLAUDE.md` | **The operating contract.** How to work in this repo. Start here. |
| `docs/spec.md` | What it is and what it answers |
| `docs/system.md` | Folders, schemas, every API call, costs, tests |
| `docs/decisions.md` | Why each call went that way, and what was rejected |
| `docs/wireframes.md` | The pages in ASCII |
| `docs/CONTEXT.md` | The terminology, and which words to avoid |
