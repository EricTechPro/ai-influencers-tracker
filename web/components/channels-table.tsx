"use client"

import Link from "next/link"
import { useCallback, useState } from "react"
import type { SlimChannel } from "@/lib/growth"
import { tiered, type SortValue } from "@/lib/sort"
import type { WindowKey } from "@/lib/types"
import { bucketText, compactSignedAuto, deltaText, fmtInt, pctText, stateExplain } from "@/lib/trust"
import { Avatar } from "./avatar"
import { SortableHeader, useTableSort, type SortColumn } from "./sortable-table"
import { Chip, Derived } from "./trust"
import { WindowTabs } from "./window-tabs"

type Key = "rank" | "channel" | "handle" | "subs" | "growth" | "dsubs" | "views" | "vids"

/** The roster with its growth rates, over a window you pick.
 *
 *  This page used to be the register: handle, subs, views, videos, ranked by a
 *  90d growth rate it never showed you. The rate is the reason the rows are in
 *  that order, so it is now a column, and the window that decides it is a
 *  control rather than a constant. Same six windows as the leaderboard and the
 *  home panel, from the same component, so a number means the same thing on
 *  every page that shows it. */
export function ChannelsTable({ channels }: { channels: SlimChannel[] }) {
  const [win, setWin] = useState<WindowKey>("90d")

  const columns: SortColumn<Key>[] = [
    { key: "rank", label: "#", tip: `Position by subscriber growth rate over ${win}.` },
    { key: "channel", label: "channel" },
    { key: "handle", label: "handle" },
    { key: "subs", label: "subs", align: "right", tip: "subscriber count at the newest snapshot" },
    {
      key: "growth",
      label: `growth ${win}`,
      align: "right",
      tip: "subscriber delta ÷ subscribers at window start",
    },
    {
      key: "dsubs",
      label: `Δsubs ${win}`,
      align: "right",
      tip: "subscriber_count newest minus oldest in window; YouTube rounds the count, so hover for the width",
    },
    { key: "views", label: `Δviews ${win}`, align: "right", tip: "view_count newest minus oldest in window; exact, never rounded" },
    { key: "vids", label: "videos", align: "right", tip: "videos on the channel at the newest snapshot" },
  ]

  const value = useCallback(
    (row: SlimChannel, key: Key): SortValue => {
      switch (key) {
        case "rank": {
          const r = row.rank.growth[win]
          return r === null ? null : -r
        }
        case "channel":
          return row.name.toLowerCase()
        case "handle":
          return (row.handle ?? "").toLowerCase()
        case "subs":
          return row.subscriber_count
        case "growth":
          return tiered(row.subscriber_growth_rate[win])
        case "dsubs":
          return tiered(row.subscriber_delta[win])
        case "views":
          return tiered(row.view_delta[win])
        case "vids":
          return row.video_count
      }
    },
    [win]
  )

  const { sorted, sortKey, sortDir, toggle } = useTableSort<SlimChannel, Key>(
    channels,
    value,
    "rank"
  )

  return (
    <>
      <div className="controls">
        <WindowTabs value={win} onChange={setWin} />
        <span className="note">
          ranked by subscriber growth rate · every column sorts on its own
        </span>
      </div>
      <div className="tblwrap">
        <table className="tbl tbl-sticky tbl-hover tbl-zebra" style={{ minWidth: "58rem" }}>
          <SortableHeader columns={columns} sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
          <tbody>
            {sorted.map((c) => (
              <ChannelRow key={c.channel_id} c={c} win={win} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function ChannelRow({ c, win }: { c: SlimChannel; win: WindowKey }) {
  const growth = c.subscriber_growth_rate[win]
  const dsubs = c.subscriber_delta[win]
  const views = c.view_delta[win]
  return (
    <tr className={c.is_self ? "youcard" : undefined}>
      <td className="num muted">{c.rank.growth[win] ?? "--"}</td>
      <td>
        <Link href={`/channels/${c.channel_id}`} className="chcell">
          <Avatar src={c.avatarUrl} name={c.name} size={30} isSelf={c.is_self} />
          <span className="chname" title={c.name}>{c.name}</span>
        </Link>
        {c.is_self && (
          <>
            {" "}
            <Chip variant="you">you</Chip>
          </>
        )}
        {c.status === "absent" && (
          <>
            {" "}
            <Chip variant="warn">absent</Chip>
          </>
        )}
      </td>
      <td className="mono10">@{c.handle}</td>
      <td className="r num nowrap">
        {c.subscriber_count === null ? "--" : fmtInt(c.subscriber_count)}{" "}
        {c.subscriber_bucket !== null && (
          <span className="muted">{bucketText(c.subscriber_bucket)}</span>
        )}
      </td>
      <td className="r num nowrap">
        {growth.state === "ok" || growth.state === "bounded" ? (
          <Derived formula={`subscriber delta ÷ subscribers at window start, ${win}`}>
            {pctText(growth)}
          </Derived>
        ) : (
          <span className="muted" title={stateExplain(growth)}>{pctText(growth)}</span>
        )}
      </td>
      <td className="r num nowrap">
        {dsubs.state === "ok" || dsubs.state === "bounded" ? (
          <Derived formula={`subscriber_count newest minus oldest, ${win}; YouTube rounds this channel to ${bucketText(c.subscriber_bucket)}`}>
            {deltaText(dsubs)}
          </Derived>
        ) : (
          <span className="muted" title={stateExplain(dsubs)}>{deltaText(dsubs)}</span>
        )}
      </td>
      <td className="r num nowrap">
        {views.state === "ok" ? (
          <Derived formula={`view_count newest minus oldest, ${win}`}>
            {compactSignedAuto(views.value ?? 0)}
          </Derived>
        ) : (
          <span className="muted" title={stateExplain(views)}>{deltaText(views)}</span>
        )}
      </td>
      <td className="r num">{c.video_count === null ? "--" : fmtInt(c.video_count)}</td>
    </tr>
  )
}
