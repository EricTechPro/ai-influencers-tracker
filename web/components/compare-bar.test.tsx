// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { compareHref } from "./compare-bar"

describe("compareHref", () => {
  it("puts the picked pair on the query in order", () => {
    expect(compareHref(["UC1", "UC2"], "SELF", "30d")).toBe("/compare?a=UC1&b=UC2&w=30d")
  })

  it("assumes you as the second side when only one is picked", () => {
    expect(compareHref(["UC1"], "SELF", "30d")).toBe("/compare?a=UC1&b=SELF&w=30d")
  })

  it("returns null with nothing picked, so the bar never renders a dead link", () => {
    expect(compareHref([], "SELF", "30d")).toBeNull()
  })

  it("does not pair you with yourself", () => {
    expect(compareHref(["SELF"], "SELF", "30d")).toBeNull()
  })

  it("refuses a blank side rather than rendering a malformed link", () => {
    expect(compareHref(["UC1"], "", "30d")).toBeNull()
  })
})
