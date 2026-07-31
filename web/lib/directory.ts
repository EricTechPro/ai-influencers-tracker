import { langTabsFor, NO_LANG, type LangTab } from "./language"
import type { SlimChannel } from "./growth"

// The vocabulary and the tab ordering moved to ./language, which the recent feed reads too. They
// are re-exported here because this module's components and tests already import them from this
// path, and the two names mean exactly the same thing in both places.
export { NO_LANG }
export type { LangTab }

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

/**
 * The language tabs, derived from the roster rather than hardcoded, so a language the sweep
 * starts returning gets a tab without an edit here and no tab can name a language the roster
 * does not hold.
 *
 * The counts run over the query-filtered roster, not the whole one, so a tab's number is always
 * what clicking it produces. With `pat` typed, `english 63` is a lie — clicking it yields one row.
 * Applying the query here rather than inside langTabsFor is what keeps that true while the
 * ordering and the naming stay shared with the feed, which has no query of its own.
 */
export function langTabs(channels: SlimChannel[], q: string): LangTab[] {
  return langTabsFor(channels.filter((c) => matchesQuery(c, q)))
}
