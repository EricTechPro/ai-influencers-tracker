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
