// The parent rollup: videos per week across all children. Weeks start Monday
// UTC. Counting Oracle publish dates is free arithmetic; the sentence below
// the chart is Derived and renders with its formula.

export interface WeekPoint {
  week_start: string
  count: number
}

function startOfWeek(d: Date): Date {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dow = (out.getUTCDay() + 6) % 7
  out.setUTCDate(out.getUTCDate() - dow)
  return out
}

export function videosPerWeek(
  publishedAts: string[],
  weeks: number,
  now: Date = new Date()
): WeekPoint[] {
  const end = startOfWeek(now)
  const points: WeekPoint[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(end)
    start.setUTCDate(start.getUTCDate() - 7 * i)
    points.push({ week_start: start.toISOString().slice(0, 10), count: 0 })
  }
  const first = new Date(points[0].week_start + "T00:00:00Z")
  for (const iso of publishedAts) {
    const w = startOfWeek(new Date(iso))
    if (w < first) continue
    const idx = Math.round((w.getTime() - first.getTime()) / (7 * 86_400_000))
    if (idx >= 0 && idx < points.length) points[idx].count++
  }
  return points
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

export function rollupLine(points: WeekPoint[]): string | null {
  if (points.length < 2) return null
  const latest = points[points.length - 1]
  const earliest = points[0]
  const month = MONTHS[new Date(earliest.week_start + "T00:00:00Z").getUTCMonth()]
  const dir = latest.count >= earliest.count ? "up" : "down"
  return `${latest.count} videos/wk across this branch, ${dir} from ${earliest.count} in ${month}.`
}
