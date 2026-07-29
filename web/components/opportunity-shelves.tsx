"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import type { OppRowModel } from "@/lib/opportunity"
import { verdictSentence } from "@/lib/opportunity"
import type { Verdict } from "@/lib/types"
import { agoText, fmtInt, SCORE_FORMULA, scoreText } from "@/lib/trust"
import type { VideoCardModel } from "./video-card"
import { VideoCard } from "./video-card"
import { AvatarCluster } from "./avatar-cluster"
import { Derived, VerdictBadge } from "./trust"

const VERDICTS: Verdict[] = [
  "MAKE_THIS_NOW",
  "ONLY_IF_UNSERVED",
  "TOO_EARLY",
  "SKIP",
  "INSUFFICIENT_DATA",
]

/**
 * What to make next, as the videos each topic is actually made of.
 *
 * This was a seven-column table. The columns ranked topics correctly and said nothing about what
 * a topic *is* — "8 videos · 7 creators" is a summary of eight thumbnails nobody could see. The
 * numbers all survive, in the header of each block, and the rail underneath is the exact set of
 * videos the competition count counted. Printing a number beside the thing it was computed from
 * is the same move the shelves on /topics already make.
 *
 * The rail is ordered best-first on each channel's own multiplier, so the leftmost card is the
 * one that most outran its channel's normal, not merely the one with the biggest audience.
 */
export function OpportunityShelves({
  models,
  cardsByTopic,
}: {
  models: OppRowModel[]
  // A resolved record, not a lookup function: a server component cannot hand a function across
  // the client boundary, and the rails are known at build time anyway.
  cardsByTopic: Record<string, VideoCardModel[]>
}) {
  const [hideCovered, setHideCovered] = useState(true)
  const [verdictFilter, setVerdictFilter] = useState<"all" | Verdict>("all")

  const shown = useMemo(
    () =>
      models.filter((m) => {
        if (hideCovered && m.row.own_coverage?.covered) return false
        if (verdictFilter !== "all" && m.row.verdict !== verdictFilter) return false
        return true
      }),
    [models, hideCovered, verdictFilter]
  )

  return (
    <>
      <div className="ctrls">
        <div className="ctrl">
          <span className="lbl">verdict</span>
          <select
            value={verdictFilter}
            onChange={(e) => setVerdictFilter(e.target.value as "all" | Verdict)}
          >
            <option value="all">all verdicts</option>
            {VERDICTS.map((v) => (
              <option key={v} value={v}>
                {v.toLowerCase().replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <label className="ctrl">
          <input
            type="checkbox"
            checked={hideCovered}
            onChange={(e) => setHideCovered(e.target.checked)}
          />
          <span className="lbl">hide topics you have covered</span>
        </label>
        <span className="cap num">{SCORE_FORMULA}</span>
      </div>

      {shown.length === 0 && <div className="empty">no topics match these filters</div>}

      {shown.map((m) => {
        const cards = cardsByTopic[m.row.topic_id] ?? []
        const volume = m.row.demand.keyword_volume
        const repo = m.row.evidence[0]
        return (
          <div key={m.row.topic_id} className="oshelf">
            <div className="ohead">
              <Link href={`/topics/${m.row.topic_id}`} className="otitle">
                {m.label}
              </Link>
              <VerdictBadge verdict={m.row.verdict} />
              <span className="oscore num">
                <Derived formula={SCORE_FORMULA}>{scoreText(m.row.score)}</Derived>
              </span>
              <AvatarCluster creators={m.creators} />
            </div>

            <div className="ostats num">
              <span>
                <b>{volume === null ? "--" : fmtInt(volume)}</b> searches/mo
                {m.row.keyword && <span className="okw"> · &ldquo;{m.row.keyword}&rdquo;</span>}
              </span>
              <span>
                <b>{fmtInt(cards.length)}</b> videos · 90d
              </span>
              <span>
                newest <b>{m.newest_video_at ? agoText(m.newest_video_at) : "--"}</b>
              </span>
              {repo && (
                <span className="owhy">
                  why now <b>{repo.full_name}</b> {fmtInt(repo.stars)}★ ·{" "}
                  {repo.velocity.toFixed(0)}/day
                </span>
              )}
            </div>

            <p className="note">{verdictSentence(m.row)}</p>

            {cards.length === 0 ? (
              <p className="note">
                nothing published on this topic in the last 90 days — which is what makes it a gap
              </p>
            ) : (
              <div className="shelf-rail">
                {cards.map((v) => (
                  <VideoCard key={v.video_id} v={v} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
