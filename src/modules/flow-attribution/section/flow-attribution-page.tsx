"use client"

import { useEffect, useState, useMemo } from "react"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ExportButton } from "@/components/ui/export-button"
import { exportToExcel, ExportColumn } from "@/lib/export-utils"
import axios from "axios"
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
    ResponsiveContainer, Cell, Sankey, Tooltip,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDateRange } from "@/hooks/use-date-range"
import {
    TrendingUp, DollarSign, ShoppingCart, Target, Workflow,
    ArrowUpDown, ArrowRight, Search,
    ArrowDown, Minus, ArrowUp,
} from "lucide-react"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"

// ───── Types ─────
interface FlowRow {
    flow_path: string
    steps_count: number
    users: number
    orders: number
    revenue: number
    conversion_rate: number
    aov: number
}

interface StepTransition {
    from: string
    to: string
    value: number
}

interface Summary {
    total_users: number
    total_orders: number
    total_revenue: number
    avg_conversion_rate: number
    avg_aov: number
    total_unique_flows: number
    top_flow: FlowRow | null
}

interface FlowData {
    flows: FlowRow[]
    top_flows: FlowRow[]
    step_transitions: StepTransition[]
    summary: Summary
    last_updated: string | null
}

// ───── Helpers ─────
function formatCurrency(value: number): string {
    if (typeof value !== "number" || isNaN(value)) return "₹0";
    if (value >= 10000000) return `₹${(value / 10000000)?.toFixed(2)}Cr`
    if (value >= 100000) return `₹${(value / 100000)?.toFixed(2)}L`
    if (value >= 1000) return `₹${(value / 1000)?.toFixed(1)}K`
    return `₹${value?.toFixed(0)}`
}

const BAR_COLORS = [
    "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
    "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
]

const STEP_COLORS: Record<string, string> = {
    signup: "#10b981",
    login: "#3b82f6",
    wishlist: "#f59e0b",
    cart_created: "#8b5cf6",
    add_to_cart: "#ec4899",
    website_visit: "#06b6d4",
    paid_ad: "#ef4444",
    purchase: "#059669",
}

function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null

    

        return (
        <div className="bg-white border border-gray-200 shadow-lg rounded-lg px-4 py-3 text-sm">
            <p className="font-semibold text-gray-800 mb-1 max-w-[300px] truncate">{label}</p>
            {payload.map((p: any, i: number) => (
                <p key={i} className="text-gray-600">
                    {p.name}: {p.name === "Revenue" ? formatCurrency(p.value) : p.value?.toLocaleString()}
                </p>
            ))}
        </div>
    )
}

// ═══════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════




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

