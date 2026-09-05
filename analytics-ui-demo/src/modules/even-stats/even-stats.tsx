"use client"

import { useEffect, useState } from "react"

interface EventStat {
  eventName: string
  total: number
  percentage: number
}

export function EventStats({ startAt, endAt }: { startAt: number; endAt: number }) {
  const [stats, setStats] = useState<EventStat[]>([])

  useEffect(() => {
    fetch(
      `/api/analytics/umami/event-stats?startAt=${startAt}&endAt=${endAt}`
    )
      .then((r) => r.json())
      .then(setStats)
  }, [startAt, endAt])

  return (
    <div className="space-y-3">
      {stats.map((s) => (
        <div key={s.eventName} className="flex items-center justify-between">
          <span className="text-sm">{s.eventName}</span>

          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">{s.total}</span>
            <span className="text-xs text-muted-foreground">
              {s.percentage}%
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
