import { channelAvatarUrl, loadChannels, loadMeta } from "@/lib/bundles"
import { slimChannel } from "@/lib/growth"
import { parseWindow } from "@/lib/window"
import { ChannelDirectory } from "@/components/channel-directory"

export default async function ChannelsPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>
}) {
  const { w } = await searchParams
  const meta = loadMeta()
  const channels = loadChannels().channels.map((c) =>
    slimChannel(c, channelAvatarUrl(c.channel_id))
  )

  return (
    <section>
      <div className="section-kicker">
        <span className="kicker">CHANNELS</span>
        <span className="rule" />
        <span className="cap">
          {/* Every non-ok state gets a slot. The kicker used to print only `absent`, so a board
              carrying a corrupt channel still read as a clean "74 tracked · 0 absent". */}
          {meta.channels.total} tracked · {meta.channels.ok} ok
          {meta.channels.corrupt > 0 ? ` · ${meta.channels.corrupt} corrupt` : ""}
          {meta.channels.absent > 0 ? ` · ${meta.channels.absent} absent` : ""}
        </span>
      </div>
      <ChannelDirectory channels={channels} win={parseWindow(w)} />
    </section>
  )
}
