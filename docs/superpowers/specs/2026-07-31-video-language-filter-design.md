# Per-video language, and the language toggle on `/topics`

The board tracks an English and a Chinese scene. `/channels` already reads them separately, but
the cut it uses is `lang` in `config/channels.json`, hand-authored, one value per channel. The
recent feed on `/topics` is a stream of videos from every channel at once, and it has no such
cut, so a Chinese breakout and an English one sit in the same grid with nothing to separate them.

This adds language to the video, not the channel, and puts a toggle on `/topics`.

## What the corpus says

Measured over `_raw/videos/*.jsonl`, 23,562 rows, 11,859 unique videos across 74 channels:

| Signal | Count |
|---|---:|
| CJK codepoints ≥ 10% of the title's alphanumerics | 1,157 videos, 11 channels |
| No CJK at all in the title | 10,701 |
| Between 1% and 10% — genuinely ambiguous | 1 |
| A language field of any kind already on the row | **0** |

Four channels title in both scripts. Three of them are ≥97% Chinese-titled and the fourth is 91%.
The set that a title check gets wrong is therefore small and countable: **6 videos in the whole
corpus** carry an English-looking title on a majority-Chinese channel.

Two things follow. A title check is close to deterministic on this corpus, and the case for
reading transcripts is worth 0.05% of it.

## Not doing: transcripts

`docs/spec.md` §10 puts extraction behind step 13, a hard gate that opens only after a 20-video
manual spike measures artifact capture against a 50% floor. Transcripts cost money and the gate
is closed.

They would also buy almost nothing here. The 6 videos they would resolve are already reachable by
a free signal: `description` is on every raw row and a Chinese creator's description is in
Chinese even when the title is not. If those 6 ever matter, the description is the next signal to
try, and it costs nothing. This design does not use it either, because 6 rows do not justify a
second rule.

## Where language comes from

Three sources, tried in order, each carrying its own tier. This is the claim-tier rule in
`CLAUDE.md`, applied to a field rather than a number.

**1. Oracle — `defaultAudioLanguage`.** The YouTube `videos.list` call in `pipeline/youtube.py`
already requests `part=snippet,statistics,contentDetails`, and `snippet.defaultAudioLanguage` is
in that response. The sweep drops it when it normalises a row into `_raw/videos/<channel>.jsonl`.
Persist it. This is the uploader's own declaration and costs nothing extra — the quota is already
spent.

It backfills nothing. Zero of the 23,562 rows on disk carry it, and it only appears on rows
written by future sweeps. That is fine: it is the tier that improves over time while tier 2 holds
the floor from day one.

**2. Derived — the CJK ratio of the title.** Count alphanumeric characters in the title, count
how many of those are CJK, and call it `zh` at or above a threshold. The threshold lives in
`config/thresholds.json` under a new `language` key, because moving it changes which videos the
toggle shows, which is the test that file's rule states. Start it at `0.10`.

Below the threshold and above zero is not English — it is the one ambiguous row in the corpus,
and a Latin-script title with a stray CJK character. It reads `en`, and the tier says derived, so
the claim is never stronger than the rule that made it.

**3. `unread`.** No declaration, and a title with no alphanumeric characters to measure. Its own
bucket. Never folded into `en`, per the rule that missing data is a state and never a zero.

The result today, with no new API calls: 1,157 `zh`, 10,701 `en`, 1 ambiguous resolving to `en`.

## Components

### `pipeline/language.py`

One pure function, stdlib only, no I/O:

```python
def detect(title: str, default_audio_language: str | None, threshold: float) -> tuple[str, str]:
    """Returns (lang, tier). tier is one of "oracle", "derived", "unread"."""
```

`default_audio_language` is normalised to its primary subtag, so `zh-Hant`, `zh-TW` and `zh` all
read `zh`, and `en-US` reads `en`. A declaration this function does not recognise carries through
as its own code rather than being renamed to a guess — the same rule `web/lib/directory.ts`
already applies to the channel field.

It never imports another skill and never imports `web/`. `test_anchors.py` enforces that.

### `pipeline/snapshot.py`

`_observation()`, the normaliser behind `record_video_metadata()`, gains
`default_audio_language`. One field, straight from the snippet, no transformation — `_raw/` is the
API as it answered.

The registry is append-only and writes a row only when the observation differs from the last one.
Adding a field therefore appends one new observation per video on the next sweep, for every video
the sweep touches, whether or not the uploader declared anything. That is the registry working as
designed, and it is why the field is added once rather than iterated on.

### `pipeline/build_data.py`

