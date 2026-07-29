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
  topics: TopicPage[]
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
  channels: { total: number; ok: number; absent: number }
  snapshot_health: {
    /** days our own daily sweep recorded: "is the sweep running" */
    days_present: number
    days_missing: number
    /** distinct days the board can measure over, swept or bought: "how much history" */
    history_days: number
    first_date: string | null
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
  /** vidIQ's own breakout score. A vendor number: we never recompute or round it,
   *  and null means vidIQ did not return one, not that the video underperformed. */
  breakout_score: number | null
  /** vidIQ's views-per-hour right now. A vendor number. */
  vph: number | null
  /** whether the video is still accelerating against its own lifetime average */
  momentum: {
    state: "climbing" | "steady" | "spent" | "unmeasured"
    ratio: number | null
    lifetime_vph: number | null
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
  batches_ok: number
  batches_failed: number
  missing_channel_ids: string[]
}

export interface RecentBundle {
  version: number
  generated_at: string
  source: "vidiq"
  fetched_at: string | null
  window: string | null
  coverage: RecentCoverage
  /** breakout score under which a row goes to the tail; config/thresholds.json outliers.display_floor */
  display_floor: number
  /** how many of one channel's rows reach the grid; config/thresholds.json outliers.per_channel_cap */
  per_channel_cap: number
  videos: RecentRow[]
  patterns: PatternRow[]
  trust: Record<string, string>
}
