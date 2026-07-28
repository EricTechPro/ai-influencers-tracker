// The ONLY file in web/ that touches the filesystem. Reads _db/ and nothing
// else: never _raw/, _synthesize/, config/, .env, or pipeline/. videos.json
// (16.7 MB) is parsed once per process and served as id slices so it is never
// shipped wholesale; the 59 MB comments bundle is not read at all in this build.
import { readFileSync } from "node:fs"
import path from "node:path"
import type {
  ChannelsBundle,
  Meta,
  OpportunitiesBundle,
  SnapshotsBundle,
  TopicPagesBundle,
  VideoRow,
  VideosBundle,
} from "./types"

const DB_DIR = process.env.AIT_DB_DIR ?? path.resolve(process.cwd(), "..", "_db")

const cache = new Map<string, unknown>()

function load<T>(name: string): T {
  let hit = cache.get(name)
  if (hit === undefined) {
    hit = JSON.parse(readFileSync(path.join(DB_DIR, name), "utf8"))
    cache.set(name, hit)
  }
  return hit as T
}

export function loadMeta(): Meta {
  return load("meta.json")
}

export function loadChannels(): ChannelsBundle {
  return load("channels.json")
}

export function loadOpportunities(): OpportunitiesBundle {
  return load("opportunities.json")
}

export function loadTopicPages(): TopicPagesBundle {
  return load("topic_pages.json")
}

export function loadSnapshots(): SnapshotsBundle {
  return load("snapshots.json")
}

let videoIndex: Map<string, VideoRow> | null = null

/** Server-side slice of videos.json. Unknown ids are dropped, never invented. */
export function videosById(ids: string[]): VideoRow[] {
  if (!videoIndex) {
    const bundle = load<VideosBundle>("videos.json")
    videoIndex = new Map(bundle.videos.map((v) => [v.video_id, v]))
  }
  const out: VideoRow[] = []
  for (const id of ids) {
    const v = videoIndex.get(id)
    if (v) out.push(v)
  }
  return out
}
