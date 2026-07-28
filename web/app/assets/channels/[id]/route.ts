// Serves _db/assets/channels/<id>.jpg straight off disk, without copying files into
// public/. _db/ is regenerable (see pipeline/avatars.py), so this route just reflects
// whatever the last avatar sync wrote. A channel with no downloaded file 404s and the
// UI's initials fallback (components/avatar-cluster.tsx) covers the gap.
import { readFile } from "node:fs/promises"
import path from "node:path"

const DB_DIR = process.env.AIT_DB_DIR ?? path.resolve(process.cwd(), "..", "_db")
const ASSETS_DIR = path.resolve(DB_DIR, "assets", "channels")

// The dynamic segment carries the whole "<channel_id>.jpg" filename (a YouTube channel_id
// is always this id shape, and the bundle only ever links this route with a .jpg suffix).
// Rejecting anything else before it ever touches path.join is what keeps a crafted id
// from walking out of ASSETS_DIR.
const FILENAME_SHAPE = /^[A-Za-z0-9_-]+\.jpg$/

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!FILENAME_SHAPE.test(id)) {
    return new Response(null, { status: 404 })
  }

  const filePath = path.resolve(ASSETS_DIR, id)
  if (path.dirname(filePath) !== ASSETS_DIR) {
    return new Response(null, { status: 404 })
  }

  try {
    const data = await readFile(filePath)
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    })
  } catch {
    return new Response(null, { status: 404 })
  }
}
