"use client"

import { useEffect, useState, useMemo } from "react"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ExportButton } from "@/components/ui/export-button"
import { exportToExcel, ExportColumn } from "@/lib/export-utils"
import { api } from "@/lib/axios"
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend, ScatterChart, Scatter, Cell,
    AreaChart, Area, ZAxis,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDateRange } from "@/hooks/use-date-range"
import {
    Users, TrendingUp, Trophy, AlertTriangle,
    DollarSign, ArrowUpDown, ChevronUp, ChevronDown,
    Eye, Target,
    ArrowDown, Minus, ArrowUp
} from "lucide-react"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"

interface AudienceData {
    adset_id: string; adset_name: string; campaign_name: string
    spend: number; impressions: number; clicks: number; conversions: number
    revenue: number; roas: number; ctr: number; cpc: number; conversion_rate: number
}
interface TrendPoint { date: string; spend: number; revenue: number; clicks: number; impressions: number; conversions: number; roas: number }
interface SummaryData {
    total_spend: number; total_revenue: number; avg_roas: number; total_conversions: number
    total_audiences: number; best_audience: string; best_audience_roas: number
    worst_audience: string; worst_audience_roas: number
}
interface AudienceRoasData { summary: SummaryData; audiences: AudienceData[]; trend: TrendPoint[]; campaigns: string[] }

const COLORS = ["#6366f1","#10b981","#f59e0b","#ef4444","#8b5cf6","#14b8a6","#f97316","#ec4899","#06b6d4","#84cc16","#a855f7","#3b82f6"]
type SortKey = "roas" | "spend" | "revenue" | "conversion_rate" | "ctr" | "conversions"

function fmt(v: number): string {
    if (v >= 10000000) return `₹${(v/10000000).toFixed(1)}Cr`
    if (v >= 100000) return `₹${(v/100000).toFixed(1)}L`
    if (v >= 1000) return `₹${(v/1000).toFixed(1)}K`
    return `₹${v.toLocaleString("en-IN")}`
}
function roasColor(r: number) { if (r >= 3) return "text-emerald-600"; if (r >= 1) return "text-amber-600"; return "text-rose-600" }
function roasBg(r: number) { if (r >= 3) return "bg-emerald-100 text-emerald-700"; if (r >= 1) return "bg-amber-100 text-amber-700"; return "bg-rose-100 text-rose-700" }
function truncName(n: string, m=22) { return n.length > m ? n.slice(0, m) + "…" : n }

function ChartTip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload



        return (<div className="bg-white border border-gray-200 shadow-xl rounded-lg px-4 py-3 text-sm">
        <p className="font-semibold text-gray-800 mb-1 max-w-[240px] truncate">{d?.adset_name || label}</p>
        <p className="text-gray-600">ROAS: <strong className={roasColor(d?.roas || 0)}>{(d?.roas || 0).toFixed(2)}x</strong></p>
        <p className="text-gray-600">Revenue: <strong className="text-emerald-600">{fmt(d?.revenue || 0)}</strong></p>
        <p className="text-gray-600">Spend: <strong className="text-rose-600">{fmt(d?.spend || 0)}</strong></p>
        <p className="text-gray-600">Conv Rate: <strong className="text-indigo-600">{(d?.conversion_rate || 0).toFixed(2)}%</strong></p>
    </div>)
}

function ScatterTip({ active, payload }: any) {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload
    return (<div className="bg-white border border-gray-200 shadow-xl rounded-lg px-4 py-3 text-sm">
        <p className="font-semibold text-gray-800 mb-1 max-w-[240px] truncate">{d?.adset_name}</p>
        <p className="text-gray-600">Spend: <strong>{fmt(d?.spend || 0)}</strong></p>
        <p className="text-gray-600">ROAS: <strong className={roasColor(d?.roas || 0)}>{(d?.roas || 0).toFixed(2)}x</strong></p>
        <p className="text-gray-600">Revenue: <strong className="text-emerald-600">{fmt(d?.revenue || 0)}</strong></p>
    </div>)
}

