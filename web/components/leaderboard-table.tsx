"use client"

import Link from "next/link"
import { useCallback, useMemo, useState } from "react"
import { peekStats, type SlimChannel } from "@/lib/growth"
import { tiered, type SortValue } from "@/lib/sort"
import type { RankMode, WindowKey } from "@/lib/types"
import { RANK_MODES, WINDOWS } from "@/lib/types"
import {
  bucketText,
  compactSignedAuto,
  deltaText,
  fmtInt,
  pctText,
  stateExplain,
} from "@/lib/trust"
import { AvatarPeek } from "./avatar"
import { SortableHeader, useTableSort, type SortColumn } from "./sortable-table"
import { Chip, Derived } from "./trust"

type Key = "rank" | "channel" | "subs" | "dsubs" | "growth" | "dviews" | "per1k" | "vids"

const CATS = ["ai-creator", "company", "adjacent", "unknown"] as const
type Cat = (typeof CATS)[number]

const MODE_TIPS: Record<RankMode, string> = {
  growth: "Subscriber growth rate over the selected window. A small channel doubling outranks a large one adding more people.",
  general: "A blend: 50 growth rate, 20 subscriber count, 30 views gained. Size and momentum together.",
  subscribers: "Raw subscriber count. The biggest channels first, whatever they did this window.",
  views: "Views gained over the selected window, in absolute terms.",
}

const CAT_TIPS: Record<Cat, string> = {
  "ai-creator": "An independent creator whose channel is mainly about AI. The comparison set.",
  company: "A company's own channel (Anthropic, OpenAI and the like). Different incentives, different upload cadence.",
  adjacent: "Not an AI channel as such, but covering enough of it to compete for the same viewers.",
  unknown: "Not categorised yet in config/channels.json.",
}

export type CoverageMap = Record<string, { videos: number; comments: number | null }>

