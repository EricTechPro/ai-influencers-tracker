"use client"

import { useCallback, useMemo, useState } from "react"
import type { SlimChannel } from "@/lib/growth"
import { tiered, type SortValue } from "@/lib/sort"
import type { RankMode, WindowKey } from "@/lib/types"
import { RANK_MODES, WINDOWS } from "@/lib/types"
import { bucketText, compactM, deltaText, fmtInt, initials, pctText } from "@/lib/trust"
import { SortableHeader, useTableSort, type SortColumn } from "./sortable-table"
import { Chip, Derived } from "./trust"

type Key = "rank" | "channel" | "subs" | "dsubs" | "growth" | "dviews" | "per1k" | "vids"

const CATS = ["ai-creator", "company", "adjacent", "unknown"] as const
type Cat = (typeof CATS)[number]

export function LeaderboardTable({ channels }: { channels: SlimChannel[] }) {
  const [mode, setMode] = useState<RankMode>("growth")
  const [win, setWin] = useState<WindowKey>("90d")
  const [niche, setNiche] = useState<string>("all")
  const [cats, setCats] = useState<Set<Cat>>(new Set(CATS))

  const columns: SortColumn<Key>[] = [
    { key: "rank", label: "#", tip: `rank by ${mode}, ${win}` },
    { key: "channel", label: "channel" },
    { key: "subs", label: "subs", align: "right" },
    {
      key: "dsubs",
      label: `Δsubs ${win}`,
      align: "right",
      tip: "subscriber_count newest minus oldest in window; bucket width always shown",
    },
    { key: "growth", label: "growth", align: "right", tip: "subscriber delta ÷ subscribers at window start" },
    { key: "dviews", label: "views Δ", align: "right", tip: "view_count newest minus oldest in window" },
    { key: "per1k", label: "subs/1k", align: "right", tip: "subscriber delta ÷ (view delta ÷ 1000)" },
    { key: "vids", label: "vids", align: "right", tip: "videos published, 30d only; other windows not computed yet" },
  ]

  const niches = useMemo(
    () =>
      [...new Set(channels.map((c) => c.niche).filter((n): n is string => n !== null))].sort(),
    [channels]
  )

  const filtered = useMemo(
    () =>
      channels.filter((c) => {
        if (!c.is_self && c.category !== "own" && !cats.has(c.category as Cat)) return false
        if (niche !== "all" && c.niche !== niche) return false
        return true
      }),
    [channels, cats, niche]
  )

  const value = useCallback(
    (row: SlimChannel, key: Key): SortValue => {
      if (row.status === "absent") return null
      switch (key) {
        case "rank": {
          const r = row.rank[mode][win]
          return r === null ? null : -r
        }
        case "channel":
          return row.name.toLowerCase()
        case "subs":
          return row.subscriber_count
        case "dsubs":
          return tiered(row.subscriber_delta[win])
        case "growth":
          return tiered(row.subscriber_growth_rate[win])
        case "dviews":
          return tiered(row.view_delta[win])
        case "per1k":
          return tiered(row.subs_per_1k_views[win])
        case "vids":
          return row.videos_published["30d"]
      }
    },
    [mode, win]
  )

  const { sorted, sortKey, sortDir, toggle } = useTableSort<SlimChannel, Key>(
    filtered,
    value,
    "rank"
  )

  return (
    <>
      <div className="controls">
        <span className="note">rank by</span>
        <div className="tabs" role="group" aria-label="rank by">
          {RANK_MODES.map((m) => (
            <button
              key={m}
              type="button"
              className={m === mode ? "on" : undefined}
              aria-pressed={m === mode}
              onClick={() => setMode(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <span className="note">window</span>
        <div className="tabs" role="group" aria-label="window">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              className={w === win ? "on" : undefined}
              aria-pressed={w === win}
              onClick={() => setWin(w)}
            >
              {w}
            </button>
          ))}
        </div>
        <select
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          aria-label="filter by niche"
          title={niches.length === 0 ? "no niche data in this build yet" : undefined}
        >
          <option value="all">all niches</option>
          {niches.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        {CATS.map((cat) => (
          <label key={cat}>
            <input
              type="checkbox"
              checked={cats.has(cat)}
              onChange={(e) => {
                const next = new Set(cats)
                if (e.target.checked) next.add(cat)
                else next.delete(cat)
                setCats(next)
              }}
            />{" "}
            {cat}
          </label>
        ))}
      </div>
      <table className="tbl">
        <SortableHeader columns={columns} sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
        <tbody>
          {sorted.map((c) => (
            <LeaderRow key={c.channel_id} c={c} mode={mode} win={win} />
          ))}
        </tbody>
      </table>
    </>
  )
}

function LeaderRow({ c, mode, win }: { c: SlimChannel; mode: RankMode; win: WindowKey }) {
  if (c.status === "absent") {
    return (
      <tr>
        <td className="muted num">--</td>
        <td>
          <span className="avatar av20">{initials(c.name)}</span> {c.name}{" "}
          <Chip variant="warn">absent</Chip>
        </td>
        {Array.from({ length: 6 }, (_, i) => (
          <td key={i} className="r muted num">
            --
          </td>
        ))}
      </tr>
    )
  }
  const delta = c.subscriber_delta[win]
  const growth = c.subscriber_growth_rate[win]
  const views = c.view_delta[win]
  const per1k = c.subs_per_1k_views[win]
  return (
    <tr className={c.is_self ? "youcard" : undefined}>
      <td className="num">{c.rank[mode][win] ?? "--"}</td>
      <td>
        <span className={c.is_self ? "avatar av20 av-you" : "avatar av20"}>{initials(c.name)}</span>{" "}
        {c.name}
        {c.is_self && (
          <>
            {" ★ "}
            <Chip variant="you">YOU</Chip>
          </>
        )}
      </td>
      <td className="r num">{c.subscriber_count !== null ? fmtInt(c.subscriber_count) : "--"}</td>
      <td className="r num">
        <Derived formula={`subscriber_count newest minus oldest, ${win}; bucket ${bucketText(c.subscriber_bucket)}`}>
          {deltaText(delta)}
        </Derived>{" "}
        <span className="muted">{bucketText(c.subscriber_bucket)}</span>
      </td>
      <td className="r num">
        <Derived formula="subscriber delta ÷ subscribers at window start">{pctText(growth)}</Derived>
      </td>
      <td className="r num">
        {views.state === "ok" ? (
          <Derived formula={`view_count newest minus oldest, ${win}`}>
            {compactM(views.value ?? 0)}
          </Derived>
        ) : (
          <span className="muted">{deltaText(views)}</span>
        )}
      </td>
      <td className="r num">
        {per1k.state === "ok" ? (
          <Derived formula="subscriber delta ÷ (view delta ÷ 1000)">
            {(per1k.value ?? 0).toFixed(1)}
          </Derived>
        ) : (
          <span className="muted">{deltaText(per1k)}</span>
        )}
      </td>
      <td className="r num">{c.videos_published["30d"] ?? "--"}</td>
    </tr>
  )
}
