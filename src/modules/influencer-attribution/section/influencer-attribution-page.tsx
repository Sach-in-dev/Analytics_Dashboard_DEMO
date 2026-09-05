"use client"

import { useEffect, useState, useMemo } from "react"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ExportButton } from "@/components/ui/export-button"
import { exportToExcel, ExportColumn } from "@/lib/export-utils"
import { api } from "@/lib/axios"
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell, AreaChart, Area, Legend,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDateRange } from "@/hooks/use-date-range"
import {
    Users, TrendingUp, Trophy, Eye,
    ArrowUpDown, ChevronUp, ChevronDown, Crown, Star,
    MousePointerClick,
    ArrowDown, Minus, ArrowUp
} from "lucide-react"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"

interface InfluencerData {
    influencer_name: string; total_orders: number; total_revenue: number
    unique_customers: number; avg_order_value: number; rank: number
}
interface TrendPoint { date: string; orders: number; revenue: number; customers: number; aov: number }
interface SummaryData {
    total_orders: number; total_revenue: number; total_customers: number
    avg_aov: number; total_influencers: number
    top_influencer: string; top_influencer_revenue: number
    worst_influencer: string; worst_influencer_revenue: number
}
interface InfluencerResponse { summary: SummaryData; influencers: InfluencerData[]; trend: TrendPoint[] }

const COLORS = ["#6366f1","#10b981","#f59e0b","#ef4444","#8b5cf6","#14b8a6","#f97316","#ec4899","#06b6d4","#84cc16","#a855f7","#3b82f6"]
type SortKey = "total_orders" | "unique_customers"

function fmtNum(v: number): string {
    if (v >= 10000000) return `${(v/10000000).toFixed(1)}Cr`
    if (v >= 100000) return `${(v/100000).toFixed(1)}L`
    if (v >= 1000) return `${(v/1000).toFixed(1)}K`
    return v.toLocaleString("en-IN")
}
function rankBadge(r: number) {
    if (r === 1) return <Crown className="h-4 w-4 text-amber-500" />
    if (r === 2) return <Star className="h-4 w-4 text-slate-400" />
    if (r === 3) return <Star className="h-4 w-4 text-amber-700" />
    return <span className="text-xs text-gray-400 font-mono w-4 text-center">{r}</span>
}

function ChartTip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload



        return (<div className="bg-white border border-gray-200 shadow-xl rounded-lg px-4 py-3 text-sm">
        <p className="font-semibold text-gray-800 mb-1 max-w-[220px] truncate">{d?.influencer_name || label}</p>
        <p className="text-gray-600">Page Views: <strong className="text-indigo-600">{fmtNum(d?.total_orders || 0)}</strong></p>
        <p className="text-gray-600">Unique Visitors: <strong className="text-emerald-600">{fmtNum(d?.unique_customers || 0)}</strong></p>
    </div>)
}
function TrendTip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    const prevDate = payload[0]?.payload?.prev_date
    return (<div className="bg-white border border-gray-200 shadow-xl rounded-lg px-4 py-3 text-sm">
        <p className="font-semibold text-gray-800 mb-1">{label}</p>
        {payload.map((p: any) => (<p key={p.name} className="text-gray-600">{p.name}: <strong style={{ color: p.color }}>{fmtNum(p.value)}</strong></p>))}
        {prevDate && <p className="mt-1.5 pt-1.5 border-t border-gray-100 text-[11px] text-gray-400">previous-period day: {prevDate}</p>}
    </div>)
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

