import { channelAvatarUrl, loadChannels, loadMeta, loadRecent } from "@/lib/bundles"
import { RecentFeed } from "@/components/recent-feed"

/**
 * What went up, and whether it is still going up.
 *
 * This page used to carry a second section underneath: every taxonomy leaf opened as a shelf of
 * its best videos. That is the corpus, and the corpus is not the question — "what is the niche
 * making" takes 25 shelves nobody scrolls, while "what broke out, and is it still climbing" is
 * one screen. Nothing was lost with it: the same counts feed the opportunity blocks on the home
 * page, and every topic still has its own route.
 */
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

  return (
    <section className="breakout">
      <RecentFeed bundle={recent} avatars={avatars} selfChannelId={meta.self_channel_id} />
    </section>
  )
}
