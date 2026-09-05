import { NextResponse } from "next/server"

// DEMO BUILD — this route never calls the real self-hosted Umami instance
// (no credentials are configured for this deployment). It returns
// deterministic synthetic website-event data in the exact shape the
// Events page expects, so the "Website" tab renders realistically without
// ever reaching out to a live analytics account.

const EVENT_NAMES = [
  "Viewed Product",
  "Added to Cart",
  "Started Checkout",
  "Purchase Completed",
  "Viewed Collection",
  "Searched",
  "Applied Coupon",
  "Signed Up",
  "Subscribed to Newsletter",
  "Viewed Cart",
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
  try {
    const { searchParams } = new URL(req.url)
    const endAt = Number(searchParams.get("endAt") ?? Date.now())
    const startAt = Number(searchParams.get("startAt") ?? endAt - 30 * 86400000)
    const days = Math.max(1, Math.round((endAt - startAt) / 86400000))

    const rand = seededRandom(startAt + days)
    const weights = [30, 17, 10, 6, 14, 12, 5, 4, 3, 9]
    const totalWeight = weights.reduce((a, b) => a + b, 0)
    const dailyPageviews = 1800 + Math.round(rand() * 600)
    const totalPageviews = dailyPageviews * days

    const raw = EVENT_NAMES.map((name, i) => ({
      eventName: name,
      count: Math.round((weights[i] / totalWeight) * totalPageviews * 0.6 * (0.85 + rand() * 0.3)),
    }))
    const totalEvents = raw.reduce((s, e) => s + e.count, 0)
    const data = raw
      .map((e) => ({
        ...e,
        percentage: totalEvents > 0 ? Math.round((e.count / totalEvents) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.count - a.count)

    const visitors = Math.round(totalPageviews / (2.3 + rand()))
    const visits = Math.round(visitors * (1.15 + rand() * 0.2))

    return NextResponse.json({
      success: true,
      data,
      count: data.length,
      totalEvents,
      stats: {
        pageviews: totalPageviews,
        visitors,
        visits,
        bounces: Math.round(visits * (0.3 + rand() * 0.15)),
        totaltime: Math.round(visits * (95 + rand() * 60)),
      },
      range: { startAt: String(startAt), endAt: String(endAt) },
    })
  } catch (error) {
    console.error("[demo] events route error", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
