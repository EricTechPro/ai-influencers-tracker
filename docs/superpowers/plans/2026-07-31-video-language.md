# Per-Video Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every video a language and a tier that says how it was read, and put a language toggle on the `/topics` recent feed.

**Architecture:** A pure stdlib function reads a language from the uploader's `defaultAudioLanguage` when it exists (oracle) and from the CJK share of the title when it does not (derived), returning `unread` when neither fires. `build_data` stamps `lang` and `lang_tier` onto `_db/videos.json` and `_db/recent.json` on every build. The web side moves `LANG_NAMES` and the tab builder out of `web/lib/directory.ts` into a shared `web/lib/language.ts` so `/channels` and the feed cannot drift, then adds one client-side facet to `RecentFeed`.

**Tech Stack:** Python 3 stdlib only in `pipeline/`. TypeScript, Next.js App Router, vitest in `web/`.

Spec: `docs/superpowers/specs/2026-07-31-video-language-filter-design.md`

## Global Constraints

- `pipeline/` imports stdlib only. It never imports a skill and never imports `web/`. `test_anchors.py` enforces this.
- Missing data is a state, never a zero. A video with no readable language is `unread`, never `en`.
- Three claim tiers, never blended: Oracle, Derived, Inference. `lang_tier` carries which one produced `lang`.
- A number belongs in `config/thresholds.json` only if changing it changes what the dashboard tells you to do. The CJK share threshold qualifies; the regex range does not.
- Layer direction is one-way: `config/` → `_raw/` → `_synthesize/` → `_db/` → `web/`. Never backwards.
- No transcripts, no descriptions. Title and the uploader's declaration only.
- Commits follow `CLAUDE.md` § Commits: `type(scope): subject` with scope one of `ait-web`, `pipeline`, `ait`, or a skill name. Every code commit carries a body ending in a line naming what ran and what passed. Footer is `Co-Authored-By:` plus `Claude-Session:`.
- Python style: `ruff check pipeline test_anchors.py scripts`, line length 100.

## File Structure

| File | Responsibility |
|---|---|
| `pipeline/language.py` (create) | `detect()` — the only place a language is decided |
| `pipeline/test_language.py` (create) | its tests |
| `config/thresholds.json` (modify) | the CJK share threshold |
| `pipeline/snapshot.py` (modify, `_observation`) | persist `defaultAudioLanguage` onto the raw row |
| `pipeline/bundles/videos.py` (modify) | stamp `lang`/`lang_tier` on `videos.json` |
| `pipeline/bundles/recent.py` (modify) | stamp `lang`/`lang_tier` on `recent.json` |
| `web/lib/language.ts` (create) | `NO_LANG`, `LANG_NAMES`, `langTabsFor` — shared by both routes |
| `web/lib/language.test.ts` (create) | its tests |
| `web/lib/directory.ts` (modify) | re-export the moved names, wrap `langTabsFor` |
| `web/lib/types.ts` (modify) | `lang`/`lang_tier` on `RecentRow` |
| `web/lib/recent.ts` (modify) | `lang` in `RecentOptions`, filtered in `selectRecent` |
| `web/components/recent-feed.tsx` (modify) | the language facet |

---

### Task 1: `detect()` and its threshold

**Files:**
- Create: `pipeline/language.py`
- Create: `pipeline/test_language.py`
- Modify: `config/thresholds.json`

**Interfaces:**
- Consumes: nothing
- Produces: `pipeline.language.detect(title: str | None, default_audio_language: str | None, threshold: float) -> tuple[str, str]`, returning `(lang, tier)` where `tier` is `"oracle"`, `"derived"`, or `"unread"`. Also `pipeline.language.NO_LANG = "none"`.

- [ ] **Step 1: Add the threshold to `config/thresholds.json`**

Add a top-level `"language"` key, alongside `"momentum"` and the others:

```json
  "language": {
    "zh_title_min_share": 0.10,
    "_comment": "Share of a title's alphanumeric characters that must be CJK before the title alone reads zh. Measured over the 11,859-video corpus on 2026-07-31: 1,157 titles sit at or above 0.10, 10,701 hold no CJK at all, and exactly one falls between 0.01 and 0.10. Raising it past ~0.5 starts dropping the mixed-script titles Chinese creators actually write, which pair a Latin product name with a Chinese sentence."
  },
```

- [ ] **Step 2: Write the failing tests**

Create `pipeline/test_language.py`:

