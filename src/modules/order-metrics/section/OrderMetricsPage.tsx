"use client"

import { useEffect, useMemo, useState } from "react"
import axios from "axios"
import { Card } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ExportButton } from "@/components/ui/export-button"
import { exportToExcel, ExportColumn } from "@/lib/export-utils"
import { Info, BarChart3, List, TrendingUp, TrendingDown, ArrowUp, ArrowDown, Minus } from "lucide-react"
import { useDateRange } from "@/hooks/use-date-range"
import { useCompareRange, addDays, daysBetween, pctChange as sharedPctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, ResponsiveContainer, Legend, ReferenceLine,
  ComposedChart, Line,
} from "recharts"

/* -------------------- TYPES -------------------- */
interface OrderMetricRow {
  id: string; date: string; total: number; discountTotal: number
  shippingTotal: number; subTotal: number; redeemedPoints: number
  ordersCount: number; aov: number; interval: string
}

/* -------------------- TOOLTIP DATA -------------------- */
const METRIC_INFO: Record<string, { full: string; definition: string; useCase: string }> = {
  AOV: {
    full: "Average Order Value",
    definition: "Total Revenue ÷ Total Orders for the selected period.",
    useCase: "Helps measure how much each customer spends per transaction. A rising AOV indicates successful upselling or bundling strategies.",
  },
  "Total Orders": {
    full: "Total Orders Count",
    definition: "Count of all orders with status COMPLETED/DELIVERED or paid_at IS NOT NULL.",
    useCase: "Core volume metric — tracks overall business demand. Compare day-over-day to spot demand spikes or drops.",
  },
  "Total Amount": {
    full: "Gross Merchandise Value (GMV)",
    definition: "Sum of order totals (₹) for all qualifying orders in the period.",
    useCase: "Primary revenue indicator. Use alongside AOV and order count to diagnose whether revenue growth comes from more orders or higher basket sizes.",
  },
  "Total Discount": {
    full: "Total Discount Given",
    definition: "Sum of all discount amounts (₹) applied across orders.",
    useCase: "Monitors promotional spend. High discount-to-revenue ratio may indicate over-reliance on coupons, eroding margins.",
  },
  "Total Shipping": {
    full: "Total Shipping Revenue",
    definition: "Sum of shipping charges (₹) collected from customers.",
    useCase: "Tracks shipping cost recovery. If shipping revenue is low relative to fulfillment costs, consider adjusting free-shipping thresholds.",
  },
  "Redeemed Points": {
    full: "Loyalty Points Redeemed",
    definition: "Total loyalty/reward points customers used to pay for orders.",
    useCase: "Measures loyalty program engagement. High redemption signals strong repeat customer behavior and program effectiveness.",
  },
}

