import { initials } from "@/lib/trust"
import type { CreatorRef } from "@/lib/opportunity"

export function AvatarCluster({ creators, max = 7 }: { creators: CreatorRef[]; max?: number }) {
  if (creators.length === 0) return <span className="muted">--</span>
  const shown = creators.slice(0, max)
  return (
    <span className="avcluster">
      {shown.map((c) => (
        <span
          key={c.channel_id}
          className={c.is_self ? "avatar av18 av-you" : "avatar av18"}
          title={c.name}
        >
          {initials(c.name)}
        </span>
      ))}
      {creators.length > max && <span className="chip">+{creators.length - max}</span>}
    </span>
  )
}