```python
from pipeline import language

T = 0.10


def test_chinese_title_with_no_declaration_reads_zh():
    assert language.detect("矽谷大神 Karpathy 筆記術！十分鐘學會", None, T) == ("zh", "derived")


def test_latin_title_with_no_declaration_reads_en():
    assert language.detect("How I Use Claude Code Every Day", None, T) == ("en", "derived")


def test_declaration_wins_over_the_title():
    assert language.detect("Claude Code Tutorial", "zh-Hant", T) == ("zh", "oracle")


def test_declaration_subtags_all_normalise_to_the_primary():
    for declared in ("zh", "zh-Hant", "zh-TW", "ZH-hans"):
        assert language.detect("anything", declared, T) == ("zh", "oracle")
    assert language.detect("anything", "en-US", T) == ("en", "oracle")


def test_an_unrecognised_declaration_carries_through_unrenamed():
    assert language.detect("Claude Code 入門", "ja", T) == ("ja", "oracle")


def test_a_title_with_nothing_to_measure_is_unread_not_en():
    assert language.detect("🔥🔥🔥", None, T) == (language.NO_LANG, "unread")
    assert language.detect("", None, T) == (language.NO_LANG, "unread")
    assert language.detect(None, None, T) == (language.NO_LANG, "unread")


def test_a_stray_cjk_character_below_the_threshold_stays_en():
    # The one ambiguous row in the corpus: a Latin title carrying a short CJK aside.
    assert language.detect(
        "Claude Code 一键切换到 DeepSeek (CC Switch) #Shorts #claudecode #deepseek "
        "full walkthrough for beginners and everyone else", None, 0.5
    ) == ("en", "derived")


def test_an_empty_declaration_falls_through_to_the_title():
    assert language.detect("矽谷大神筆記術", "", T) == ("zh", "derived")
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pytest pipeline/test_language.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'pipeline.language'`

- [ ] **Step 4: Write the implementation**

Create `pipeline/language.py`:

```python
"""What language a video is in, and how confidently we know it.

Two signals, and the tier says which one answered. `defaultAudioLanguage` is the uploader's own
declaration, carried in the videos.list snippet the sweep already pays for — Oracle. The CJK share
of the title is a rule this project applies — Derived, and it ships the rule that produced it.
Neither firing is `unread`: its own state, never folded into en.

Nothing here reads a transcript or a description. Measured over the corpus on 2026-07-31, a title
check misreads 6 videos out of 11,859, and extraction is behind step 13's hard gate.
"""
from __future__ import annotations

import re

#: The bucket a video with no readable language falls in. Not a language.
NO_LANG = "none"

# CJK Unified Ideographs, Extension A, and the compatibility block. Kana and Hangul are
# deliberately absent: this board tracks an English and a Chinese scene, and a Japanese title
# should read as its own code from a declaration rather than be folded into zh by script alone.
_CJK = re.compile(r"[一-鿿㐀-䶿豈-﫿]")


def _primary_subtag(tag: str) -> str:
    """`zh-Hant` and `ZH-hans` are both zh. A tag this project has no opinion on carries through."""
    return tag.strip().lower().split("-")[0]


def cjk_share(title: str) -> float:
    """CJK characters as a share of the title's alphanumerics. 0.0 when there is nothing to count.

    The denominator is alphanumerics rather than the whole string so that punctuation, emoji, and
    the spaces around a Latin product name cannot dilute a Chinese sentence below the threshold.
    """
    letters = [c for c in title if c.isalnum()]
    if not letters:
        return 0.0
    return sum(1 for c in letters if _CJK.match(c)) / len(letters)


def detect(title: str | None, default_audio_language: str | None,
           threshold: float) -> tuple[str, str]:
    """Returns (lang, tier). tier is one of "oracle", "derived", "unread"."""
    if default_audio_language:
        return _primary_subtag(default_audio_language), "oracle"
    if not title:
        return NO_LANG, "unread"
    letters = [c for c in title if c.isalnum()]
    if not letters:
        return NO_LANG, "unread"
    return ("zh" if cjk_share(title) >= threshold else "en"), "derived"
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pytest pipeline/test_language.py -v`
Expected: PASS, 8 tests.

- [ ] **Step 6: Check style and the import rules**

Run: `ruff check pipeline/language.py pipeline/test_language.py && pytest test_anchors.py -q`
Expected: no ruff findings, anchors pass.

- [ ] **Step 7: Commit**

```bash
rtk git add pipeline/language.py pipeline/test_language.py config/thresholds.json
rtk git commit -m "feat(pipeline): read a video's language from its declaration, then its title"
```

Body must state: the two signals and their tiers, the corpus measurement that sized the threshold at 0.10 (1,157 zh / 10,701 en / 1 between 0.01 and 0.10), that kana and hangul are deliberately outside the CJK range, and a closing line with the test counts.

---

### Task 2: Persist the uploader's declaration

