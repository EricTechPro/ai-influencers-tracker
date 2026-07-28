"use client"

import { useMemo, useState } from "react"
import type { RankMode, WindowKey } from "@/lib/types"
import { RANK_MODES, WINDOWS } from "@/lib/types"
import {
  cardModel,
  panelBuilding,
  rankedChannels,
  sparkWindow,
  type SlimChannel,
  type SparkPoint,
} from "@/lib/growth"
import { BuildingCallout } from "./building-callout"
import { GrowthCard } from "./growth-card"

export function GrowthPanel({
  channels,
  sparks,
}: {
  channels: SlimChannel[]
  sparks: Record<string, SparkPoint[]>
}) {
  const [mode, setMode] = useState<RankMode>("growth")
  const [win, setWin] = useState<WindowKey>("90d")
  const [niche, setNiche] = useState<string>("all")

  const niches = useMemo(
    () =>
      [...new Set(channels.map((c) => c.niche).filter((n): n is string => n !== null))].sort(),
    [channels]
  )
  const pool = niche === "all" ? channels : channels.filter((c) => c.niche === niche)
  const building = panelBuilding(pool, win)
  const ranked = rankedChannels(pool, mode, win)
  const top5 = ranked.slice(0, 5)
  const self = ranked.find((c) => c.is_self)
  const selfRank = self?.rank[mode][win] ?? null

  return (
    <>
      <div className="controls">
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
      </div>
      {building ? (
        <BuildingCallout state={building} />
      ) : top5.length === 0 ? (
        <div className="empty">no channels in this niche</div>
      ) : (
        <>
          <div className="cardgrid">
            {top5.map((c) => (
              <GrowthCard
                key={c.channel_id}
                card={cardModel(
                  c,
                  win,
                  mode,
                  sparkWindow(sparks[c.channel_id] ?? [], c.subscriber_delta[win])
                )}
                window={win}
              />
            ))}
          </div>
          {self && selfRank !== null && selfRank > 5 && (
            <p className="note">
              ⓘ You are #{selfRank}. Your card sits at its true rank on{" "}
              <a href="/leaderboard">/leaderboard</a>.
            </p>
          )}
        </>
      )}
    </>
  )
}
