"use client"

import { useCallback, useMemo, useState } from "react"
import Link from "next/link"
import type { OppRowModel } from "@/lib/opportunity"
import { firedThreshold, scoreSortValue, topicSortValue, verdictSentence } from "@/lib/opportunity"
import type { SortValue } from "@/lib/sort"
import type { OpportunityRow, Verdict } from "@/lib/types"
import {
  agoText,
  fmtDate,
  fmtInt,
  SCORE_FORMULA,
  scoreText,
  VERDICT_LABEL,
  VERDICT_RANK,
} from "@/lib/trust"
import { PagedTable } from "./paged-table"
import type { SortColumn } from "./sortable-table"
import { AvatarCluster } from "./avatar-cluster"
import { Meter } from "./meter"
import { Chip, Derived, VerdictBadge } from "./trust"

type Key = "topic" | "volume" | "competition" | "verdict" | "who" | "score" | "newest"

/**
 * Fixed ceilings for the two meters, just above the roster's observed maxima
 * (9,883 searches/mo and 489 videos/90d as of build 3).
 *
 * Deliberately not "the max of the visible rows": a bar that rescales when you
 * change a filter makes the same topic look different for no reason, and turns
 * a glance-level comparison into a lie. Fixed means the bar is comparable
 * everywhere; a row past the ceiling fills it and shows a ▸ rather than being
 * clipped without saying so.
 */
const VOLUME_CEILING = 10_000
const COMPETITION_CEILING = 500

const COLUMNS: SortColumn<Key>[] = [
  { key: "topic", label: "topic" },
  {
    key: "volume",
    label: "search volume",
    align: "right",
    tip: "vidIQ searches per month for this topic's keyword; the notch is the bar demand is held to",
  },
  {
    key: "competition",
    label: "competition",
    align: "right",
    tip: "videos published on this topic in the supply window, across all tracked creators",
  },
  { key: "verdict", label: "verdict", tip: "demand band × supply band; expand a row for what fired" },
  { key: "who", label: "who's on it", sortable: false },
  {
    key: "score",
    label: "score",
    align: "right",
    tip: `${SCORE_FORMULA}; -- sorts last both ways`,
  },
  { key: "newest", label: "newest", align: "right", tip: "days since the newest video on this topic" },
]

const VERDICTS: Verdict[] = [
  "MAKE_THIS_NOW",
  "ONLY_IF_UNSERVED",
  "TOO_EARLY",
  "SKIP",
  "INSUFFICIENT_DATA",
]

