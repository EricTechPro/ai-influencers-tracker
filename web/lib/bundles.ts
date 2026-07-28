// The only file in web/ that reads the JSON bundles. Reads _db/ and nothing
// else: never _raw/, _synthesize/, config/, .env, or pipeline/. videos.json
// (16.7 MB) is parsed once per process and served as id slices so it is never
// shipped wholesale; the 59 MB comments monolith no longer exists, comments
// are read as per-channel and per-topic slices under _db/comments/.
// (app/assets/channels/[id]/route.ts also touches the filesystem, but only to
// stream a single avatar image straight through; it never reads a bundle.)
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import type {
  ChannelCommentsFile,
  ChannelsBundle,
  Meta,
  OpportunitiesBundle,
  SnapshotsBundle,
  TopicCommentsFile,
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

// channel_id is always UC[A-Za-z0-9_-]+, topic_id is kebab-case; both fit this
// shape. Rejecting anything else before it ever reaches path.join is what
// keeps a URL-derived id (tasks 4-6 pass these straight from route params)
// from walking out of _db/comments/.
const COMMENT_ID_SHAPE = /^[A-Za-z0-9_-]+$/

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

/** True when the downloaded avatar exists on disk; the page then renders the
 *  image route, otherwise initials. Decided server-side so no broken img flashes. */
export function hasChannelAvatar(channelId: string): boolean {
  return existsSync(path.join(DB_DIR, "assets", "channels", `${channelId}.jpg`))
}

let videosByChannel: Map<string, VideoRow[]> | null = null

/** Server-side slice: all registered videos for one channel, newest last. */
export function channelVideos(channelId: string): VideoRow[] {
  if (!videosByChannel) {
    const bundle = load<VideosBundle>("videos.json")
    videosByChannel = new Map()
    for (const v of bundle.videos) {
      const list = videosByChannel.get(v.channel_id) ?? []
      list.push(v)
      videosByChannel.set(v.channel_id, list)
    }
    for (const list of videosByChannel.values()) {
      list.sort((a, b) => a.published_at.localeCompare(b.published_at))
    }
  }
  return videosByChannel.get(channelId) ?? []
}

/** Per-channel comment slice (T13). null is a state: the comment ledger has
 *  not reached this channel yet. Never invent an empty bundle for it. */
export function loadChannelComments(channelId: string): ChannelCommentsFile | null {
  if (!COMMENT_ID_SHAPE.test(channelId)) return null
  const rel = path.join("comments", "channel", `${channelId}.json`)
  if (!existsSync(path.join(DB_DIR, rel))) return null
  return load<ChannelCommentsFile>(rel)
}

/** Per-topic comment slice (T13). null is a state: the comment ledger has
 *  not reached this topic yet. Never invent an empty bundle for it. */
export function loadTopicComments(topicId: string): TopicCommentsFile | null {
  if (!COMMENT_ID_SHAPE.test(topicId)) return null
  const rel = path.join("comments", "topic", `${topicId}.json`)
  if (!existsSync(path.join(DB_DIR, rel))) return null
  return load<TopicCommentsFile>(rel)
}
