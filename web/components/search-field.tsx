"use client"

import { useEffect, useId, useRef } from "react"

/**
 * The board's one search field.
 *
 * There were two. `/channels` had a bordered box and `/topics` had a ruled underline with a
 * character glyph, each written where it was needed, and the same act — narrow this list by
 * typing — looked like two different controls on two pages of one board. This is the `.tabs`
 * argument (one vocabulary for every "pick one of these") applied to the other kind of control.
 *
 * The underline lost that argument on its own merits too: it carries no left edge, so on `/topics`
 * it read as placeholder text floating at the end of the filter row rather than as a field, and
 * nothing said where to click.
 *
 * Everything the field needs sits inside its own frame — the glyph that says what it is, and one
 * trailing slot holding the `/` shortcut until you type and the clear control after, so the width
 * does not shift when the first character lands.
 */
export function SearchField({
  value,
  onChange,
  label,
  placeholder,
  className,
}: {
  value: string
  onChange: (v: string) => void
  /** The accessible name. Says what typing here searches, since the visible field has no label. */
  label: string
  placeholder: string
  className?: string
}) {
  const id = useId()
  const box = useRef<HTMLInputElement>(null)

  // `/` puts the cursor here from anywhere on the page — on a board whose lists run to dozens of
  // rows, finding one is the most frequent thing anyone does. Ignored while already typing
  // somewhere, and while a modifier is held, so it never eats a real keystroke or a browser
  // shortcut.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return
      e.preventDefault()
      box.current?.focus()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  return (
    <span className={className ? `srch ${className}` : "srch"}>
      {/* Drawn, not typed. U+2315 is not in the board's mono subset, so it fell to whatever the
          system had and rendered as an ambiguous 11px squiggle. */}
      <svg
        className="srch-glyph"
        viewBox="0 0 14 14"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      >
        <circle cx="6" cy="6" r="4.2" />
        <path d="M9.2 9.2 12.4 12.4" />
      </svg>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        ref={box}
        // type="text", not type="search": the native control hangs the browser's autofill history
        // over whatever sits below the field the moment it is focused, and it draws its own clear
        // affordance in a place and shape nothing else on this board uses. Both are ours now.
        type="text"
        className="srch-input"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault()
            onChange("")
          }
        }}
      />
      {value ? (
        <button
          type="button"
          className="srch-clear"
          aria-label="clear search"
          onClick={() => {
            onChange("")
            box.current?.focus()
          }}
        >
          ✕
        </button>
      ) : (
        <kbd className="srch-key" aria-hidden="true">
          /
        </kbd>
      )}
    </span>
  )
}
