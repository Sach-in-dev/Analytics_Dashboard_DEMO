import { NextResponse } from "next/server"

export const runtime = "nodejs"

// DEMO BUILD — this route is unused by the current UI (no page calls it),
// but it previously made a live call to a real self-hosted Umami instance.
// Neutralized here so no code path in this demo deployment can ever reach
// a real analytics account, even accidentally.

export async function POST() {
  return NextResponse.json({
    success: true,
    data: { source: [], medium: [] },
  })
}
