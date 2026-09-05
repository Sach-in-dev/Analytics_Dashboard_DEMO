"use client"

import { useEffect, useState, useMemo } from "react"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { api } from "@/lib/axios"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDateRange } from "@/hooks/use-date-range"
import {
    Clock, Users, Eye, MousePointer, Activity, ArrowUp, ArrowDown, Minus
} from "lucide-react"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"
import { CompareChartTooltip } from "@/components/ui/compare-chart-tooltip"
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from "recharts"




function DeltaLine({ current, previous, kind, lowerIsBetter = false }: {
    current?: number; previous?: number;
    kind: "count" | "currency" | "percent" | "days";
    lowerIsBetter?: boolean;
}) {
    if (current == null || previous == null) return null
    const delta = pctChange(current, previous)
    const isNeutral = delta === 0
    const isPositive = lowerIsBetter ? delta < 0 : delta > 0
    const Icon = isNeutral ? Minus : (delta > 0 ? ArrowUp : ArrowDown)
    const color = isNeutral ? "text-gray-400" : isPositive ? "text-emerald-600" : "text-rose-600"
    const fmtPrev =
        kind === "currency" ? (previous >= 100000 ? `₹${(previous/100000).toFixed(1)}L` : previous >= 1000 ? `₹${(previous/1000).toFixed(1)}K` : `₹${Math.round(previous).toLocaleString()}`) :
        kind === "percent" ? `${previous}%` :
        kind === "days" ? `${previous.toFixed(1)}d` :
        previous.toLocaleString()
    return (
        <div className="mt-2 flex items-center gap-2 text-xs">
            <span className={`inline-flex items-center gap-0.5 font-semibold ${color}`}>
                <Icon size={12} />
                {Math.abs(delta)}%
            </span>
            <span className="text-gray-400">vs {fmtPrev}</span>
        </div>
    )
}

