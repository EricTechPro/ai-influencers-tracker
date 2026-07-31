"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { filterDirectory } from "@/lib/directory"
import { Pager, usePager } from "./pager"
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

/**
 * `/channels`: find a channel and open it. The leaderboard already ranks the
 * roster by growth; this page used to rank it a second time with a near-
 * identical table under the same "ALL CHANNELS" header. Asked what he
 * actually does here, the answer was "find and open a channel" — so this is
 * a directory: a search box, category filters, faces you can scan, and just
 * enough numbers to recognise who is who. No rank, no sort, no window tabs;
 * those belong to the comparing view.
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

  // Alphabetical, not ranked: the directory has no metric it is ordering by.
  const filtered = useMemo(
    () =>
      filterDirectory(channels, q, cat)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [channels, q, cat]
  )

  // 74 rows is a 4,400px page, and the search box and category tabs scroll out of view about ten
  // rows in — so narrowing a list whose controls you cannot see meant scrolling back to the top
  // first. 25 a page keeps the directory about one screen tall with the filters still on it.
  const { slice: page, props: pager } = usePager(filtered, 25)

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
      {filtered.length === 0 ? (
        <div className="empty">no channels match these filters</div>
      ) : (
        <div className="directory">
          {page.map((c) => (
            <DirectoryRow key={c.channel_id} c={c} win={win} />
          ))}
        </div>
      )}
      <Pager {...pager} unit="channels" />
    </>
  )
}

function DirectoryRow({ c, win }: { c: SlimChannel; win: WindowKey }) {
  return (
    <div className={`dirrow${c.is_self ? " youcard" : ""}`}>
      <Link href={withWindow(`/channels/${c.channel_id}`, win)} className="chcell dirlink">
        <Avatar src={c.avatarUrl} name={c.name} size={36} isSelf={c.is_self} />
        <span className="dirmeta">
          <span className="chname" title={c.name}>
            {c.name}
          </span>
          <span className="mono10">
            @{c.handle} · {c.subscriber_count === null ? "--" : fmtInt(c.subscriber_count)} subs
            {" · "}
            {c.video_count === null ? "--" : fmtInt(c.video_count)} videos
            {c.lang ? ` · ${c.lang}` : ""}
          </span>
        </span>
      </Link>
      {/* An absent channel keeps its last-seen figures above (subscriber_count
          and video_count already hold the last value YouTube returned, never
          zeroed out) — the chip is what names the state so the numbers are
          not mistaken for current ones. */}
      {c.status === "absent" && <Chip variant="warn">absent</Chip>}
      {/* Same reasoning one state over. A corrupt tail means the freshest reading failed the
          view_count monotonicity check, so the figures above are the last trustworthy ones and
          not today's — rendered without a chip they were styled identically to 73 measured rows. */}
      {c.status === "corrupt" && (
        <Chip variant="warn" title="The freshest snapshot for this channel failed the view_count monotonicity check, so the figures shown are the last trustworthy reading, not today's.">
          corrupt
        </Chip>
      )}
      {c.is_self ? (
        <Chip variant="you">you</Chip>
      ) : (
        <Link href={withWindow(`/compare?a=${c.channel_id}`, win)} className="btn">
          compare →
        </Link>
      )}
    </div>
  )
}
