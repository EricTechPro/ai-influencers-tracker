"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { windowDays } from "@/lib/compare"
import { WINDOWS } from "@/lib/types"
import { withWindow } from "@/lib/window"
import {
  axisTicks, dailySeries, daySpan, indexedToStart, monthTicks, nearestIndex, noiseFloor,
  perDayAverage, perDayPerThousand, rangeFromDrag, uploadMarks, zoomAbout,
  type Range, type SeriesPoint, type UploadMark,
} from "@/lib/growth-series"
import { deltaText, fmtInt, pctText } from "@/lib/trust"
import { BuildingCallout } from "@/components/building-callout"
import type { SnapshotDay, StateCell, WindowKey } from "@/lib/types"

type Metric = "subscribers" | "views"
type Shape = "total" | "per day"

export interface CompareChannel {
  channel_id: string
  name: string
  series: SnapshotDay[]
}

/** What an upload tick can show about itself when a reader asks it directly. */
export interface UploadVideo {
  video_id: string
  title: string
  published_at: string
  view_count: number | null
}

export function ChannelGrowth({
  series,
  delta,
  rate,
  bucket,
  win,
  name = "this channel",
  peers = [],
  uploads = [],
  rank = null,
  fieldSize = 0,
}: {
  series: SnapshotDay[]
  delta: Record<string, StateCell>
  rate: Record<string, StateCell>
  bucket: number | null
  /** the shared window (spec's six), owned by the page's own searchParams —
   *  this chart used to pick its own 30/90/365 and drifted from every other
   *  page's window control. */
  win: WindowKey
  name?: string
  /** channels this one can be laid over. Empty is a normal state and hides the control. */
  peers?: CompareChannel[]
  /** uploads, drawn as ticks under the axis. The card makes no claim about them. */
  uploads?: UploadVideo[]
  /** where this channel sits on the 90-day growth ladder, and how many are on it */
  rank?: number | null
  fieldSize?: number
}) {
  const [metric, setMetric] = useState<Metric>("subscribers")
  const [shape, setShape] = useState<Shape>("total")
  const [against, setAgainst] = useState<string>("")
  const days = windowDays(win)

  const pick = useMemo(
    () => (rows: SnapshotDay[]): SeriesPoint[] => {
      // `days - 1`, because a window is that many calendar days *inclusive of both ends* — the
      // pipeline's own 7d delta runs 07-27 → 08-02. Subtracting the full `days` pulled in one
      // extra day, so the chart plotted 2,100 over "7d" where every other surface reading the same
      // bundle said 1,800. It agreed on 90d only by luck: 05-04 and 05-05 both held 17,000.
      const cutoff = Date.parse(rows.at(-1)?.date ?? "") - (days - 1) * 86_400_000
      return rows
        .filter((d) => d.status === "ok" && Date.parse(d.date) >= cutoff)
        .map((d) => ({
          date: d.date,
          value: metric === "subscribers" ? d.subscriber_count : d.view_count,
        }))
        .filter((p): p is SeriesPoint => p.value !== null)
    },
    [metric, days],
  )

  const full = useMemo(() => pick(series), [pick, series])

  // The visible slice, in indices into `full`. Null is the whole window, which is the state the
  // card returns to rather than a range that happens to cover everything: only an explicit null
  // can restore the "over 90d" label without re-deriving whether a range is secretly the full one.
  const [zoom, setZoom] = useState<Range | null>(null)
  const pathname = usePathname()

  // Which day the reader is dragging across, if any. A scrub, not a selection: dragging a price
  // chart reads it, it does not choose a region, and that is the gesture people arrive expecting.
  const [scrub, setScrub] = useState<number | null>(null)
  // A window change re-picks the series underneath, and an index range against the old series
  // means a different span against the new one. Drop it rather than silently re-point it.
  useEffect(() => { setZoom(null) }, [win, metric])

  const points = useMemo(
    () => (zoom ? full.slice(zoom[0], zoom[1] + 1) : full),
    [zoom, full],
  )
  const view: Range = zoom ?? [0, Math.max(full.length - 1, 0)]

  const peer = peers.find((p) => p.channel_id === against) ?? null
  // Sliced by date, not by index: the peer is a different series and may hold different days, so
  // the same index in it is not the same day.
  const peerPoints = useMemo(() => {
    if (!peer) return []
    const rows = pick(peer.series)
    if (!zoom || points.length === 0) return rows
    const from = points[0].date
    const to = points[points.length - 1].date
    return rows.filter((p) => p.date >= from && p.date <= to)
  }, [pick, peer, zoom, points])
  const comparing = peerPoints.length >= 2

  // Views are exact, so they carry no bucket however the chart is drawn.
  const activeBucket = metric === "subscribers" ? bucket : null
  const daily = useMemo(() => dailySeries(points, activeBucket), [points, activeBucket])
  const unresolved = daily.filter((d) => d.belowFloor).length
  const floor = noiseFloor(activeBucket)

  // Indexed whenever two channels are on the axis. Absolute is available, but it is not the
  // default: 69,500 against 328,000 draws one flat line and one that fills the card, and the
  // smaller channel's shape — the thing being compared — becomes unreadable.
  const [absolute, setAbsolute] = useState(false)
  const indexed = comparing && !absolute

  // Two channels of different sizes cannot share an absolute per-day axis — see `perDayPerThousand`.
  // Rate is the only per-day view where both shapes stay readable, so the overlay switches to it
  // and the caption says so rather than leaving the reader to notice the smaller line is flat.
  const rated = shape === "per day" && comparing

  const plotted = useMemo(() => {
    if (rated) return perDayPerThousand(points)
    if (shape === "per day") {
      return daily.filter((d) => d.delta !== null)
        .map((d) => ({ date: d.date, value: d.delta as number }))
    }
    return indexed ? indexedToStart(points) : points
  }, [rated, shape, daily, indexed, points])

  const plottedPeer = useMemo(() => {
    if (!comparing) return []
    if (rated) return perDayPerThousand(peerPoints)
    if (shape === "per day") {
      return dailySeries(peerPoints, null).filter((d) => d.delta !== null)
        .map((d) => ({ date: d.date, value: d.delta as number }))
    }
    return indexed ? indexedToStart(peerPoints) : peerPoints
  }, [comparing, rated, shape, peerPoints, indexed])

  const cell = metric === "subscribers" ? delta[win] : undefined
  // What the card leads with. Per-day is the window's average day, computed from the two endpoints
  // rather than from the daily deltas — see `perDayAverage`. Averaging the resolvable days alone
  // would drop every small day and report a channel faster than the one being measured.
  const moved = (points[points.length - 1]?.value ?? 0) - (points[0]?.value ?? 0)
  // Signs are carried by the ▲/▼ beside the supporting figures, never by a "+" glued to a digit.
  // A leading plus on every number makes the one negative case read as a typo rather than a loss.
  const headline = useMemo(() => {
    if (plotted.length < 2) return "--"
    if (shape === "per day") {
      const average = perDayAverage(points)
      if (average === null) return "--"
      // A window whose whole move sits inside the rounding cannot name a daily rate. It can only
      // bound one, at the same bar every other delta on this board clears before it prints.
      if (floor > 0 && Math.abs(moved) < floor) {
        return `< ${fmtInt(Math.ceil(floor / daySpan(points)))}`
      }
      return fmtInt(Math.abs(average))
    }
    if (cell) return deltaText(cell).replace(/^\+/, "")
    return fmtInt(Math.abs(moved))
  }, [plotted.length, shape, floor, cell, points, moved])

  const rising = moved >= 0
  const arrow = rising ? "▲" : "▼"
  const first = points[0]?.value ?? null
  const last = points[points.length - 1]?.value ?? null

  // While scrubbing, the card reports the day under the finger and the move to it from the start
  // of the range, then returns to the range summary on release. The figure and the pointer say the
  // same thing at every moment, which is the only reason a scrub is readable.
  const atScrub = scrub === null ? null : points[scrub] ?? null
  const scrubMove = atScrub && first !== null ? atScrub.value - first : 0
  const scrubRising = scrubMove >= 0

  // Ticks only, and only against this channel's own line. An overlay's spikes belong to a series
  // whose uploads are not on this axis, and a tick row that silently means one of two channels is
  // a mark a reader will attribute to whichever line they were looking at.
  const allMarks = useMemo(
    () => (comparing ? [] : uploadMarks(plotted, uploads.map((v) => v.published_at))),
    [comparing, plotted, uploads],
  )

  // What a hovered day actually carries. A day is a fact about the upload schedule; it says nothing
  // about the subscribers that day, and the readout is worded so it cannot be read as if it did.
  const byDay = useMemo(() => {

    const map = new Map<string, UploadVideo[]>()
    if (comparing) return map
    for (const v of uploads) {
      const day = v.published_at.slice(0, 10)
      const at = map.get(day)
      if (at) at.push(v)
      else map.set(day, [v])
    }
    for (const list of map.values()) {
      list.sort((a, b) => (b.view_count ?? -1) - (a.view_count ?? -1))
    }
    return map
  }, [comparing, uploads])

  // A near-daily uploader puts 123 dots on a 180-day line and the dots become the line. Above this
  // only the biggest days are dotted; the tick rail below still carries every one, and zooming in
  // drops the count until they all come back. Ranked by views, which is an exact count — this is a
  // cap on what is drawn, never a judgment about which uploads mattered.
  const DOT_CAP = 30
  const marks = useMemo(() => {
    if (allMarks.length <= DOT_CAP) return allMarks
    const views = (m: UploadMark) => byDay.get(m.date)?.[0]?.view_count ?? -1
    return [...allMarks]
      .sort((a, b) => views(b) - views(a))
      .slice(0, DOT_CAP)
      .sort((a, b) => a.index - b.index)
  }, [allMarks, byDay])

  return (
    <div className="card pad">
      {/* The answer first. Everything below is the evidence for this number, and the number is
          what the page was opened to read. */}
      {/* One hero figure, then everything else at one weight below it. The three numbers used to
          compete at the same size and the eye had nowhere to land first. */}
      <div className="chart-head">
        <span className={`chart-figure${(atScrub ? scrubRising : rising) ? " gain" : ""}`}>
          {atScrub ? fmtInt(atScrub.value) : headline}
        </span>
        {atScrub ? (
          <span className="chart-sub">
            {metric} on {atScrub.date.slice(0, 10)}
            {first !== null
              ? ` · ${scrubRising ? "▲" : "▼"} ${fmtInt(Math.abs(scrubMove))} since ${points[0].date.slice(0, 10)}`
              : ""}
          </span>
        ) : (
        <span className="chart-sub">
          {/* "per day" alone reads as a typical day, and a reader has no way to tell which
              statistic they are being shown. Name it. And once zoomed, name the span actually
              drawn: every figure on this card recomputes against the visible slice, so a label
              still reading "over 90d" would be describing a chart that is no longer on screen. */}
          {metric} {shape === "per day" ? "a day, averaged over " : "gained over "}
          {zoom && points.length >= 2
            ? `${points[0].date} → ${points[points.length - 1].date}`
            : win}
          {metric === "subscribers" && bucket ? ` · counted in steps of ${fmtInt(bucket)}` : ""}
        </span>
        )}
        {/* The range lives in the URL and travels with you across every page — that is deliberate,
            so these are links rather than local state. They sit on the card because the range is
            the first thing anyone reaches for on a chart, and it was two sections away. */}
        <span className="range-pills" role="group" aria-label="range">
          {WINDOWS.map((w) => (
            <Link key={w} href={withWindow(pathname, w)} scroll={false}
              className={w === win ? "on" : undefined}
              aria-current={w === win ? "true" : undefined}>
              {w}
            </Link>
          ))}
          {zoom && (
            <button type="button" onClick={() => setZoom(null)} className="zoom-reset">
              reset zoom
            </button>
          )}
        </span>
      </div>
      {points.length >= 2 && (
        <div className="chart-stats">
          {/* Only when the hero is not already this number. In total mode the headline *is* the
              window's gain, and repeating it here printed 63,700 twice on one card. */}
          {shape === "per day" && (
            <span>
              <b className={rising ? "gain" : undefined}>{arrow} {fmtInt(Math.abs(moved))}</b>
              {" "}{rising ? "gained" : "lost"} over {win}
            </span>
          )}
          {first !== null && last !== null && (
            <span className="num">{fmtInt(first)} → {fmtInt(last)}</span>
          )}
          {/* The window rate belongs to the cumulative move, never beside a per-day figure: they
              are two different quantities and one line implying otherwise is the whole failure.
              Its sign is stripped for the same reason the hero's is — direction is the arrow's
              job on this card, and a "+" on every figure makes the one loss read as a typo. */}
          {/* Labelled. A bare "82.4%" beside three subscriber counts is a percentage of nothing in
              particular, and the first thing anyone asks is what it is a percentage of. "up"
              rather than "growth" because the rank beside it already ends in "by growth", and the
              row read "82.4% growth · #29 of 74 by growth". The word only attaches to a real
              figure — "up building" is not a phrase. */}
          {rate[win] && metric === "subscribers" ? (
            <span>
              {rate[win].state === "ok" || rate[win].state === "bounded"
                ? `${(rate[win].value ?? rate[win].upper ?? 0) < 0 ? "down" : "up"} `
                : ""}
              {pctText(rate[win]).replace(/^[+-]/, "")}
            </span>
          ) : null}
          {rank !== null && fieldSize > 0 && (
            <span>{`#${rank} of ${fieldSize} by growth`}</span>
          )}
        </div>
      )}
      <div className="chart-rail">
        <span className="tabs">
          {(["subscribers", "views"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={metric === m}
              className={metric === m ? "on" : undefined}
              onClick={() => setMetric(m)}>{m}</button>
          ))}
        </span>
        <span className="tabs">
          {(["total", "per day"] as const).map((s) => (
            <button key={s} type="button" aria-pressed={shape === s}
              className={shape === s ? "on" : undefined}
              onClick={() => setShape(s)}>{s}</button>
          ))}
        </span>
        {peers.length > 0 && (
          <label>
            against
            <select value={against} onChange={(e) => setAgainst(e.target.value)}
              aria-label="compare with another channel">
              <option value="">nobody</option>
              {peers.map((p) => (
                <option key={p.channel_id} value={p.channel_id}>{p.name}</option>
              ))}
            </select>
          </label>
        )}
        {comparing && shape === "total" && (
          <button type="button" className={absolute ? "on" : undefined}
            aria-pressed={absolute} onClick={() => setAbsolute((v) => !v)}>
            {absolute ? "absolute" : "indexed to 100"}
          </button>
        )}
      </div>

      {plotted.length < 2 ? (
        <div style={{ marginTop: 10 }}>
          <BuildingCallout state={{ kind: "building", have: plotted.length, need: days }} />
        </div>
      ) : (
        <>
          <GrowthLine points={plotted} peer={plottedPeer}
            // Only in per-day mode, and only for a rounded metric. A band drawn on a cumulative
            // line would be claiming something about the total that the rounding does not say.
            // A rate axis is not in subscribers either, so the band has nothing to mark there.
            floor={shape === "per day" && !rated ? floor : 0}
            uploads={allMarks} dots={marks} byDay={byDay}
            onScrub={setScrub}
            onSelect={(from, to) => setZoom(rangeFromDrag(view, from, to, full.length))}
            onZoom={(at, factor) => setZoom(zoomAbout(view, at, factor, full.length))}
            onReset={() => setZoom(null)}
            name={name} peerName={peer?.name ?? null}
            unit={rated ? "per 1k subs" : shape === "per day" ? "a day" : indexed ? "indexed" : ""} />
          {comparing && (
            <div className="chart-legend">
              <span className="mine"><i className="swatch" />{name}</span>
              <span className="theirs"><i className="swatch" />{peer?.name}</span>
              {/* This line used to read "both start at 100" whenever two channels were on the
                  axis, including per-day, where nothing is indexed at all. A caption that names a
                  normalization the plot did not perform is worse than no caption. */}
              <span>
                {rated ? "daily gain per 1,000 subs, so both are readable"
                  : indexed ? "both start at 100" : "absolute, different scales"}
              </span>
            </div>
          )}
          <div style={{ fontSize: 12, marginTop: 6 }}>
            {shape === "per day" && metric === "subscribers" && activeBucket ? (
              // The load-bearing sentence on this chart. A daily subscriber move smaller than the
              // rounding is not a small day, it is a day we cannot resolve, and saying so is the
              // difference between a measurement and a claim.
              <span className="note">
                daily subscriber counts are rounded to {fmtInt(activeBucket)}, so a move under{" "}
                {fmtInt(floor)} a day cannot be resolved
                {unresolved > 0 ? ` — ${unresolved} of ${daily.length - 1} days are inside that band` : ""}
                . The shaded band is the rounding, not the range of the data.
              </span>
            ) : metric === "views" ? (
              <span className="note">exact counts, not rounded</span>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}

function coordsFor(points: SeriesPoint[], min: number, range: number): string {
  return points
    .map((p, i) => {
      const x = 4 + (i / Math.max(points.length - 1, 1)) * 92
      const y = 34 - ((p.value - min) / range) * 28
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(" ")
}

function GrowthLine({ points, peer = [], floor = 0, uploads = [], dots = [], byDay, onScrub,
                      onSelect, onZoom, onReset, name, peerName, unit }: {
  points: SeriesPoint[]
  peer?: SeriesPoint[]
  /** half-height of the unresolvable band around zero, in value units. 0 draws none. */
  floor?: number
  /** every upload day, drawn as ticks under the axis and captioned as nothing more than that */
  uploads?: UploadMark[]
  /** the subset dotted on the line itself, which is capped when the rail gets dense */
  dots?: UploadMark[]
  /** what was posted on each day, surfaced only when a reader hovers and asks */
  byDay?: Map<string, UploadVideo[]>
  /** the day being dragged across, or null on release */
  onScrub?: (index: number | null) => void
  /** a shift-drag across the plot, as fractions of what is currently drawn */
  onSelect?: (from: number, to: number) => void
  /** where the gesture is centred, 0-1, and how much to scale the visible span by */
  onZoom?: (at: number, factor: number) => void
  onReset?: () => void
  name: string
  peerName: string | null
  /** what the number is, when it is not a plain count */
  unit: string
}) {
  // One scale across both lines, or the overlay would compare two differently-stretched shapes
  // and every crossing would be an artifact of the drawing.
  const values = [...points, ...peer].map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const coords = coordsFor(points, min, range)
  const peerCoords = peer.length >= 2 ? coordsFor(peer, min, range) : null
  // The band is the rounding, drawn in the same value space as the line so a reader can see which
  // days fall inside it. y = 34 - ((v - min) / range) * 28, the same mapping coordsFor uses.
  const y = (v: number) => 34 - ((v - min) / range) * 28
  const bandTop = floor > 0 ? Math.min(y(floor), y(-floor)) : 0
  const bandHeight = floor > 0 ? Math.abs(y(-floor) - y(floor)) : 0
  const ticks = useMemo(() => monthTicks(points), [points])
  // The vertical scale the card never had. Without it a spike could be 1,000 or 4,000 and hovering
  // was the only way to find out, which is a chart asking to be read one point at a time.
  const levels = useMemo(() => axisTicks(min, max).filter((v) => v >= min && v <= max),
    [min, max])

  // Which day the pointer is over. Null is the resting state and shows the ends instead, so the
  // chart still says what it spans when nobody is touching it.
  const [hover, setHover] = useState<number | null>(null)
  const box = useRef<HTMLDivElement | null>(null)

  // The plot is inset 4% each side (coordsFor starts at x=4 of 100), so a pointer is mapped into
  // that band rather than the element, or every reading would drift toward the edges.
  const fractionAt = useCallback((clientX: number): number | null => {
    const rect = box.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return null
    return Math.max(0, Math.min(1, ((clientX - rect.left) / rect.width - 0.04) / 0.92))
  }, [])

  // A plain drag reads the chart. A shift-drag selects a span to zoom into — the box-zoom is kept
  // because it is genuinely faster than scrolling to a range, but it is off the primary gesture,
  // which belongs to scrubbing.
  const [drag, setDrag] = useState<{ from: number; to: number; box: boolean } | null>(null)

  // Live pointers, so two fingers can be told from one. A pinch is the same zoom the wheel does,
  // driven by the distance between them.
  const touches = useRef(new Map<number, number>())
  const pinch = useRef<number | null>(null)

  const onMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, e.clientX)
    if (touches.current.size === 2) {
      const [a, b] = [...touches.current.values()]
      const gap = Math.abs(a - b)
      const rect = box.current?.getBoundingClientRect()
      if (pinch.current !== null && gap > 0 && rect && rect.width > 0) {
        const mid = fractionAt((a + b) / 2)
        if (mid !== null) onZoom?.(mid, pinch.current / gap)
      }
      pinch.current = gap
      return
    }
    const at = fractionAt(e.clientX)
    if (at === null) return
    setHover(nearestIndex(points, at))
    setDrag((d) => (d ? { ...d, to: at } : d))
    if (drag && !drag.box) onScrub?.(nearestIndex(points, at))
  }, [points, fractionAt, drag, onScrub, onZoom])

  const onDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const at = fractionAt(e.clientX)
    if (at === null) return
    touches.current.set(e.pointerId, e.clientX)
    // A press that reaches the plot is a press on the background — the dot and the card both stop
    // it — so it dismisses whatever is open.
    setOpen(null)
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ from: at, to: at, box: e.shiftKey })
    if (!e.shiftKey) onScrub?.(nearestIndex(points, at))
  }, [fractionAt, points, onScrub])

  const onUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    touches.current.delete(e.pointerId)
    if (touches.current.size < 2) pinch.current = null
    // A shift-drag under 1.5% of the width is a click with a shaky hand, not a selection.
    if (drag?.box && Math.abs(drag.to - drag.from) > 0.015) onSelect?.(drag.from, drag.to)
    setDrag(null)
    onScrub?.(null)
  }, [drag, onSelect, onScrub])

  // Wheel is bound natively rather than through React's onWheel, which is passive: without a
  // preventDefault the page scrolls away underneath while the chart zooms.
  useEffect(() => {
    const el = box.current
    if (!el || !onZoom) return
    const handler = (e: WheelEvent) => {
      if (e.deltaY === 0) return
      e.preventDefault()
      const at = fractionAt(e.clientX)
      if (at === null) return
      onZoom(at, e.deltaY < 0 ? 0.82 : 1 / 0.82)
    }
    el.addEventListener("wheel", handler, { passive: false })
    return () => el.removeEventListener("wheel", handler)
  }, [onZoom, fractionAt])

  const at = hover === null ? null : points[hover]
  const peerAt = hover === null || peer.length === 0 ? null : peer[Math.min(hover, peer.length - 1)]

  // Which dot is open. A click rather than a hover, so the card holds still long enough to read
  // and to click through — a card that lives on hover cannot contain a link to the video.
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => { setOpen(null) }, [points])
  useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  const openMark = open === null ? null : dots.find((d) => d.date === open) ?? null
  const posted = open !== null && byDay ? byDay.get(open) ?? [] : []
  const openPct = openMark ? (openMark.index / Math.max(points.length - 1, 1)) * 100 : 0

  return (
    <>
      <div ref={box} className="chart-plot" style={{ position: "relative" }}
        onPointerMove={onMove} onPointerDown={onDown} onPointerUp={onUp}
        onPointerLeave={() => { setHover(null); setDrag(null); onScrub?.(null) }}
        onDoubleClick={() => onReset?.()}>
        <svg viewBox="0 0 100 40" preserveAspectRatio="none"
          style={{ width: "100%", height: 110, display: "block" }} aria-hidden>
          {/* Gridlines under everything, at the levels the axis labels name. Faint enough that the
              line still reads as the subject and the grid as the paper it sits on. */}
          {levels.map((v) => (
            <line key={`g${v}`} x1="4" y1={y(v).toFixed(2)} x2="96" y2={y(v).toFixed(2)}
              stroke="currentColor" strokeWidth="1" opacity="0.08"
              vectorEffect="non-scaling-stroke" />
          ))}
          {floor > 0 && bandHeight > 0 && (
            <rect x="4" y={bandTop.toFixed(2)} width="92" height={bandHeight.toFixed(2)}
              fill="color-mix(in srgb, currentColor 10%, transparent)" />
          )}
          {/* Month boundaries. Hairlines in the SVG, labels in HTML below — see the note there. */}
          {ticks.map((t) => (
            <line key={t.label} x1={(4 + (t.pct / 100) * 92).toFixed(2)} y1="0"
              x2={(4 + (t.pct / 100) * 92).toFixed(2)} y2="40"
              stroke="currentColor" strokeWidth="1" opacity="0.14"
              vectorEffect="non-scaling-stroke" />
          ))}
          {!peerCoords && floor === 0 && (
            <polygon points={`4,40 ${coords} 96,40`}
              fill="color-mix(in srgb, var(--primary) 8%, transparent)" />
          )}
          {peerCoords && (
            <polyline points={peerCoords} fill="none" stroke="currentColor" strokeWidth="1"
              strokeDasharray="2 2" opacity="0.45" vectorEffect="non-scaling-stroke" />
          )}
          <polyline points={coords} fill="none" stroke="var(--primary)" strokeWidth="1"
            vectorEffect="non-scaling-stroke" />
          {/* What a drag has selected so far. Drawn under the crosshair so the pointer stays the
              thing you are following. */}
          {drag?.box && Math.abs(drag.to - drag.from) > 0.015 && (
            <rect x={(4 + Math.min(drag.from, drag.to) * 92).toFixed(2)} y="0"
              width={(Math.abs(drag.to - drag.from) * 92).toFixed(2)} height="40"
              fill="color-mix(in srgb, var(--primary) 12%, transparent)" />
          )}
          {hover !== null && (
            <line x1={(4 + (hover / Math.max(points.length - 1, 1)) * 92).toFixed(2)} y1="0"
              x2={(4 + (hover / Math.max(points.length - 1, 1)) * 92).toFixed(2)} y2="40"
              stroke="var(--primary)" strokeWidth="1" opacity="0.5"
              vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {/* Axis labels ride above their own gridline rather than in a left gutter: the gutter is
            4% of the card and collapses to about fifteen pixels on a narrow screen, which is not
            a column any number fits in. In HTML for the same reason every other glyph here is —
            preserveAspectRatio="none" stretches x roughly 4x more than y and smears type. */}
        {levels.map((v) => (
          <span key={`l${v}`} className="mono10 axis-level"
            style={{ top: `${(y(v) / 40) * 110}px` }}>
            {fmtInt(v)}
          </span>
        ))}
        {/* Upload days, marked on the line itself rather than only on the rail below it, so the
            release and the curve are read in one glance instead of two. A dot says "posted",
            never "because".

            In HTML, not in the SVG: preserveAspectRatio="none" scales x roughly 4x more than y,
            which turned every circle into a wide ellipse and welded 123 of them into a chain that
            covered the line it was supposed to annotate. */}
        {dots.map((u) => {
          const p = points[u.index]
          if (!p) return null
          const title = byDay?.get(u.date)?.[0]?.title
          return (
            <button key={`d${u.date}`} type="button"
              className={`upload-dot${open === u.date ? " on" : ""}`}
              // The plot below is a drag-to-zoom surface, so the press must stop here or every
              // attempt to open a dot would also start selecting a range under it.
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                setOpen((d) => (d === u.date ? null : u.date))
              }}
              aria-expanded={open === u.date}
              aria-label={title ? `${u.date} · ${title}` : `upload · ${u.date}`}
              style={{ left: `${4 + (u.index / Math.max(points.length - 1, 1)) * 92}%`,
                       top: `${(y(p.value) / 40) * 110}px` }} />
          )
        })}
        {/* What was posted on the day under the pointer. It states the date and the upload and
            stops there: no "this is why the line moved", no multiple of the average day beside it.
            The reader is looking at both the tick and the curve and can draw that line themselves,
            which is the difference between showing evidence and asserting a cause. */}
        {posted.length > 0 && open !== null && (
          <div className="upload-peek"
            style={{ left: `${4 + (openPct / 100) * 92}%`,
                     // Flipped to the left of the dot past the midpoint so a card near the right
                     // edge does not hang off the plot.
                     transform: openPct > 55 ? "translateX(-100%)" : undefined }}
            onPointerDown={(e) => e.stopPropagation()}>
            <a href={`https://www.youtube.com/watch?v=${posted[0].video_id}`}
              target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`https://i.ytimg.com/vi/${posted[0].video_id}/mqdefault.jpg`} alt=""
                loading="lazy" width={96} height={54} />
            </a>
            <span>
              <a href={`https://www.youtube.com/watch?v=${posted[0].video_id}`}
                target="_blank" rel="noreferrer"><b>{posted[0].title}</b></a>
              <span className="mono10">
                posted {open}
                {posted[0].view_count !== null ? ` · ${fmtInt(posted[0].view_count)} views` : ""}
                {posted.length > 1 ? ` · +${posted.length - 1} more that day` : ""}
              </span>
            </span>
            <button type="button" className="peek-close" onClick={() => setOpen(null)}
              aria-label="close">×</button>
          </div>
        )}
        {/* The month labels sit in HTML, not in the SVG, for the same reason the end labels do:
            preserveAspectRatio="none" scales x roughly 4x more than y and smears any glyph inside
            it. Positioned by percent so they line up with the hairlines above. */}
        <div style={{ position: "relative", height: 14 }}>
          {ticks.map((t) => (
            <span key={t.label} className="mono10"
              style={{ position: "absolute", left: `${4 + (t.pct / 100) * 92}%`,
                       transform: "translateX(-50%)", whiteSpace: "nowrap", opacity: 0.7 }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>
      {/* Uploads, and nothing else. No line to a spike, no label naming a video beside a number it
          did not produce — the reader can see which marks sit under which days and decide for
          themselves what that is worth. */}
      {uploads.length > 0 && (
        <>
          <div className="upload-rail" aria-hidden>
            {uploads.map((u) => (
              <i key={u.date} title={`upload · ${u.date}`}
                style={{ left: `${4 + (u.pct / 100) * 92}%` }} />
            ))}
          </div>
          {/* The count sat absolutely at the right end of the rail and landed on top of the ticks,
              which on a near-daily uploader is exactly where they are densest. It gets its own
              line: a caption that covers its own data is worse than no caption. */}
          {/* Never a silent cap. If only some days are dotted, the line says which and says what
              brings the rest back, because a chart that quietly drops marks reads as one that
              covered everything. */}
          <div className="mono10 upload-count">
            {uploads.length} upload days
            {dots.length < uploads.length
              ? ` · ${dots.length} biggest dotted, zoom in for the rest`
              : ""}
            {" "}· click a dot to see what went out ·
            {" "}drag to read, scroll or pinch to zoom, shift-drag to select
          </div>
        </>
      )}
      <div className="mono10 chart-foot">
        {at ? (
          // What the pointer is on, replacing the ends rather than sitting beside them: two date
          // pairs on one line is the reading you have to disambiguate before you can use it.
          <span>
            {at.date} · <span className="num">{fmtInt(at.value)}</span>
            {unit ? ` ${unit}` : ""}
            {peerAt && peerName ? (
              <> · {peerName} <span className="num">{fmtInt(peerAt.value)}</span></>
            ) : null}
            {peerAt && peerName ? "" : ` · ${name}`}
          </span>
        ) : (
          <>
            <span>{points[0].date} · <span className="num">{fmtInt(points[0].value)}</span></span>
            <span>
              {points[points.length - 1].date} ·{" "}
              <span className="num">{fmtInt(points[points.length - 1].value)}</span>
            </span>
          </>
        )}
      </div>
    </>
  )
}