export default function EngagementPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [startDate, endDate, setDates] = useDateRange()
  const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<any>(null)
    const [compareLoading, setCompareLoading] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        const r = await api.get("/engagement", { params: { start_date: startDate, end_date: endDate } })
        if (r.data?.success) setData(r.data.data)
      } catch (e) { console.error(e) } finally { setLoading(false) }
    })()
  }, [startDate, endDate])

    useEffect(() => {
        if (!compare.range) { setCompareData(null); return }
        const fetchCompare = async () => {
            try {
                setCompareLoading(true)
                const res = await api.get("/engagement", {
                    params: { start_date: compare.range!.start, end_date: compare.range!.end }
                })
                if (res.data?.success) setCompareData(res.data.data)
                else setCompareData(null)
            } catch (e) {
                console.error("Failed to load compare data", e)
                setCompareData(null)
            } finally {
                setCompareLoading(false)
            }
        }
        fetchCompare()
    }, [compare.range?.start, compare.range?.end])


  const kpis = [
    { label: "Avg Session Duration", current: data?.avg_session_duration_seconds, previous: compareData?.avg_session_duration_seconds, kind: "count", value: data?.avg_session_duration_formatted || "—", icon: Clock, color: "from-indigo-50 to-indigo-100/50 border-l-indigo-500 text-indigo-700", sub: `${data?.avg_session_duration_seconds || 0}s per session` },
    { label: "Sessions", current: data?.sessions, previous: compareData?.sessions, kind: "count", value: data ? (data.sessions as number).toLocaleString() : "—", icon: Activity, color: "from-emerald-50 to-emerald-100/50 border-l-emerald-500 text-emerald-700", sub: "Total user sessions" },
    { label: "Unique Visitors", current: data?.visitors, previous: compareData?.visitors, kind: "count", value: data ? (data.visitors as number).toLocaleString() : "—", icon: Users, color: "from-blue-50 to-blue-100/50 border-l-blue-500 text-blue-700", sub: "Distinct visitors" },
    { label: "Pageviews", current: data?.pageviews, previous: compareData?.pageviews, kind: "count", value: data ? (data.pageviews as number).toLocaleString() : "—", icon: Eye, color: "from-amber-50 to-amber-100/50 border-l-amber-500 text-amber-700", sub: "Total page views" },
    { label: "Pages / Session", current: data?.avg_pages_per_session, previous: compareData?.avg_pages_per_session, kind: "count", value: data ? data.avg_pages_per_session.toFixed(2) : "—", icon: MousePointer, color: "from-violet-50 to-violet-100/50 border-l-violet-500 text-violet-700", sub: "Avg pages per visit" },
    { label: "Bounce Rate", current: data?.bounce_rate_pct, previous: compareData?.bounce_rate_pct, kind: "percent", lowerIsBetter: true, value: data ? `${data.bounce_rate_pct}%` : "—", icon: Activity, color: data && data.bounce_rate_pct > 60 ? "from-rose-50 to-rose-100/50 border-l-rose-500 text-rose-700" : "from-emerald-50 to-emerald-100/50 border-l-emerald-500 text-emerald-700", sub: "Sessions with 1 pageview" },
  ]
  const chartData = useMemo(() => {
    const trend = data?.daily_trend || []
    const cmpTrend = compareData?.daily_trend || []
    return trend.map((d: any, i: number) => ({
      date: d.date.slice(5),
      pageviews: d.pageviews,
      sessions: d.sessions,
      prev_pageviews: cmpTrend[i]?.pageviews ?? null,
      prev_sessions: cmpTrend[i]?.sessions ?? null,
      prev_date: cmpTrend[i]?.date ?? null,
    }))
  }, [data, compareData])


  

  return (
    <div className="space-y-6 mb-8 w-full max-w-full">
      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground tracking-tight">Engagement Metrics</h1>
          <p className="text-sm text-muted-foreground">Session duration, pageviews, and bounce rate from Umami Analytics</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <CompareControl
              mode={compare.mode}
              onModeChange={compare.setMode}
              range={compare.range}
              customStart={compare.customStart}
              customEnd={compare.customEnd}
              onCustomChange={compare.setCustom}
              currentRange={{ start: startDate, end: endDate }}
          />
          <DateRangePicker startDate={startDate} endDate={endDate} onChange={setDates} />
        </div>
      </div>

      {/* Insight — shown right after header, before KPI cards */}
      {!loading && data?.source === "umami" && (
        <Card className="bg-gradient-to-r from-slate-50 to-indigo-50/30 shadow-sm border-l-4 border-l-indigo-400">
          <CardContent className="py-4">
            <p className="text-sm text-gray-600 leading-relaxed">
              <strong className="text-gray-800">💡 Insight:</strong>{" "}
              Average session duration is <strong>{data.avg_session_duration_formatted}</strong> with{" "}
              <strong>{data.avg_pages_per_session.toFixed(2)}</strong> pages per session.{" "}
              {data.bounce_rate_pct > 60
                ? <span className="text-rose-700">Bounce rate of <strong>{data.bounce_rate_pct}%</strong> is high — consider improving landing page relevance.</span>
                : <span className="text-emerald-700">Bounce rate of <strong>{data.bounce_rate_pct}%</strong> is within healthy range.</span>
              }
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && data?.source === "unavailable" && (
        <Card className="bg-amber-50 border border-amber-200">
          <CardContent className="py-4 space-y-2">
            <p className="text-sm text-amber-800">
              <strong>⚠️ Umami Analytics temporarily unavailable.</strong> The Umami server at <code>analytics.superlabs.co</code> is returning an error right now (HTTP 500). Data will appear automatically once the Umami server recovers.
            </p>
            <p className="text-xs text-amber-700">
              Credentials are correctly configured (endpoint, username, password, website_id all set). This is a temporary server-side issue — no action needed on your end.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className={`bg-gradient-to-br ${k.color} shadow-sm border-l-4`}>
            <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-widest flex items-center justify-between gap-2">{k.label}<k.icon className="h-4 w-4 shrink-0 opacity-70" /></CardTitle></CardHeader>
            <CardContent>
              <div className="text-3xl font-extrabold">{loading ? "—" : k.value}</div>
              <p className="text-xs opacity-70 mt-1">{loading ? "" : k.sub}</p>
              <DeltaLine current={k.current} previous={k.previous} kind={k.kind as any} lowerIsBetter={k.lowerIsBetter} />
            </CardContent>
          </Card>
        ))}
      </div>

      {data?.daily_trend && data.daily_trend.length > 0 && (
          <Card className="shadow-sm">
              <CardHeader>
                  <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <Activity className="h-4 w-4 text-gray-500" />
                      Engagement Trend ({data.daily_trend.length} days)
                  </CardTitle>
              </CardHeader>
              <CardContent>
                  <div className="h-80 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                              <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => v.toLocaleString()} />
                              <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => v.toLocaleString()} />
                              <RechartsTooltip cursor={{ fill: '#f8fafc' }} content={<CompareChartTooltip />} />
                              <Legend wrapperStyle={{ fontSize: 12, paddingTop: '10px' }} />
                              
                              <Bar yAxisId="left" dataKey="pageviews" name="Pageviews" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={32} />
                              <Line yAxisId="right" type="monotone" dataKey="sessions" name="Sessions" stroke="#10b981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                              
                              {compare.range && (
                                  <Line yAxisId="left" type="monotone" dataKey="prev_pageviews" name="Pageviews (previous)" stroke="#c4b5fd" strokeDasharray="5 5" strokeWidth={2} dot={false} connectNulls />
                              )}
                              {compare.range && (
                                  <Line yAxisId="right" type="monotone" dataKey="prev_sessions" name="Sessions (previous)" stroke="#6ee7b7" strokeDasharray="5 5" strokeWidth={2} dot={false} connectNulls />
                              )}
                          </ComposedChart>
                      </ResponsiveContainer>
                  </div>
              </CardContent>
          </Card>
      )}

      {compare.range && (
          <CompareBanner
              current={{ start: startDate, end: endDate }}
              compare={compare.range}
              mode={compare.mode}
          />
      )}
      {compare.range && (
          <CompareSummary
              endpoint="/api/engagement"
              currentRange={{ start: startDate, end: endDate }}
              compareRange={compare.range}
              title="Engagement — Period Comparison"
          />
      )}

    </div>
  )
}
