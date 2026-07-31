import type { SlimChannel } from "./growth"

/** The bucket a channel with no language reading falls in. `null` is unmeasured, not a language,
 *  so it gets its own key rather than being folded into en or dropped out of the roster. */
export const NO_LANG = "none"

/** What a language code is called on the board. A language names itself in its own script where
 *  it has one — a Chinese speaker scanning this row should not have to read `zh`. Anything not
 *  listed carries through as its own code rather than being renamed to a guess. */
const LANG_NAMES: Record<string, string> = {
  en: "english",
  zh: "中文",
  [NO_LANG]: "unread",
}

/** Does this channel answer the search box? Split out of the filter because the language tab
 *  counts have to run the query without the language, and two copies of the @-stripping would
 *  drift. */
export function matchesQuery(c: SlimChannel, q: string): boolean {
  const needle = q.trim().replace(/^@/, "").toLowerCase()
  if (!needle) return true
  return c.name.toLowerCase().includes(needle) || c.handle.toLowerCase().includes(needle)
}

/**
 * The directory's two filters: a text query and a language.
 *
 * It used to filter on `category` — ai-creator, company, adjacent — which is the cut that decides
 * who counts as a peer, and that question belongs to the leaderboard, where it still lives. The
 * question this page is actually asked is which half of the roster a row is from: the board tracks
 * an English and a Chinese scene and they are read separately.
 */
export function filterDirectory(channels: SlimChannel[], q: string, lang: string): SlimChannel[] {
  return channels.filter((c) => {
    if (lang !== "all" && (c.lang ?? NO_LANG) !== lang) return false
    return matchesQuery(c, q)
  })
}

export type LangTab = { key: string; label: string; count: number }

/**
 * The language tabs, derived from the roster rather than hardcoded, so a language the sweep
 * starts returning gets a tab without an edit here and no tab can name a language the roster
 * does not hold.
 *
 * The counts run over the query-filtered roster, not the whole one, so a tab's number is always
 * what clicking it produces. With `pat` typed, `english 63` is a lie — clicking it yields one row.
 */
export function langTabs(channels: SlimChannel[], q: string): LangTab[] {
  const matched = channels.filter((c) => matchesQuery(c, q))
  const counts = new Map<string, number>()
  for (const c of matched) {
    const k = c.lang ?? NO_LANG
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
  return [{ key: "all", label: "all", count: matched.length }, ...langs]
}
