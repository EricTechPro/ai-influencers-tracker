import { channelAvatarUrl, loadChannels, loadMeta, channelVideos } from "@/lib/bundles"
import { parseWindow } from "@/lib/window"
import { fmtInt } from "@/lib/trust"
import { Avatar } from "@/components/avatar"
import { ComparePicker } from "@/components/compare-picker"
import { CompareTable, type CompareSide } from "@/components/compare-table"
import { SectionKicker } from "@/components/section-kicker"

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string; w?: string }>
}) {
  const { a, b, w } = await searchParams
  const bundle = loadChannels()
  const meta = loadMeta()
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
      {/* The subject header, in the same `.card pad` shape `/channels/[id]` opens with. This page
          is about two channels the way that one is about one, and it was the only route on the
          board that opened on nothing — a bare flex row of two selects, floated at the top with
          no card, no kicker, and no rule under it. Identity only: subscribers and views are the
          first two rows of the table below, and a header restating them is the same answer twice,
          which is why the leaderboard dropped its top-5 summary. */}
      <div className="card pad comparehead">
        <Side channel={him} side="a" options={options} selfId={bundle.self_channel_id} />
        <span className="mono10 vs">vs</span>
        <Side channel={you} side="b" options={options} selfId={bundle.self_channel_id} />
      </div>

      <SectionKicker label="the numbers" />
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
      <CompareTable them={toSide(him)} you={toSide(you)} initialWindow={parseWindow(w)}
        generatedAt={meta.generated_at} />
    </section>
  )
}

/**
 * One side of the header: the face, the picker that swaps it, and the same
 * `@handle · niche · lang` line the channel page prints under a channel's name.
 *
 * The picker stays the naming element rather than sitting beside a printed
 * name — the select already shows the channel's name and its "★ you" mark, so
 * a heading above it would be that name twice.
 */
function Side({
  channel,
  side,
  options,
  selfId,
}: {
  channel: { channel_id: string; name: string; is_self: boolean; handle: string | null;
    niche: string | null; lang: string | null }
  side: "a" | "b"
  options: { channel_id: string; name: string; is_self: boolean }[]
  selfId: string
}) {
  return (
    <div className="who">
      <Avatar src={channelAvatarUrl(channel.channel_id)} name={channel.name} size={48}
        isSelf={channel.is_self} />
      <div className="whobody">
        <ComparePicker side={side} value={channel.channel_id} options={options} selfId={selfId} />
        <div className="mono10">
          {channel.handle ? `@${channel.handle}` : "--"}
          {channel.niche ? ` · ${channel.niche}` : ""}
          {channel.lang ? ` · ${channel.lang}` : ""}
        </div>
      </div>
    </div>
  )
}
