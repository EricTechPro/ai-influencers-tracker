import type { CreatorRef } from "@/lib/opportunity"
import { Avatar } from "./avatar"

export function AvatarCluster({ creators, max = 7 }: { creators: CreatorRef[]; max?: number }) {
  if (creators.length === 0) return <span className="muted">--</span>
  const shown = creators.slice(0, max)
  return (
    <span className="avcluster">
      {shown.map((c) => (
        <Avatar key={c.channel_id} src={c.avatarUrl} name={c.name} size={26}
          isSelf={c.is_self} title={c.name} />
      ))}
      {creators.length > max && <span className="chip">+{creators.length - max}</span>}
    </span>
  )
}
