"use client"

import Link from "next/link"
import { useCallback, useMemo, useState } from "react"
import { filterDirectory } from "@/lib/directory"
import { PagedTable } from "./paged-table"
import type { SortColumn } from "./sortable-table"
import type { SortValue } from "@/lib/sort"
import type { SlimChannel } from "@/lib/growth"
import type { WindowKey } from "@/lib/types"
import { withWindow } from "@/lib/window"
import { fmtInt } from "@/lib/trust"
import { Avatar } from "./avatar"
import { Chip } from "./trust"

// `unknown` is a real category in the roster and it used to have no tab, so the four visible
// counts summed to 73 of 74 and the unclassified channel matched no filter at all. Unclassified
// is a state, not an absence; it gets its own tab, hidden only when nothing is in it.
const CATS = ["all", "ai-creator", "company", "adjacent", "unknown", "you"] as const
type Cat = (typeof CATS)[number]

type ColKey =
  | "name" | "subscriber_count" | "video_count" | "view_count" | "lang" | "status" | "compare"

const COLUMNS: SortColumn<ColKey>[] = [
  { key: "name", label: "channel" },
  { key: "subscriber_count", label: "subs", align: "right",
    tip: "Rounded to 3 significant figures. No vendor sells better." },
  { key: "video_count", label: "videos", align: "right", tip: "Exact count from the API." },
  { key: "view_count", label: "views", align: "right",
    tip: "Lifetime channel views. Exact." },
  { key: "lang", label: "lang" },
  { key: "status", label: "state",
    tip: "ok, or why the freshest reading for this channel cannot be trusted." },
  // Display only. There is nothing to order a column of buttons by.
  { key: "compare", label: "", align: "right", sortable: false },
]

/**
 * `/channels`: find a channel and open it.
 *
 * It was a card list, alphabetical and unsortable, on the reasoning that a directory has no
 * metric it is ordering by. That held right up until the list was 74 rows long: "who on this
 * board is smallest", "who posts most", and "which ones are stale" are all directory questions,
 * and none of them can be answered by scrolling names. It is a table now, sorted on any column
 * and paged, on the same PagedTable every other long list uses.
 *
 * The sort runs over the filtered roster and the pager slices the result, so ordering is a
 * property of the whole list rather than of whichever page you are standing on.
 */
export function ChannelDirectory({ channels, win }: { channels: SlimChannel[]; win: WindowKey }) {
  const [q, setQ] = useState("")
  const [cat, setCat] = useState<Cat>("all")

  // Counts read off the same roster the filters run against, so a tab's own
  // number always agrees with what clicking it produces.
  const counts = useMemo(() => {
    const out: Record<Cat, number> = {
      all: channels.length,
      "ai-creator": 0,
      company: 0,
      adjacent: 0,
      unknown: 0,
      you: 0,
    }
    for (const c of channels) {
      if (c.category !== "own" && c.category in out) out[c.category as Cat] += 1
      if (c.is_self) out.you += 1
    }
    return out
  }, [channels])

  const filtered = useMemo(() => filterDirectory(channels, q, cat), [channels, q, cat])

  // A null count is unmeasured, and lib/sort's tiering already sinks it to the bottom in both
  // directions — so it is passed through as null rather than coerced to a zero it is not.
  const value = useCallback((c: SlimChannel, key: ColKey): SortValue => {
    if (key === "name") return c.name.toLowerCase()
    if (key === "lang") return c.lang ?? null
    if (key === "status") return c.status
    if (key === "compare") return null
    return c[key]
  }, [])

  return (
    <>
      <div className="controls">
        <label htmlFor="chsearch" className="sr-only">
          search channels by name or handle
        </label>
        <input
          id="chsearch"
          type="search"
          className="chsearch"
          placeholder="search name or @handle"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="cattabs" role="group" aria-label="category">
          {CATS.filter((c) => c !== "unknown" || counts.unknown > 0).map((c) => (
            <button
              key={c}
              type="button"
              className={`t${cat === c ? " on" : ""}`}
              aria-pressed={cat === c}
              onClick={() => setCat(c)}
            >
              {c} <b>{fmtInt(counts[c])}</b>
            </button>
          ))}
        </div>
      </div>
      <PagedTable
        rows={filtered}
        columns={COLUMNS}
        value={value}
        initialKey="name"
        initialDir={1}
        rowKey={(c) => c.channel_id}
        unit="channels"
        empty="no channels match these filters"
        row={(c) => <DirectoryCells c={c} win={win} />}
      />
    </>
  )
}

/** A measured count, or the unmeasured glyph. Never a zero: a channel we could not read is not
 *  a channel with no subscribers. */
function num(n: number | null) {
  return n === null ? <span className="statecell">--</span> : fmtInt(n)
}

function DirectoryCells({ c, win }: { c: SlimChannel; win: WindowKey }) {
  return (
    <>
      <td>
        <Link href={withWindow(`/channels/${c.channel_id}`, win)} className="chcell dirlink">
          <Avatar src={c.avatarUrl} name={c.name} size={28} isSelf={c.is_self} />
          <span className="dirmeta">
            <span className="chname" title={c.name}>
              {c.name}
            </span>
            <span className="mono10">@{c.handle}</span>
          </span>
        </Link>
      </td>
      <td className="r num">{num(c.subscriber_count)}</td>
      <td className="r num">{num(c.video_count)}</td>
      <td className="r num">{num(c.view_count)}</td>
      <td className="mono10">{c.lang ?? <span className="statecell">--</span>}</td>
      <td>
        {/* An absent or corrupt channel keeps its last-seen figures in the columns above
            (subscriber_count and video_count already hold the last value YouTube returned,
            never zeroed out) — the chip is what names the state so those numbers are not
            mistaken for current ones. */}
        {c.status === "absent" && <Chip variant="warn">absent</Chip>}
        {c.status === "corrupt" && (
          <Chip
            variant="warn"
            title="The freshest snapshot for this channel failed the view_count monotonicity check, so the figures shown are the last trustworthy reading, not today's."
          >
            corrupt
          </Chip>
        )}
        {c.status === "ok" && (c.is_self ? <Chip variant="you">you</Chip> : null)}
      </td>
      <td className="r">
        {!c.is_self && (
          <Link href={withWindow(`/compare?a=${c.channel_id}`, win)} className="btn">
            compare →
          </Link>
        )}
      </td>
    </>
  )
}
