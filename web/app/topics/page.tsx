import {
  channelAvatarUrl, channelVideos, loadChannels, loadMeta, loadRecent, loadTopicPages, videosById,
} from "@/lib/bundles"
import { RecentFeed } from "@/components/recent-feed"

/**
 * What went up, and whether it is still going up.
 *
 * This page used to carry a second section underneath: every taxonomy leaf opened as a shelf of
 * its best videos. That is the corpus, and the corpus is not the question — "what is the niche
 * making" takes 25 shelves nobody scrolls, while "what broke out, and is it still climbing" is
 * one screen. Nothing was lost with it: the same counts feed the opportunity blocks on the home
 * page.
 *
 * This is the only one of the five routes that never reads `searchParams`, so without this it is
 * the only one Next prerenders statically. Two things break under that: NavLinks reads
 * useSearchParams, which without a page-level dynamic API needs its Suspense fallback for the
 * static HTML, so the nav ships empty and only appears after client hydration — the four sibling
 * routes render it inline because reading their own searchParams already makes them dynamic. And
 * the feed and the snapshot date get baked in at build time instead of read per request, which is
 * the wrong tradeoff for the one page whose entire job is "what broke out recently." Forcing
 * dynamic rendering costs static prerendering for this route, matching the other four, and fixes
 * both.
 */
export const dynamic = "force-dynamic"

export default function TopicsIndexPage() {
  const recent = loadRecent()
  const meta = loadMeta()
  const channels = loadChannels().channels

  // Only the channels the feed shows. RecentFeed is a client component, so this map crosses the
  // RSC boundary on every render; all 72 channels meant shipping entries nothing reads.
  const feedChannels = new Set(recent.videos.map((v) => v.channel_id))
  const avatars = Object.fromEntries(
    channels
      .filter((c) => feedChannels.has(c.channel_id))
      .map((c) => [c.channel_id, channelAvatarUrl(c.channel_id)])
  )

  // Topic assignments for the feed's own videos, and the self channel's coverage of those same
  // topics — both narrowed to only what /topics can show, for the same reason the avatars map
  // above is narrowed to the feed's channels: this crosses the RSC boundary on every render, and
  // shipping all 11,820 videos' assignments would be a waste.
  const feedIds = new Set(recent.videos.map((v) => v.video_id))
  const feedVideos = videosById([...feedIds])
  const topicsByVideo = Object.fromEntries(
    feedVideos.map((v) => [
      v.video_id,
      (v.topic_assignments as { topic_id: string }[]).map((a) => a.topic_id),
    ])
  )
  const feedTopics = new Set(Object.values(topicsByVideo).flat())

  // The uploader's own keywords, lowercased and de-duplicated per video so "Claude Code" and
  // "claude code" are one facet. A video snapshotted before the ingest kept tags has none, which
  // is why this is a sparse map rather than an entry per feed video: a missing key is "we never
  // captured this video's tags", and the rail says how many that is rather than implying the
  // uploader left them blank.
  const tagsByVideo = Object.fromEntries(
    feedVideos
      .filter((v) => v.tags && v.tags.length > 0)
      .map((v) => [v.video_id, [...new Set(v.tags!.map((t) => t.toLowerCase().trim()))]])
  )

  // Human labels for the feed's own topic ids ("claude-code-mcp-setup" ->
  // "Setting up MCP with Claude Code"), narrowed to the ids this feed
  // actually shows for the same reason the avatars map above is narrowed:
  // this crosses the RSC boundary on every render.
  const allLabels = loadTopicPages().labels
  const topicLabels = Object.fromEntries(
    Object.entries(allLabels).filter(([id]) => feedTopics.has(id))
  )

  return (
    <section className="breakout">
      <RecentFeed
        bundle={recent}
        avatars={avatars}
        selfChannelId={meta.self_channel_id}
        topicsByVideo={topicsByVideo}
        tagsByVideo={tagsByVideo}
        topicLabels={topicLabels}
        generatedAt={meta.generated_at}
      />
    </section>
  )
}
