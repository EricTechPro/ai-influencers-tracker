/**
 * What Eric has taken off the feed one video at a time, read from `config/muted.json`.
 *
 * `config/exclusions.json` already answers "I have stopped making this kind of video" — whole
 * topics, whole channels, title terms — by hand, at build time. This answers the finer question
 * the board kept raising and could not act on: *I have already made this one*. A competitor's
 * Opus-5-vs-Fable-5 review is a real breakout and belongs in the corpus; it is just not a thing
 * to go film, so it should stop occupying a card on the page whose only job is to say what to
 * film next.
 *
 * Same contract as exclusions: nothing is deleted. Every muted video stays in `_raw/`, in
 * `_db/videos.json`, and in `recent.json`'s own `scanned` count. A mute decides one thing —
 * whether the video draws a card — and it is reversible from the strip that lists it.
 *
 * The entry carries the title and channel it was muted from, which is redundant with the corpus
 * and deliberately so: the strip has to be able to name what you muted three weeks after the
 * video fell out of every window the feed still offers. Reading it back out of the bundle would
 * make the list silently shorter than the file.
 *
 * This module is pure. The filesystem lives in `lib/muted-store.ts` (server) and the toggle
 * crosses `app/api/mute/route.ts`.
 */
import type { FormatKey } from "./recent"

export interface MutedEntry {
  video_id: string
  /** the title as it read when it was muted, so the strip can name it without the corpus */
  title: string
  channel_name: string
  /** ISO 8601. Orders the strip, and is the only record of when a decision was made. */
  muted_at: string
}

export interface MutedFile {
  version: 1
  videos: Record<string, MutedEntry>
}

/** A repo with no `config/muted.json` mutes nothing, which is a valid state and not an error. */
export const EMPTY_MUTED: MutedFile = { version: 1, videos: {} }

/**
 * What the feed's format row selects.
 *
 * `muted` is a fourth key in a row of three formats, which reads as a mixed dimension and is one:
 * it was the alternative to an `unmuted` key beside `long` and `shorts`, where either `long`
 * shows muted videos — making `unmuted` a lie for two of the four keys — or it does not, making
 * `unmuted` a key that changes nothing. The three format keys always hide muted videos, which is
 * the whole point of muting one; `muted` is the review view that shows only them, and it is the
 * only place they are reachable.
 */
export type FeedView = FormatKey | "muted"

export function isMutedView(view: FeedView): view is "muted" {
  return view === "muted"
}

/** The format the bundle selection runs at. The muted view spans every format on purpose: it is a
 *  list of decisions, not a slice of the feed, and splitting it by duration would hide half of
 *  what you came to that key to undo. */
export function formatOf(view: FeedView): FormatKey {
  return isMutedView(view) ? "all" : view
}

/**
 * Whatever was on disk, as a file this app can render.
 *
 * Tolerant by design: this is hand-editable config, and a typo in it must cost the entry rather
 * than the page. An entry with no recoverable id is dropped; one missing a title falls back to
 * its id, because a key reading `undefined` in the strip is worse than a key reading `dQw4w9WgXcQ`.
 */
export function parseMuted(raw: unknown): MutedFile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_MUTED
  const videos = (raw as { videos?: unknown }).videos
  if (!videos || typeof videos !== "object" || Array.isArray(videos)) return EMPTY_MUTED

  const out: Record<string, MutedEntry> = {}
  for (const [id, value] of Object.entries(videos as Record<string, unknown>)) {
    if (!id || !value || typeof value !== "object" || Array.isArray(value)) continue
    const entry = value as Partial<MutedEntry>
    out[id] = {
      // The key, never the body's own `video_id`. The key is what the feed filters on, so an
      // entry filed under one id carrying another would mute one video and name a different one.
      video_id: id,
      title: typeof entry.title === "string" && entry.title ? entry.title : id,
      channel_name: typeof entry.channel_name === "string" ? entry.channel_name : "",
      muted_at: typeof entry.muted_at === "string" ? entry.muted_at : "",
    }
  }
  return { version: 1, videos: out }
}

/** Mute if it is not muted, unmute if it is. One entry point, so the button and the strip key
 *  cannot drift into two different ideas of what a second click does. Returns a new file; the
 *  caller's copy is never touched, because the client holds it as React state. */
export function toggleMuted(
  file: MutedFile,
  entry: Omit<MutedEntry, "muted_at">,
  now: string
): MutedFile {
  const videos = { ...file.videos }
  if (videos[entry.video_id]) delete videos[entry.video_id]
  else videos[entry.video_id] = { ...entry, video_id: entry.video_id, muted_at: now }
  return { version: 1, videos }
}

/** The strip's rows: most recently muted first, so the one you want to undo is the one you just
 *  clicked. An entry with no stamp sorts last rather than as the oldest — an unstamped hand-edit
 *  is a mute of unknown date, and putting it at the top of a list ordered by date would be a
 *  claim nobody made. */
export function entriesOf(file: MutedFile): MutedEntry[] {
  return Object.values(file.videos).sort((a, b) => {
    if (a.muted_at === b.muted_at) return a.video_id.localeCompare(b.video_id)
    if (!a.muted_at) return 1
    if (!b.muted_at) return -1
    return b.muted_at.localeCompare(a.muted_at)
  })
}
