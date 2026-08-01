/**
 * Toggling a mute, which is the only write the dashboard makes.
 *
 * `POST` takes one video and flips it, rather than taking the whole list and replacing it. Two
 * tabs open on `/topics` is the normal case here, and a last-write-wins PUT of the full map would
 * mean the second tab's save silently unmutes everything the first one muted while it was open.
 * A per-video toggle re-reads the file, applies one change, and writes it back, so concurrent
 * tabs converge instead of clobbering.
 *
 * The response is the whole list either way, so the client re-syncs to disk on every click and a
 * tab that has drifted corrects itself the moment it is used.
 */
import { entriesOf, toggleMuted } from "@/lib/muted"
import { loadMuted, saveMuted } from "@/lib/muted-store"

/** A YouTube video id. Checked before the id is ever used as an object key or written to disk —
 *  this is the one route in the app that takes a body and persists it. */
const VIDEO_ID = /^[A-Za-z0-9_-]{6,24}$/

/** Long enough for any real title, short enough that the file cannot be used as storage. Titles
 *  are only ever rendered as text, never as markup. */
const MAX_TEXT = 300

export async function GET() {
  return Response.json({ muted: entriesOf(loadMuted()) })
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "body must be JSON" }, { status: 400 })
  }

  const { video_id, title, channel_name } = (body ?? {}) as Record<string, unknown>
  if (typeof video_id !== "string" || !VIDEO_ID.test(video_id)) {
    return Response.json({ error: "video_id must be a YouTube video id" }, { status: 400 })
  }

  const entry = {
    video_id,
    // Falls back to the id rather than rejecting: the mute is the point, and a card whose title
    // failed to reach the route is still a card the reader means to take off the board.
    title: text(title) || video_id,
    channel_name: text(channel_name),
  }

  try {
    const next = toggleMuted(loadMuted(), entry, new Date().toISOString())
    saveMuted(next)
    return Response.json({ muted: entriesOf(next) })
  } catch {
    // A failed write must not read as a successful mute. The client reverts its optimistic state
    // on a non-ok response, so the card comes back rather than looking hidden until a reload.
    return Response.json({ error: "could not write config/muted.json" }, { status: 500 })
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_TEXT) : ""
}
