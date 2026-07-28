"use client"

import { useState } from "react"
import type { ChainEdge } from "@/lib/types"
import { VERB, verbClass, visibleEdges } from "@/lib/chain"
import { fmtDate } from "@/lib/trust"

function pad(s: string, n: number) {
  return s.length >= n ? s : s + " ".repeat(n - s.length)
}

function padStart(s: string, n: number) {
  return s.length >= n ? s : " ".repeat(n - s.length) + s
}

/** The fork, drawn as a terminal diagram. Click a row for the exact words. */
export function ChainMap({ edges }: { edges: ChainEdge[] }) {
  const rows = visibleEdges(edges)
  const [open, setOpen] = useState<ChainEdge | null>(null)
  if (rows.length === 0) return null

  const nameW = Math.max(...rows.flatMap((e) => [e.from.length, e.to.length]))
  const verbW = Math.max(...Object.values(VERB).map((v) => v.length))

  return (
    <div className="card pad">
      <div className="chain">
        {rows.map((e, i) => (
          <button key={i} type="button" className="row" onClick={() => setOpen(e)}>
            <span className="dim">{padStart(e.from, nameW)}</span>
            <span className="dim">{" ──"}</span>
            <span className={verbClass(e.relation)}>{pad(VERB[e.relation], verbW)}</span>
            <span className="dim">{"──▶ "}</span>
            <span>{pad(e.to, nameW)}</span>
            {e.cites.length > 1 && <span className="dim"> ×{e.cites.length}</span>}
          </button>
        ))}
      </div>
      <p className="note">click any row for the exact words they said</p>
      {open && <CiteDialog edge={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function CiteDialog({ edge, onClose }: { edge: ChainEdge; onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="dialogbox" onClick={(e) => e.stopPropagation()}>
        <p className="kicker">
          {edge.from} {VERB[edge.relation]} {edge.to}
        </p>
        <p className="note">
          {edge.cites.length === 1
            ? "Said once, by one person."
            : `Said ${edge.cites.length} times by ${edge.voices} ${
                edge.voices === 1 ? "person" : "people"
              }.`}{" "}
          A claim they made, not a verified fact.
        </p>
        {edge.cites.map((c, i) => (
          <blockquote className="quote" key={i}>
            <p>&ldquo;{c.evidence}&rdquo;</p>
            <p className="cite">
              {c.handle} · {fmtDate(c.said_on)}
              {c.url && (
                <>
                  {" · "}
                  <a href={c.url} target="_blank" rel="noreferrer">
                    open video →
                  </a>
                </>
              )}
            </p>
          </blockquote>
        ))}
        <button type="button" className="btn" onClick={onClose}>
          close
        </button>
      </div>
    </div>
  )
}
