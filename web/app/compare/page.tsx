import { channelAvatarUrl, loadChannels, loadOpportunities, channelVideos } from "@/lib/bundles"
import { comparePartition, coverageByTopic } from "@/lib/compare"
import { CADENCE_FORMULA, cadenceDays } from "@/lib/channel"
import { bucketText, deltaText, fmtInt, pctText } from "@/lib/trust"
import { Avatar } from "@/components/avatar"
import { Chip, Derived, VerdictBadge } from "@/components/trust"
import { ComparePicker } from "@/components/compare-picker"
import Link from "next/link"

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>
}) {
  const { a, b } = await searchParams
  const bundle = loadChannels()
  const byId = new Map(bundle.channels.map((c) => [c.channel_id, c]))
  const self = bundle.channels.find((c) => c.is_self)
  const defaultA = bundle.channels
    .filter((c) => !c.is_self && c.rank.growth["90d"] !== null)
    .sort((x, y) => (x.rank.growth["90d"]! - y.rank.growth["90d"]!))[0]
  const him = byId.get(a ?? "") ?? defaultA ?? bundle.channels[0]
  const you = byId.get(b ?? "") ?? self ?? bundle.channels[1]

  const opps = loadOpportunities().rows
  const gaps = comparePartition(
    coverageByTopic(channelVideos(him.channel_id), him.channel_id),
    coverageByTopic(channelVideos(you.channel_id), you.channel_id),
    opps,
  )
  const bucketsDiffer = him.subscriber_bucket !== you.subscriber_bucket
  const options = bundle.channels.map((c) => ({
    channel_id: c.channel_id, name: c.name, is_self: c.is_self,
  }))

  const hisCadence = cadenceDays(channelVideos(him.channel_id).map((v) => v.published_at))
  const yourCadence = cadenceDays(channelVideos(you.channel_id).map((v) => v.published_at))

  return (
    <section>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: "1.2rem", fontSize: 13 }}>
        <Avatar src={channelAvatarUrl(him.channel_id)} name={him.name} size={36} />
        <ComparePicker side="a" value={him.channel_id} options={options}
          selfId={bundle.self_channel_id} />
        <span className="mono10">vs</span>
        <Avatar src={channelAvatarUrl(you.channel_id)} name={you.name} size={36} isSelf />
        <ComparePicker side="b" value={you.channel_id} options={options}
          selfId={bundle.self_channel_id} />
      </div>

      <div className="section-kicker">
        <span className="kicker">what {him.name} covers that {you.is_self ? "you do" : `${you.name} does`} not</span>
        <span className="rule" /><span className="cap">the actionable part</span>
      </div>
      <div className="card tblwrap">
        <table className="tbl tbl-sticky tbl-hover" style={{ fontSize: 12 }}>
          <thead><tr><th>topic</th><th className="r">their videos</th>
            <th className="r">your videos</th>
            <th className="r">their views</th><th>verdict</th></tr></thead>
          <tbody>
            {gaps.himOnly.length === 0 && (
              <tr><td colSpan={5} className="stateline">
                No topic {him.name} covers is one {you.is_self ? "you have" : `${you.name} has`} left
                alone. The gaps below run the other way.
              </td></tr>
            )}
            {gaps.himOnly.map((g) => (
              <tr key={g.topic_id}>
                <td><Link href={`/topics/${g.topic_id}`}>{g.topic_id}</Link></td>
                <td className="r num">{g.him!.videos}</td>
                <td className="r num muted">0</td>
                <td className="r num">{fmtInt(g.him!.views)}</td>
                <td>{g.verdict ? <VerdictBadge verdict={g.verdict} /> : <span className="mono10">not scored</span>}</td>
              </tr>
            ))}
            {gaps.youOnly.length > 0 && (
              <tr><td colSpan={5} className="sub mono10">-- you cover, they do not --</td></tr>
            )}
            {gaps.youOnly.map((g) => (
              <tr key={g.topic_id}>
                <td><Link href={`/topics/${g.topic_id}`}>{g.topic_id}</Link></td>
                <td className="r num muted">0</td>
                <td className="r num">{g.you!.videos}</td>
                <td className="r num muted">--</td>
                <td className="mono10">--</td>
              </tr>
            ))}
            {gaps.both.length > 0 && (
              <tr><td colSpan={5} className="sub mono10">-- both --</td></tr>
            )}
            {gaps.both.map((g) => (
              <tr key={g.topic_id}>
                <td><Link href={`/topics/${g.topic_id}`}>{g.topic_id}</Link></td>
                <td className="r num">{g.him!.videos}</td>
                <td className="r num">{g.you!.videos}</td>
                <td className="r num">{fmtInt(g.him!.views)}</td>
                <td>{g.verdict ? <VerdictBadge verdict={g.verdict} /> : <span className="mono10">not scored</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-kicker">
        <span className="kicker">the numbers</span><span className="rule" />
      </div>
      {bucketsDiffer && (
        <div className="callout warn" style={{ marginBottom: 8, fontSize: 12 }}>
          ⚠ Different bucket widths. {him.name} rounds to {fmtInt(him.subscriber_bucket ?? 0)},{" "}
          {you.is_self ? "you round" : `${you.name} rounds`} to {fmtInt(you.subscriber_bucket ?? 0)}.
          A subscriber comparison across this size gap is not like-for-like. Views carry no such caveat.
        </div>
      )}
      <div className="card tblwrap">
        <table className="tbl tbl-hover" style={{ fontSize: 12 }}>
          <thead><tr><th></th><th className="r">{him.name}</th>
            <th className="r">{you.name}{you.is_self ? " ★" : ""}</th></tr></thead>
          <tbody>
            <tr><td>subscribers</td>
              <td className="r num">{him.subscriber_count === null ? "--" : fmtInt(him.subscriber_count)} <Chip>{bucketText(him.subscriber_bucket)}</Chip></td>
              <td className="r num">{you.subscriber_count === null ? "--" : fmtInt(you.subscriber_count)} <Chip>{bucketText(you.subscriber_bucket)}</Chip></td></tr>
            <tr><td><Derived formula="last snapshot minus first snapshot in window">Δ subs 90d</Derived></td>
              <td className="r num">{deltaText(him.subscriber_delta["90d"])}</td>
              <td className="r num">{deltaText(you.subscriber_delta["90d"])}</td></tr>
            <tr><td><Derived formula="Δ subs divided by subs at window start">growth rate 90d</Derived></td>
              <td className="r num">{pctText(him.subscriber_growth_rate["90d"])}</td>
              <td className="r num">{pctText(you.subscriber_growth_rate["90d"])}</td></tr>
            <tr><td>views</td>
              <td className="r num">{him.view_count === null ? "--" : fmtInt(him.view_count)}</td>
              <td className="r num">{you.view_count === null ? "--" : fmtInt(you.view_count)}</td></tr>
            <tr><td><Derived formula="exact viewCount delta over window">Δ views 90d</Derived></td>
              <td className="r num">{deltaText(him.view_delta["90d"])}</td>
              <td className="r num">{deltaText(you.view_delta["90d"])}</td></tr>
            <tr><td><Derived formula="Δ subs divided by Δ views, times 1000">subs / 1k views 90d</Derived>{" "}<span className="mono10">the real gap</span></td>
              <td className="r num"><b>{subsPerK(him)}</b></td>
              <td className="r num"><b>{subsPerK(you)}</b></td></tr>
            <tr><td>videos 30d</td>
              <td className="r num">{him.videos_published["30d"] ?? "--"}</td>
              <td className="r num">{you.videos_published["30d"] ?? "--"}</td></tr>
            <tr><td><Derived formula="median of exact viewCounts, last 30d uploads">median views 30d</Derived></td>
              <td className="r num">{him.median_views_per_video["30d"] === null ? "--" : fmtInt(him.median_views_per_video["30d"]!)}</td>
              <td className="r num">{you.median_views_per_video["30d"] === null ? "--" : fmtInt(you.median_views_per_video["30d"]!)}</td></tr>
            <tr><td><Derived formula={CADENCE_FORMULA}>cadence</Derived></td>
              <td className="r num">{hisCadence === null ? "--" : `${hisCadence}d`}</td>
              <td className="r num">{yourCadence === null ? "--" : `${yourCadence}d`}</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

function subsPerK(c: { subs_per_1k_views: Record<string, { state: string; value: number | null }> }) {
  const cell = c.subs_per_1k_views["90d"]
  return cell && cell.state === "ok" && cell.value !== null ? cell.value.toFixed(1) : "--"
}
