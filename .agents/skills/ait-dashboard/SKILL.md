---
name: ait-dashboard
description: Open the AI influencers tracker dashboard (projects/ai-influencers-tracker/web) — start the Next.js dev server on port 3002 if it is not already running, rebuild _db/, and open the browser. Use when Eric says "ait-dashboard", "open the AI influencer tracker", "open the AI tracker dashboard", "start the influencer tracker app", or "what should I make next".
---

# ait-dashboard

Writes nothing. Starts the dev server and opens the browser. The sibling of `si-dashboard`.

## Run it

```bash
cd projects/ai-influencers-tracker/web
lsof -ti:3002 && echo "already running, just open it" || npm run dev
```

`predev` runs `python3 -m pipeline.build_data` before `next dev`, so `_db/` is rebuilt from
`_raw/` and `_synthesize/` on every cold start. A warm server is already serving the last build;
rerun `python3 -m pipeline.build_data` by hand if `_raw/` changed underneath it.

Then open <http://localhost:3002>.

## Confirm it is actually up

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/
```

Anything but `200` means the server printed an error the log will name. `✓ Ready in` in the log is
not sufficient on its own — a route can still 500 on first render.

## What the build prints

`build_data` prints the date, the channel count, and the bundle list. If the channel count does not
match `config/channels.json`, the roster changed and the sweep has not run since — run
`ait-ingest` first, then rebuild.

## Do not

- Do not run `npm run build` to "check" it. `predev` already rebuilds the data; a production build
  answers a different question and takes minutes.
- Do not delete `_db/` to force a refresh. Deleting it is safe but pointless here: `build_data`
  overwrites every bundle it owns.
- Do not edit anything under `config/`. That is Eric's, and the pipeline never writes there.
- Ignore the "inferred your workspace root" Turbopack warning. It is the EricOS root lockfile,
  not a fault.