export default function InfluencerAttributionPage() {
    const [data, setData] = useState<InfluencerResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [sortKey, setSortKey] = useState<SortKey>("total_orders")
    const [sortAsc, setSortAsc] = useState(false)
    const [filterName, setFilterName] = useState("")

    const getPastDate = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().split("T")[0] }
    const [startDate, endDate, setDates] = useDateRange()
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<InfluencerResponse | null>(null)
    const [compareLoading, setCompareLoading] = useState(false)

    useEffect(() => {
        (async () => {
            try {
                setLoading(true)
                const params: any = { start_date: startDate, end_date: endDate }
                if (filterName) params.influencer = filterName
                const r = await api.get("/influencer-attribution", { params })
                if (r.data?.success) setData(r.data.data)
            } catch (e) { console.error("Failed to load Influencer data", e) }
            finally { setLoading(false) }
        })()
    }, [startDate, endDate, filterName])

    const summary = data?.summary
    const compareSummary = compareData?.summary, influencers = data?.influencers || [], trend = data?.trend || [], compareTrend = compareData?.trend || []
    const handleSort = (k: SortKey) => { if (sortKey === k) setSortAsc(!sortAsc); else { setSortKey(k); setSortAsc(false) } }
    const sorted = useMemo(() => [...influencers].sort((a, b) => sortAsc ? (a[sortKey]) - (b[sortKey]) : (b[sortKey]) - (a[sortKey])), [influencers, sortKey, sortAsc])
    const SortIcon = ({ col }: { col: SortKey }) => { if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />; return sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" /> }
    const barData = useMemo(() => [...influencers].sort((a, b) => b.total_orders - a.total_orders).slice(0, 12), [influencers])

    // Total views and visitors
    const totalViews = summary?.total_orders || 0
    const totalVisitors = summary?.total_customers || 0

    return (
        <div className="space-y-6 mb-8 w-full max-w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 tracking-tight">Influencer Traffic Attribution</h1>
                    <p className="text-sm text-gray-500">Track influencer-driven visitors via UTM source data from Umami</p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton
                        disabled={loading || influencers.length === 0}
                        onClick={() => {
                            const cols: ExportColumn[] = [
                                { header: "Rank", key: "rank", format: "number" },
                                { header: "Influencer", key: "influencer_name" },
                                { header: "Page Views", key: "total_orders", format: "number" },
                                { header: "Unique Visitors", key: "unique_customers", format: "number" },
                            ]
                            exportToExcel(sorted, cols, "Influencer_Traffic", startDate, endDate)
                        }}
                    />
                    <input type="text" placeholder="Search influencer..." value={filterName} onChange={e => setFilterName(e.target.value)}
                        className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 w-[170px]" />
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

            {compare.range && (
                <CompareBanner
                    current={{ start: startDate, end: endDate }}
                    compare={compare.range}
                    mode={compare.mode}
                />
            )}
            {compare.range && (
                <CompareSummary
                    endpoint="/api/influencer-attribution"
                    currentRange={{ start: startDate, end: endDate }}
                    compareRange={compare.range}
                    title="Influencer Attribution — Period Comparison"
                />
            )}


            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 shadow-sm border-l-4 border-l-indigo-500">
                    <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-indigo-600 uppercase tracking-widest flex items-center justify-between gap-2">Total Page Views<Eye className="h-4 w-4 text-indigo-500 shrink-0" /></CardTitle></CardHeader>
                    <CardContent><div className="text-3xl font-extrabold text-indigo-700">{loading ? "—" : fmtNum(totalViews)}</div><p className="text-xs text-indigo-500/70 mt-1">{!loading && summary ? `from ${summary.total_influencers} influencer sources` : "—"}</p>
                    <DeltaLine current={totalViews} previous={compareSummary?.total_orders} kind="count" />
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 shadow-sm border-l-4 border-l-emerald-500">
                    <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-emerald-600 uppercase tracking-widest flex items-center justify-between gap-2">Unique Visitors<Users className="h-4 w-4 text-emerald-500 shrink-0" /></CardTitle></CardHeader>
                    <CardContent><div className="text-3xl font-extrabold text-emerald-700">{loading ? "—" : fmtNum(totalVisitors)}</div><p className="text-xs text-emerald-500/70 mt-1">Distinct users from influencer links</p>
                    <DeltaLine current={totalVisitors} previous={compareSummary?.total_customers} kind="count" />
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 shadow-sm border-l-4 border-l-amber-500">
                    <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-amber-600 uppercase tracking-widest flex items-center justify-between gap-2">Influencer Sources<MousePointerClick className="h-4 w-4 text-amber-500 shrink-0" /></CardTitle></CardHeader>
                    <CardContent><div className="text-3xl font-extrabold text-amber-700">{loading ? "—" : (summary?.total_influencers || 0)}</div><p className="text-xs text-amber-500/70 mt-1">Unique UTM sources tracked</p>
                    <DeltaLine current={summary?.total_influencers} previous={compareSummary?.total_influencers} kind="count" />
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-violet-50 to-violet-100/50 shadow-sm border-l-4 border-l-violet-500">
                    <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-violet-600 uppercase tracking-widest flex items-center justify-between gap-2">Top Source<Trophy className="h-4 w-4 text-violet-500 shrink-0" /></CardTitle></CardHeader>
                    <CardContent><div className="text-lg font-extrabold text-violet-700 truncate max-w-[200px]">{loading ? "—" : (summary?.top_influencer || "N/A")}</div><p className="text-xs text-violet-500/70 mt-1">{!loading && summary?.top_influencer_revenue ? `${fmtNum(summary.top_influencer_revenue)} views` : "—"}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Insight */}
            {!loading && influencers.length > 0 && (
                <Card className="bg-gradient-to-r from-slate-50 to-violet-50/30 shadow-sm border-l-4 border-l-violet-400">
                    <CardContent className="py-4">
                        <p className="text-sm text-gray-600 leading-relaxed">
                            <strong className="text-gray-800">💡 Insight:</strong>{" "}
                            <strong className="text-indigo-700">{summary?.top_influencer}</strong> is your top influencer source with {fmtNum(summary?.top_influencer_revenue || 0)} page views.
                            {summary?.worst_influencer && summary.worst_influencer !== "N/A" && summary.worst_influencer !== summary.top_influencer && (<> Lowest performer: <strong className="text-rose-600">{summary.worst_influencer}</strong> ({fmtNum(summary.worst_influencer_revenue || 0)} views).</>)}
                            {" "}Total: {summary?.total_influencers} influencer sources, {fmtNum(totalViews)} page views, {fmtNum(totalVisitors)} unique visitors.
                        </p>
                    </CardContent>
                </Card>)}

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Views bar chart */}
                <Card className="shadow-sm">
                    <CardHeader><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Eye className="h-4 w-4 text-gray-500" />Page Views by Influencer</CardTitle></CardHeader>
                    <CardContent>
                        {loading ? (<div className="h-[360px] flex items-center justify-center text-gray-400 text-sm">Loading…</div>) : barData.length === 0 ? (<div className="h-[360px] flex items-center justify-center text-gray-400 text-sm">No influencer data</div>) : (
                            <div className="w-full" style={{ height: Math.max(200, barData.length * 44 + 40) }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={barData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={v => fmtNum(v)} />
                                        <YAxis type="category" dataKey="influencer_name" width={140} tick={{ fontSize: 11, fill: "#374151" }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<ChartTip />} />
                                        <Bar dataKey="total_orders" name="Page Views" radius={[0, 6, 6, 0]}>{barData.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}</Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>)}
                    </CardContent>
                </Card>

                {/* Leaderboard */}
                <Card className="shadow-sm">
                    <CardHeader><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Crown className="h-4 w-4 text-amber-500" />Influencer Leaderboard<span className="text-xs text-gray-400 font-normal ml-1">Ranked by Page Views</span></CardTitle></CardHeader>
                    <CardContent>
                        {loading ? (<div className="h-[360px] flex items-center justify-center text-gray-400 text-sm">Loading…</div>) : influencers.length === 0 ? (<div className="h-[360px] flex items-center justify-center text-gray-400 text-sm">No data</div>) : (
                            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                                {influencers.slice(0, 10).map((inf, idx) => {
                                    const maxViews = influencers[0]?.total_orders || 1
                                    const pct = Math.round((inf.total_orders / maxViews) * 100)
                                    return (<div key={inf.influencer_name} className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${idx === 0 ? "bg-gradient-to-r from-amber-50 to-amber-100/40 border border-amber-200/60" : "bg-gray-50/60 hover:bg-gray-100/60"}`}>
                                        <div className="shrink-0 w-6 flex justify-center">{rankBadge(inf.rank)}</div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-gray-800 text-sm truncate">{inf.influencer_name}</p>
                                            <div className="w-full bg-gray-200/60 rounded-full h-1.5 mt-1.5">
                                                <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: COLORS[idx % COLORS.length] }} />
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="font-bold text-indigo-700 text-sm">{fmtNum(inf.total_orders)} views</p>
                                            <p className="text-[10px] text-gray-400">{fmtNum(inf.unique_customers)} visitors</p>
                                        </div>
                                    </div>)
                                })}
                            </div>)}
                    </CardContent>
                </Card>
            </div>

            {/* Trend */}
            {trend.length > 0 && (
                <Card className="shadow-sm">
                    <CardHeader><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-gray-500" />Daily Influencer Traffic Trend</CardTitle></CardHeader>
                    <CardContent>
                        <div className="h-[280px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={trend.map((row,i)=>({...row,prev_orders:compareTrend[i]?.orders??null,prev_customers:compareTrend[i]?.customers??null,prev_date:compareTrend[i]?.date??null}))} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="infViewsG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} /><stop offset="95%" stopColor="#6366f1" stopOpacity={0} /></linearGradient>
                                        <linearGradient id="infVisG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.2} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                                    <YAxis yAxisId="left" tickFormatter={v => fmtNum(v)} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                                    <Tooltip content={<TrendTip />} /><Legend />
                                    <Area yAxisId="left" type="monotone" dataKey="orders" name="Page Views" stroke="#6366f1" fill="url(#infViewsG)" strokeWidth={2.5} />
                                    <Area yAxisId="right" type="monotone" dataKey="customers" name="Visitors" stroke="#10b981" fill="url(#infVisG)" strokeWidth={1.5} />
                                    {compare.range && (
                                        <Area yAxisId="left" type="monotone" dataKey="prev_orders" name="Page Views (previous)" stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={2} fill="transparent" dot={false} connectNulls />
                                    )}
                                    {compare.range && (
                                        <Area yAxisId="right" type="monotone" dataKey="prev_customers" name="Visitors (previous)" stroke="#86efac" strokeDasharray="5 5" strokeWidth={2} fill="transparent" dot={false} connectNulls />
                                    )}
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>)}

            {/* Table */}
            <Card className="shadow-sm">
                <CardHeader><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Users className="h-4 w-4 text-gray-500" />Influencer Breakdown<span className="text-xs text-gray-400 font-normal ml-2">Click headers to sort</span></CardTitle></CardHeader>
                <CardContent>
                    {loading ? (<div className="py-12 text-center text-gray-400 text-sm">Loading…</div>) : sorted.length === 0 ? (<div className="py-12 text-center text-gray-400 text-sm">No influencer data found. Ensure UTM sources are tracked in Umami.</div>) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead><tr className="border-b border-gray-100">
                                    <th className="text-left py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider w-8">#</th>
                                    <th className="text-left py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Influencer Source</th>
                                    <th className="text-right py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("total_orders")}><span className="inline-flex items-center gap-1">Page Views <SortIcon col="total_orders" /></span></th>
                                    <th className="text-right py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("unique_customers")}><span className="inline-flex items-center gap-1">Visitors <SortIcon col="unique_customers" /></span></th>
                                </tr></thead>
                                <tbody>
                                    {sorted.map((inf, idx) => {
                                        const isTop = inf.influencer_name === summary?.top_influencer
                                        return (<tr key={inf.influencer_name + idx} className={`border-b border-gray-50 transition-colors hover:bg-gray-50/80 ${isTop ? "bg-indigo-50/30" : ""}`}>
                                            <td className="py-3 px-3">{rankBadge(inf.rank)}</td>
                                            <td className="py-3 px-3 font-medium text-gray-700"><div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} /><span className="truncate max-w-[200px]">{inf.influencer_name}</span>{isTop && <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-semibold shrink-0">TOP</span>}</div></td>
                                            <td className="py-3 px-3 text-right text-indigo-600 font-bold">{fmtNum(inf.total_orders)}</td>
                                            <td className="py-3 px-3 text-right text-emerald-600 font-medium">{fmtNum(inf.unique_customers)}</td>
                                        </tr>)
                                    })}
                                </tbody>
                            </table>
                        </div>)}
                
                
                </CardContent>
            </Card>

        </div>
    )
}
