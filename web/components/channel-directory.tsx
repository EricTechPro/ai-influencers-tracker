"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { filterDirectory } from "@/lib/directory"
import type { SlimChannel } from "@/lib/growth"
import type { WindowKey } from "@/lib/types"
import { withWindow } from "@/lib/window"
import { fmtInt } from "@/lib/trust"
import { Avatar } from "./avatar"
import { Chip } from "./trust"

const CATS = ["all", "ai-creator", "company", "adjacent", "you"] as const
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
      you: 0,
    }
    for (const c of channels) {
      if (c.category === "ai-creator" || c.category === "company" || c.category === "adjacent") {
        out[c.category] += 1
      }
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
          {CATS.map((c) => (
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
          {filtered.map((c) => (
            <DirectoryRow key={c.channel_id} c={c} win={win} />
          ))}
        </div>
      )}
    </>
  )
}

function DirectoryRow({ c, win }: { c: SlimChannel; win: WindowKey }) {
  return (
    <div className={`dirrow${c.is_self ? " youcard" : ""}`}>
      <Link href={`/channels/${c.channel_id}`} className="chcell dirlink">
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
