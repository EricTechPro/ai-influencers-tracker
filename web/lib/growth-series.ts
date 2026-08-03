/**
 * Per-day growth, and the rounding floor that decides whether a daily number may be spoken.
 *
 * YouTube rounds `subscriberCount` to three significant figures for every channel you do not own,
 * so the bucket is about 0.1% of the count — 100 at 69,500 subs. A channel growing 114 a day moves
 * roughly one bucket a day, and a bare daily figure over that would be quantization noise wearing
 * a measurement's clothes.
 *
 * The rest of the board already answers this: a delta under five buckets renders `< N` rather than
 * a number (see `CLAUDE.md`, "Easy to break"). The same bar applies here, per day. A point under it
 * is not zero and it is not the number shown — it is unresolved, and the chart draws the band it
 * could really sit anywhere inside.
 *
 * `view_count` is exact and takes no band at all. A one-view day is a real one-view day.
 */

export interface SeriesPoint {
  date: string
  value: number
}

export interface DailyPoint extends SeriesPoint {
  /** change since the previous held day. Null on the first, which has nothing behind it. */
  delta: number | null
  /** whether that change is smaller than the rounding can resolve */
  belowFloor: boolean
  /** the quantization width this reading carries. 0 when the count is exact. */
  band: number
}

/** Five buckets, the same bar every other delta on this board clears before it prints a number. */
export const FLOOR_BUCKETS = 5

export function noiseFloor(bucket: number | null): number {
  return bucket === null ? 0 : bucket * FLOOR_BUCKETS
}

export function dailySeries(points: SeriesPoint[], bucket: number | null): DailyPoint[] {
  const floor = noiseFloor(bucket)
  const band = bucket ?? 0
  return points.map((p, i) => {
    const delta = i === 0 ? null : p.value - points[i - 1].value
    return {
      ...p,
      delta,
      // A zero floor can never be cleared from below, so an exact count is never marked — which
      // is the point: `Math.abs(x) < 0` is false for every x, including 0.
      belowFloor: delta !== null && Math.abs(delta) < floor,
      band,
    }
  })
}

/**
 * Calendar days between the first and last held day, not the number of points.
 *
 * A window with a missed sweep has fewer points than days, and dividing by points would spread the
 * same move over fewer gaps and report a faster channel than the one being measured.
 */
export function daySpan(points: SeriesPoint[]): number {
  if (points.length < 2) return 0
  const first = Date.parse(points[0].date)
  const last = Date.parse(points[points.length - 1].date)
  if (!Number.isFinite(first) || !Number.isFinite(last)) return 0
  return (last - first) / 86_400_000
}

/**
 * The window's average daily change: the whole move divided by the days it took.
 *
 * The per-day headline used to be the median of the days that cleared the floor, which on a channel
 * where half the days cannot be resolved is the median of the *big* days and nothing else. Austin
 * Marchese's 90-day window drops 46 of its 90 days that way and leads with +900 for a channel that
 * actually averaged +708 — the excluded days are excluded precisely because they were small, so the
 * censoring only ever biases upward. A censored median also has no honest name: it is neither the
 * typical day nor the average one.
 *
 * The average needs only the two endpoints, so it inherits one bucket of rounding at each end
 * rather than one on every day — ±100 against a 63,700 move. That is a number this data supports.
 *
 * Null when there is no span to divide by, which is a state, not a zero.
 */
export function perDayAverage(points: SeriesPoint[]): number | null {
  const span = daySpan(points)
  if (span <= 0) return null
  return (points[points.length - 1].value - points[0].value) / span
}

/**
 * Daily change expressed per 1,000 of the count it grew from.
 *
 * The per-day overlay is unreadable in absolute terms: Austin Marchese's 3,600-subscriber day sets
 * the axis and pins Eric's whole line to the baseline, so the smaller channel — the one being
 * compared — has no visible shape. Indexing, which fixes exactly this on the cumulative plot, does
 * not apply to a series of deltas: there is no meaningful "first day = 100" for a difference.
 *
 * Dividing by the base count is the normalization that does apply. It turns "who added more people"
 * into "who grew faster relative to their size", which is the question an overlay is asked.
 *
 * The first day has no delta, and a day growing from nothing has no rate, so both are dropped
 * rather than rendered as zero.
 */
export function perDayPerThousand(points: SeriesPoint[]): SeriesPoint[] {
  const out: SeriesPoint[] = []
  for (let i = 1; i < points.length; i++) {
    const base = points[i - 1].value
    if (base <= 0) continue
    out.push({ date: points[i].date, value: ((points[i].value - base) / base) * 1000 })
  }
  return out
}

/**
 * Round values to label a y-axis with, spanning the data at a human interval.
 *
 * The chart had no vertical scale at all, so a spike could be 1,000 or 4,000 and the only way to
 * find out was to hover it. Steps are 1, 2, or 5 times a power of ten — the intervals a reader
 * already divides by without thinking.
 */
export function axisTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || count < 2) return []
  const span = max - min
  if (span <= 0) return [min]
  // Divided by `count`, not `count - 1`. Gaps-between-ticks is the intuitive reading and it is the
  // wrong one here: rounding a step *up* to the next round number always yields fewer ticks than
  // asked for, so starting from the wider estimate left a 0-3,600 axis with two gridlines on it.
  const rough = span / count
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + step / 1000; v += step) out.push(v)
  return out
}

export interface UploadMark {
  /** how far along the plotted series this upload sits, 0-100 */
  pct: number
  /** which plotted point it lands on, so a dot can be drawn at that point's own value */
  index: number
  date: string
}

