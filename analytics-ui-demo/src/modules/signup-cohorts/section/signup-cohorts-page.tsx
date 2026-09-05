"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/axios"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { useDateRange } from "@/hooks/use-date-range"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareBanner } from "@/components/ui/compare-control"
import {
    Users, TrendingUp, Calendar, Target, ArrowUp, ArrowDown, Minus
} from "lucide-react"

function DeltaLine({ current, previous, kind, lowerIsBetter = false }: {
    current?: number; previous?: number;
    kind: "count" | "percent";
    lowerIsBetter?: boolean;
}) {
    if (current == null || previous == null) return null
    const delta = pctChange(current, previous)
    const isNeutral = delta === 0
    const isPositive = lowerIsBetter ? delta < 0 : delta > 0
    const Icon = isNeutral ? Minus : (delta > 0 ? ArrowUp : ArrowDown)
    const color = isNeutral ? "text-gray-400" : isPositive ? "text-emerald-600" : "text-rose-600"
    const fmtPrev = kind === "percent" ? `${previous}%` : previous.toLocaleString()
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

function retentionColor(pct: number) {
  if (pct >= 60) return "bg-emerald-500"
  if (pct >= 40) return "bg-emerald-400"
  if (pct >= 25) return "bg-amber-400"
  if (pct >= 10) return "bg-orange-400"
  if (pct > 0) return "bg-rose-400"
  return "bg-gray-100"
}

export default function SignupCohortsPage() {
  const [startDate, endDate, setDates] = useDateRange()
  const compare = useCompareRange(startDate, endDate)
  const [data, setData] = useState<any>(null)
  const [compareData, setCompareData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        const r = await api.get("/signup-cohorts", {
          params: { start_month: startDate.substring(0, 7), end_month: endDate.substring(0, 7) }
        })
        if (r.data?.success) setData(r.data.data)
        
        if (compare.range) {
          const cr = await api.get("/signup-cohorts", {
            params: { start_month: compare.range.start.substring(0, 7), end_month: compare.range.end.substring(0, 7) }
          })
          if (cr.data?.success) setCompareData(cr.data.data)
        } else {
          setCompareData(null)
        }
      } catch (e) { console.error(e) } finally { setLoading(false) }
    })()
  }, [startDate, endDate, compare.range])

  const cohorts: any[] = data?.cohorts || []
  const curve: any[] = data?.retention_curve || []
  const summary = data?.summary
  const cmpSummary = compareData?.summary
  const maxIndex = Math.max(0, ...cohorts.flatMap((c: any) => c.periods.map((p: any) => p.cohort_index)))
  
  const chartData = curve.map((d: any) => {
      const match = (compareData?.retention_curve || []).find((c: any) => c.cohort_index === d.cohort_index)
      return { ...d, prev_avg_retention_pct: match?.avg_retention_pct ?? null }
  })

  return (
    <div className="space-y-6 mb-8 w-full max-w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800 tracking-tight">Signup Cohorts</h1>
          <p className="text-sm text-gray-500">Customers grouped by registration month — track purchase activity over time</p>
        </div>
        <div className="flex items-center gap-3">
          <DateRangePicker startDate={startDate} endDate={endDate} onChange={setDates} />
        </div>
      </div>
      
      {compare.range && (
          <CompareBanner
              current={{ start: startDate, end: endDate }}
              compare={compare.range}
              mode={compare.mode}
          />
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Cohorts", current: summary?.total_cohorts, previous: cmpSummary?.total_cohorts, kind: "count" as const, value: summary?.total_cohorts || 0, icon: Calendar, color: "from-indigo-50 to-indigo-100/50 border-l-indigo-500 text-indigo-700", sub: "Registration months" },
          { label: "Avg M1 Retention", current: summary?.avg_month1_retention, previous: cmpSummary?.avg_month1_retention, kind: "percent" as const, value: `${summary?.avg_month1_retention || 0}%`, icon: Repeat2Icon, color: "from-emerald-50 to-emerald-100/50 border-l-emerald-500 text-emerald-700", sub: "Month-after-signup purchase rate" },
          { label: "Best Cohort", value: summary?.best_cohort || "—", icon: Target, color: "from-amber-50 to-amber-100/50 border-l-amber-500 text-amber-700", sub: "Highest M1 retention" },
          { label: "Cohort Size (avg)", current: cohorts.length > 0 ? Math.round(cohorts.reduce((s: number, c: any) => s + c.cohort_size, 0) / cohorts.length) : undefined, previous: compareData?.cohorts?.length > 0 ? Math.round(compareData.cohorts.reduce((s: number, c: any) => s + c.cohort_size, 0) / compareData.cohorts.length) : undefined, kind: "count" as const, value: cohorts.length > 0 ? Math.round(cohorts.reduce((s: number, c: any) => s + c.cohort_size, 0) / cohorts.length).toLocaleString() : "—", icon: Users, color: "from-violet-50 to-violet-100/50 border-l-violet-500 text-violet-700", sub: "Avg signups per month" },
        ].map(k => (
          <Card key={k.label} className={`bg-gradient-to-br ${k.color} shadow-sm border-l-4`}>
            <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-widest flex items-center justify-between gap-2">{k.label}<k.icon className="h-4 w-4 shrink-0 opacity-70" /></CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold">{loading ? "—" : k.value}</div>
              <p className="text-xs opacity-70 mt-1">{k.sub}</p>
              {"current" in k && k.current !== undefined && k.kind && <DeltaLine current={k.current} previous={k.previous} kind={k.kind} lowerIsBetter={false} />}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Retention Curve */}
      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-gray-500" />Avg Retention Curve (All Cohorts)</CardTitle></CardHeader>
        <CardContent>
          {loading ? <div className="h-56 flex items-center justify-center text-gray-400 text-sm">Loading…</div> : curve.length === 0 ? <div className="h-56 flex items-center justify-center text-gray-400 text-sm">No data</div> : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="cohort_index" tickFormatter={v => `M${v}`} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} domain={[0, 100]} />
                  <Tooltip formatter={(v: any) => [`${Number(v).toFixed(1)}%`, "Avg Retention"]} labelFormatter={l => `Month ${l} after signup`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="avg_retention_pct" name="Avg Retention %" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 4, fill: "#6366f1" }} />
                  {compare.range && (
                      <Line type="monotone" dataKey="prev_avg_retention_pct" name="Avg Retention % (previous)" stroke="#a5b4fc" strokeDasharray="5 5" strokeWidth={2} dot={false} connectNulls />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cohort Heatmap */}
      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-sm font-semibold text-gray-700">Cohort Retention Heatmap</CardTitle></CardHeader>
        <CardContent>
          {loading ? <div className="h-32 flex items-center justify-center text-gray-400 text-sm">Loading…</div> : cohorts.length === 0 ? <div className="h-32 flex items-center justify-center text-gray-400 text-sm">No cohort data</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="text-left p-2 text-gray-500 font-medium w-20">Cohort</th>
                    <th className="text-center p-2 text-gray-500 font-medium w-16">Size</th>
                    {Array.from({ length: maxIndex + 1 }, (_, i) => (
                      <th key={i} className="text-center p-1.5 text-gray-500 font-medium min-w-[48px]">M{i}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cohorts.slice(-18).map((cohort: any) => {
                    const pMap: Record<number, any> = {}
                    cohort.periods.forEach((p: any) => { pMap[p.cohort_index] = p })
                    return (
                      <tr key={cohort.signup_cohort} className="border-t border-gray-100">
                        <td className="p-2 font-medium text-gray-700">{cohort.signup_cohort}</td>
                        <td className="p-2 text-center text-gray-500">{cohort.cohort_size.toLocaleString()}</td>
                        {Array.from({ length: maxIndex + 1 }, (_, i) => {
                          const p = pMap[i]
                          return (
                            <td key={i} className="p-1 text-center">
                              {p ? (
                                <div className={`${retentionColor(p.retention_pct)} rounded text-white font-semibold py-1 px-1 text-xs`} title={`${cohort.signup_cohort} M${i}: ${p.retention_pct}% (${p.active_customers} customers)`}>
                                  {p.retention_pct.toFixed(0)}%
                                </div>
                              ) : <div className="bg-gray-50 rounded py-1 px-1 text-gray-300">—</div>}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-500">Retention:</span>
                {[["≥60%", "bg-emerald-500"], ["40–60%", "bg-emerald-400"], ["25–40%", "bg-amber-400"], ["10–25%", "bg-orange-400"], ["<10%", "bg-rose-400"]].map(([label, bg]) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className={`w-3 h-3 rounded ${bg}`} />
                    <span className="text-xs text-gray-500">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Repeat2Icon(props: any) { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m17 2 4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg> }
