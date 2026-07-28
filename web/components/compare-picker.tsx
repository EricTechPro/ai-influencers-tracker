"use client"

import { useRouter, useSearchParams } from "next/navigation"

export function ComparePicker({
  side,
  value,
  options,
  selfId,
}: {
  side: "a" | "b"
  value: string
  options: { channel_id: string; name: string; is_self: boolean }[]
  selfId: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  return (
    <select
      className="chip"
      value={value}
      aria-label={side === "a" ? "left channel" : "right channel"}
      onChange={(e) => {
        const next = new URLSearchParams(params.toString())
        next.set(side, e.target.value)
        router.replace(`/compare?${next.toString()}`)
      }}
    >
      {options.map((o) => (
        <option key={o.channel_id} value={o.channel_id}>
          {o.name}{o.channel_id === selfId ? " ★ you" : ""}
        </option>
      ))}
    </select>
  )
}
