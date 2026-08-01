// The only route in this app that writes. What it persists is decided by a request body, so the
// validation is not defensive politeness — an unchecked `video_id` becomes an object key and then
// a line in config/, and a malformed write of muted.json reads back as "nothing is muted", which
// silently puts every decision Eric made back on the board.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

const configDir = mkdtempSync(path.join(os.tmpdir(), "ait-config-"))
const mutedPath = path.join(configDir, "muted.json")

// muted-store reads AIT_CONFIG_DIR into a module-level constant at import time, so it has to be
// set before the dynamic import below ever evaluates the module.
process.env.AIT_CONFIG_DIR = configDir

let GET: typeof import("./route").GET
let POST: typeof import("./route").POST

beforeAll(async () => {
  ;({ GET, POST } = await import("./route"))
})

afterEach(() => {
  rmSync(mutedPath, { force: true })
})

afterAll(() => {
  rmSync(configDir, { recursive: true, force: true })
  delete process.env.AIT_CONFIG_DIR
})

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/mute", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  )
}

const VIDEO = { video_id: "UBFHTHUs1wA", title: "Opus 5 review", channel_name: "Dubibubi" }

describe("GET", () => {
  // A fresh clone has no muted.json, and that is a valid state meaning "nothing is muted" —
  // the same contract pipeline/exclusions.py gives an absent exclusions.json.
  it("answers empty when no file exists", async () => {
    expect(await (await GET()).json()).toEqual({ muted: [] })
  })

  // A hand-edit that breaks the JSON must cost the mute list, not the board. Every card renders.
  it("answers empty rather than throwing on a malformed file", async () => {
    writeFileSync(mutedPath, "{ not json")
    expect(await (await GET()).json()).toEqual({ muted: [] })
  })
})

describe("POST", () => {
  it("mutes, writes readable JSON, and answers with the whole list", async () => {
    const res = await post(VIDEO)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      muted: [{ ...VIDEO, muted_at: expect.any(String) }],
    })

    const onDisk = JSON.parse(readFileSync(mutedPath, "utf8"))
    expect(onDisk.version).toBe(1)
    expect(onDisk.videos[VIDEO.video_id].title).toBe("Opus 5 review")
  })

  it("unmutes on a second call", async () => {
    await post(VIDEO)
    const res = await post(VIDEO)
    expect(await res.json()).toEqual({ muted: [] })
    expect(JSON.parse(readFileSync(mutedPath, "utf8")).videos).toEqual({})
  })

  // The reason this is a per-video toggle rather than a PUT of the whole map: two tabs open on
  // /topics is normal, and last-write-wins would let the second tab's save unmute everything the
  // first one muted while it was open.
  it("leaves other entries alone", async () => {
    await post(VIDEO)
    await post({ ...VIDEO, video_id: "dQw4w9WgXcQ", title: "Another" })
    const res = await post(VIDEO)
    const { muted } = (await res.json()) as { muted: { video_id: string }[] }
    expect(muted.map((e) => e.video_id)).toEqual(["dQw4w9WgXcQ"])
  })

  it.each([
    ["a path traversal", { video_id: "../../.env" }],
    ["a dotted name", { video_id: "a.b" }],
    ["an empty id", { video_id: "" }],
    ["a non-string id", { video_id: 7 }],
    ["no id at all", {}],
  ])("rejects %s without writing", async (_case, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    expect(() => readFileSync(mutedPath, "utf8")).toThrow()
  })

  it("rejects a body that is not JSON", async () => {
    expect((await post("not json at all")).status).toBe(400)
  })

  // The mute is the point. A card whose title failed to reach the route is still a card the
  // reader means to take off the board, so the id carries it rather than the request failing.
  it("falls back to the id when the title is missing", async () => {
    const res = await post({ video_id: VIDEO.video_id })
    const { muted } = (await res.json()) as { muted: { title: string; channel_name: string }[] }
    expect(muted[0].title).toBe(VIDEO.video_id)
    expect(muted[0].channel_name).toBe("")
  })

  it("caps how long a stored title can be", async () => {
    const res = await post({ ...VIDEO, title: "x".repeat(5000) })
    const { muted } = (await res.json()) as { muted: { title: string }[] }
    expect(muted[0].title.length).toBe(300)
  })
})
