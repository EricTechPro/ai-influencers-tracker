// Shapes of the _db/ bundles the UI reads. bundles.test.ts checks every field
// listed here against the real files, so a pipeline schema change fails loudly
// here instead of rendering a wrong number.

export type WindowKey = "7d" | "14d" | "30d" | "90d" | "180d" | "365d"
export const WINDOWS: WindowKey[] = ["7d", "14d", "30d", "90d", "180d", "365d"]

export type CellState =
  | "ok"
  | "bounded"
  /** fewer dates exist than the window needs; the sweep fills this in */
  | "building"
  /** the dates exist but one or more cannot be used, so no amount of waiting
   *  completes this window. `unusable` counts the holes. */
  | "blocked"
  | "insufficient_data"
  | "no_baseline"
  | "unavailable"

export interface StateCell {
  state: CellState
  value: number | null
  /** The two dates the window actually resolved to. Present on the windowed
   *  subscriber cells; the sparkline slices on these so the line and the
   *  number beside it always describe the same span. */
  from?: string
  to?: string
  /** bounded only: the measurement floor the delta sits under */
  upper?: number
  /** subscriber cells: the channel's bucket width, always disclosed in the UI */
  bucket?: number
  /** building only */
  have?: number
  need?: number
  /** blocked only: how many of the window's days are unusable */
  unusable?: number
}

export type RankMode = "growth" | "general" | "subscribers" | "views"
export const RANK_MODES: RankMode[] = ["growth", "general", "subscribers", "views"]

export interface ChannelRow {
  channel_id: string
  name: string
  handle: string
  avatar: string
  blurb: string | null
  niche: string | null
  lang: string | null
  category: "ai-creator" | "company" | "adjacent" | "own" | "unknown"
  is_self: boolean
  /** "corrupt" means the freshest snapshot row failed the view_count monotonicity
   *  check. The channel is still present and still ranks; only its view-derived
   *  cells are affected, and each of those says so itself. */
  status: "ok" | "absent" | "corrupt"
  subscriber_count: number | null
  subscriber_bucket: number | null
  view_count: number | null
  video_count: number | null
  rank: Record<RankMode, Record<WindowKey, number | null>>
  subscriber_delta: Record<WindowKey, StateCell>
  subscriber_growth_rate: Record<WindowKey, StateCell>
  subs_per_1k_views: Record<WindowKey, StateCell>
  view_delta: Record<string, StateCell>
  videos_published: Record<string, number | null>
  median_views_per_video: Record<string, number | null>
  still_growing_video_ids: string[]
}

export interface ChannelsBundle {
  generated_at: string
  version: number
  self_channel_id: string
  channels: ChannelRow[]
}

export interface ScoreComponent {
  key: string
  raw: number | null
  raw_label: string | null
  norm: number | null
  weight: number
  points: number | null
  source: string
  state: "ok" | "no_data"
}

export interface ScoreBlock {
  components: ScoreComponent[]
  out_of: number | null
  value: number | null
}

export type Verdict =
  | "MAKE_THIS_NOW"
  | "ONLY_IF_UNSERVED"
  | "TOO_EARLY"
  | "SKIP"
  | "INSUFFICIENT_DATA"

export interface RepoEvidence {
  kind: string
  github_id: number
  full_name: string
  stars: number
  velocity: number
  age_days: number
  discovered_via: string
  indie: { score: number; owner_type: string; contributors: number; trust: string }
}

export interface OpportunityRow {
  topic_id: string
  label: string
  /** the videos the supply count counted, best first; the rail renders these */
  video_ids: string[]
  /** the phrase vidIQ was actually asked about, so a 0 is checkable */
  keyword: string | null
  verdict: Verdict
  shape: "tutorial" | "review" | null
  hunch: boolean
  score: ScoreBlock
  demand: {
    band: string
    fired: string[]
    repo_velocity: number | null
    keyword_volume: number | null
  }
  supply: {
    band: string
    fired: string[]
    videos: number
    creators: number
    window_days: number
  }
  evidence: RepoEvidence[]
  own_coverage: {
    covered: boolean
    suppressed: boolean
    video_id: string | null
    published_at: string | null
  }
  trust: Record<string, string>
}