function TrendTip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    const prevDate = payload[0]?.payload?.prev_date
    return (<div className="bg-white border border-gray-200 shadow-xl rounded-lg px-4 py-3 text-sm">
        <p className="font-semibold text-gray-800 mb-1">{label}</p>
        {payload.map((p: any) => (<p key={p.name} className="text-gray-600">{p.name}: <strong style={{ color: p.color }}>{p.name === "ROAS" ? `${p.value.toFixed(2)}x` : fmt(p.value)}</strong></p>))}
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

export default function AudienceRoasPage() {
    const [data, setData] = useState<AudienceRoasData | null>(null)
    const [loading, setLoading] = useState(true)
    const [sortKey, setSortKey] = useState<SortKey>("roas")
    const [sortAsc, setSortAsc] = useState(false)
    const [campaignFilter, setCampaignFilter] = useState("")

    const getPastDate = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().split("T")[0] }
    const [startDate, endDate, setDates] = useDateRange()
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<AudienceRoasData | null>(null)
    const [compareLoading, setCompareLoading] = useState(false)

    useEffect(() => {
        (async () => {
            try {
                setLoading(true)
                const params: any = { start_date: startDate, end_date: endDate }
                if (campaignFilter) params.campaign = campaignFilter
                const r = await api.get("/audience-roas", { params })
                if (r.data?.success) setData(r.data.data)
            } catch (e) { console.error("Failed to load Audience ROAS", e) }
            finally { setLoading(false) }
        })()
    }, [startDate, endDate, campaignFilter])

    const summary = data?.summary
    const compareSummary = compareData?.summary, audiences = data?.audiences || [], trend = data?.trend || [], compareTrend = compareData?.trend || [], campaigns = data?.campaigns || []
    const handleSort = (k: SortKey) => { if (sortKey === k) setSortAsc(!sortAsc); else { setSortKey(k); setSortAsc(false) } }
    const sorted = useMemo(() => [...audiences].filter(a => a.spend > 0).sort((a, b) => sortAsc ? (a[sortKey] as number) - (b[sortKey] as number) : (b[sortKey] as number) - (a[sortKey] as number)), [audiences, sortKey, sortAsc])
    const SortIcon = ({ col }: { col: SortKey }) => { if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />; return sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" /> }
    const roasBarData = useMemo(() => [...audiences].filter(a => a.spend > 0).sort((a, b) => b.roas - a.roas).slice(0, 15), [audiences])
    const scatterData = useMemo(() => audiences.filter(a => a.spend > 0 && a.roas > 0), [audiences])

    return (
        <div className="space-y-6 mb-8 w-full max-w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 tracking-tight">ROAS by Audience</h1>
                    <p className="text-sm text-gray-500">Adset-level audience performance from Meta Ads</p>
                </div>
                <div className="flex items-center gap-3">
                    {campaigns.length > 0 && (
                        <select value={campaignFilter} onChange={e => setCampaignFilter(e.target.value)}
                            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 max-w-[200px] truncate">
                            <option value="">All Campaigns</option>
                            {campaigns.map(c => (<option key={c} value={c}>{truncName(c, 30)}</option>))}
                        </select>
                    )}
                    <ExportButton
                        disabled={loading || audiences.length === 0}
                        onClick={() => {
                            const cols: ExportColumn[] = [
                                { header: "Audience", key: "adset_name" },
                                { header: "Campaign", key: "campaign_name" },
                                { header: "Spend (₹)", key: "spend", format: "currency" },
                                { header: "Revenue (₹)", key: "revenue", format: "currency" },
                                { header: "ROAS", key: "roas", format: "number" },
                                { header: "Impressions", key: "impressions", format: "number" },
                                { header: "Clicks", key: "clicks", format: "number" },
                                { header: "CTR (%)", key: "ctr", format: "percent" },
                                { header: "Conv Rate (%)", key: "conversion_rate", format: "percent" },
                                { header: "Conversions", key: "conversions", format: "number" },
                            ]
                            exportToExcel(sorted, cols, "Audience_ROAS", startDate, endDate)
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

            {compare.range && (
                <CompareBanner
                    current={{ start: startDate, end: endDate }}
                    compare={compare.range}
                    mode={compare.mode}
                />
            )}
            {compare.range && (
                <CompareSummary
                    endpoint="/api/audience-roas"
                    currentRange={{ start: startDate, end: endDate }}
                    compareRange={compare.range}
                    title="Audience Roas — Period Comparison"
                />
            )}


            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 shadow-sm border-l-4 border-l-indigo-500">
                    <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-indigo-600 uppercase tracking-widest flex items-center justify-between gap-2">Avg ROAS<TrendingUp className="h-4 w-4 text-indigo-500 shrink-0" /></CardTitle></CardHeader>
                    <CardContent><div className={`text-3xl font-extrabold ${roasColor(summary?.avg_roas || 0)}`}>{loading ? "—" : `${(summary?.avg_roas || 0).toFixed(2)}x`}</div><p className="text-xs text-indigo-500/70 mt-1">Revenue ÷ Spend</p>
                    <DeltaLine current={summary?.avg_roas} previous={compareSummary?.avg_roas} kind="count" />
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 shadow-sm border-l-4 border-l-emerald-500">
                    <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-emerald-600 uppercase tracking-widest flex items-center justify-between gap-2">Total Revenue<DollarSign className="h-4 w-4 text-emerald-500 shrink-0" /></CardTitle></CardHeader>
                    <CardContent><div className="text-3xl font-extrabold text-emerald-700">{loading ? "—" : fmt(summary?.total_revenue || 0)}</div><p className="text-xs text-emerald-500/70 mt-1">{!loading && summary ? `${summary.total_conversions.toLocaleString()} conversions` : "—"}</p>
                    <DeltaLine current={summary?.total_revenue} previous={compareSummary?.total_revenue} kind="currency" />
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 shadow-sm border-l-4 border-l-amber-500">
                    <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-amber-600 uppercase tracking-widest flex items-center justify-between gap-2">Total Spend<DollarSign className="h-4 w-4 text-amber-500 shrink-0" /></CardTitle></CardHeader>
                    <CardContent><div className="text-3xl font-extrabold text-amber-700">{loading ? "—" : fmt(summary?.total_spend || 0)}</div><p className="text-xs text-amber-500/70 mt-1">{!loading && summary ? `${summary.total_audiences} audiences` : "—"}</p>
                    <DeltaLine current={summary?.total_spend} previous={compareSummary?.total_spend} kind="currency" lowerIsBetter />
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-emerald-50/80 to-teal-50/50 shadow-sm border-l-4 border-l-teal-500">
                    <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-teal-600 uppercase tracking-widest flex items-center justify-between gap-2">Best Audience<Trophy className="h-4 w-4 text-teal-500 shrink-0" /></CardTitle></CardHeader>
                    <CardContent><div className="text-lg font-extrabold text-teal-700 truncate max-w-[200px]">{loading ? "—" : (summary?.best_audience || "N/A")}</div><p className="text-xs text-teal-500/70 mt-1">{!loading && summary?.best_audience_roas ? `ROAS: ${summary.best_audience_roas.toFixed(2)}x` : "—"}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Insight */}
            {!loading && audiences.length > 0 && (
                <Card className="bg-gradient-to-r from-slate-50 to-indigo-50/30 shadow-sm border-l-4 border-l-indigo-400">
                    <CardContent className="py-4">
                        <p className="text-sm text-gray-600 leading-relaxed">
                            <strong className="text-gray-800">💡 Insight:</strong>{" "}
                            {summary?.best_audience && summary.best_audience !== "N/A" ? (<>
                                <strong className="text-emerald-700">{summary.best_audience}</strong> is your top audience with ROAS of <strong className="text-emerald-600">{summary.best_audience_roas.toFixed(2)}x</strong>.
                                {summary.worst_audience && summary.worst_audience !== "N/A" && summary.worst_audience !== summary.best_audience && (<> Consider reducing budget for <strong className="text-rose-600">{summary.worst_audience}</strong> (ROAS: {summary.worst_audience_roas.toFixed(2)}x).</>)}
                                {" "}Across {summary.total_audiences} audiences: avg ROAS <strong className={roasColor(summary.avg_roas)}>{summary.avg_roas.toFixed(2)}x</strong>, {summary.total_conversions.toLocaleString()} conversions.
                            </>) : (<>No audience data available. Ensure Meta Ads API is configured.</>)}
                        </p>
                    </CardContent>
                </Card>)}

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* ROAS Bar Chart */}
                <Card className="shadow-sm">
                    <CardHeader><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Target className="h-4 w-4 text-gray-500" />ROAS by Audience<span className="text-xs text-gray-400 font-normal ml-1">Higher = better</span></CardTitle></CardHeader>
                    <CardContent>
                        {loading ? (<div className="h-[360px] flex items-center justify-center text-gray-400 text-sm">Loading…</div>) : roasBarData.length === 0 ? (<div className="h-[360px] flex items-center justify-center text-gray-400 text-sm">No audience data</div>) : (
                            <div className="w-full" style={{ height: Math.max(200, roasBarData.length * 44 + 40) }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={roasBarData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={v => `${v.toFixed(1)}x`} />
                                        <YAxis type="category" dataKey="adset_name" width={150} tick={{ fontSize: 11, fill: "#374151" }} axisLine={false} tickLine={false} tickFormatter={v => truncName(v)} />
                                        <Tooltip content={<ChartTip />} /><Bar dataKey="roas" name="ROAS" radius={[0, 6, 6, 0]}>{roasBarData.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}</Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>)}
                    </CardContent>
                </Card>
                {/* Scatter: Spend vs ROAS */}
                <Card className="shadow-sm">
                    <CardHeader><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Users className="h-4 w-4 text-gray-500" />Spend vs ROAS<span className="text-xs text-gray-400 font-normal ml-1">Scale high-ROAS, high-spend audiences</span></CardTitle></CardHeader>
                    <CardContent>
                        {loading ? (<div className="h-[360px] flex items-center justify-center text-gray-400 text-sm">Loading…</div>) : scatterData.length === 0 ? (<div className="h-[360px] flex items-center justify-center text-gray-400 text-sm">No data</div>) : (
                            <div className="h-[360px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ScatterChart margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="spend" name="Spend" tickFormatter={v => fmt(v)} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                                        <YAxis dataKey="roas" name="ROAS" tickFormatter={v => `${v}x`} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                                        <ZAxis dataKey="revenue" range={[40, 400]} name="Revenue" />
                                        <Tooltip content={<ScatterTip />} />
                                        <Scatter data={scatterData} name="Audiences">{scatterData.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.8} />))}</Scatter>
                                    </ScatterChart>
                                </ResponsiveContainer>
                            </div>)}
                    </CardContent>
                </Card>
            </div>

            {/* Trend */}
            {trend.length > 0 && (
                <Card className="shadow-sm">
                    <CardHeader><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-gray-500" />Daily ROAS Trend</CardTitle></CardHeader>
                    <CardContent>
                        <div className="h-[280px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={trend.map((row,i)=>({...row,prev_roas:compareTrend[i]?.roas??null,prev_revenue:compareTrend[i]?.revenue??null,prev_date:compareTrend[i]?.date??null}))} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="arRoasG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} /><stop offset="95%" stopColor="#6366f1" stopOpacity={0} /></linearGradient>
                                        <linearGradient id="arRevG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.2} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                                        <linearGradient id="arSpG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2} /><stop offset="95%" stopColor="#f43f5e" stopOpacity={0} /></linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                                    <YAxis yAxisId="left" tickFormatter={v => fmt(v)} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                                    <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v}x`} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                                    <Tooltip content={<TrendTip />} /><Legend />
                                    <Area yAxisId="right" type="monotone" dataKey="roas" name="ROAS" stroke="#6366f1" fill="url(#arRoasG)" strokeWidth={2.5} />
                                    <Area yAxisId="left" type="monotone" dataKey="revenue" name="Revenue" stroke="#10b981" fill="url(#arRevG)" strokeWidth={1.5} />
                                    <Area yAxisId="left" type="monotone" dataKey="spend" name="Spend" stroke="#f43f5e" fill="url(#arSpG)" strokeWidth={1.5} />
                                    {compare.range && (
                                        <Area yAxisId="right" type="monotone" dataKey="prev_roas" name="ROAS (previous)" stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={2} fill="transparent" dot={false} connectNulls />
                                    )}
                                    {compare.range && (
                                        <Area yAxisId="left" type="monotone" dataKey="prev_revenue" name="Revenue (previous)" stroke="#86efac" strokeDasharray="5 5" strokeWidth={2} fill="transparent" dot={false} connectNulls />
                                    )}
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>)}

            {/* Table */}
            <Card className="shadow-sm">
                <CardHeader><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Eye className="h-4 w-4 text-gray-500" />Audience Breakdown<span className="text-xs text-gray-400 font-normal ml-2">Click headers to sort</span></CardTitle></CardHeader>
                <CardContent>
                    {loading ? (<div className="py-12 text-center text-gray-400 text-sm">Loading…</div>) : sorted.length === 0 ? (<div className="py-12 text-center text-gray-400 text-sm">No audience data</div>) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead><tr className="border-b border-gray-100">
                                    <th className="text-left py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Audience (Adset)</th>
                                    <th className="text-left py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Campaign</th>
                                    <th className="text-right py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("spend")}><span className="inline-flex items-center gap-1">Spend <SortIcon col="spend" /></span></th>
                                    <th className="text-right py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("revenue")}><span className="inline-flex items-center gap-1">Revenue <SortIcon col="revenue" /></span></th>
                                    <th className="text-right py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("roas")}><span className="inline-flex items-center gap-1">ROAS <SortIcon col="roas" /></span></th>
                                    <th className="text-right py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("ctr")}><span className="inline-flex items-center gap-1">CTR <SortIcon col="ctr" /></span></th>
                                    <th className="text-right py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("conversion_rate")}><span className="inline-flex items-center gap-1">Conv% <SortIcon col="conversion_rate" /></span></th>
                                    <th className="text-right py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("conversions")}><span className="inline-flex items-center gap-1">Conv <SortIcon col="conversions" /></span></th>
                                </tr></thead>
                                <tbody>
                                    {sorted.map((a, idx) => {
                                        const isBest = a.adset_name === summary?.best_audience
                                        const isWorst = a.adset_name === summary?.worst_audience
                                        return (<tr key={a.adset_id + "-" + idx} className={`border-b border-gray-50 transition-colors hover:bg-gray-50/80 ${isBest ? "bg-emerald-50/30" : isWorst ? "bg-rose-50/20" : ""}`}>
                                            <td className="py-3 px-3 font-medium text-gray-700"><div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} /><span className="truncate max-w-[200px]">{a.adset_name}</span>{isBest && <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold shrink-0">BEST</span>}{isWorst && <span className="text-[9px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full font-semibold shrink-0">LOW</span>}</div></td>
                                            <td className="py-3 px-3 text-gray-500 truncate max-w-[140px]">{a.campaign_name}</td>
                                            <td className="py-3 px-3 text-right text-rose-600 font-medium">{fmt(a.spend)}</td>
                                            <td className="py-3 px-3 text-right text-emerald-600 font-medium">{fmt(a.revenue)}</td>
                                            <td className="py-3 px-3 text-right"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${roasBg(a.roas)}`}>{a.roas > 0 ? `${a.roas.toFixed(2)}x` : "—"}</span></td>
                                            <td className="py-3 px-3 text-right text-gray-600">{a.ctr > 0 ? `${a.ctr.toFixed(2)}%` : "—"}</td>
                                            <td className="py-3 px-3 text-right text-indigo-600 font-medium">{a.conversion_rate > 0 ? `${a.conversion_rate.toFixed(2)}%` : "—"}</td>
                                            <td className="py-3 px-3 text-right text-gray-600 font-medium">{a.conversions.toLocaleString()}</td>
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
