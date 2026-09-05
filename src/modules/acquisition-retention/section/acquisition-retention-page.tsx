"use client"

import { useEffect, useState } from "react"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { api } from "@/lib/axios"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useDateRange } from "@/hooks/use-date-range"
import {
    Link2, Repeat, TrendingDown, ArrowUp, ArrowDown, Minus
} from "lucide-react"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"

function fmt(v: number) {
  if (v >= 100000) return `₹${(v / 100000)?.toFixed(1)}L`
  if (v >= 1000) return `₹${(v / 1000)?.toFixed(1)}K`
  return `₹${v?.toLocaleString("en-IN")}`
}

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#f97316", "#ec4899"]





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

export default function AcquisitionRetentionPage() {
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
        const r = await api.get("/acquisition-retention", { params: { start_date: startDate, end_date: endDate } })
        if (r.data?.success) setData(r.data.data)
      } catch (e) { console.error(e) } finally { setLoading(false) }
    })()
  }, [startDate, endDate])

    useEffect(() => {
        if (!compare.range) { setCompareData(null); return }
        const fetchCompare = async () => {
            try {
                setCompareLoading(true)
                const res = await api.get("/acquisition-retention", {
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



  

  return (
    <div className="space-y-6 mb-8 w-full max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800 tracking-tight">Acquisition Source Retention</h1>
          <p className="text-sm text-gray-500">Source breakdown by revenue + cohort retention by month</p>
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

      {compare.range && (
        <CompareBanner
          current={{ start: startDate, end: endDate }}
          compare={compare.range}
          mode={compare.mode}
        />
      )}
      {compare.range && (
        <CompareSummary
          endpoint="/api/acquisition-retention"
          currentRange={{ start: startDate, end: endDate }}
          compareRange={compare.range}
          title="Acquisition Retention — Period Comparison"
        />
      )}

      {/* Source Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Link2 className="h-4 w-4 text-gray-500" />Revenue by Source</CardTitle></CardHeader>
          <CardContent>
            {loading ? <div className="h-64 flex items-center justify-center text-gray-400 text-sm">Loading…</div> : (data?.source_breakdown || []).length === 0 ? <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No UTM data</div> : (
              <div style={{ height: Math.max(200, (data.source_breakdown.length) * 44 + 40) }} className="w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.source_breakdown.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" tickFormatter={v => fmt(v)} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="source" width={90} tick={{ fontSize: 11, fill: "#374151" }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: any) => [fmt(Number(v)), "Revenue"]} />
                    <Bar dataKey="revenue" name="Revenue" fill="#6366f1" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

          <DeltaLine current={data?.summary?.total_revenue} previous={compareData?.summary?.total_revenue} kind="currency" />
          </CardContent>
        </Card>

        {/* Retention by Month Index */}
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Repeat className="h-4 w-4 text-gray-500" />Avg Retention by Month</CardTitle></CardHeader>
          <CardContent>
            {loading ? <div className="h-64 flex items-center justify-center text-gray-400 text-sm">Loading…</div> : (data?.cohort_retention_by_month || []).length === 0 ? <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No cohort data</div> : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.cohort_retention_by_month} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month_index" tickFormatter={v => `M${v}`} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: any) => [`${Number(v)?.toFixed(1)}%`, "Avg Retention"]} labelFormatter={l => `Month ${l}`} />
                    <Line type="monotone" dataKey="avg_retention_pct" name="Avg Retention %" stroke="#6366f1" strokeWidth={2} dot={{ r: 4, fill: "#6366f1" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

          <DeltaLine current={data?.summary?.avg_retention_m1_pct} previous={compareData?.summary?.avg_retention_m1_pct} kind="percent" />
          </CardContent>
        </Card>
      </div>

      {/* Source Table */}
      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-sm font-semibold text-gray-700">Source Breakdown Detail</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="bg-gray-50"><TableHead>Source</TableHead><TableHead className="text-right">Sessions</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Revenue Share</TableHead><TableHead className="text-right">Conv. Rate</TableHead></TableRow></TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={6} className="text-center text-gray-400 py-8">Loading…</TableCell></TableRow> :
                  (data?.source_breakdown || []).map((s: any, i: number) => (
                    <TableRow key={i} className="hover:bg-gray-50">
                      <TableCell><span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: COLORS[i % COLORS.length] + "20", color: COLORS[i % COLORS.length] }}>{s.source}</span></TableCell>
                      <TableCell className="text-right">{s.sessions?.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{s.orders?.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600">{fmt(s.revenue)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-400 rounded-full" style={{ width: `${s.revenue_share_pct}%` }} /></div>
                          <span className="text-xs font-medium">{s.revenue_share_pct}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm">{s.conversion_rate}%</TableCell>
                    </TableRow>
                  ))
                }
              </TableBody>
            </Table>
          </div>
        
        <DeltaLine current={data?.summary?.total_orders} previous={compareData?.summary?.total_orders} kind="count" />
        </CardContent>
      </Card>

      {/* Medium Breakdown */}
      {!loading && (data?.medium_breakdown || []).length > 0 && (
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-sm font-semibold text-gray-700">Revenue by Medium</CardTitle></CardHeader>
          <CardContent>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.medium_breakdown} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="medium" tick={{ fontSize: 10, fill: "#374151" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => fmt(v)} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: any) => fmt(Number(v))} />
                  <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          
          <DeltaLine current={data?.summary?.total_sessions} previous={compareData?.summary?.total_sessions} kind="count" />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