**Files:**
- Modify: `pipeline/snapshot.py:102-116` (`_observation`)
- Test: `pipeline/test_video_sweep.py`

**Interfaces:**
- Consumes: nothing from Task 1
- Produces: a `default_audio_language` key on every row in `_raw/videos/<channel_id>.jsonl`, `str` or `None`

- [ ] **Step 1: Write the failing test**

Append to `pipeline/test_video_sweep.py`:

```python
def test_observation_keeps_the_uploaders_declared_audio_language(tmp_path, monkeypatch):
    item = {"id": "v1",
            "snippet": {"title": "t", "publishedAt": "2026-07-01T00:00:00Z",
                        "defaultAudioLanguage": "zh-Hant"},
            "contentDetails": {"duration": "PT10M"},
            "statistics": {"viewCount": "5"}}
    row = snapshot._observation("UC1", item, "2026-07-27T00:00:00Z")
    assert row["default_audio_language"] == "zh-Hant"


def test_observation_records_an_absent_declaration_as_none_not_empty_string():
    item = {"id": "v2",
            "snippet": {"title": "t", "publishedAt": "2026-07-01T00:00:00Z"},
            "contentDetails": {"duration": "PT10M"},
            "statistics": {"viewCount": "5"}}
    row = snapshot._observation("UC1", item, "2026-07-27T00:00:00Z")
    assert row["default_audio_language"] is None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest pipeline/test_video_sweep.py -k audio_language -v`
Expected: FAIL with `KeyError: 'default_audio_language'`

- [ ] **Step 3: Add the field**

In `pipeline/snapshot.py`, inside `_observation`'s returned dict, after the `"tags"` entry:

```python
            # The uploader's own declaration, Oracle tier. In the snippet we already pay for and
            # discarded until now. Most uploaders never set it, so it is absent far more often
            # than not — absent is None, which language.detect reads as "fall through to the
            # title", never as a claim that the video has no language.
            "default_audio_language": snippet.get("defaultAudioLanguage"),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest pipeline/test_video_sweep.py -v`
Expected: PASS, including the two new tests and every pre-existing one.

- [ ] **Step 5: Confirm the registry's change-detection still behaves**

Run: `pytest pipeline/ -q`
Expected: PASS. `record_video_metadata` compares every key but `seen_at`, so adding a field means the next sweep appends one fresh observation per video it touches. That is the append-only registry working as designed; no test should need relaxing to accommodate it. If one fails, read it before changing it.

- [ ] **Step 6: Commit**

```bash
rtk git add pipeline/snapshot.py pipeline/test_video_sweep.py
rtk git commit -m "feat(pipeline): keep the defaultAudioLanguage the sweep was discarding"
```

Body must state: the field was already in the `part=snippet` response the quota is spent on, that zero of the 23,562 rows on disk carry it so it backfills nothing and improves only with future sweeps, and that adding a key to the observation appends one row per swept video on the next run.

---

### Task 3: Stamp `lang` and `lang_tier` onto the bundles

**Files:**
- Modify: `pipeline/bundles/videos.py`
- Modify: `pipeline/bundles/recent.py`
- Create: `pipeline/bundles/test_videos_language.py`

**Interfaces:**
- Consumes: `language.detect(title, default_audio_language, threshold)` from Task 1; the `default_audio_language` raw key from Task 2
- Produces: `lang: str` and `lang_tier: str` on every row of `_db/videos.json` and `_db/recent.json`

- [ ] **Step 1: Write the failing test**

Create `pipeline/bundles/test_videos_language.py`:

