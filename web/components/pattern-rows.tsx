import type { PatternRow, RecentRow } from "@/lib/types"
import { GridVideoCard } from "./grid-video-card"

const ACTION_LABEL: Record<PatternRow["action"], string> = {
  promote: "promote to a topic →",
  add_to_leaf: "add to that topic →",
  below_floor: "needs more creators",
}

const ACTION_CLASS: Record<PatternRow["action"], string> = {
  promote: "ppromote",
  add_to_leaf: "ppromote padd",
  below_floor: "ppromote pfloor",
}

/**
 * The outliers regrouped by what they are actually about.
 *
 * Every label here is an LLM judgement, so every row carries its evidence: the titles the group
 * was read from, verbatim. A bad grouping should look like a bad grouping rather than pass as a
 * finding. The leaf match beside it is the opposite kind of claim, a deterministic alias hit,
 * which is why it renders in the derived colour and not the inference one.
 */
export function PatternRows({
  patterns,
  videos,
  avatars,
  selfChannelId,
}: {
  patterns: PatternRow[]
  videos: RecentRow[]
  avatars: Record<string, string | null>
  selfChannelId: string
}) {
  if (patterns.length === 0) {
    return (
      <p className="note">
        No grouping pass has run over this sweep yet, so there are no pattern rows. The feed above
        does not depend on it.
      </p>
    )
  }

  const byId = new Map(videos.map((v) => [v.video_id, v]))

  return (
    <div className="card pad">
      {patterns.map((p) => {
        const rows = p.evidence.map((id) => byId.get(id)).filter((v): v is RecentRow => !!v)
        return (
          <div key={p.pattern_id} className="prow">
            <div className="phead">
              <span className="plabel">{p.label}</span>
              <span className="pinf">INFERENCE</span>
              {p.existing_leaf && <span className="pleaf">matches {p.existing_leaf}</span>}
              <span className="pstat">
                {rows.length} videos · {p.creator_count} creators
              </span>
              <button
                className={ACTION_CLASS[p.action]}
                disabled={p.action === "below_floor"}
              >
                {ACTION_LABEL[p.action]}
              </button>
            </div>
            <div className="pgrid">
              {rows.map((v) => (
                <GridVideoCard
                  key={v.video_id}
                  v={v}
                  avatarUrl={avatars[v.channel_id] ?? null}
                  isSelf={v.channel_id === selfChannelId}
                />
              ))}
            </div>
            <p className="pevidence">
              grouped on these titles: {rows.map((v) => `“${v.title}”`).join(" · ")}
            </p>
          </div>
        )
      })}
      <div className="plegend">
        <span>
          <b>promote to a topic →</b> clears the creator floor and matches no existing leaf
        </span>
        <span>
          <b>add to that topic →</b> matches a leaf you already authored
        </span>
        <span>
          <b>needs more creators</b> real, but too few channels to act on yet
        </span>
      </div>
    </div>
  )
}