/* -------------------- HELPERS -------------------- */
const getPastDate = (days: number) => {
  const d = new Date(); d.setDate(d.getDate() - days)
  return d.toISOString().split("T")[0]
}
const fmt = (v: number) => `₹ ${v?.toLocaleString()}`
const pctChange = sharedPctChange
const dayName = (ds: string) => {
  try { return new Date(ds + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" }) } catch { return "" }
}

/* -------------------- COMPONENT -------------------- */
export default function OrderMetricsPage() {
  const [startDate, endDate, setDates] = useDateRange()
  const [tableData, setTableData] = useState<OrderMetricRow[]>([])
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = useState<"graph" | "table">("graph")

  // ── Compare period state (shared hook) ──
  const compare = useCompareRange(startDate, endDate)
  const [compareData, setCompareData] = useState<OrderMetricRow[]>([])
  const [compareLoading, setCompareLoading] = useState(false)

  const fetchOrderData = async () => {
    try {
      setLoading(true)
      const res = await axios.get("/api/orders", { params: { start_date: startDate, end_date: endDate } })
      if (res.data.success) setTableData(res.data.data)
    } catch (err) { console.error("Order API error", err); setTableData([]) }
    finally { setLoading(false) }
  }

  const fetchCompareData = async (range: { start: string; end: string }) => {
    try {
      setCompareLoading(true)
      const res = await axios.get("/api/orders", { params: { start_date: range.start, end_date: range.end } })
      if (res.data.success) setCompareData(res.data.data)
      else setCompareData([])
    } catch (err) { console.error("Compare API error", err); setCompareData([]) }
    finally { setCompareLoading(false) }
  }

  useEffect(() => { if (startDate && endDate) fetchOrderData() }, [startDate, endDate])

  useEffect(() => {
    if (compare.range) fetchCompareData(compare.range)
    else setCompareData([])
  }, [compare.range?.start, compare.range?.end])

  /* ---- Aggregated KPI metrics ---- */
  const aggregate = (rows: OrderMetricRow[]) => {
    if (!rows.length) return null
    const totalOrders = rows.reduce((a, r) => a + r.ordersCount, 0)
    const totalAmount = rows.reduce((a, r) => a + r.total, 0)
    const totalDiscount = rows.reduce((a, r) => a + r.discountTotal, 0)
    const totalShipping = rows.reduce((a, r) => a + r.shippingTotal, 0)
    const redeemedPoints = rows.reduce((a, r) => a + r.redeemedPoints, 0)
    const aov = totalOrders > 0 ? Math.round(totalAmount / totalOrders) : 0
    return { totalOrders, totalAmount, totalDiscount, totalShipping, redeemedPoints, aov }
  }
  const agg = useMemo(() => aggregate(tableData), [tableData])
  const compareAgg = useMemo(() => aggregate(compareData), [compareData])

  // KPI definitions with deltas. Each item builds current + prev values.
  const kpis = useMemo(() => {
    const fields: { label: string; key: keyof NonNullable<typeof agg>; format: "currency" | "count"; color: string }[] = [
      { label: "AOV", key: "aov", format: "currency", color: "text-gray-800" },
      { label: "Total Orders", key: "totalOrders", format: "count", color: "text-blue-600" },
      { label: "Total Amount", key: "totalAmount", format: "currency", color: "text-gray-800" },
      { label: "Total Discount", key: "totalDiscount", format: "currency", color: "text-gray-800" },
      { label: "Total Shipping", key: "totalShipping", format: "currency", color: "text-gray-800" },
      { label: "Redeemed Points", key: "redeemedPoints", format: "count", color: "text-gray-800" },
    ]
    return fields.map(f => {
      const cur = agg ? (agg[f.key] as number) : null
      const prev = compareAgg ? (compareAgg[f.key] as number) : null
      const delta = (cur != null && prev != null) ? pctChange(cur, prev) : null
      const fmtVal = (v: number) => f.format === "currency" ? fmt(v) : v?.toLocaleString()
      return {
        label: f.label,
        value: cur != null ? fmtVal(cur) : "—",
        color: cur != null ? f.color : "text-gray-400",
        previousValue: prev != null ? fmtVal(prev) : null,
        delta,
      }
    })
  }, [agg, compareAgg])

  /* ---- Chart data ---- */
  const chartData = useMemo(() => {
    return tableData.map((r, i) => {
      const prev = i > 0 ? tableData[i - 1] : null
      // Align by index so day-1 of the compare range overlays day-1 of the current range.
      const cmp = compareData[i] || null
      return {
        date: r.date.slice(5),
        fullDate: r.date,
        day: dayName(r.date),
        Orders: r.ordersCount,
        Revenue: r.total,
        AOV: r.aov,
        Discount: r.discountTotal,
        Shipping: r.shippingTotal,
        orderChange: prev ? pctChange(r.ordersCount, prev.ordersCount) : 0,
        // Compare-period overlays (only present when compareMode active)
        PrevOrders: cmp ? cmp.ordersCount : null,
        PrevRevenue: cmp ? cmp.total : null,
        PrevAOV: cmp ? cmp.aov : null,
        prevDate: cmp ? cmp.date : null,
      }
    })
  }, [tableData, compareData])

  /* ---- Day-wise insights ---- */
  const insights = useMemo(() => {
    if (!tableData.length) return null
    const sorted = [...tableData].sort((a, b) => b.ordersCount - a.ordersCount)
    const best = sorted[0]
    const worst = sorted[sorted.length - 1]
    const avgOrders = Math.round(tableData.reduce((a, r) => a + r.ordersCount, 0) / tableData.length)
    const avgAov = agg && agg.totalOrders > 0 ? agg.aov : 0

    // Spike/drop detection
    const spikes: string[] = []
    const drops: string[] = []
    tableData.forEach((r, i) => {
      if (i === 0) return
      const change = pctChange(r.ordersCount, tableData[i - 1].ordersCount)
      if (change >= 30) spikes.push(`${r.date} (+${change}%)`)
      if (change <= -30) drops.push(`${r.date} (${change}%)`)
    })

    // Weekend vs weekday
    let weekdayTotal = 0, weekdayCount = 0, weekendTotal = 0, weekendCount = 0
    tableData.forEach(r => {
      const dow = new Date(r.date + "T00:00:00").getDay()
      if (dow === 0 || dow === 6) { weekendTotal += r.ordersCount; weekendCount++ }
      else { weekdayTotal += r.ordersCount; weekdayCount++ }
    })
    const weekdayAvg = weekdayCount > 0 ? Math.round(weekdayTotal / weekdayCount) : 0
    const weekendAvg = weekendCount > 0 ? Math.round(weekendTotal / weekendCount) : 0

    return { best, worst, avgOrders, avgAov, spikes, drops, weekdayAvg, weekendAvg }
  }, [tableData, agg])

  /* ---- Render ---- */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Order Metrics</h1>
          <p className="text-sm text-gray-500">Order performance summary</p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButton
            disabled={loading || tableData.length === 0}
            onClick={() => {
              const cols: ExportColumn[] = [
                { header: "Date", key: "date" },
                { header: "Orders", key: "ordersCount", format: "number" },
                { header: "Amount (₹)", key: "total", format: "currency" },
                { header: "Discount (₹)", key: "discountTotal", format: "currency" },
                { header: "Shipping (₹)", key: "shippingTotal", format: "currency" },
                { header: "Sub Total (₹)", key: "subTotal", format: "currency" },
                { header: "Redeemed Points", key: "redeemedPoints", format: "number" },
                { header: "AOV (₹)", key: "aov", format: "currency" },
              ]
              exportToExcel(tableData, cols, "Order_Metrics", startDate, endDate)
            }}
          />
          <CompareControl
            mode={compare.mode}
            onModeChange={compare.setMode}
            range={compare.range}
            customStart={compare.customStart}
            customEnd={compare.customEnd}
            onCustomChange={compare.setCustom}
            currentRange={{ start: startDate, end: endDate }}
          />
          <DateRangePicker startDate={startDate} endDate={endDate} onChange={(s, e) => { setDates(s, e) }} />
        </div>
      </div>

      {/* Compare period summary banner */}
      {compare.range && (
        <CompareBanner
          current={{ start: startDate, end: endDate }}
          compare={compare.range}
          mode={compare.mode}
          loading={compareLoading}
        />
      )}

      {/* KPI Cards with Tooltips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {kpis.map(m => {
          // For "Total Discount" — lower is generally better; for everything else higher is better.
          const lowerIsBetter = m.label === "Total Discount"
          const isPositive = m.delta != null && (lowerIsBetter ? m.delta < 0 : m.delta > 0)
          const isNeutral = m.delta == null || m.delta === 0
          const deltaColor = isNeutral ? "text-gray-400" : isPositive ? "text-emerald-600" : "text-rose-600"
          const DeltaIcon = isNeutral ? Minus : (m.delta! > 0 ? ArrowUp : ArrowDown)
          return (
            <Card key={m.label} className="p-6 relative group">
              <div className="flex items-center gap-2">
                <p className="text-base text-gray-500 font-medium">{m.label}</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="text-gray-300 hover:text-blue-500 transition-colors"><Info size={14} /></button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs bg-gray-900 text-white p-3 rounded-lg shadow-xl text-left">
                    <p className="font-bold text-blue-300 text-xs mb-1">{METRIC_INFO[m.label]?.full ?? m.label}</p>
                    <p className="text-[11px] text-gray-300 mb-1.5">{METRIC_INFO[m.label]?.definition}</p>
                    <p className="text-[11px] text-emerald-300 italic">{METRIC_INFO[m.label]?.useCase}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className={`mt-2 text-3xl font-bold ${m.color}`}>{loading ? "Loading..." : m.value}</p>
              {m.previousValue != null && (
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <span className={`inline-flex items-center gap-0.5 font-semibold ${deltaColor}`}>
                    <DeltaIcon size={14} />
                    {m.delta != null ? `${Math.abs(m.delta)}%` : "—"}
                  </span>
                  <span className="text-gray-400">vs {m.previousValue}</span>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* View Toggle + Content */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b bg-gray-50/50">
          <h2 className="text-lg font-semibold text-gray-700">Order Performance</h2>
          <div className="flex items-center gap-1 bg-gray-200 p-1 rounded-lg">
            <button onClick={() => setViewMode("graph")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === "graph" ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:text-gray-700"}`}>
              <BarChart3 size={16} /> Graph
            </button>
            <button onClick={() => setViewMode("table")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === "table" ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:text-gray-700"}`}>
              <List size={16} /> Table
            </button>
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="py-16 text-center text-gray-500">Loading order data...</div>
          ) : tableData.length === 0 ? (
            <div className="py-16 text-center text-gray-500 italic">No data found in this period</div>
          ) : viewMode === "graph" ? (
            <GraphView chartData={chartData} insights={insights} agg={agg} compareActive={!!compare.range} />
          ) : (
            <TableView tableData={tableData} />
          )}
        </div>
      </Card>
    </div>
  )
}

/* ============================= GRAPH VIEW ============================= */
function GraphView({ chartData, insights, agg, compareActive }: { chartData: any[]; insights: any; agg: any; compareActive: boolean }) {
  return (
    <div className="space-y-8">
      {/* 1. Day-wise Insights Panel — top for quick summary */}
      {insights && <InsightsPanel insights={insights} />}

      {/* 2. Orders + Revenue Trend */}
      <div>
        <h3 className="text-sm font-semibold text-gray-600 mb-4">Daily Orders & Revenue Trend</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v / 1000)?.toFixed(0)}k`} />
              <RTooltip content={<CustomTooltip />} />
              <Legend />
              {agg && <ReferenceLine yAxisId="left" y={Math.round(agg.totalOrders / chartData.length)} stroke="#94a3b8" strokeDasharray="6 3" label={{ value: "Avg Orders", fill: "#94a3b8", fontSize: 11, position: "insideTopRight" }} />}
              <Bar yAxisId="left" dataKey="Orders" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} name="Orders (current)" />
              {compareActive && (
                <Line yAxisId="left" type="monotone" dataKey="PrevOrders" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Orders (previous)" />
              )}
              <Line yAxisId="right" type="monotone" dataKey="Revenue" stroke="#10b981" strokeWidth={2.5} dot={false} name="Revenue (current)" />
              {compareActive && (
                <Line yAxisId="right" type="monotone" dataKey="PrevRevenue" stroke="#fcd34d" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Revenue (previous)" />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. AOV Trend */}
      <div>
        <h3 className="text-sm font-semibold text-gray-600 mb-4">Daily AOV Trend</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${v}`} />
              <RTooltip formatter={(v: any, name: any) => [`₹${Number(v)?.toLocaleString()}`, name]} />
              <Legend />
              {agg && <ReferenceLine y={agg.aov} stroke="#f59e0b" strokeDasharray="6 3" label={{ value: `Avg ₹${agg.aov}`, fill: "#f59e0b", fontSize: 11, position: "insideTopRight" }} />}
              <Area type="monotone" dataKey="AOV" stroke="#8b5cf6" fill="url(#aovGrad)" strokeWidth={2} name="AOV (current)" />
              {compareActive && (
                <Line type="monotone" dataKey="PrevAOV" stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={2} dot={false} name="AOV (previous)" />
              )}
              <defs><linearGradient id="aovGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} /><stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} /></linearGradient></defs>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. Discount vs Shipping */}
      <div>
        <h3 className="text-sm font-semibold text-gray-600 mb-4">Discount vs Shipping (Daily)</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v / 1000)?.toFixed(0)}k`} />
              <RTooltip formatter={(v: any) => [`₹${Number(v)?.toLocaleString()}`]} />
              <Legend />
              <Bar dataKey="Discount" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={16} />
              <Bar dataKey="Shipping" fill="#06b6d4" radius={[4, 4, 0, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

/* ---- Custom Tooltip ---- */
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  return (
    <div className="bg-white border border-gray-200 shadow-lg rounded-lg p-3 text-sm min-w-[220px]">
      <p className="font-bold text-gray-700 mb-2">{row?.fullDate} ({row?.day})</p>
      {payload.map((p: any, i: number) => {
        if (p.value == null) return null
        const isRevenue = p.name.startsWith("Revenue")
        return (
          <div key={i} className="flex justify-between gap-4">
            <span className="text-gray-500">{p.name}</span>
            <span className="font-semibold" style={{ color: p.color }}>
              {isRevenue ? `₹${Number(p.value)?.toLocaleString()}` : Number(p.value)?.toLocaleString()}
            </span>
          </div>
        )
      })}
      {row?.prevDate && (
        <div className="mt-1.5 pt-1.5 border-t border-gray-100 text-[11px] text-gray-400">
          previous-period day: {row.prevDate}
        </div>
      )}
      {row?.orderChange !== 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-gray-100 flex items-center gap-1 text-xs">
          {row.orderChange > 0 ? <ArrowUp size={12} className="text-emerald-500" /> : <ArrowDown size={12} className="text-rose-500" />}
          <span className={row.orderChange > 0 ? "text-emerald-600" : "text-rose-500"}>{Math.abs(row.orderChange)}% vs prev day</span>
        </div>
      )}
    </div>
  )
}

/* ---- Insights Panel ---- */
function InsightsPanel({ insights }: { insights: any }) {
  return (
    <div className="bg-gradient-to-br from-slate-50 to-blue-50/30 rounded-xl border border-gray-200 p-6">
      <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2"><TrendingUp size={16} className="text-blue-500" /> Day-wise Order Analysis</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <InsightCard icon={<ArrowUp size={18} />} color="emerald" label="Best Day" value={`${insights.best.ordersCount} orders`} sub={`${insights.best.date} (${dayName(insights.best.date)})`} />
        <InsightCard icon={<ArrowDown size={18} />} color="rose" label="Worst Day" value={`${insights.worst.ordersCount} orders`} sub={`${insights.worst.date} (${dayName(insights.worst.date)})`} />
        <InsightCard icon={<Minus size={18} />} color="blue" label="Avg Daily Orders" value={insights.avgOrders?.toLocaleString()} sub={`AOV ₹${insights.avgAov?.toLocaleString()}`} />
        <InsightCard icon={<BarChart3 size={18} />} color="violet" label="Weekday vs Weekend" value={`${insights.weekdayAvg} vs ${insights.weekendAvg}`} sub={insights.weekdayAvg > insights.weekendAvg ? "Weekdays outperform" : "Weekends outperform"} />
      </div>

      {(insights.spikes.length > 0 || insights.drops.length > 0) && (
        <div className="space-y-3">
          {insights.spikes.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <p className="text-xs font-bold text-emerald-700 mb-1">📈 Order Spikes (≥30% increase)</p>
              <p className="text-xs text-emerald-600">{insights.spikes.join(" · ")}</p>
              <p className="text-[11px] text-emerald-500 mt-1 italic">Possible reasons: flash sale, marketing campaign, payday, festive season, or viral social media post.</p>
            </div>
          )}
          {insights.drops.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
              <p className="text-xs font-bold text-rose-700 mb-1">📉 Order Drops (≥30% decrease)</p>
              <p className="text-xs text-rose-600">{insights.drops.join(" · ")}</p>
              <p className="text-[11px] text-rose-500 mt-1 italic">Possible reasons: weekend/holiday slowdown, end of promotional period, stock-out of popular items, or technical issues.</p>
            </div>
          )}
          {insights.spikes.length === 0 && insights.drops.length === 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs font-bold text-blue-700">✅ Stable order volume — no major spikes or drops detected in this period.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function InsightCard({ icon, color, label, value, sub }: { icon: React.ReactNode; color: string; label: string; value: string; sub: string }) {
  const bg: Record<string, string> = { emerald: "bg-emerald-100 text-emerald-600", rose: "bg-rose-100 text-rose-600", blue: "bg-blue-100 text-blue-600", violet: "bg-violet-100 text-violet-600" }
  return (
    <div className="bg-white rounded-lg border border-gray-100 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className={`p-1.5 rounded-lg ${bg[color]}`}>{icon}</span>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-lg font-bold text-gray-800">{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  )
}

/* ============================= TABLE VIEW ============================= */
function TableView({ tableData }: { tableData: OrderMetricRow[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date Interval</TableHead>
            <TableHead>Orders</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Discount</TableHead>
            <TableHead>Shipping</TableHead>
            <TableHead>Redeemed</TableHead>
            <TableHead>AOV</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tableData.map(row => (
            <TableRow key={row.date}>
              <TableCell className="font-medium text-gray-700">{row.date} {row.interval === "monthly" && "(Month)"}</TableCell>
              <TableCell>{row.ordersCount?.toLocaleString()}</TableCell>
              <TableCell>{fmt(row.total)}</TableCell>
              <TableCell>{fmt(row.discountTotal)}</TableCell>
              <TableCell>{fmt(row.shippingTotal)}</TableCell>
              <TableCell>{row.redeemedPoints?.toLocaleString()}</TableCell>
              <TableCell className="text-green-600 font-medium">{fmt(row.aov)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
