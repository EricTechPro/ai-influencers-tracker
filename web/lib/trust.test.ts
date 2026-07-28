import { describe, expect, it } from "vitest"
import { loadOpportunities } from "./bundles"
import {
  agoText,
  bucketText,
  capDeltaText,
  capPctText,
  compactM,
  compactSigned,
  deltaText,
  fmtDate,
  fmtInt,
  heroScale,
  initials,
  pctText,
  scoreText,
  signedInt,
  signedPct,
  VERDICT_CLASS,
  VERDICT_LABEL,
  VERDICT_RANK,
} from "./trust"
import type { StateCell } from "./types"

const ok = (value: number, bucket?: number): StateCell => ({ state: "ok", value, bucket })
const bounded = (upper: number): StateCell => ({ state: "bounded", value: null, upper })
const building = (have: number, need: number): StateCell => ({
  state: "building",
  value: null,
  have,
  need,
})

describe("deltaText: a bounded delta renders < N and never a bare number", () => {
  it("measured", () => {
    expect(deltaText(ok(15000))).toBe("+15,000")
    expect(deltaText(ok(-180))).toBe("-180")
  })
  it("bounded", () => {
    expect(deltaText(bounded(50000))).toBe("< 50,000")
  })
  it("bounded ignores a stray value; belt over the pipeline's braces", () => {
    expect(deltaText({ state: "bounded", value: 12345, upper: 50000 })).toBe("< 50,000")
  })
  it("building renders the window state and no number", () => {
    expect(deltaText(building(1, 90))).toBe("building, 1 of 90 days")
  })
  it("building without window bookkeeping still names its state (subs_per_1k cells)", () => {
    expect(deltaText({ state: "building", value: null })).toBe("building")
  })
  it("everything unmeasured renders --", () => {
    expect(deltaText({ state: "insufficient_data", value: null })).toBe("--")
    expect(deltaText({ state: "unavailable", value: null })).toBe("--")
    expect(deltaText({ state: "no_baseline", value: null })).toBe("--")
  })
})

describe("pctText", () => {
  it("measured growth is a signed percent", () => {
    expect(pctText(ok(0.074))).toBe("+7.4%")
    expect(pctText(ok(-0.021))).toBe("-2.1%")
  })
  it("bounded growth renders < N%", () => {
    expect(pctText(bounded(0.02))).toBe("< 2.0%")
  })
  it("building matches deltaText exactly", () => {
    expect(pctText(building(1, 90))).toBe("building, 1 of 90 days")
  })
})

describe("scoreText: only a full / 100 may omit its denominator", () => {
  it("full score", () => {
    expect(scoreText({ components: [], out_of: 100, value: 71.9 })).toBe("71.9")
  })
  it("partial score renders its denominator inline", () => {
    expect(scoreText({ components: [], out_of: 75, value: 40.3 })).toBe("40.3 / 75")
  })
  it("INSUFFICIENT_DATA scores --, never 0", () => {
    expect(scoreText({ components: [], out_of: null, value: null })).toBe("--")
  })
})

describe("formatting helpers", () => {
  it("fmtInt and signedInt", () => {
    expect(fmtInt(2940000)).toBe("2,940,000")
    expect(signedInt(0)).toBe("+0")
  })
  it("signedPct", () => {
    expect(signedPct(0.074)).toBe("+7.4%")
  })
  it("compactM renders millions like the wireframe", () => {
    expect(compactM(3100000)).toBe("+3.1M")
    expect(compactM(20000)).toBe("+0.02M")
    expect(compactM(-1200000)).toBe("-1.2M")
  })
  it("bucketText always discloses the bucket", () => {
    expect(bucketText(1000)).toBe("±1,000")
    expect(bucketText(null)).toBe("")
  })
  it("fmtDate and agoText", () => {
    expect(fmtDate("2026-07-18T13:00:11Z")).toBe("2026-07-18")
    expect(fmtDate(null)).toBe("--")
    expect(agoText("2026-07-22T00:00:00Z", new Date("2026-07-28T12:00:00Z"))).toBe("6d")
    expect(agoText(null)).toBe("never")
  })
  it("initials", () => {
    expect(initials("Dan Martell")).toBe("DM")
    expect(initials("AICodeKing")).toBe("A")
  })
})

