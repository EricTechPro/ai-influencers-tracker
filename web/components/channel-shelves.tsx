"use client"

/**
 * The channel page's video shelf, and the mute state it owns.
 *
 * One shelf, not two. It was "still climbing" above "most viewed ever" until the climbing shelf
 * turned out to render an empty callout on every channel — a section whose only content is an
 * explanation of why it is empty is a section that should have been a sort order. Climbing is one
 * option in the sort now, so the same question is asked without a permanently apologetic box.
 *
 * A client boundary exists here because a mute is one decision across the whole page. The hook is
 * `lib/use-mute.ts`, the same one /topics uses, so a mute made here and a mute made there are the
 * same act against the same file.
 */
import { useMuteList } from "@/lib/use-mute"
import type { MutedEntry } from "@/lib/muted"
import type { RecentRow } from "@/lib/types"
import { ChannelVideos } from "./channel-videos"

export function ChannelShelves({
  videos,
  avatarUrl,
  isSelf,
  initialMuted,
}: {
  videos: RecentRow[]
  avatarUrl: string | null
  isSelf: boolean
  initialMuted: MutedEntry[]
}) {
  const { mutedIds, onToggleMute } = useMuteList(initialMuted)

  return (
    <ChannelVideos
      heading="videos"
      rows={videos}
      avatarUrl={avatarUrl}
      isSelf={isSelf}
      mutedIds={mutedIds}
      onToggleMute={onToggleMute}
      empty="No uploads of theirs have reached the registry yet."
    />
  )
}
