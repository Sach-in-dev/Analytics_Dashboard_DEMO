import { NextResponse } from "next/server"

// DEMO BUILD — this route never calls the real Umami service. It returns
// deterministic synthetic event stats so the (otherwise dead/unwired) widget
// that reads it has something realistic to show instead of a live external
// call with real analytics credentials.

const EVENTS: Array<{ eventName: string; weight: number }> = [
  { eventName: "Viewed Product", weight: 32 },
  { eventName: "Added to Cart", weight: 18 },
  { eventName: "Started Checkout", weight: 11 },
  { eventName: "Purchase Completed", weight: 7 },
  { eventName: "Viewed Collection", weight: 15 },
  { eventName: "Searched", weight: 10 },
  { eventName: "Signed Up", weight: 4 },
  { eventName: "Subscribed to Newsletter", weight: 3 },
]

function seededRandom(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const startAt = Number(searchParams.get("startAt") ?? Date.now() - 30 * 86400000)
  const endAt = Number(searchParams.get("endAt") ?? Date.now())
  const days = Math.max(1, Math.round((endAt - startAt) / 86400000))

  const rand = seededRandom(startAt + days)
  const totalWeight = EVENTS.reduce((s, e) => s + e.weight, 0)
  const baseVolume = 40 * days

  const withTotals = EVENTS.map((e) => ({
    eventName: e.eventName,
    total: Math.round((e.weight / totalWeight) * baseVolume * (0.85 + rand() * 0.3)),
  }))
  const grandTotal = withTotals.reduce((s, e) => s + e.total, 0)

  const data = withTotals.map((e) => ({
    ...e,
    percentage: grandTotal > 0 ? Math.round((e.total / grandTotal) * 1000) / 10 : 0,
  }))

  return NextResponse.json(data)
}