export function LeaderboardTable({
  channels,
  coverage,
}: {
  channels: SlimChannel[]
  coverage?: CoverageMap
}) {
  const [mode, setMode] = useState<RankMode>("growth")
  const [win, setWin] = useState<WindowKey>("90d")
  const [niche, setNiche] = useState<string>("all")
  const [cats, setCats] = useState<Set<Cat>>(new Set(CATS))

  const columns: SortColumn<Key>[] = [
    {
      key: "rank",
      label: "#",
      tip: `Position by ${mode} over ${win}. Change it with "rank by" above; sorting a column does not change it.`,
    },
    { key: "channel", label: "channel" },
    { key: "subs", label: "subs", align: "right", tip: "subscriber count at the newest snapshot" },
    {
      key: "dsubs",
      label: `Δsubs ${win}`,
      align: "right",
      tip:
        "subscriber_count newest minus oldest in window. YouTube rounds subscriber counts, so " +
        "every figure carries a rounding width — hover a number to see its own.",
    },
    { key: "growth", label: "growth", align: "right", tip: "subscriber delta ÷ subscribers at window start" },
    { key: "dviews", label: `Δviews ${win}`, align: "right", tip: "view_count newest minus oldest in window; exact, never rounded" },
    { key: "per1k", label: "subs/1k views", align: "right", tip: "subscriber delta ÷ (view delta ÷ 1000): subscribers earned per thousand views" },
    { key: "vids", label: "vids 30d", align: "right", tip: "videos published in the last 30 days; this column is always 30d, whatever window is selected" },
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
        <span className="note" title="What the # column counts down. It sets the ranking only; every column stays sortable on its own.">
          rank by
        </span>
        <div className="tabs" role="group" aria-label="rank by">
          {RANK_MODES.map((m) => (
            <button
              key={m}
              type="button"
              className={m === mode ? "on" : undefined}
              aria-pressed={m === mode}
              onClick={() => setMode(m)}
              title={MODE_TIPS[m]}
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
        {/* These are the roster's own category tags, set by hand in
            config/channels.json: who is an independent creator, who is a
            company channel, who is adjacent to the niche, and who has not been
            tagged yet. Unlabelled they read as three stray switches. */}
        <span className="note" title="Each tracked channel is tagged by hand in config/channels.json. Untick a tag to drop those channels from the table.">
          show
        </span>
        {CATS.map((cat) => (
          <label key={cat} title={CAT_TIPS[cat]}>
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
      {/* Nine columns and a one-line name cap need more width than a narrow
          viewport has. Scrolling sideways beats wrapping every row to two
          lines, and matches how the other dense tables behave. */}
      <div className="tblwrap">
        <table className="tbl tbl-sticky tbl-hover" style={{ minWidth: "62rem" }}>
          <SortableHeader columns={columns} sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
          <tbody>
            {sorted.map((c) => (
              <LeaderRow key={c.channel_id} c={c} mode={mode} win={win}
              cover={coverage?.[c.channel_id]} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/** The same state, short enough for a numeric column. "building, 89 of 90 days"
 *  is right on a card and too wide here: it either wraps every second row to
 *  two lines or pushes the table out past the page. Still a state, still shows
 *  how far along it is, never a zero. */
/** The cell's state, short enough not to set the column width on its own.
 *  "building 364/365" was the widest string in the table and every one of the
 *  72 rows paid for it; the fraction alone says the same thing, with the full
 *  sentence on hover. */
function stateText(cell: SlimChannel["subscriber_delta"][WindowKey]): string {
  if (cell.state === "building" && cell.have !== undefined && cell.need !== undefined) {
    return `${cell.have}/${cell.need}`
  }
  return deltaText(cell)
}

const stateTitle = stateExplain

function LeaderRow({ c, mode, win, cover }: {
  c: SlimChannel
  mode: RankMode
  win: WindowKey
  cover?: { videos: number; comments: number | null }
}) {
  const stats = peekStats(c, cover)
  if (c.status === "absent") {
    return (
      <tr>
        <td className="muted num">--</td>
        <td>
          <Link href={`/channels/${c.channel_id}`} className="chcell">
            <AvatarPeek src={c.avatarUrl} name={c.name} handle={c.handle} size={28} />
            <span className="chname" title={c.name}>{c.name}</span>
          </Link>{" "}
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
        <Link href={`/channels/${c.channel_id}`} className="chcell">
          <AvatarPeek src={c.avatarUrl} name={c.name} handle={c.handle} size={28}
            isSelf={c.is_self} stats={stats} />
          <span className="chname" title={c.name}>{c.name}</span>
        </Link>
        {c.is_self && (
          <>
            {" ★ "}
            <Chip variant="you">YOU</Chip>
          </>
        )}
      </td>
      <td className="r num">{c.subscriber_count !== null ? fmtInt(c.subscriber_count) : "--"}</td>
      <td className="r num nowrap">
        {/* The rounding width used to sit beside every number as "±100". It is
            a real disclosure and it stays, but inline it gave each row a
            different width and made a column of numbers impossible to scan
            down. It now rides the hover, where the exact figure already is. */}
        <Derived formula={`subscriber_count newest minus oldest, ${win}; YouTube rounds this channel to ${bucketText(c.subscriber_bucket)}`}>
          {deltaText(delta)}
        </Derived>
      </td>
      <td className="r num">
        <Derived formula="subscriber delta ÷ subscribers at window start">{pctText(growth)}</Derived>
      </td>
      <td className="r num nowrap">
        {views.state === "ok" ? (
          <Derived formula={`view_count newest minus oldest, ${win}`}>
            {compactSignedAuto(views.value ?? 0)}
          </Derived>
        ) : (
          <span className="muted" title={stateTitle(views)}>{stateText(views)}</span>
        )}
      </td>
      <td className="r num nowrap">
        {per1k.state === "ok" ? (
          <Derived formula="subscriber delta ÷ (view delta ÷ 1000)">
            {(per1k.value ?? 0).toFixed(1)}
          </Derived>
        ) : (
          <span className="muted" title={stateTitle(per1k)}>{stateText(per1k)}</span>
        )}
      </td>
      <td className="r num">{c.videos_published["30d"] ?? "--"}</td>
    </tr>
  )
}