export function OpportunityTable({ models }: { models: OppRowModel[] }) {
  const [hideCovered, setHideCovered] = useState(true)
  const [verdictFilter, setVerdictFilter] = useState<"all" | Verdict>("all")
  const [expanded, setExpanded] = useState<string | null>(null)

  const filtered = useMemo(
    () =>
      models.filter((m) => {
        if (hideCovered && m.row.own_coverage.suppressed) return false
        if (verdictFilter !== "all" && m.row.verdict !== verdictFilter) return false
        return true
      }),
    [models, hideCovered, verdictFilter]
  )

  // Hoisted out of the table so PagedTable can own the sort/page composition. It sorted the
  // whole list already and simply never paged it, so 31 topic rows arrived as one wall.
  const value = useCallback(
    (m: OppRowModel, key: Key): SortValue => {
      switch (key) {
        case "topic":
          return topicSortValue(m)
        case "volume":
          return m.row.demand.keyword_volume
        case "competition":
          return m.row.supply.videos
        case "verdict":
          return VERDICT_RANK[m.row.verdict]
        case "who":
          return null
        case "score":
          return scoreSortValue(m.row)
        case "newest":
          return m.newest_video_at ? new Date(m.newest_video_at).getTime() : null
      }
    },
    []
  )

  return (
    <>
      <div className="controls">
        <select
          value={verdictFilter}
          onChange={(e) => setVerdictFilter(e.target.value as "all" | Verdict)}
        >
          <option value="all">all verdicts</option>
          {VERDICTS.map((v) => (
            <option key={v} value={v}>
              {VERDICT_LABEL[v]}
            </option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            checked={hideCovered}
            onChange={(e) => setHideCovered(e.target.checked)}
          />{" "}
          hide covered
        </label>
        <span className="legend mono10">
          <Meter value={7} max={10} threshold={5} tone="hot" segments={8} />
          notch = the threshold the band is measured against
        </span>
      </div>
      <PagedTable
        rows={filtered}
        columns={COLUMNS}
        value={value}
        initialKey="score"
        rowKey={(m) => m.row.topic_id}
        unit="topics"
        empty="no rows match these filters"
        className="tbl tbl-hover opptbl"
        row={(m) => (
          <Row
            model={m}
            expanded={expanded === m.row.topic_id}
            onToggle={() => setExpanded(expanded === m.row.topic_id ? null : m.row.topic_id)}
          />
        )}
      />
    </>
  )
}

function Row({
  model,
  expanded,
  onToggle,
}: {
  model: OppRowModel
  expanded: boolean
  onToggle: () => void
}) {
  const r = model.row
  const vol = r.demand.keyword_volume
  const volBar = firedThreshold(r.demand.fired, "keyword_volume")
  const vidBar = firedThreshold(r.supply.fired, "videos")

  // The fastest repo behind this topic. It is the concrete thing a topic slug
  // stands in for: "codex-workflows" is a folder name, "Codex-Dream-Skin,
  // 12,538 stars, 964 a day, 13 days old" is a video.
  const lead = r.evidence[0] ?? null

  return (
    <>
      <tr className="rowlink" onClick={onToggle}>
        <td>
          <Link
            className="opptopic"
            href={`/topics/${r.topic_id}`}
            onClick={(e) => e.stopPropagation()}
          >
            {model.label}
          </Link>
          <div className="oppsub">
            <span className="mono10">{r.topic_id}</span>
            {r.shape && <span className="mono10"> · {r.shape}</span>}
            {r.hunch && (
              <>
                {" "}
                <Chip>hunch</Chip>
              </>
            )}
            {r.own_coverage.covered && (
              <>
                {" "}
                <Chip>{r.own_coverage.suppressed ? "covered" : "covered, stale"}</Chip>
              </>
            )}
          </div>
          {lead && (
            <div className="whynow" title="The fastest-moving repo behind this topic's demand.">
              <span className="whynow-lbl">why now</span>{" "}
              <a
                href={`https://github.com/${lead.full_name}`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                {lead.full_name}
              </a>{" "}
              <span className="num">
                {fmtInt(lead.stars)}★ · +{lead.velocity.toFixed(0)}/day · {lead.age_days}d old
              </span>
            </div>
          )}
        </td>

        <td className="r">
          {vol === null ? (
            <span className="muted">--</span>
          ) : (
            <div className="gauge">
              <span className="gauge-n num">{fmtInt(vol)}</span>
              <span className="gauge-u">searches/mo</span>
              <Meter
                value={vol}
                max={VOLUME_CEILING}
                threshold={volBar ?? undefined}
                tone={volBar !== null && vol >= volBar ? "hot" : "cool"}
                label={
                  volBar !== null
                    ? `${fmtInt(vol)} searches/mo · high demand starts at ${fmtInt(volBar)}`
                    : `${fmtInt(vol)} searches/mo`
                }
              />
            </div>
          )}
        </td>

        <td className="r">
          <div className="gauge">
            <span className="gauge-n num">{fmtInt(r.supply.videos)}</span>
            <span className="gauge-u">
              videos · {fmtInt(r.supply.creators)} creators · {r.supply.window_days}d
            </span>
            <Meter
              value={r.supply.videos}
              max={COMPETITION_CEILING}
              threshold={vidBar ?? undefined}
              tone="warn"
              label={
                vidBar !== null
                  ? `${fmtInt(r.supply.videos)} videos · crowded starts at ${fmtInt(vidBar)}`
                  : `${fmtInt(r.supply.videos)} videos`
              }
            />
          </div>
        </td>

        <td>
          <VerdictBadge verdict={r.verdict} />
        </td>
        <td>
          <AvatarCluster creators={model.creators} />
        </td>
        <td className="r num">
          <Derived formula={SCORE_FORMULA}>{scoreText(r.score)}</Derived>
        </td>
        <td className="r num">{agoText(model.newest_video_at)}</td>
      </tr>
      {expanded && (
        <tr className="sub">
          <Derivation row={r} />
        </tr>
      )}
    </>
  )
}

function Derivation({ row }: { row: OpportunityRow }) {
  const fired = [...row.demand.fired, ...row.supply.fired]
  return (
    <td colSpan={7}>
      {/* The badge in one sentence of its own numbers, before any table of
          them: "crowded" is a word for a comparison, and this is that
          comparison written out. */}
      <p className="verdictline">{verdictSentence(row)}</p>

      <table className="tbl">
        <thead>
          <tr>
            <th>component</th>
            <th className="r">raw</th>
            <th className="r">norm</th>
            <th className="r">wt</th>
            <th className="r">points</th>
            <th>source</th>
          </tr>
        </thead>
        <tbody>
          {row.score.components.map((c) => (
            <tr key={c.key}>
              <td>{c.key.replace(/_/g, " ")}</td>
              {c.state === "ok" ? (
                <>
                  <td className="r num">{c.raw_label ?? String(c.raw)}</td>
                  <td className="r num">{c.norm?.toFixed(2)}</td>
                  <td className="r num">{c.weight}</td>
                  <td className="r num">{c.points?.toFixed(1)}</td>
                </>
              ) : (
                <>
                  <td className="r muted" colSpan={3}>
                    no data, weight excluded
                  </td>
                  <td className="r muted">--</td>
                </>
              )}
              <td className="muted">{c.source}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={4} className="r">
              <b className="num">{scoreText(row.score)}</b>
            </td>
            <td colSpan={2} />
          </tr>
        </tbody>
      </table>
      {fired.length > 0 && <p className="note num">fired: {fired.join(" · ")}</p>}
      {row.evidence.map((e) => (
        <p className="note num" key={e.github_id}>
          repo:{" "}
          <a href={`https://github.com/${e.full_name}`} target="_blank" rel="noreferrer">
            {e.full_name}
          </a>{" "}
          {fmtInt(e.stars)}★ {e.age_days}d{" "}
          <Derived formula="stars ÷ max(age_days, 1)">{e.velocity.toFixed(0)} stars/day</Derived>{" "}
          <Derived formula="owner type and contributor count; scores, never filters">
            indie {e.indie.score.toFixed(2)} · {e.indie.owner_type} · {e.indie.contributors}{" "}
            contributors
          </Derived>
        </p>
      ))}
      {row.own_coverage.covered && (
        <p className="note">
          you covered this:{" "}
          <a
            href={`https://www.youtube.com/watch?v=${row.own_coverage.video_id}`}
            target="_blank"
            rel="noreferrer"
          >
            {row.own_coverage.video_id}
          </a>{" "}
          on {fmtDate(row.own_coverage.published_at)}
          {row.own_coverage.suppressed && " · suppressed from the default view"}
        </p>
      )}
    </td>
  )
}