export interface OpportunitiesBundle {
  generated_at: string
  version: number
  thresholds_version: number
  rows: OpportunityRow[]
}

export interface ChainCite {
  handle: string
  said_on: string
  evidence: string
  url?: string | null
}

export type Relation = "then" | "requires" | "alternative_to" | "contradicts"

export interface ChainEdge {
  from: string
  to: string
  relation: Relation
  voices: number
  cites: ChainCite[]
}

export interface LeafTopicPage {
  topic_id: string
  label: string
  is_leaf: true
  parent_id: string | null
  shape: string | null
  state: string
  video_count: number
  creator_count: number
  min_videos: number
  newest_video_at: string | null
  window_days: number
  video_ids: string[]
  /** the subset of video_ids published inside shelf_window_days; the shelf renders these */
  recent_video_ids: string[]
  shelf_window_days: number
  nodes: unknown[] | null
  edges: ChainEdge[] | null
}

export interface ParentTopicPage {
  topic_id: string
  label: string
  is_leaf: false
  parent_id: string | null
  children: string[]
  leaf_count: number
  video_count: number
  creator_count: number
  window_days: number
}

export type TopicPage = LeafTopicPage | ParentTopicPage

export interface TopicPagesBundle {
  generated_at: string
  version: number
  /** only the leaves that cleared min_videos/min_creators; a topic can exist and have no page */
  topics: TopicPage[]
  /** every topic id in the tree -> its human label, ungated. Naming a topic must not depend on
   *  whether it qualified for a page. */
  labels: Record<string, string>
}

export interface VideoRow {
  video_id: string
  channel_id: string
  title: string
  published_at: string
  type: "short" | "long"
  view_count: number | null
  duration_s: number | null
  topic_assignments: unknown[]
  /** the uploader's own YouTube keywords. null when the ingest never captured them for this
   *  video, which is not the same as an uploader who tagged nothing. */
  tags: string[] | null
  multiplier: {
    state: string
    value: number | null
    baseline: number | null
    baseline_n: number | null
    source: string
  }
  /** null for ~29% of videos (not yet ingested). Renders a missing state, never zero. */
  comment_stats: unknown | null
  traction: {
    still_growing: boolean | null
    share_recent_7d: number | null
    views_gained: Record<string, StateCell>
  }
}

export interface VideosBundle {
  generated_at: string
  version: number
  videos: VideoRow[]
}

export interface SnapshotDay {
  date: string
  status: string
  source: string
  subscriber_count: number | null
  subscriber_bucket: number | null
  view_count: number | null
  video_count: number | null
}

export interface SnapshotsBundle {
  generated_at: string
  version: number
  dates_present: string[]
  dates_missing: string[]
  channels: Record<string, { handle: string; series: SnapshotDay[] }>
}

export type CommentCategory =
  | "video_request"
  | "question"
  | "correction"
  | "suggestion"
  | "other"

export interface CategoryCounts {
  video_request: number
  question: number
  correction: number
  suggestion: number
  other: number
  /** rows the classification pass has not labeled; they render, just unlabeled */
  unsorted: number
}

export interface CommentRow {
  comment_id: string
  video_id: string
  video_title: string
  video_url: string
  video_published_at: string
  author: string
  author_channel_id: string | null
  text: string
  like_count: number
  reply_count: number
  published_at: string
  answered: boolean
  /** Derived: comment published_at minus video published_at, in whole days */
  lag_days: number
  topic_ids: string[]
  /** Inference when present; null until the classification pass (build step 12) runs */
  category: {
    key: CommentCategory
    trust: string
    model: string
    classified_at: string
  } | null
  channel_id: string
}

export interface VideoComments {
  totals: { comments: number }
  by_category: CategoryCounts
  top: CommentRow[]
}

