import { describe, expect, it } from "vitest"
import { parseWindow, withWindow } from "./window"

describe("parseWindow", () => {
  it("accepts every real window key", () => {
    expect(parseWindow("7d")).toBe("7d")
    expect(parseWindow("365d")).toBe("365d")
  })

  it("falls back when the param is missing", () => {
    expect(parseWindow(undefined)).toBe("90d")
  })

  it("falls back when the param is junk rather than throwing", () => {
    expect(parseWindow("42d")).toBe("90d")
    expect(parseWindow("")).toBe("90d")
  })

  it("honours an explicit fallback", () => {
    expect(parseWindow(undefined, "30d")).toBe("30d")
  })
})

describe("withWindow", () => {
  it("adds the param to a bare path", () => {
    expect(withWindow("/compare", "30d")).toBe("/compare?w=30d")
  })

  it("appends to a path that already has params", () => {
    expect(withWindow("/compare?a=UC123", "30d")).toBe("/compare?a=UC123&w=30d")
  })

  it("replaces an existing window rather than adding a second", () => {
    expect(withWindow("/compare?w=7d&a=UC123", "30d")).toBe("/compare?w=30d&a=UC123")
  })
})