export default function FlowAttributionPage() {
    const [data, setData] = useState<FlowData | null>(null)
    const [loading, setLoading] = useState(true)
    const [sortField, setSortField] = useState<string>("revenue")
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
    const [searchQuery, setSearchQuery] = useState("")

    const getPastDate = (days: number) => {
        const d = new Date()
        d.setDate(d.getDate() - days)
        return d.toISOString().split("T")[0]
    }
    const [startDate, endDate, setDates] = useDateRange()
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<FlowData | null>(null)
    const [compareLoading, setCompareLoading] = useState(false)

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true)
                const res = await axios.get("/api/flow-attribution", {
                    params: { start_date: startDate, end_date: endDate },
                })
                if (res.data?.success) {
                    setData(res.data.data)
                }
            } catch (e) {
                console.error("Failed to load flow attribution", e)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [startDate, endDate])

    useEffect(() => {
        if (!compare.range) { setCompareData(null); return }
        const fetchCompare = async () => {
            try {
                setCompareLoading(true)
                const res = await axios.get("/api/flow-attribution", {
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


    const summary = data?.summary || {
        total_users: 0, total_orders: 0, total_revenue: 0,
        avg_conversion_rate: 0, avg_aov: 0, total_unique_flows: 0,
        top_flow: null,
    }
    const compareSummary = compareData?.summary || {
        total_users: 0, total_orders: 0, total_revenue: 0,
        avg_conversion_rate: 0, avg_aov: 0, total_unique_flows: 0,
        top_flow: null,
    }

    const filteredFlows = useMemo(() => {
        if (!data?.flows) return []
        let filtered = data.flows
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            filtered = filtered.filter(f => f.flow_path.toLowerCase().includes(q))
        }
        const sorted = [...filtered]
        sorted.sort((a, b) => {
            const va = (a as any)[sortField] ?? 0
            const vb = (b as any)[sortField] ?? 0
            return sortDir === "desc" ? vb - va : va - vb
        })
        return sorted
    }, [data, sortField, sortDir, searchQuery])

    const toggleSort = (field: string) => {
        if (sortField === field) {
            setSortDir(sortDir === "desc" ? "asc" : "desc")
        } else {
            setSortField(field)
            setSortDir("desc")
        }
    }

    const SortHeader = ({ field, label, align }: { field: string; label: string; align?: string }) => (
        <th
            className={`px-3 py-2 font-semibold text-gray-600 cursor-pointer hover:text-gray-800 select-none whitespace-nowrap ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"}`}
            onClick={() => toggleSort(field)}
        >
            <span className="inline-flex items-center gap-1">
                {label}
                {sortField === field && <ArrowUpDown className="h-3 w-3 text-blue-500" />}
            </span>
        </th>
    )

    // Prepare bar chart data (top 10 flows by revenue)
    const barData = (data?.top_flows || []).slice(0, 10).map(f => ({
        name: f.flow_path.length > 35 ? f.flow_path.substring(0, 35) + "…" : f.flow_path,
        revenue: f.revenue,
        orders: f.orders,
        fullName: f.flow_path,
    }))

    return (
        <div className="space-y-6 mb-8 w-full max-w-full">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 tracking-tight">
                        Flow-Level Revenue Attribution
                    </h1>
                    <p className="text-sm text-gray-500">
                        Track user journey flows — which paths drive the most revenue
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton
                        disabled={loading || (data?.flows || []).length === 0}
                        onClick={() => {
                            const cols: ExportColumn[] = [
                                { header: "Flow Path", key: "flow_path" },
                                { header: "Users", key: "users", format: "number" },
                                { header: "Orders", key: "orders", format: "number" },
                                { header: "Revenue (₹)", key: "revenue", format: "currency" },
                                { header: "Conv Rate (%)", key: "conversion_rate", format: "percent" },
                                { header: "AOV (₹)", key: "aov", format: "currency" },
                            ]
                            exportToExcel(data?.flows || [], cols, "Flow_Attribution", startDate, endDate)
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
                    <DateRangePicker
                        startDate={startDate}
                        endDate={endDate}
                        onChange={(start, end) => { setDates(start, end) }}
                    />
                </div>
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
                    endpoint="/api/flow-attribution"
                    currentRange={{ start: startDate, end: endDate }}
                    compareRange={compare.range}
                    title="Flow Attribution — Period Comparison"
                />
            )}


            {/* ═══════ KPI Cards ═══════ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 shadow-sm border-l-4 border-l-blue-600">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-blue-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Total Revenue
                            <DollarSign className="h-4 w-4 text-blue-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-blue-700">
                            {loading ? "—" : formatCurrency(summary?.total_revenue || 0)}
                        </div>
                        <p className="text-xs text-blue-500/70 mt-1">across all flows</p>
                    
                    <DeltaLine current={summary?.total_revenue} previous={compareSummary?.total_revenue} kind="currency" />
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-emerald-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            Total Orders
                            <ShoppingCart className="h-4 w-4 text-emerald-600 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-emerald-700">
                            {loading ? "—" : (summary?.total_orders || 0)?.toLocaleString()}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            {summary.total_unique_flows?.toLocaleString()} unique flows
                        </p>
                    
                    <DeltaLine current={summary?.total_orders} previous={compareSummary?.total_orders} kind="count" />
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-amber-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            Avg Conversion
                            <Target className="h-4 w-4 text-amber-600 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-amber-600">
                            {loading ? "—" : `${summary.avg_conversion_rate}%`}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            AOV: {formatCurrency(summary.avg_aov)}
                        </p>
                    
                    <DeltaLine current={summary?.avg_conversion_rate} previous={compareSummary?.avg_conversion_rate} kind="percent" />
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-violet-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            Top Flow
                            <Workflow className="h-4 w-4 text-violet-600 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="text-3xl font-extrabold text-gray-800">—</div>
                        ) : summary.top_flow ? (
                            <>
                                <div className="text-sm font-bold text-violet-700 truncate max-w-full" title={summary.top_flow.flow_path}>
                                    {summary.top_flow.flow_path}
                                </div>
                                <p className="text-xs text-gray-400 mt-1">
                                    {formatCurrency(summary.top_flow.revenue)} · {summary.top_flow.orders?.toLocaleString()} orders
                                </p>
                            </>
                        ) : (
                            <div className="text-sm text-gray-400">No data</div>
                        )}
                    
                    
                    </CardContent>
                </Card>
            </div>

            {/* ═══════ Step Flow Visualization ═══════ */}
            {!loading && data?.step_transitions && data.step_transitions.length > 0 && (
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <Workflow className="h-4 w-4 text-gray-500" />
                            User Journey Flow — Step Transitions
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {data.step_transitions.slice(0, 12).map((t, idx) => (
                                <div
                                    key={`${t.from}-${t.to}-${idx}`}
                                    className="flex items-center gap-2 p-3 rounded-lg border border-gray-100 hover:border-blue-200 transition-colors bg-gradient-to-r from-gray-50 to-white"
                                >
                                    <span
                                        className="inline-flex px-2.5 py-1 rounded-md text-xs font-semibold text-white capitalize"
                                        style={{ backgroundColor: STEP_COLORS[t.from] || "#6b7280" }}
                                    >
                                        {t.from}
                                    </span>
                                    <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />
                                    <span
                                        className="inline-flex px-2.5 py-1 rounded-md text-xs font-semibold text-white capitalize"
                                        style={{ backgroundColor: STEP_COLORS[t.to] || "#6b7280" }}
                                    >
                                        {t.to}
                                    </span>
                                    <span className="ml-auto text-sm font-bold text-gray-700">
                                        {t.value?.toLocaleString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ═══════ Top Flows Bar Chart ═══════ */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-gray-500" />
                        Top 10 Flows by Revenue
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading || !barData.length ? (
                        <div className="h-80 flex items-center justify-center text-gray-400 text-sm">
                            {loading ? "Loading…" : "No data"}
                        </div>
                    ) : (
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={barData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={formatCurrency} />
                                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={250} />
                                    <ReTooltip content={<ChartTooltip />} />
                                    <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]}>
                                        {barData.map((_, i) => (
                                            <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ═══════ Detailed Flow Table ═══════ */}
            <Card className="shadow-sm">
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-gray-500" />
                            Flow Attribution Breakdown
                        </CardTitle>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search flows..."
                                className="pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 w-56"
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
                    ) : filteredFlows.length === 0 ? (
                        <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No flows found</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-200">
                                        <th className="text-left px-3 py-2 font-semibold text-gray-600">Flow Path</th>
                                        <SortHeader field="steps_count" label="Steps" align="center" />
                                        <SortHeader field="users" label="Users" align="center" />
                                        <SortHeader field="orders" label="Orders" align="center" />
                                        <SortHeader field="revenue" label="Revenue" align="right" />
                                        <SortHeader field="conversion_rate" label="Conv %" align="center" />
                                        <SortHeader field="aov" label="AOV" align="right" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredFlows.slice(0, 50).map((flow, idx) => (
                                        <tr
                                            key={`${flow.flow_path}-${idx}`}
                                            className="border-b border-gray-100 hover:bg-gray-50"
                                        >
                                            <td className="px-3 py-2.5 max-w-[400px]">
                                                <div className="flex flex-wrap items-center gap-1">
                                                    {flow.flow_path.split(" > ").map((step, i) => (
                                                        <span key={i} className="inline-flex items-center gap-1">
                                                            {i > 0 && <ArrowRight className="h-3 w-3 text-gray-300 shrink-0" />}
                                                            <span
                                                                className="inline-flex px-2 py-0.5 rounded text-xs font-medium text-white capitalize"
                                                                style={{ backgroundColor: STEP_COLORS[step] || "#6b7280" }}
                                                            >
                                                                {step}
                                                            </span>
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 text-center text-gray-600">{flow.steps_count}</td>
                                            <td className="px-3 py-2 text-center text-gray-700">{flow.users?.toLocaleString()}</td>
                                            <td className="px-3 py-2 text-center text-gray-700">{flow.orders?.toLocaleString()}</td>
                                            <td className="px-3 py-2 text-right font-medium text-blue-700">{formatCurrency(flow.revenue)}</td>
                                            <td className="px-3 py-2 text-center">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                    flow.conversion_rate >= 80 ? "bg-emerald-100 text-emerald-700" :
                                                    flow.conversion_rate >= 50 ? "bg-blue-100 text-blue-700" :
                                                    flow.conversion_rate >= 20 ? "bg-amber-100 text-amber-700" :
                                                    "bg-gray-100 text-gray-600"
                                                }`}>
                                                    {flow.conversion_rate}%
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-right text-gray-700">{formatCurrency(flow.aov)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