export interface ChannelCommentsFile {
  version: number
  generated_at: string
  channel: {
    totals: { ingested: number; classified: number; window_days: number }
    top: CommentRow[]
    by_category: CategoryCounts
    most_discussed_video_ids: string[]
  }
  videos: Record<string, VideoComments>
}

export interface TopicCommentsFile {
  version: number
  generated_at: string
  topic: {
    totals: { comments: number; videos: number; creators: number }
    top: CommentRow[]
    by_category: CategoryCounts
    unserved: unknown[]
  }
}

export interface Meta {
  version: number
  generated_at: string
  build_step: number
  thresholds_version: number
  partial_run: boolean
  self_channel_id: string
  channels: { total: number; ok: number; corrupt: number; absent: number }
  snapshot_health: {
    /** days our own daily sweep recorded: "is the sweep running" */
    days_present: number
    days_missing: number
    /** distinct days the board can measure over, swept or bought: "how much history" */
    history_days: number
    first_date: string | null
    /** when the newest daily sweep landed, to the minute. Null for every snapshot written
     *  before pipeline/snapshot.py started stamping the clock. */
    fetched_at_utc: string | null
  }
  video_snapshot_health: { days_present: number; videos_tracked: number }
  comment_health: { ingested: number; classified: number; channels_with_comments: number }
  coverage_rate: number | null
  discovery: { trending_ok: boolean; reason: string | null }
  target: { mode: string; rank: number; window_days: number }
}

export interface RecentRow {
  video_id: string
  title: string
  published_at: string
  view_count: number | null
  duration_s: number | null
  type: "short" | "long"
  channel_id: string
  channel_name: string
  /** How far past this channel's own normal the video ran: its views over the median of the
   *  channel's last mature uploads of the same kind. Derived tier, computed from exact free
   *  view counts. Null is a channel with no baseline yet, never a video that underperformed. */
  multiplier: number | null
  /** The median the multiplier was divided by, and how many uploads it was taken from. A Derived
   *  number on this board ships its working; these two are it. Null with the multiplier. */
  baseline: number | null
  baseline_n: number
  /** Views added in the last 24 hours, from our own dated snapshots. Null when the video has
   *  been observed once, which is not the same as a video that stopped moving. */
  views_gained_24h: number | null
  /** whether the video is still pulling views, as a share of the ones it already has */
  momentum: {
    state: "climbing" | "steady" | "flat" | "unmeasured"
    /** views added per day as a share of the views it already has */
    daily_share: number | null
    per_day: number | null
    vph: number | null
  }
  pattern_id: string | null
}

export type PatternAction = "promote" | "add_to_leaf" | "below_floor"

export interface PatternRow {
  pattern_id: string
  label: string
  evidence: string[]
  creator_count: number
  existing_leaf: string | null
  action: PatternAction
}

export interface RecentCoverage {
  channels_requested: number
  channels_scored: number
  /** Channels with too few mature uploads to build a baseline from, so none of their videos can
   *  carry a multiplier. Named rather than left to look like a channel that had a quiet month. */
  unscored_channel_ids: string[]
}

export interface RecentBundle {
  version: number
  generated_at: string
  /** Our own video registry, filled free by the daily sweep. Was "vidiq" until the feed stopped
   *  reading the paid outlier sweep — see pipeline/bundles/recent.py for why. */
  source: "corpus"
  /** The day the counts these multipliers were computed from last landed. */
  fetched_at: string | null
  /** the same sweep, to the minute. Null before the first sweep has ever run, so the page falls
   *  back to the day alone. */
  fetched_at_utc: string | null
  coverage: RecentCoverage
  /** multiplier under which a row goes to the tail; config/thresholds.json outliers.display_floor */
  display_floor: number
  /** how many of one channel's rows reach the grid; config/thresholds.json outliers.per_channel_cap */
  per_channel_cap: number
  /** how much history the bundle carries; the ceiling on every window the feed can offer */
  feed_window_days: number
  videos: RecentRow[]
  patterns: PatternRow[]
  trust: Record<string, string>
}
