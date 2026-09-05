"use client"

import { useEffect, useState } from "react"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { api } from "@/lib/axios"
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useDateRange } from "@/hooks/use-date-range"
import {
    Users, TrendingUp, Repeat, DollarSign, Target, Calendar, ArrowUp, ArrowDown, Minus
} from "lucide-react"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"

function fmt(v: number) {
  if (v >= 100000) return `₹${(v / 100000)?.toFixed(1)}L`
  if (v >= 1000) return `₹${(v / 1000)?.toFixed(1)}K`
  return `₹${v?.toLocaleString("en-IN")}`
}

const SEG_COLORS: Record<string, string> = {
  "Champions": "#10b981", "Loyal Customers": "#6366f1", "Potential Loyalists": "#f59e0b",
  "At Risk": "#ef4444", "Lost Customers": "#9ca3af",
}





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
        kind === "currency" ? (previous >= 100000 ? `₹${(previous/100000)?.toFixed(1)}L` : previous >= 1000 ? `₹${(previous/1000)?.toFixed(1)}K` : `₹${Math.round(previous)?.toLocaleString()}`) :
        kind === "percent" ? `${previous}%` :
        kind === "days" ? `${previous?.toFixed(1)}d` :
        previous?.toLocaleString()
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

export default function RetentionPage() {
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
        const r = await api.get("/retention", { params: { start_date: startDate, end_date: endDate } })
        if (r.data?.success) setData(r.data.data)
      } catch (e) { console.error(e) } finally { setLoading(false) }
    })()
  }, [startDate, endDate])

    useEffect(() => {
        if (!compare.range) { setCompareData(null); return }
        const fetchCompare = async () => {
            try {
                setCompareLoading(true)
                const res = await api.get("/retention", {
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


  const s = data?.summary


  

  return (
    <div className="space-y-6 mb-8 w-full max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800 tracking-tight">Retention Metrics</h1>
          <p className="text-sm text-gray-500">Retention Stack, Gross Profit LTV, CAC Payback, RPR Trend</p>
        </div>
        <DateRangePicker startDate={startDate} endDate={endDate} onChange={setDates} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: "Repeat Purchase Rate", value: s ? `${s.rpr_pct?.toFixed(1)}%` : "—", icon: Repeat, color: "from-emerald-50 to-emerald-100/50 border-l-emerald-500 text-emerald-700", sub: "Returning customer %" },
          { label: "Gross Profit LTV", value: s ? fmt(s.gross_profit_ltv) : "—", icon: DollarSign, color: "from-indigo-50 to-indigo-100/50 border-l-indigo-500 text-indigo-700", sub: "LTV × 42% gross margin" },
          { label: "LTV:CAC Ratio", value: s ? `${s.ltv_cac_ratio?.toFixed(2)}x` : "—", icon: TrendingUp, color: s && s.ltv_cac_ratio >= 3 ? "from-emerald-50 to-emerald-100/50 border-l-emerald-500 text-emerald-700" : "from-amber-50 to-amber-100/50 border-l-amber-500 text-amber-700", sub: "Target ≥ 3x" },
          { label: "CAC Payback", value: s ? `${s.cac_payback_months} months` : "—", icon: Calendar, color: "from-blue-50 to-blue-100/50 border-l-blue-500 text-blue-700", sub: "Months to recover CAC" },
          { label: "Loyal Customer %", value: s ? `${s.loyal_customer_pct}%` : "—", icon: Users, color: "from-violet-50 to-violet-100/50 border-l-violet-500 text-violet-700", sub: "Champions + Loyal RFM" },
          { label: "Avg M1 Retention", value: s ? `${s.avg_month1_retention}%` : "—", icon: Target, color: "from-rose-50 to-rose-100/50 border-l-rose-500 text-rose-700", sub: "Month-1 cohort return rate" },
        ].map(k => (
          <Card key={k.label} className={`bg-gradient-to-br ${k.color} shadow-sm border-l-4`}>
            <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-widest flex items-center justify-between gap-2">{k.label}<k.icon className="h-4 w-4 shrink-0 opacity-70" /></CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-extrabold">{loading ? "—" : k.value}</div><p className="text-xs opacity-70 mt-1">{k.sub}</p></CardContent>
          </Card>
        ))}
      </div>

      {compare.range && (
          <CompareBanner
              current={{ start: startDate, end: endDate }}
              compare={compare.range}
              mode={compare.mode}
          />
      )}
      {compare.range && (
          <CompareSummary
              endpoint="/api/retention"
              currentRange={{ start: startDate, end: endDate }}
              compareRange={compare.range}
              title="Retention — Period Comparison"
          />
      )}


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Retention Stack (RFM Distribution) */}
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-sm font-semibold text-gray-700">Retention Stack (RFM Segments)</CardTitle></CardHeader>
          <CardContent>
            {loading ? <div className="h-64 flex items-center justify-center text-gray-400 text-sm">Loading…</div> : (
              <div className="space-y-3">
                {(data?.retention_stack || []).map((seg: any) => (
                  <div key={seg.segment} className="flex items-center gap-3">
                    <div className="w-28 text-xs text-gray-600 font-medium truncate">{seg.segment}</div>
                    <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${seg.share_pct}%`, backgroundColor: SEG_COLORS[seg.segment] || "#6366f1" }} />
                    </div>
                    <div className="w-12 text-xs text-right font-semibold text-gray-700">{seg.share_pct}%</div>
                    <div className="w-16 text-xs text-right text-gray-500">{seg.count?.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          
          <DeltaLine current={data?.retention_stack} previous={compareData?.retention_stack} kind="count" />
          </CardContent>
        </Card>

        {/* Gross Profit LTV by Segment */}
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-sm font-semibold text-gray-700">Gross Profit LTV by Segment</CardTitle></CardHeader>
          <CardContent>
            {loading ? <div className="h-64 flex items-center justify-center text-gray-400 text-sm">Loading…</div> : (data?.gross_profit_ltv_by_segment || []).length === 0 ? <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No data</div> : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.gross_profit_ltv_by_segment} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" tickFormatter={v => fmt(v)} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="segment" width={120} tick={{ fontSize: 11, fill: "#374151" }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: any) => fmt(Number(v))} />
                    <Legend />
                    <Bar dataKey="avg_ltv" name="Avg LTV" fill="#6366f1" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="gross_profit_ltv" name="GP LTV" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          
          <DeltaLine current={data?.gross_profit_ltv_by_segment} previous={compareData?.gross_profit_ltv_by_segment} kind="currency" />
          </CardContent>
        </Card>
      </div>

      {/* RPR Trend */}
      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-sm font-semibold text-gray-700">RPR Trend</CardTitle></CardHeader>
        <CardContent>
          {loading ? <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Loading…</div> : (data?.rpr_trend || []).length === 0 ? <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No RPR trend data in range</div> : (
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={(data?.rpr_trend || []).map((row: any, i: number) => ({ ...row, prev_rpr_pct: (compareData?.rpr_trend || [])[i]?.rpr_pct ?? null }))} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: any) => [`${Number(v)?.toFixed(1)}%`, "RPR"]} />
                  <Area type="monotone" dataKey="rpr_pct" name="RPR %" stroke="#10b981" fill="#d1fae5" strokeWidth={2} dot={false} />
                  {compare.range && (
                      <Area type="monotone" dataKey="prev_rpr_pct" name="RPR % (previous)" stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={2} fill="transparent" dot={false} connectNulls />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        
        <DeltaLine current={data?.rpr_trend} previous={compareData?.rpr_trend} kind="count" />
        </CardContent>
      </Card>

      {/* Cohort M1 Trend */}
      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-sm font-semibold text-gray-700">Month-1 Cohort Retention by Cohort</CardTitle></CardHeader>
        <CardContent>
          {loading ? <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Loading…</div> : (data?.cohort_month1_trend || []).length === 0 ? <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No cohort data</div> : (
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[...data.cohort_month1_trend].reverse()} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="cohort_month" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: any) => [`${Number(v)?.toFixed(1)}%`, "M1 Retention"]} />
                  <Bar dataKey="month1_retention" name="M1 Retention %" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        
        <DeltaLine current={data?.cohort_month} previous={compareData?.cohort_month} kind="count" />
        </CardContent>
      </Card>
    </div>
  )
}
