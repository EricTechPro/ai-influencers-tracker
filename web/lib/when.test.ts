/**
 * How a card says when a video went up.
 *
 * "54d" is a number you have to convert before you can use it. YouTube says "2 months ago"
 * because that is the unit a person actually thinks in, and the exact date rides along for when
 * the rounding is not enough.
 */
import { describe, expect, it } from "vitest"
import { dateText, whenText } from "./when"

const now = new Date("2026-08-02T12:00:00Z")

describe("whenText", () => {
  it("says today rather than 0 days ago", () => {
    expect(whenText("2026-08-02T01:00:00Z", now)).toBe("today")
  })

  it("counts single days up to a week", () => {
    expect(whenText("2026-08-01T01:00:00Z", now)).toBe("1 day ago")
    expect(whenText("2026-07-28T01:00:00Z", now)).toBe("5 days ago")
  })

  it("switches to weeks once there is more than one", () => {
    expect(whenText("2026-07-19T01:00:00Z", now)).toBe("2 weeks ago")
  })

  it("switches to months at about thirty days", () => {
    expect(whenText("2026-06-09T01:00:00Z", now)).toBe("1 month ago")
    expect(whenText("2026-05-15T01:00:00Z", now)).toBe("2 months ago")
  })

  it("switches to years once months stop being readable", () => {
    expect(whenText("2025-07-17T01:00:00Z", now)).toBe("1 year ago")
    expect(whenText("2023-05-18T01:00:00Z", now)).toBe("3 years ago")
  })

  it("never counts backwards from a clock that is behind the data", () => {
    // _db anchors to midnight UTC; a video published later the same day must not read "-1 days".
    expect(whenText("2026-08-02T23:00:00Z", now)).toBe("today")
  })

  it("says so plainly when there is no date at all", () => {
    expect(whenText(null, now)).toBe("no date")
  })
})

describe("dateText", () => {
  it("spells the month, because 7/17 and 17/7 are the same string to different readers", () => {
    expect(dateText("2025-07-17T01:00:00Z")).toBe("Jul 17, 2025")
  })

  it("says so plainly when there is no date", () => {
    expect(dateText(null)).toBe("no date")
  })
})
