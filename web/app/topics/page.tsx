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
  const topicsByVideo = Object.fromEntries(
    videosById([...feedIds]).map((v) => [
      v.video_id,
      (v.topic_assignments as { topic_id: string }[]).map((a) => a.topic_id),
    ])
  )
  const feedTopics = new Set(Object.values(topicsByVideo).flat())

  // Human labels for the feed's own topic ids ("claude-code-mcp-setup" ->
  // "Setting up MCP with Claude Code"), narrowed to the ids this feed
  // actually shows for the same reason the avatars map above is narrowed:
  // this crosses the RSC boundary on every render.
  const topicLabels = Object.fromEntries(
    loadTopicPages()
      .topics.filter((t) => feedTopics.has(t.topic_id))
      .map((t) => [t.topic_id, t.label])
  )

  const ownCoverage: Record<string, number> = {}
  for (const v of channelVideos(meta.self_channel_id)) {
    for (const a of v.topic_assignments as { topic_id: string }[]) {
      if (feedTopics.has(a.topic_id)) {
        ownCoverage[a.topic_id] = (ownCoverage[a.topic_id] ?? 0) + 1
      }
    }
  }

  return (
    <section className="breakout">
      <RecentFeed
        bundle={recent}
        avatars={avatars}
        selfChannelId={meta.self_channel_id}
        topicsByVideo={topicsByVideo}
        ownCoverage={ownCoverage}
        topicLabels={topicLabels}
        generatedAt={meta.generated_at}
      />
    </section>
  )
}
