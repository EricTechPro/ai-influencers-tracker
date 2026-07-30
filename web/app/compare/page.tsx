import { channelAvatarUrl, loadChannels, channelVideos } from "@/lib/bundles"
import { parseWindow } from "@/lib/window"
import { fmtInt } from "@/lib/trust"
import { Avatar } from "@/components/avatar"
import { ComparePicker } from "@/components/compare-picker"
import { CompareTable, type CompareSide } from "@/components/compare-table"

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string; w?: string }>
}) {
  const { a, b, w } = await searchParams
  const bundle = loadChannels()
  const byId = new Map(bundle.channels.map((c) => [c.channel_id, c]))
  const self = bundle.channels.find((c) => c.is_self)
  const defaultA = bundle.channels
    .filter((c) => !c.is_self && c.rank.growth["90d"] !== null)
    .sort((x, y) => (x.rank.growth["90d"]! - y.rank.growth["90d"]!))[0]
  const him = byId.get(a ?? "") ?? defaultA ?? bundle.channels[0]
  const you = byId.get(b ?? "") ?? self ?? bundle.channels[1]

  const options = bundle.channels.map((c) => ({
    channel_id: c.channel_id, name: c.name, is_self: c.is_self,
  }))

  const toSide = (c: typeof him): CompareSide => ({
    channel_id: c.channel_id,
    name: c.name,
    is_self: c.is_self,
    subscriber_count: c.subscriber_count,
    subscriber_bucket: c.subscriber_bucket,
    view_count: c.view_count,
    subscriber_delta: c.subscriber_delta,
    subscriber_growth_rate: c.subscriber_growth_rate,
    view_delta: c.view_delta,
    subs_per_1k_views: c.subs_per_1k_views,
    videos: channelVideos(c.channel_id),
  })

  return (
    <section>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: "1.2rem", fontSize: 13 }}>
        <Avatar src={channelAvatarUrl(him.channel_id)} name={him.name} size={36} isSelf={him.is_self} />
        <ComparePicker side="a" value={him.channel_id} options={options}
          selfId={bundle.self_channel_id} />
        <span className="mono10">vs</span>
        <Avatar src={channelAvatarUrl(you.channel_id)} name={you.name} size={36} isSelf={you.is_self} />
        <ComparePicker side="b" value={you.channel_id} options={options}
          selfId={bundle.self_channel_id} />
      </div>

      <div className="section-kicker">
        <span className="kicker">the numbers</span><span className="rule" />
      </div>
      {/* Both sides need a real bucket width for this comparison to mean anything; a null on
          either side is missing data, not a zero, so the callout stays silent rather than
          claiming a channel "rounds to 0". */}
      {him.subscriber_bucket !== null && you.subscriber_bucket !== null &&
        him.subscriber_bucket !== you.subscriber_bucket && (
        <div className="callout warn" style={{ marginBottom: 8, fontSize: 12 }}>
          ⚠ Different bucket widths. {him.name} rounds to {fmtInt(him.subscriber_bucket)},{" "}
          {you.is_self ? "you round" : `${you.name} rounds`} to {fmtInt(you.subscriber_bucket)}.
          A subscriber comparison across this size gap is not like-for-like. Views carry no such caveat.
        </div>
      )}
      <CompareTable them={toSide(him)} you={toSide(you)} initialWindow={parseWindow(w)} />
    </section>
  )
}
