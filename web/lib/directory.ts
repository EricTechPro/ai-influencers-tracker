import type { SlimChannel } from "./growth"

/** The directory's two filters. `you` is the self flag rather than a category
 *  value, because a channel's category says what kind of channel it is and
 *  "mine" is not that. */
export function filterDirectory(channels: SlimChannel[], q: string, cat: string): SlimChannel[] {
  const needle = q.trim().replace(/^@/, "").toLowerCase()
  return channels.filter((c) => {
    if (cat === "you" && !c.is_self) return false
    if (cat !== "all" && cat !== "you" && c.category !== cat) return false
    if (!needle) return true
    return c.name.toLowerCase().includes(needle) || c.handle.toLowerCase().includes(needle)
  })
}
