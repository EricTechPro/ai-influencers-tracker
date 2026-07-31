import { slimChannel, type SlimChannel } from "./growth"
// The only file in web/ that reads the JSON bundles. Reads _db/ and nothing
// else: never _raw/, _synthesize/, config/, .env, or pipeline/. videos.json
// (16.7 MB) is parsed once per process and served as id slices so it is never
// shipped wholesale; the 59 MB comments monolith no longer exists, comments
// are read as per-channel and per-topic slices under _db/comments/.
// (app/assets/channels/[id]/route.ts also touches the filesystem, but only to
// stream a single avatar image straight through; it never reads a bundle.)
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import type {
  ChannelCommentsFile,
  ChannelsBundle,
  Meta,
  OpportunitiesBundle,
  RecentBundle,
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

export function loadRecent(): RecentBundle {
  return load("recent.json")
}

export function loadSnapshots(): SnapshotsBundle {
  return load("snapshots.json")
}

/**
 * The first date any point in the series came from our own sweep rather than from vidIQ.
 *
 * `vendor` is an explicit trust tier here (decision 0012) and the schema keeps `source` precisely
 * so a bought point stays distinguishable from one we recorded. The series is 24,922 backfill
 * points against a few hundred of ours, cleanly split at one date, so a window whose baseline
 * predates this is anchored on a vendor reconstruction — and every window of 7d or longer
 * currently is. Nothing on the board said so; a Derived formula that names the field but not the
 * tier reads as our own measurement.
 *
 * `null` means no own sweep has landed yet, which is a state and not a date.
 */
export function ownSweepFrom(): string | null {
  const snaps = loadSnapshots()
  let first: string | null = null
  for (const ch of Object.values(snaps.channels)) {
    for (const day of ch.series) {
      if (day.source === "vidiq_backfill") continue
      if (first === null || day.date < first) first = day.date
    }
  }
  return first
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
  return avatarIds().has(channelId)
}

/**
 * The avatar route for a channel, or null when no file was ever downloaded.
 *
 * channels.json carries an `avatar` path for every row, but that is the path
 * the pipeline intends, not proof of a file: a channel whose thumbnail fetch
 * failed still gets one (see pipeline/avatars.py, where a failure is a state).
 * Resolving against the directory keeps a missing face a missing face, the
 * monogram fallback, instead of a broken image.
 */
export function channelAvatarUrl(channelId: string): string | null {
  return avatarIds().has(channelId) ? `/assets/channels/${channelId}.jpg` : null
}

let avatarIdCache: Set<string> | null = null

/** One readdir per process instead of an existsSync per rendered face; a
 *  72-row table asks this 72 times. Cleared with the bundle cache in tests. */
function avatarIds(): Set<string> {
  if (avatarIdCache) return avatarIdCache
  const dir = path.join(DB_DIR, "assets", "channels")
  if (!existsSync(dir)) return (avatarIdCache = new Set())
  const ids = readdirSync(dir)
    .filter((f) => f.endsWith(".jpg"))
    .map((f) => f.slice(0, -4))
  return (avatarIdCache = new Set(ids))
}

/** How much of a channel we have actually pulled, as opposed to what YouTube
 *  says exists. The gap between `videos` here and the channel's own
 *  `video_count` is our ingest coverage, which is the thing worth surfacing:
 *  every other number on the row is only as good as this. */
export interface ChannelCoverage {
  /** videos of this channel present in videos.json */
  videos: number
  /** comment rows ingested for this channel; null means the ledger has not
   *  reached it yet, which is a state, not a zero. */
  comments: number | null
  /** newest published_at we hold for this channel, or null if we hold none */
  newestVideoAt: string | null
}

export function channelCoverage(channelId: string): ChannelCoverage {
  const videos = channelVideos(channelId)
  const comments = loadChannelComments(channelId)
  return {
    videos: videos.length,
    comments: comments ? comments.channel.totals.ingested : null,
    newestVideoAt: videos.length ? videos[videos.length - 1].published_at : null,
  }
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

/** The roster as the client tables want it: slimmed, each row already carrying its avatar URL.
 *  Two routes built this identically, which made "a slim channel carries its avatar" a rule each
 *  of them had to remember rather than a fact the loader guarantees. */
export function loadSlimChannels(): SlimChannel[] {
  return loadChannels().channels.map((c) => slimChannel(c, channelAvatarUrl(c.channel_id)))
}
