"use client"

import { useEffect, useState } from "react"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { api } from "@/lib/axios"
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDateRange } from "@/hooks/use-date-range"
import {
    TrendingUp, Users, Zap, BarChart2, DollarSign, ShoppingBag, ArrowUp, ArrowDown, Minus
} from "lucide-react"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"
import { CompareChartTooltip } from "@/components/ui/compare-chart-tooltip"

function fmt(v: number) {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`
  return `₹${v.toLocaleString("en-IN")}`
}
function fmtNum(v: number) { return v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toLocaleString() }

interface Summary {
  qualified_sessions: number; total_users: number; session_to_order_rate: number
  mer: number; total_revenue: number; total_spend: number
  new_customers_paid: number; new_customer_orders: number; total_orders: number
}
interface TrendPoint { date: string; orders: number; revenue: number; spend: number; mer: number }





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

export default function GrowthPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [startDate, endDate, setDates] = useDateRange()
  const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<any>(null)
    const [compareLoading, setCompareLoading] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        const r = await api.get("/growth", { params: { start_date: startDate, end_date: endDate } })
        if (r.data?.success) {
          setSummary(r.data.data.summary)
          setTrend(r.data.data.daily_trend || [])
        }
      } catch (e) { console.error(e) } finally { setLoading(false) }
    })()
  }, [startDate, endDate])

    useEffect(() => {
        if (!compare.range) { setCompareData(null); return }
        const fetchCompare = async () => {
            try {
                setCompareLoading(true)
                const res = await api.get("/growth", {
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


  const compareSummary = compareData?.summary ?? compareData
  const compareTrend = compareData?.daily_trend || []
  const kpis = [
    { label: "Qualified Sessions", current: summary?.qualified_sessions, previous: compareSummary?.qualified_sessions, kind: "count", value: fmtNum(summary?.qualified_sessions || 0), icon: Zap, color: "indigo", sub: "UTM-attributed sessions" },
    { label: "MER", current: summary?.mer, previous: compareSummary?.mer, kind: "count", value: summary ? `${summary.mer.toFixed(2)}x` : "—", icon: BarChart2, color: "emerald", sub: "Revenue / Ad Spend" },
    { label: "New Customers", current: summary?.new_customers_paid, previous: compareSummary?.new_customers_paid, kind: "count", value: fmtNum(summary?.new_customers_paid || 0), icon: Users, color: "blue", sub: "Acquired via paid ads" },
    { label: "Total Revenue", current: summary?.total_revenue, previous: compareSummary?.total_revenue, kind: "currency", value: fmt(summary?.total_revenue || 0), icon: DollarSign, color: "amber", sub: `${fmtNum(summary?.total_orders || 0)} orders` },
    { label: "Total Ad Spend", current: summary?.total_spend, previous: compareSummary?.total_spend, kind: "currency", lowerIsBetter: true, value: fmt(summary?.total_spend || 0), icon: TrendingUp, color: "rose", sub: "Meta Ads total" },
    { label: "Session → Order", current: summary?.session_to_order_rate, previous: compareSummary?.session_to_order_rate, kind: "percent", value: summary ? `${summary.session_to_order_rate}%` : "—", icon: ShoppingBag, color: "violet", sub: "Conversion rate" },
  ]

  const colorMap: Record<string, string> = { indigo: "from-indigo-50 to-indigo-100/50 border-l-indigo-500 text-indigo-700", emerald: "from-emerald-50 to-emerald-100/50 border-l-emerald-500 text-emerald-700", blue: "from-blue-50 to-blue-100/50 border-l-blue-500 text-blue-700", amber: "from-amber-50 to-amber-100/50 border-l-amber-500 text-amber-700", rose: "from-rose-50 to-rose-100/50 border-l-rose-500 text-rose-700", violet: "from-violet-50 to-violet-100/50 border-l-violet-500 text-violet-700" }


  

  return (
    <div className="space-y-6 mb-8 w-full max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800 tracking-tight">Growth Metrics</h1>
          <p className="text-sm text-gray-500">Qualified Sessions, MER, and New Customer Acquisition</p>
        </div>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className={`bg-gradient-to-br ${colorMap[k.color]} shadow-sm border-l-4`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-widest flex items-center justify-between gap-2">
                {k.label}<k.icon className="h-4 w-4 shrink-0 opacity-70" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-extrabold">{loading ? "—" : k.value}</div>
              <p className="text-xs opacity-70 mt-1">{k.sub}</p>
              <DeltaLine current={k.current} previous={k.previous} kind={k.kind as any} lowerIsBetter={k.lowerIsBetter} />
            </CardContent>
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
              endpoint="/api/growth"
              currentRange={{ start: startDate, end: endDate }}
              compareRange={compare.range}
              title="Growth — Period Comparison"
          />
      )}


      {/* MER Trend */}
      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><BarChart2 className="h-4 w-4 text-gray-500" />Daily MER Trend</CardTitle></CardHeader>
        <CardContent>
          {loading ? <div className="h-64 flex items-center justify-center text-gray-400 text-sm">Loading…</div> : trend.length === 0 ? <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No data</div> : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend.map((row,i)=>({...row,prev_mer:compareTrend[i]?.mer??null,prev_date:compareTrend[i]?.date??null}))} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CompareChartTooltip valueFormatter={(v) => `${v.toFixed(2)}x`} />} />
                  <Area type="monotone" dataKey="mer" name="MER" stroke="#6366f1" fill="#e0e7ff" strokeWidth={2} dot={false} />
                  {compare.range && (
                      <Area type="monotone" dataKey="prev_mer" name="MER (previous)" stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={2} fill="transparent" dot={false} connectNulls />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revenue vs Spend */}
      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-gray-500" />Revenue vs Ad Spend</CardTitle></CardHeader>
        <CardContent>
          {loading ? <div className="h-64 flex items-center justify-center text-gray-400 text-sm">Loading…</div> : trend.length === 0 ? <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No data</div> : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trend.map((row,i)=>({...row,prev_revenue:compareTrend[i]?.revenue??null,prev_spend:compareTrend[i]?.spend??null,prev_date:compareTrend[i]?.date??null}))} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => fmt(v)} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CompareChartTooltip valueFormatter={(v) => fmt(v)} />} />
                  <Legend />
                  <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="spend" name="Ad Spend" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  {compare.range && (
                      <Line type="monotone" dataKey="prev_revenue" name="Revenue (previous)" stroke="#86efac" strokeDasharray="5 5" strokeWidth={2} dot={false} connectNulls />
                  )}
                  {compare.range && (
                      <Line type="monotone" dataKey="prev_spend" name="Ad Spend (previous)" stroke="#fda4af" strokeDasharray="5 5" strokeWidth={2} dot={false} connectNulls />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
