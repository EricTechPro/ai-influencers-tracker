import Link from "next/link"
import {
  channelAvatarUrl,
  loadChannels,
  loadMeta,
  loadOpportunities,
  loadRecent,
  loadTopicPages,
  videosById,
} from "@/lib/bundles"
import { findOpp, topVideoCards } from "@/lib/topic"
import { fmtInt } from "@/lib/trust"
import { RecentFeed } from "@/components/recent-feed"
import { VerdictBadge } from "@/components/trust"
import { VideoCard } from "@/components/video-card"
import type { LeafTopicPage, TopicPage } from "@/lib/types"

const PER_SHELF = 8

/**
 * Topics, as the videos they are actually made of.
 *
 * This page used to be an indented list of slugs and counts — "1,936 videos ·
 * 55 creators" — which ranks topics well and says nothing about what is in
 * them. The counts are the summary; the videos are the thing. So each leaf now
 * opens as a shelf of its best-performing videos, ranked by each channel's own
 * multiplier where it has one, so a small channel's breakout is not buried
 * under a big channel's routine upload.
 */
export default function TopicsIndexPage() {
  const topics = loadTopicPages().topics
  const opps = loadOpportunities().rows
  const channels = loadChannels().channels
  const roots = topics.filter((t) => t.parent_id === null)
  const leafById = new Map(
    topics.filter((t): t is LeafTopicPage => t.is_leaf).map((t) => [t.topic_id, t])
  )

  const leavesUnder = (t: TopicPage): LeafTopicPage[] =>
    t.is_leaf
      ? [leafById.get(t.topic_id)!]
      : t.children.flatMap((id) => {
          const child = topics.find((x) => x.topic_id === id)
          return child ? leavesUnder(child) : []
        })

  const recent = loadRecent()
  const meta = loadMeta()
  const avatars = Object.fromEntries(
    channels.map((c) => [c.channel_id, channelAvatarUrl(c.channel_id)])
  )

  return (
    <section className="breakout">
      <RecentFeed
        bundle={recent}
        avatars={avatars}
        selfChannelId={meta.self_channel_id}
        floor={2.5}
        defaultCap={2}
      />

      <div className="section-kicker">
        <span className="kicker">WHAT THE NICHE IS MAKING</span>
        <span className="rule" />
        <span className="cap">
          {topics.filter((t) => t.is_leaf).length} topics ·{" "}
          {fmtInt(roots.reduce((n, r) => n + r.video_count, 0))} videos
        </span>
      </div>
      <p className="note">
        every topic opened as its best-performing videos · ranked by each channel&apos;s own
        multiplier where it has one, otherwise by views · a card links straight to the video
      </p>

      {roots.map((root) => (
        <div key={root.topic_id} className="tgroup">
          <div className="tgroup-head">
            <h2>{root.label}</h2>
            <span className="mono10">
              {fmtInt(root.video_count)} videos · {fmtInt(root.creator_count)} creators
            </span>
          </div>

          {leavesUnder(root).map((leaf) => {
            const opp = findOpp(opps, leaf.topic_id)
            const cards = topVideoCards(
              videosById(leaf.video_ids),
              channels,
              channelAvatarUrl,
              PER_SHELF
            )
            return (
              <div key={leaf.topic_id} className="shelf">
                <div className="shelf-head">
                  <Link href={`/topics/${leaf.topic_id}`} className="shelf-title">
                    {leaf.label}
                  </Link>
                  <span className="mono10">
                    {fmtInt(leaf.video_count)} videos · {fmtInt(leaf.creator_count)} creators
                  </span>
                  {opp ? (
                    <VerdictBadge verdict={opp.verdict} />
                  ) : (
                    <span className="chip">not scored</span>
                  )}
                  <Link href={`/topics/${leaf.topic_id}`} className="shelf-all">
                    open topic →
                  </Link>
                </div>
                {cards.length === 0 ? (
                  <p className="note">no videos registered on this topic yet</p>
                ) : (
                  <div className="shelf-rail">
                    {cards.map((v) => (
                      <VideoCard key={v.video_id} v={v} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </section>
  )
}