```python
import types

from pipeline.bundles import videos


def _ctx(rows):
    return types.SimpleNamespace(
        videos=rows,
        baselines={"UC1": {}},
        comment_stats={},
        topic_index=[],
        thresholds={"traction": {}, "language": {"zh_title_min_share": 0.10}},
        today=None,
        generated_at="2026-07-31T00:00:00Z",
    )


def _row(video_id, title, declared=None):
    return {"video_id": video_id, "channel_id": "UC1", "published_at": "2026-07-01T00:00:00Z",
            "title": title, "duration_s": 600, "type": "long", "view_count": 10,
            "series": [], "tags": [], "default_audio_language": declared}


def test_every_row_carries_a_language_and_the_tier_that_read_it(monkeypatch):
    monkeypatch.setattr(videos.multiplier, "for_video", lambda v, b: {"value": None})
    monkeypatch.setattr(videos.traction, "for_video", lambda *a: {})
    monkeypatch.setattr(videos.topics, "match_video", lambda v, i: [])
    out = videos.build(_ctx([_row("a", "矽谷大神筆記術"),
                             _row("b", "How I Use Claude Code"),
                             _row("c", "Claude Code Tutorial", "zh-TW"),
                             _row("d", "🔥")]))
    by_id = {r["video_id"]: r for r in out["videos"]}
    assert (by_id["a"]["lang"], by_id["a"]["lang_tier"]) == ("zh", "derived")
    assert (by_id["b"]["lang"], by_id["b"]["lang_tier"]) == ("en", "derived")
    assert (by_id["c"]["lang"], by_id["c"]["lang_tier"]) == ("zh", "oracle")
    assert (by_id["d"]["lang"], by_id["d"]["lang_tier"]) == ("none", "unread")


def test_a_raw_row_predating_the_field_still_gets_a_language(monkeypatch):
    monkeypatch.setattr(videos.multiplier, "for_video", lambda v, b: {"value": None})
    monkeypatch.setattr(videos.traction, "for_video", lambda *a: {})
    monkeypatch.setattr(videos.topics, "match_video", lambda v, i: [])
    row = _row("e", "矽谷大神筆記術")
    del row["default_audio_language"]
    out = videos.build(_ctx([row]))
    assert out["videos"][0]["lang"] == "zh"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest pipeline/bundles/test_videos_language.py -v`
Expected: FAIL with `KeyError: 'lang'`

- [ ] **Step 3: Stamp the fields in `videos.py`**

In `pipeline/bundles/videos.py`, add `language` to the import line:

```python
from .. import config, language, multiplier, topics, traction, util
```

Bump `VERSION = 2` to `VERSION = 3` — the bundle's shape changed and the web reader's schema parity test keys on it.

Inside `build()`, read the threshold once above the loop:

```python
def build(ctx) -> dict:
    threshold = ctx.thresholds["language"]["zh_title_min_share"]
    rows = []
    for video in ctx.videos:
        baselines = ctx.baselines[video["channel_id"]]
        lang, lang_tier = language.detect(video.get("title"),
                                          video.get("default_audio_language"), threshold)
        rows.append({
```

and add to the appended dict, after `"tags"`:

```python
            # Derived on every build rather than inherited from the last _db/, so moving the
            # threshold takes effect on the next build_data with no re-sweep. lang_tier is which
            # signal answered, and it travels with the value because a declaration and a title
            # rule are not the same claim.
            "lang": lang,
            "lang_tier": lang_tier,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pytest pipeline/bundles/test_videos_language.py -v`
Expected: PASS, 2 tests.

- [ ] **Step 5: Do the same for `recent.py`**

In `pipeline/bundles/recent.py`, add `language` to the import line, bump `VERSION = 2` to `VERSION = 3`, and add `"lang"` and `"lang_tier"` to the appended card dict after `"pattern_id": None,`:

```python
            "lang": lang,
            "lang_tier": lang_tier,
```

computing them just above the append, from the same threshold read once above the loop:

```python
        lang, lang_tier = language.detect(video.get("title"),
                                          video.get("default_audio_language"), threshold)
```

**Leave `TRUST` unchanged.** `TRUST` states one tier per field for the whole bundle, and `lang`
has two — oracle for a declared row, derived for an inferred one. Adding `"lang": "derived"` there
would claim the weaker tier for rows that earned the stronger one, and `"lang": "oracle"` would
claim the stronger for rows that did not. That is exactly the blend the claim-tier rule forbids,
which is why `lang_tier` rides on the row instead.

- [ ] **Step 6: Rebuild and confirm against the real corpus**

Run: `python3 -m pipeline.build_data`
Then:

```bash
python3 -c "
import json,collections
d=json.load(open('_db/videos.json'))
print('version',d['version'])
c=collections.Counter((v['lang'],v['lang_tier']) for v in d['videos'])
print(dict(c))
"
```

Expected: `version 3`, and roughly `{('en','derived'): 10701, ('zh','derived'): 1157, ...}`. Zero rows should carry tier `oracle` — nothing on disk declares a language yet. If any row reads `('en', 'unread')` the fallthrough is wrong.

- [ ] **Step 7: Run the whole pipeline suite**

Run: `pytest -q && ruff check pipeline`
Expected: PASS, no ruff findings.

- [ ] **Step 8: Commit**

```bash
rtk git add pipeline/bundles/videos.py pipeline/bundles/recent.py pipeline/bundles/test_videos_language.py
rtk git commit -m "feat(pipeline): every video carries a language and the tier that read it"
```

Body must state: both bundle versions went to 3, the real counts the rebuild produced, that zero rows read oracle because nothing on disk declares one yet, and that the value is re-derived on every build so the threshold needs no re-sweep.

---

### Task 4: Move the language vocabulary into `web/lib/language.ts`

