"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import type { OppRowModel } from "@/lib/opportunity"
import { scoreSortValue } from "@/lib/opportunity"
import type { SortValue } from "@/lib/sort"
import type { OpportunityRow, Verdict } from "@/lib/types"
import { agoText, fmtDate, fmtInt, scoreText, VERDICT_RANK } from "@/lib/trust"
import { SortableHeader, useTableSort, type SortColumn } from "./sortable-table"
import { AvatarCluster } from "./avatar-cluster"
import { Chip, Derived, VerdictBadge } from "./trust"

type Key = "topic" | "verdict" | "who" | "score" | "newest"

const COLUMNS: SortColumn<Key>[] = [
  { key: "topic", label: "topic" },
  { key: "verdict", label: "verdict", tip: "demand band × supply band; expand a row for what fired" },
  { key: "who", label: "who's on it", sortable: false },
  {
    key: "score",
    label: "score",
    align: "right",
    tip: "score = 40·velocity + 25·keyword + 25·supply gap + 10·staleness; -- sorts last both ways",
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

  const { sorted, sortKey, sortDir, toggle } = useTableSort<OppRowModel, Key>(
    filtered,
    (m, key): SortValue => {
      switch (key) {
        case "topic":
          return m.label.toLowerCase()
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
    "score"
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
              {v}
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
      </div>
      <table className="tbl">
        <SortableHeader columns={COLUMNS} sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
        <tbody>
          {sorted.map((m) => (
            <Row
              key={m.row.topic_id}
              model={m}
              expanded={expanded === m.row.topic_id}
              onToggle={() =>
                setExpanded(expanded === m.row.topic_id ? null : m.row.topic_id)
              }
            />
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && <div className="empty">no rows match these filters</div>}
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
  return (
    <>
      <tr className="rowlink" onClick={onToggle}>
        <td>
          <Link href={`/topics/${r.topic_id}`} onClick={(e) => e.stopPropagation()}>
            {r.topic_id}
          </Link>
          {r.hunch && (
            <>
              {" "}
              <Chip>hunch</Chip>
            </>
          )}
          {r.own_coverage.suppressed && (
            <>
              {" "}
              <Chip>covered</Chip>
            </>
          )}
        </td>
        <td>
          <VerdictBadge verdict={r.verdict} />
        </td>
        <td>
          <AvatarCluster creators={model.creators} />
        </td>
        <td className="r num">
          <Derived formula="score = 40·velocity + 25·keyword + 25·supply gap + 10·staleness">
            {scoreText(r.score)}
          </Derived>
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
    <td colSpan={5}>
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
