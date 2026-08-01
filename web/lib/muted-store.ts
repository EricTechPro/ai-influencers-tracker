/**
 * The one place in `web/` that writes to disk, and the one that reads `config/`.
 *
 * `lib/bundles.ts` reads `_db/` and nothing else, on purpose: `_db/` is regenerable and the web
 * is downstream of the pipeline. A mute is the opposite direction — it is a decision Eric makes
 * at the board and it has to survive `build_data`, so it lands in `config/` beside
 * `exclusions.json` rather than in the layer a rebuild deletes.
 *
 * That makes `config/muted.json` the one config file this repo does not hand-author. The rule it
 * does not break is the load-bearing one: **the pipeline still never writes here**. Python reads
 * this file at most; the UI is the only writer, and the file stays a plain readable JSON object
 * so a hand-edit is still the fallback.
 *
 * The write is atomic — temp file, then rename — because the alternative is a truncated
 * `muted.json` on a crashed write, which reads as "nothing is muted" and silently puts every
 * decision back on the board.
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import { EMPTY_MUTED, parseMuted, type MutedFile } from "./muted"

const CONFIG_DIR = process.env.AIT_CONFIG_DIR ?? path.resolve(process.cwd(), "..", "config")
const MUTED_PATH = path.join(CONFIG_DIR, "muted.json")

/** Not cached, unlike the `_db/` bundles. Those are rebuilt by a pipeline run and stable for the
 *  life of the process; this one changes from inside the running server, and a cached copy would
 *  mean a mute that survives a reload only until the next render reads a stale map. */
export function loadMuted(): MutedFile {
  try {
    return parseMuted(JSON.parse(readFileSync(MUTED_PATH, "utf8")))
  } catch {
    // Missing is the normal first-run state and parses to "nothing muted". Unreadable or
    // malformed lands here too, and takes the same answer deliberately: the board renders every
    // video rather than 500ing, and the next successful write rewrites the file clean.
    return EMPTY_MUTED
  }
}

export function saveMuted(file: MutedFile): void {
  const tmp = `${MUTED_PATH}.tmp`
  writeFileSync(tmp, `${JSON.stringify(file, null, 2)}\n`, "utf8")
  renameSync(tmp, MUTED_PATH)
}