describe("card capping: the hero number never outgrows its card", () => {
  it("a percent under the cap is untouched, digit for digit", () => {
    expect(capPctText(ok(0.074))).toEqual({ text: "+7.4%", exact: null })
    expect(capPctText(ok(2.008))).toEqual({ text: "+200.8%", exact: null })
    expect(capPctText(ok(-9.999))).toEqual({ text: "-999.9%", exact: null })
  })
  it("past 1000% it renders a compact multiple and hands back the exact value", () => {
    expect(capPctText(ok(54.806))).toEqual({ text: "+5.5k%", exact: "+5,480.6%" })
    expect(capPctText(ok(10))).toEqual({ text: "+1.0k%", exact: "+1,000.0%" })
  })
  it("a bounded percent stays bounded through the cap", () => {
    expect(capPctText(bounded(0.02))).toEqual({ text: "< 2.0%", exact: null })
    expect(capPctText(bounded(12))).toEqual({ text: "< 1.2k%", exact: "< 1,200.0%" })
  })
  it("building and unmeasured states pass through as themselves, never a number", () => {
    expect(capPctText(building(1, 90))).toEqual({ text: "building, 1 of 90 days", exact: null })
    expect(capPctText({ state: "unavailable", value: null })).toEqual({ text: "--", exact: null })
  })

  it("a delta under 100k keeps every digit", () => {
    expect(capDeltaText(ok(36800))).toEqual({ text: "+36,800", exact: null })
    expect(capDeltaText(ok(-99999))).toEqual({ text: "-99,999", exact: null })
  })
  it("past 100k it compacts, and past 1M it goes to millions", () => {
    expect(capDeltaText(ok(123400))).toEqual({ text: "+123k", exact: "+123,400" })
    expect(capDeltaText(ok(1230000))).toEqual({ text: "+1.23M", exact: "+1,230,000" })
  })
  it("a bounded delta stays bounded through the cap", () => {
    expect(capDeltaText(bounded(1230000))).toEqual({ text: "< 1.23M", exact: "< 1,230,000" })
  })

  it("compactSigned is the shared rounding rule underneath both", () => {
    expect(compactSigned(999)).toBe("+999")
    expect(compactSigned(100000)).toBe("+100k")
    expect(compactSigned(-2940000)).toBe("-2.94M")
  })

  it("heroScale shrinks only once a value is genuinely long", () => {
    expect(heroScale("+7.4%")).toBe(1)
    expect(heroScale("+200.8%")).toBe(1)
    expect(heroScale("building, 1 of 90 days")).toBeLessThan(1)
    expect(heroScale("+5.5k%")).toBe(1)
  })
})

describe("verdict maps", () => {
  it("cover every verdict in the live bundle", () => {
    for (const r of loadOpportunities().rows) {
      expect(VERDICT_CLASS[r.verdict]).toBeTruthy()
      expect(VERDICT_LABEL[r.verdict]).toBeTruthy()
      expect(VERDICT_RANK[r.verdict]).toBeGreaterThanOrEqual(0)
    }
  })
  it("SKIP wears the crowded hue and INSUFFICIENT_DATA renders shortened", () => {
    expect(VERDICT_CLASS.SKIP).toBe("v-crowded")
    // Labels read as instructions now, not as enum members. The keys are the
    // pipeline's contract and stay SCREAMING_SNAKE_CASE; only the words move.
    expect(VERDICT_LABEL.INSUFFICIENT_DATA).toBe("not enough data")
    expect(VERDICT_LABEL.MAKE_THIS_NOW).toBe("make this now")
    expect(Object.values(VERDICT_LABEL).every((l) => l === l.toLowerCase())).toBe(true)
    expect(VERDICT_RANK.MAKE_THIS_NOW).toBeGreaterThan(VERDICT_RANK.ONLY_IF_UNSERVED)
    expect(VERDICT_RANK.ONLY_IF_UNSERVED).toBeGreaterThan(VERDICT_RANK.TOO_EARLY)
    expect(VERDICT_RANK.TOO_EARLY).toBeGreaterThan(VERDICT_RANK.SKIP)
    expect(VERDICT_RANK.SKIP).toBeGreaterThan(VERDICT_RANK.INSUFFICIENT_DATA)
  })
})