/**
 * Where each upload falls along the plotted series.
 *
 * Ticks only. The card draws them under the axis and says nothing about them, because a subscriber
 * jump on the day after an upload is an adjacency and not a cause, and this board does not render
 * an inference in a measurement's clothes. A reader can see the alignment and draw their own line;
 * the chart will not draw it for them.
 *
 * Placed by index for the same reason `monthTicks` is: the line is plotted by index, so a series
 * with a missing day draws its neighbours adjacent and a mark placed by elapsed date would sit
 * beside the wrong point.
 */
export function uploadMarks(points: SeriesPoint[], published: string[]): UploadMark[] {
  if (points.length < 2) return []
  const days = points.map((p) => p.date.slice(0, 10))
  const span = points.length - 1
  const seen = new Set<string>()
  const out: UploadMark[] = []
  for (const raw of published) {
    const day = raw.slice(0, 10)
    if (day < days[0] || day > days[span] || seen.has(day)) continue
    seen.add(day)
    // The first held day on or after the upload. A sweep can miss a day, and an upload on a missed
    // day belongs at the next point the chart actually draws rather than nowhere.
    const i = days.findIndex((d) => d >= day)
    if (i >= 0) out.push({ pct: (i / span) * 100, index: i, date: day })
  }
  return out.sort((a, b) => a.pct - b.pct)
}

/**
 * Every series rebased to 100 at the window's first held day.
 *
 * The default for comparison, because an absolute axis holding Eric at 69,500 against Matt Pocock
 * at 328,000 draws one flat line and one that fills the card, and the shape of the smaller
 * channel — the thing being compared — becomes unreadable. Indexed, both curves answer the
 * question actually being asked: which one grew faster.
 */
export function indexedToStart(points: SeriesPoint[]): SeriesPoint[] {
  const first = points[0]?.value
  // No ratio exists against zero, and inventing one would put a channel that started from nothing
  // at an infinite multiple of itself.
  if (!first) return []
  return points.map((p) => ({ date: p.date, value: (p.value / first) * 100 }))
}

export interface MonthTick {
  /** "Jun", or "Jan 26" when the window crosses a year and the month alone is ambiguous */
  label: string
  /** how far along the plotted series this boundary sits, 0-100 */
  pct: number
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const

/**
 * Where each month starts, as a percentage along the series.
 *
 * Ticked by index rather than by elapsed time, because the line is plotted by index too — a
 * series with a missing day draws its neighbours adjacent, and a tick placed by date would sit
 * next to the wrong point. The first point's own month is never ticked: the left edge already
 * carries its full date, and a label on top of it would name the same thing twice.
 */
export function monthTicks(points: SeriesPoint[]): MonthTick[] {
  if (points.length < 2) return []
  const out: MonthTick[] = []
  const span = points.length - 1
  for (let i = 1; i < points.length; i++) {
    const [year, month] = points[i].date.split("-")
    const [prevYear, prevMonth] = points[i - 1].date.split("-")
    if (month === prevMonth && year === prevYear) continue
    const name = MONTHS[Number(month) - 1] ?? month
    // The year rides along only when the window actually crosses one. "Jan" inside a single year
    // needs no disambiguation, and "Jun 26" on a 90-day window is noise.
    const crossesYear = year !== prevYear
    out.push({ label: crossesYear ? `${name} ${year.slice(2)}` : name, pct: (i / span) * 100 })
  }
  return out
}

/** A visible slice of the windowed series, as inclusive indices into it. */
export type Range = [number, number]

/** Below this the chart is a handful of points and further zoom tells you nothing. */
export const MIN_RANGE = 4

export function clampRange([a, b]: Range, length: number): Range {
  const last = Math.max(length - 1, 0)
  let start = Math.max(0, Math.min(Math.round(a), last))
  let end = Math.max(0, Math.min(Math.round(b), last))
  if (start > end) [start, end] = [end, start]
  // Widen rather than reject, and widen away from whichever edge has room, so a drag near the end
  // of the chart still zooms instead of silently doing nothing.
  const short = Math.min(MIN_RANGE, last) - (end - start)
  if (short > 0) {
    start = Math.max(0, start - Math.ceil(short / 2))
    end = Math.min(last, start + Math.min(MIN_RANGE, last))
    start = Math.max(0, end - Math.min(MIN_RANGE, last))
  }
  return [start, end]
}

/**
 * The range a drag across the visible plot selects, mapped back to the full series.
 *
 * Fractions arrive relative to what is currently drawn, so zooming twice composes: the second
 * selection is a fraction of the first slice, not of the whole window.
 */
export function rangeFromDrag(view: Range, from: number, to: number, length: number): Range {
  const [start, end] = view
  const span = end - start
  const lo = Math.min(from, to)
  const hi = Math.max(from, to)
  return clampRange([start + lo * span, start + hi * span], length)
}

/**
 * Zoom about a point, the way a chart under a scroll wheel behaves: whatever sits under the
 * cursor stays under the cursor, and the range shrinks or grows around it.
 *
 * `factor` below 1 zooms in. `at` is where the cursor sits in the visible plot, 0 to 1.
 */
export function zoomAbout(view: Range, at: number, factor: number, length: number): Range {
  const [start, end] = view
  const span = end - start
  const anchor = start + at * span
  const next = span * factor
  return clampRange([anchor - at * next, anchor + (1 - at) * next], length)
}

/** Which point a pointer at `fraction` (0 at the left edge, 1 at the right) is nearest to. */
export function nearestIndex(points: SeriesPoint[], fraction: number): number | null {
  if (points.length === 0) return null
  const last = points.length - 1
  return Math.max(0, Math.min(last, Math.round(fraction * last)))
}
