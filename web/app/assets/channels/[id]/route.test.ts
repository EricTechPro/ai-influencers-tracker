// This is the only test file under app/**: it exists solely to cover route.ts's
// path-traversal guard, which vitest's original lib/**+components/** globs never collected.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const dbDir = mkdtempSync(path.join(os.tmpdir(), "ait-db-"))
const assetsDir = path.join(dbDir, "assets", "channels")
mkdirSync(assetsDir, { recursive: true })
writeFileSync(path.join(assetsDir, "UCcole.jpg"), Buffer.from("FAKEJPEGBYTES"))

// The route reads AIT_DB_DIR into a module-level constant at import time, so the env
// var must be set before the dynamic import below ever evaluates the module.
process.env.AIT_DB_DIR = dbDir

let GET: typeof import("./route").GET

beforeAll(async () => {
  ;({ GET } = await import("./route"))
})

afterAll(() => {
  rmSync(dbDir, { recursive: true, force: true })
  delete process.env.AIT_DB_DIR
})

function call(id: string) {
  return GET({} as Request, { params: Promise.resolve({ id }) })
}

describe("GET /assets/channels/[id]", () => {
  it("returns the file as image/jpeg for a channel that was downloaded", async () => {
    const res = await call("UCcole.jpg")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/jpeg")
    const body = Buffer.from(await res.arrayBuffer())
    expect(body.toString()).toBe("FAKEJPEGBYTES")
  })

  it("404s for a channel with no downloaded file", async () => {
    const res = await call("UCmissing.jpg")
    expect(res.status).toBe(404)
  })

  it("404s for a directory traversal attempt", async () => {
    const res = await call("../../../etc/passwd.jpg")
    expect(res.status).toBe(404)
  })

  it("404s for an encoded traversal segment smuggled into the id", async () => {
    const res = await call("x/..%2f..jpg")
    expect(res.status).toBe(404)
  })
})