**Files:**
- Create: `web/lib/language.ts`
- Create: `web/lib/language.test.ts`
- Modify: `web/lib/directory.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `NO_LANG: "none"`, `type LangTab = { key: string; label: string; count: number }`, `langTabsFor<T extends { lang?: string | null }>(items: T[]): LangTab[]`

- [ ] **Step 1: Write the failing test**

Create `web/lib/language.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { langTabsFor, NO_LANG } from "./language"

const item = (lang: string | null) => ({ lang })

describe("langTabsFor", () => {
  it("leads with all, then orders languages by size", () => {
    const tabs = langTabsFor([item("zh"), item("en"), item("en")])
    expect(tabs.map((t) => t.key)).toEqual(["all", "en", "zh"])
    expect(tabs.map((t) => t.count)).toEqual([3, 2, 1])
  })

  it("names a language in its own script, and an unread one as unread", () => {
    const tabs = langTabsFor([item("en"), item("zh"), item(null)])
    const labels = Object.fromEntries(tabs.map((t) => [t.key, t.label]))
    expect(labels.en).toBe("english")
    expect(labels.zh).toBe("中文")
    expect(labels[NO_LANG]).toBe("unread")
  })

  it("sinks the unread bucket to the end whatever its size", () => {
    const tabs = langTabsFor([item(null), item(null), item(null), item("en")])
    expect(tabs.map((t) => t.key)).toEqual(["all", "en", NO_LANG])
  })

  it("carries a language it has no name for through as its own code", () => {
    const tabs = langTabsFor([item("ja")])
    expect(tabs.find((t) => t.key === "ja")?.label).toBe("ja")
  })

  it("offers no tab for a language the set does not hold", () => {
    expect(langTabsFor([item("en")]).map((t) => t.key)).toEqual(["all", "en"])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run lib/language.test.ts`
Expected: FAIL, cannot resolve `./language`

- [ ] **Step 3: Create `web/lib/language.ts`**

```ts
/** The bucket an item with no language reading falls in. `null` is unmeasured, not a language,
 *  so it gets its own key rather than being folded into en or dropped out of the set. */
export const NO_LANG = "none"

/** What a language code is called on the board. A language names itself in its own script where
 *  it has one — a Chinese speaker scanning this row should not have to read `zh`. Anything not
 *  listed carries through as its own code rather than being renamed to a guess. */
export const LANG_NAMES: Record<string, string> = {
  en: "english",
  zh: "中文",
  [NO_LANG]: "unread",
}

export type LangTab = { key: string; label: string; count: number }

/**
 * The language tabs for any set of things that carry a language.
 *
 * Shared by the channel directory, whose language is hand-authored per channel in
 * `config/channels.json`, and by the recent feed, whose language is read per video by
 * `pipeline/language.py`. They are different questions on different data, but the vocabulary and
 * the ordering are the same, and a second copy is how the two rows start disagreeing about what
 * `zh` is called.
 *
 * Callers pass the already-filtered set. The counts therefore run over what the viewer can
 * actually reach, so a tab's number is always what clicking it produces.
 */
export function langTabsFor<T extends { lang?: string | null }>(items: T[]): LangTab[] {
  const counts = new Map<string, number>()
  for (const it of items) {
    const k = it.lang ?? NO_LANG
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  // Biggest language first; the unmeasured bucket sinks to the end whatever its size, because it
  // is a state and the tabs before it are a roster.
  const langs = [...counts.entries()]
    .sort((a, b) => {
      if (a[0] === NO_LANG) return 1
      if (b[0] === NO_LANG) return -1
      return b[1] - a[1] || a[0].localeCompare(b[0])
    })
    .map(([key, count]) => ({ key, label: LANG_NAMES[key] ?? key, count }))
  return [{ key: "all", label: "all", count: items.length }, ...langs]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run lib/language.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Point `directory.ts` at the shared copy**

In `web/lib/directory.ts`, delete the local `NO_LANG`, `LANG_NAMES`, and `LangTab`, and replace the body of `langTabs` so the directory keeps its own two-argument signature — its callers and tests pass a query, and the shared helper takes a pre-filtered list:

```ts
import { langTabsFor, NO_LANG, type LangTab } from "./language"
import type { SlimChannel } from "./growth"

// Re-exported because the directory's components and tests import them from here, and the two
// names mean the same thing in both places.
export { NO_LANG, type LangTab }
```

and

```ts
/**
 * The language tabs, derived from the roster rather than hardcoded, so a language the sweep
 * starts returning gets a tab without an edit here and no tab can name a language the roster
 * does not hold.
 *
 * The counts run over the query-filtered roster, not the whole one, so a tab's number is always
 * what clicking it produces. With `pat` typed, `english 63` is a lie — clicking it yields one row.
 */
export function langTabs(channels: SlimChannel[], q: string): LangTab[] {
  return langTabsFor(channels.filter((c) => matchesQuery(c, q)))
}
```

- [ ] **Step 6: Run the directory's existing tests unchanged**

Run: `cd web && npx vitest run lib/directory.test.ts components/channel-directory.test.tsx`
Expected: PASS, with **no edits to either test file**. If a test needs changing, the extraction changed behaviour and the extraction is wrong — revert and redo it.

- [ ] **Step 7: Type-check and commit**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

```bash
rtk git add web/lib/language.ts web/lib/language.test.ts web/lib/directory.ts
rtk git commit -m "refactor(ait-web): one language vocabulary, shared by the directory and the feed"
```

Body must state: what moved and why one copy matters, that `filterDirectory` and `matchesQuery` stayed because they are the directory's alone, that `langTabs` kept its two-argument signature so no caller changed, and a closing line naming the directory tests that passed untouched.

---

### Task 5: The language filter in `selectRecent`

**Files:**
- Modify: `web/lib/types.ts` (`RecentRow`)
- Modify: `web/lib/recent.ts` (`RecentOptions`, `selectRecent`)
- Modify: `web/lib/recent.test.ts`

**Interfaces:**
- Consumes: the `lang`/`lang_tier` fields from Task 3
- Produces: `RecentOptions.lang: string`; `selectRecent` filters on it

- [ ] **Step 1: Add the fields to `RecentRow`**

In `web/lib/types.ts`, inside `interface RecentRow`, after `channel_name`:

```ts
  /** Which scene this video is from, read per video rather than inherited from its channel: a
   *  Chinese video on an English channel lands correctly. `"none"` is unread, never english. */
  lang: string
  /** Which signal produced `lang`: `"oracle"` is the uploader's own declaration, `"derived"` is
   *  this project's CJK-share rule over the title, `"unread"` is neither. */
  lang_tier: string
```

- [ ] **Step 2: Write the failing tests**

Append to `web/lib/recent.test.ts`:

```ts
describe("the language filter", () => {
  const row = (id: string, lang: string, multiplier: number) => ({
    video_id: id, title: id, published_at: "2026-07-30T00:00:00Z", view_count: 100,
    duration_s: 600, type: "long" as const, channel_id: `ch-${id}`, channel_name: id,
    lang, lang_tier: "derived", multiplier, baseline: 10, baseline_n: 5,
    views_gained_24h: null,
    momentum: { state: "unmeasured" as const }, pattern_id: null,
  })
  const bundle = { videos: [row("a", "zh", 5), row("b", "en", 4), row("c", "none", 3)] }
  const today = new Date("2026-07-31T00:00:00Z")
  const opts = { window: 30, format: "all" as const, perChannelCap: null, floor: 0 }

  it("returns every language under all", () => {
    const { feed } = selectRecent(bundle as never, { ...opts, lang: "all" }, today)
    expect(feed.map((v) => v.video_id)).toEqual(["a", "b", "c"])
  })

  it("returns one language and nothing else", () => {
    const { feed } = selectRecent(bundle as never, { ...opts, lang: "zh" }, today)
    expect(feed.map((v) => v.video_id)).toEqual(["a"])
  })

  it("treats unread as its own bucket rather than folding it into a real language", () => {
    const { feed } = selectRecent(bundle as never, { ...opts, lang: "none" }, today)
    expect(feed.map((v) => v.video_id)).toEqual(["c"])
  })

  it("applies the language before the per-channel cap, so the cap is spent on rows you can see", () => {
    const shared = [
      { ...row("x", "en", 9), channel_id: "same" },
      { ...row("y", "en", 8), channel_id: "same" },
      { ...row("z", "zh", 7), channel_id: "same" },
    ]
    const { ranked } = selectRecent(
      { videos: shared } as never, { ...opts, lang: "zh", perChannelCap: 2 }, today
    )
    expect(ranked.map((v) => v.video_id)).toEqual(["z"])
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd web && npx vitest run lib/recent.test.ts -t "the language filter"`
Expected: FAIL — `lang` is not a property of `RecentOptions`, and all four cases return every row.

- [ ] **Step 4: Add `lang` to `RecentOptions` and filter on it**

In `web/lib/recent.ts`, inside `interface RecentOptions`:

```ts
  /** which language scene to show; "all" lifts the filter entirely */
  lang: string
```

and in `selectRecent`, inside the `inWindow` filter, as the first check:

```ts
  const inWindow = bundle.videos.filter((v) => {
    // Before the floor split and before the cap, deliberately. A per-channel cap spent across
    // both scenes and then filtered would push a channel's Chinese rows to the tail on the
    // strength of its English ones, which is a cap the viewer never set.
    if (opts.lang !== "all" && v.lang !== opts.lang) return false
    if (!matchesFormat(v, opts.format)) return false
    const age = ageDays(v.published_at, today)
    return age >= 0 && age <= opts.window
  })
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web && npx vitest run lib/recent.test.ts`
Expected: PASS, including every pre-existing case. Pre-existing calls to `selectRecent` in this file will not compile without a `lang` — add `lang: "all"` to each, which is the behaviour they already asserted.

- [ ] **Step 6: Type-check and commit**

Run: `cd web && npx tsc --noEmit`
Expected: no errors. `RecentFeed` will not compile yet if it calls `selectRecent` without `lang`; add `lang: "all"` there for now and Task 6 replaces it with state.

```bash
rtk git add web/lib/types.ts web/lib/recent.ts web/lib/recent.test.ts web/components/recent-feed.tsx
rtk git commit -m "feat(ait-web): the recent feed can be cut to one language scene"
```

Body must state why the filter runs before the floor split and the cap, and close with the vitest counts.

---

### Task 6: The toggle on `/topics`

**Files:**
- Modify: `web/components/recent-feed.tsx`
- Modify: `web/components/recent-feed.test.tsx`

**Interfaces:**
- Consumes: `langTabsFor` from Task 4, `RecentOptions.lang` from Task 5
- Produces: no exports; a `role="group"` with `aria-label="language"` on the page

- [ ] **Step 1: Write the failing tests**

Append to `web/components/recent-feed.test.tsx`, following the render helper the existing suite already uses:

```tsx
describe("the language row", () => {
  it("offers only languages the current window holds", () => {
    renderFeed()
    const tabs = screen.getByRole("group", { name: "language" })
    expect(within(tabs).getAllByRole("button").map((b) => b.textContent)).toEqual(
      expect.arrayContaining(["all"])
    )
    expect(within(tabs).queryByText("ja")).toBeNull()
  })

  it("selecting a language shows that language and nothing else", async () => {
    renderFeed()
    const tabs = screen.getByRole("group", { name: "language" })
    await userEvent.click(within(tabs).getByRole("button", { name: /中文/ }))
    expect(screen.queryByText("How I Use Claude Code")).toBeNull()
  })

  it("marks the selected language pressed and all unpressed", async () => {
    renderFeed()
    const tabs = screen.getByRole("group", { name: "language" })
    await userEvent.click(within(tabs).getByRole("button", { name: /中文/ }))
    expect(within(tabs).getByRole("button", { name: "all" })).toHaveAttribute(
      "aria-pressed", "false"
    )
  })
})
```

Extend the suite's fixture bundle with at least one `lang: "zh"` row titled in Chinese and one `lang: "en"` row titled `How I Use Claude Code`, both inside the default window, and give every existing fixture row `lang: "en"` and `lang_tier: "derived"`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run components/recent-feed.test.tsx -t "the language row"`
Expected: FAIL, `Unable to find an accessible element with the role "group" and name "language"`

- [ ] **Step 3: Add the state and the counts**

In `web/components/recent-feed.tsx`, add to the imports:

```tsx
import { langTabsFor } from "@/lib/language"
```

Add the state beside the other facets, after `const [format, setFormat] = useState<FormatKey>("all")`:

```tsx
  const [lang, setLang] = useState("all")
```

Replace the existing `selectRecent` memo with two calls — one lang-agnostic for the counts, one for what the grid renders:

```tsx
  // Two passes, deliberately. The tabs count over the window's own videos rather than over the
  // current selection, the same rule the tag facets follow: a facet that recounts itself as you
  // click it can only ever read its own selection back. The feed below is the filtered pass.
  const { feed: allLangs } = useMemo(
    () => selectRecent(bundle, { window, format, perChannelCap: cap, floor, lang: "all" }, now),
    [bundle, window, format, cap, floor, now]
  )
  const { feed } = useMemo(
    () => selectRecent(bundle, { window, format, perChannelCap: cap, floor, lang }, now),
    [bundle, window, format, cap, floor, lang, now]
  )
  const langs = useMemo(() => langTabsFor(allLangs), [allLangs])
```

Add the fallback that the directory already runs, so a window change cannot leave a lit button over an empty grid:

```tsx
  // Narrowing the window can empty the selected language. Falling back to all beats leaving the
  // page reading "no videos" beside a language button still lit.
  useEffect(() => {
    if (lang !== "all" && !langs.some((t) => t.key === lang)) setLang("all")
  }, [langs, lang])
```

- [ ] **Step 4: Render the row**

In the `fbar` div, immediately after the `format` group's closing `</Keys>`:

```tsx
            {/* Only rendered when the window actually holds more than one language: a single-key
                row plus "all" is two buttons that cannot change anything, and the line already
                carries four groups, the count, and the search. */}
            {langs.length > 2 && (
              <Keys label="language">
                {langs.map((t) => (
                  <Key
                    key={t.key}
                    on={lang === t.key}
                    onClick={() => setLang(t.key)}
                    label={t.label}
                    n={t.key === "all" ? undefined : t.count}
                  />
                ))}
              </Keys>
            )}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web && npx vitest run components/recent-feed.test.tsx`
Expected: PASS, including every pre-existing case.

- [ ] **Step 6: Commit**

```bash
rtk git add web/components/recent-feed.tsx web/components/recent-feed.test.tsx
rtk git commit -m "feat(ait-web): cut the recent feed to one language scene"
```

Body must state: why the counts run over a lang-agnostic pass, why the row hides itself below two languages, the fallback when a window change empties the selection, and the vitest counts.

---

### Task 7: Full verification and the docs

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/system.md`

**Interfaces:**
- Consumes: everything above
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Rebuild from scratch and confirm the bundles agree**

Run:

```bash
python3 -m pipeline.build_data
python3 -c "
import json,collections
for name in ('videos','recent'):
    d=json.load(open(f'_db/{name}.json'))
    rows=d['videos']
    c=collections.Counter(r['lang'] for r in rows)
    t=collections.Counter(r['lang_tier'] for r in rows)
    print(name,'v'+str(d['version']),len(rows),dict(c),dict(t))
"
```

Expected: both at version 3, every row carrying a `lang` and a `lang_tier`, and no row with `lang == "none"` carrying a tier other than `unread`.

- [ ] **Step 2: Run every test**

Run: `pytest -q && ruff check pipeline test_anchors.py scripts && cd web && npx vitest run && npx tsc --noEmit && npm run build`
Expected: all PASS, 0 ruff findings, 0 build warnings. Record the counts; they go in the commit body.

- [ ] **Step 3: Walk the page**

Run: `cd web && npm run dev`, open `/topics`.
Check: the language row appears beside window and format; clicking 中文 leaves only Chinese-titled cards; the count on each key matches the grid's own "N videos of M" after clicking it; clicking a 1d window with no Chinese video in it drops the selection back to all rather than emptying the grid under a lit button.

- [ ] **Step 4: Update the docs**

In `CLAUDE.md`, under "Easy to break", add:

```markdown
- A video's `lang` is read per video, from the uploader's `defaultAudioLanguage` when it exists
  and the CJK share of the title when it does not. It is not the channel's hand-authored `lang`
  in `config/channels.json`, which is what `/channels` filters on. The two answer different
  questions and neither replaces the other.
```

In `docs/system.md`, add `lang` and `lang_tier` to the `videos.json` and `recent.json` schema tables, both `string`, and note the bundle version bump to 3.

- [ ] **Step 5: Commit**

```bash
rtk git add CLAUDE.md docs/system.md
rtk git commit -m "docs(ait): the video language field, and how it differs from the roster's"
```

Body must state the counts from Step 2 and the distinction between the two `lang` fields.

---

## Self-Review

**Spec coverage.** Oracle source → Task 2 and Task 1. Derived source → Task 1. `unread` bucket → Task 1, tested. Threshold in `config/thresholds.json` → Task 1. `pipeline/language.py` pure and stdlib-only → Task 1, anchors run in Step 6. `_observation` persists the declaration → Task 2. `build_data` stamps both bundles → Task 3. `web/lib/language.ts` extraction with the directory's tests untouched → Task 4. `RecentOptions.lang` filtering before the floor split → Task 5. Client state, not a URL parameter → Task 6. Tabs derived from the feed's own rows → Task 6. Every "What this does not build" item is absent from every task.

**Type consistency.** `detect(title, default_audio_language, threshold) -> (lang, tier)` is defined in Task 1 and called with that signature in Task 3. `NO_LANG` is `"none"` in both `pipeline/language.py` and `web/lib/language.ts`. `langTabsFor` takes `{ lang?: string | null }[]` in Task 4 and is called with `RecentRow[]` in Task 6, which carries `lang: string` from Task 5. `LangTab` is defined once in Task 4 and re-exported by `directory.ts`.

**Known ordering constraint.** Task 5 leaves `recent-feed.tsx` compiling only because it adds `lang: "all"` to the existing call; Task 6 replaces it. Running Task 6 before Task 5 will not type-check.
