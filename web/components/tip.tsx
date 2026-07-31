"use client"

import { useId, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useAnchoredPanel } from "./anchored"

/**
 * The disclosure behind a number.
 *
 * Every Derived-tier formula, every explanation of why a window has no number, and every column
 * definition on this board used to live in a `title` attribute. A `title` fires on pointer hover
 * and nowhere else: no browser shows it on keyboard focus and no touch device shows it at all. So
 * on a phone, a dotted-underlined number advertised a disclosure that could not be invoked — which
 * collides head-on with the invariant that a Derived claim always shows its formula.
 *
 * `useTip` gives an existing focusable element a real one; `Tip` wraps text that has no trigger of
 * its own in a button. Both render through `useAnchoredPanel`, so the panel is portalled and can
 * never contribute to a table wrapper's scroll height.
 */
export function useTip(text: string | undefined) {
  const id = useId()
  const { anchor, panel, isOpen, open, close } = useAnchoredPanel<HTMLButtonElement, HTMLSpanElement>(
    "below"
  )

  if (!text) {
    return { ref: anchor, triggerProps: {}, tip: null, open: false }
  }

  return {
    ref: anchor,
    triggerProps: {
      // aria-describedby rather than aria-label: the number stays the accessible name and the
      // formula is announced after it, which is the same order a sighted reader gets.
      "aria-describedby": isOpen ? id : undefined,
      onPointerEnter: open,
      onPointerLeave: close,
      onFocus: open,
      onBlur: close,
      // Escape is the dismissal WCAG 1.4.13 asks for, and the only one a keyboard has here.
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Escape") close()
      },
    },
    tip:
      isOpen && typeof document !== "undefined"
        ? createPortal(
            <span ref={panel} className="tipnote" role="tooltip" id={id}>
              {text}
            </span>,
            document.body
          )
        : null,
    open: isOpen,
  }
}

/**
 * A tip on content that has no interactive element of its own. The trigger is a real button
 * because that is what makes it reachable: a `tabindex` span is not a control, and on touch a
 * button is the difference between a tap that opens the explanation and a tap that does nothing.
 */
export function Tip({
  text,
  className,
  children,
}: {
  text: string | undefined
  className?: string
  children: ReactNode
}) {
  const { ref, triggerProps, tip, open } = useTip(text)
  if (!text) return <span className={className}>{children}</span>
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={className ? `tipbtn ${className}` : "tipbtn"}
        aria-expanded={open}
        {...triggerProps}
      >
        {children}
      </button>
      {tip}
    </>
  )
}