Stamp `lang` and `lang_tier` onto every video in `_db/videos.json` and every row in
`_db/recent.json`. Derived on every build, never inherited from a previous `_db/`, so changing the
threshold takes effect on the next `python3 -m pipeline.build_data` with no re-sweep.

### `web/lib/language.ts`

`LANG_NAMES` and the tab derivation move here out of `web/lib/directory.ts`, and the directory
imports them. Today `LANG_NAMES` and the tab-ordering rule exist once, in the directory; putting a
second copy behind the feed is how the two rows start disagreeing about what `zh` is called.

What moves:

- `LANG_NAMES` — `en` → `english`, `zh` → `中文`, `none` → `unread`. A language names itself in its
  own script. An unlisted code carries through as itself.
- `NO_LANG`
- The tab builder, generalised from `SlimChannel[]` to any `{ lang?: string | null }[]`, keeping
  both existing rules: counts run over the already-filtered set so a tab's number is always what
  clicking it produces, and the `unread` bucket sinks to the end whatever its size, because it is
  a state and the tabs before it are a roster.

`filterDirectory` and `matchesQuery` stay in `directory.ts`. They are the directory's, not shared.

### `web/lib/recent.ts`

`RecentOptions` gains `lang: string`, defaulting to `"all"`. `selectRecent` filters on it before
the floor split, so the cap and the ranked/tail boundary are computed over the language the viewer
is looking at rather than over the whole feed. A per-channel cap applied across both scenes and
then filtered would silently drop rows.

### `web/components/recent-feed.tsx`

One more `useState`, one more `role="group"` tab row, rendered through the existing group
component beside the tag and format rows. Client state, like every other filter on this feed — not
a URL parameter. The window is the only facet on this page the other four routes share, and it is
the only one carried in the URL.

Tabs are derived from the feed's own rows, so a language nothing in the current window is in gets
no tab, and the toggle never offers a filter that returns nothing.

## Data flow

```
YouTube snippet.defaultAudioLanguage
  └─> _raw/videos/<channel>.jsonl   (persisted verbatim, new field)
        └─> pipeline/language.py detect(title, default_audio_language, threshold)
              └─> _db/videos.json, _db/recent.json   (lang, lang_tier)
                    └─> web/lib/recent.ts selectRecent(..., lang)
                          └─> RecentFeed language tabs
```

`config/thresholds.json` feeds `detect`. One direction throughout, never backwards.

## Errors and edge cases

- **A title with no alphanumerics** — an emoji-only or punctuation-only title. Zero denominator.
  Reads `unread`, not `en`.
- **An unrecognised declaration** — `ja`, `ko`, `fr`. Carries through as its own code and gets its
  own tab named after the code, because `LANG_NAMES` has no entry to rename it with. The tabs are
  derived from the data, so this needs no edit to ship.
- **A declaration that contradicts the title** — a `zh`-titled video declared `en`. Oracle wins.
  The uploader knows what language they spoke; the title is a proxy.
- **The threshold moved** — no re-sweep. `build_data` re-derives on every run.
- **A language the current window holds nothing in** — no tab. The count rule already guarantees
  a tab's number is what clicking it produces, and zero is not a number to offer.

## Testing

`pipeline/test_language.py`, beside the code:

- `zh` from a Chinese title with no declaration, tier `derived`
- `en` from a Latin title with no declaration, tier `derived`
- `zh` from `zh-Hant`, `zh-TW` and `zh` declarations, tier `oracle`
- oracle beats a title that disagrees
- an emoji-only title is `unread`, not `en`
- the one real ambiguous title from the corpus resolves the way the threshold says
- an unrecognised declaration carries through unrenamed

`web/lib/language.test.ts`: the tab rules that move, re-pointed at the new home — ordering by
size, `unread` last, counts over the filtered set, an unnamed code carried through.

`web/lib/recent.test.ts`: the language filter runs before the floor split and before the cap.

`web/components/recent-feed.test.tsx`: selecting a language shows that language and nothing else;
the row offers only languages the current window holds.

The directory's existing tests stay green unchanged. If they do not, the extraction changed
behaviour and the extraction is wrong.

## What this does not build

- Any use of transcripts or descriptions.
- Any change to `config/channels.json` or the channel-level `lang`. `/channels` keeps reading the
  hand-authored field. The two answer different questions and the video field is not a
  replacement for the roster one.
- A language cut anywhere but the recent feed. The leaderboard, `/compare` and the channel pages
  are channel-scoped and already have the roster field if they ever want it.
- Backfilling `defaultAudioLanguage` onto the 23,562 rows already on disk. That is a full
  re-sweep of the corpus for a field the derived rule already covers.
