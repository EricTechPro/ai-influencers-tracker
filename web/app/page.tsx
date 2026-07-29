import {
  channelAvatarUrl,
  channelCoverage,
  loadChannels,
  loadMeta,
  loadOpportunities,
  loadSnapshots,
  loadTopicPages,
  videosById,
} from "@/lib/bundles"
import { slimChannel, sparkAll } from "@/lib/growth"
import { oppRowModels } from "@/lib/opportunity"
import { topVideoCards } from "@/lib/topic"
import { SCORE_FORMULA } from "@/lib/trust"
import { GrowthPanel } from "@/components/growth-panel"
import { OpportunityShelves } from "@/components/opportunity-shelves"

const CARDS_PER_TOPIC = 8

export default function HomePage() {
  const meta = loadMeta()
  const channels = loadChannels().channels
  const snapshots = loadSnapshots()
  const slim = channels.map((c) => slimChannel(c, channelAvatarUrl(c.channel_id)))
  const coverage = Object.fromEntries(
    slim.map((c) => {
      const { videos, comments } = channelCoverage(c.channel_id)
      return [c.channel_id, { videos, comments }]
    })
  )
  const sparks = Object.fromEntries(
    slim.map((c) => [c.channel_id, sparkAll(snapshots, c.channel_id)])
  )
  const opps = loadOpportunities().rows
  const models = oppRowModels(
    opps,
    loadTopicPages().topics,
    channels,
    videosById,
    channelAvatarUrl
  )
  // The rail per topic, resolved on the server: the ids come from the same in_window list the
  // supply count was measured over, so the thumbnails and the number cannot disagree.
  const idsByTopic = new Map(opps.map((r) => [r.topic_id, r.video_ids]))
  const cardsByTopic = Object.fromEntries(
    opps.map((r) => [
      r.topic_id,
      topVideoCards(videosById(idsByTopic.get(r.topic_id) ?? []), channels, channelAvatarUrl,
                    CARDS_PER_TOPIC),
    ])
  )

  return (
    <div className="vb">
      <section>
        <div className="section-kicker">
          <span className="kicker bigsec">WHO IS GROWING</span>
          <span className="rule" />
          <a className="cap" href="/leaderboard">
            see all {meta.channels.total} →
          </a>
        </div>
        <p className="note">
          ranked by subscriber growth rate · below a channel&apos;s measurement floor renders
          &quot;&lt; N&quot;
        </p>
        <GrowthPanel channels={slim} sparks={sparks} coverage={coverage} />
      </section>
      {/* Seven columns, two of them gauges, do not fit the 64rem reading
          measure the rest of the app is set to. This section breaks out to the
          viewport instead of asking the topic column to wrap every label. */}
      <section className="breakout">
        <div className="section-kicker">
          <span className="kicker bigsec">WHAT TO MAKE NEXT</span>
          <span className="rule" />
          <span className="cap num">{SCORE_FORMULA}</span>
        </div>
        <p className="note">
          each topic opened as the videos it is actually made of · <b>search volume</b> is vidIQ
          searches/mo for the keyword printed beside it · the rail is every video published on the
          topic in the last 90d, the same set the count is measured over, best first on each
          channel&apos;s own multiplier · <b>why now</b> names the fastest-moving repo behind the
          demand
        </p>
        <OpportunityShelves models={models} cardsByTopic={cardsByTopic} />
      </section>
    </div>
  )
}
