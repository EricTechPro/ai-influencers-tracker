"use client"

/**
 * The mute list as a hook, shared by /topics and by a channel page.
 *
 * It lived inside recent-feed.tsx until channel pages needed the same control. Two copies would
 * have been two ideas of what a mute is, and the half that drifts is always the revert: a write
 * that fails must put the card back, or the surface sits there looking filtered by a decision
 * that never reached `config/muted.json`.
 *
 * Optimistic, because the alternative is a card that lingers for a round trip after you have
 * decided it is not a video you are going to make. On success the server's own list replaces the
 * optimistic one, so a second tab's mutes land here too.
 */
import { useCallback, useMemo, useState } from "react"
import { entriesOf, toggleMuted, type MutedEntry, type MutedFile } from "./muted"

export function useMuteList(initialMuted: MutedEntry[]) {
  // Held as the file shape the API speaks, so a response can replace it whole. It starts as what
  // the server read off disk, which is why a mute survives a reload with no flash of the card it
  // hid: the very first HTML is already filtered.
  const [muted, setMuted] = useState<MutedFile>(() => ({
    version: 1,
    videos: Object.fromEntries(initialMuted.map((e) => [e.video_id, e])),
  }))
  const mutedList = useMemo(() => entriesOf(muted), [muted])
  const mutedIds = useMemo(() => new Set(mutedList.map((e) => e.video_id)), [mutedList])

  const onToggleMute = useCallback((entry: Omit<MutedEntry, "muted_at">) => {
    let reverted: MutedFile | null = null
    setMuted((prev) => {
      reverted = prev
      return toggleMuted(prev, entry, new Date().toISOString())
    })
    fetch("/api/mute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        const body = (await res.json()) as { muted: MutedEntry[] }
        setMuted({
          version: 1,
          videos: Object.fromEntries(body.muted.map((e) => [e.video_id, e])),
        })
      })
      .catch(() => {
        if (reverted) setMuted(reverted)
      })
  }, [])

  return { muted, setMuted, mutedList, mutedIds, onToggleMute }
}
