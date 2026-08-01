import { describe, expect, it } from "vitest"
import { EMPTY_MUTED, entriesOf, parseMuted, toggleMuted, type MutedFile } from "./muted"

const ENTRY = {
  video_id: "abc123",
  title: "I Made Claude Opus 5 and Fable 5 Build the Same App",
  channel_name: "Dubibubi",
}

function fileWith(...ids: string[]): MutedFile {
  const videos: MutedFile["videos"] = {}
  ids.forEach((id, i) => {
    videos[id] = { ...ENTRY, video_id: id, muted_at: `2026-08-0${i + 1}T00:00:00.000Z` }
  })
  return { version: 1, videos }
}

describe("parseMuted", () => {
  it("reads a written file back", () => {
    const file = fileWith("aaa", "bbb")
    expect(parseMuted(JSON.parse(JSON.stringify(file)))).toEqual(file)
  })

  // A missing file means "nothing is muted", not a broken board. Same contract as
  // pipeline/exclusions.py: absent config excludes nothing.
  it.each([undefined, null, {}, [], "nope", { version: 1 }, { version: 1, videos: null }])(
    "treats %o as nothing muted",
    (raw) => {
      expect(parseMuted(raw)).toEqual(EMPTY_MUTED)
    }
  )

  // A hand-edit that drops a title must not put `undefined` on a key in the strip. The id is the
  // only field that cannot be recovered, so an entry missing it is dropped; the rest fall back.
  it("fills what a hand-edit left out and drops what it cannot recover", () => {
    const parsed = parseMuted({
      version: 1,
      videos: {
        aaa: { muted_at: "2026-08-01T00:00:00.000Z" },
        bbb: 7,
      },
    })
    expect(parsed.videos.aaa).toEqual({
      video_id: "aaa",
      title: "aaa",
      channel_name: "",
      muted_at: "2026-08-01T00:00:00.000Z",
    })
    expect(parsed.videos.bbb).toBeUndefined()
  })

  // The key is what the feed filters on. An entry filed under one id carrying another in its body
  // would mute one video and name a different one in the strip.
  it("trusts the key over a mismatched video_id in the body", () => {
    const parsed = parseMuted({
      version: 1,
      videos: { aaa: { video_id: "zzz", title: "T", channel_name: "C", muted_at: "x" } },
    })
    expect(parsed.videos.aaa.video_id).toBe("aaa")
  })
})

describe("toggleMuted", () => {
  it("mutes a video that was not muted, stamping when", () => {
    const next = toggleMuted(EMPTY_MUTED, ENTRY, "2026-08-01T13:20:00.000Z")
    expect(next.videos.abc123).toEqual({ ...ENTRY, muted_at: "2026-08-01T13:20:00.000Z" })
  })

  it("unmutes a video that was muted", () => {
    const next = toggleMuted(fileWith("abc123"), ENTRY, "2026-08-02T00:00:00.000Z")
    expect(next.videos).toEqual({})
  })

  it("never mutates the file it was given", () => {
    const before = fileWith("aaa")
    const snapshot = JSON.parse(JSON.stringify(before))
    toggleMuted(before, ENTRY, "2026-08-01T00:00:00.000Z")
    expect(before).toEqual(snapshot)
  })
})

describe("entriesOf", () => {
  // Most recently muted first: the strip's job is "what did I just take off the board", and the
  // one you want to undo is the one you just clicked.
  it("orders newest mute first", () => {
    expect(entriesOf(fileWith("aaa", "bbb", "ccc")).map((e) => e.video_id)).toEqual([
      "ccc",
      "bbb",
      "aaa",
    ])
  })

  it("is empty for an empty file", () => {
    expect(entriesOf(EMPTY_MUTED)).toEqual([])
  })
})
