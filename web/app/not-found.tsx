import Link from "next/link"

export default function NotFound() {
  return (
    <div className="empty" style={{ marginTop: "3rem" }}>
      no such page
      <br />
      <Link href="/">back to home</Link>
    </div>
  )
}
