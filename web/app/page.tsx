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
import { SCORE_FORMULA } from "@/lib/trust"
import { GrowthPanel } from "@/components/growth-panel"
import { OpportunityTable } from "@/components/opportunity-table"

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
  const models = oppRowModels(
    loadOpportunities().rows,
    loadTopicPages().topics,
    channels,
    videosById,
    channelAvatarUrl
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
          <b>search volume</b> is vidIQ searches/mo for the topic&apos;s keyword ·{" "}
          <b>competition</b> is videos published on it in the last 90d across all tracked creators ·
          the dashed notch on each bar is the threshold that decides the band ·{" "}
          <b>why now</b> names the fastest-moving repo behind the demand · click a row for the
          full derivation
        </p>
        <OpportunityTable models={models} />
      </section>
    </div>
  )
}
