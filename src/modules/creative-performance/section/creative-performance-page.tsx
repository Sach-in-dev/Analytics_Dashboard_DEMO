"use client"

import { useEffect, useState, useMemo } from "react"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ExportButton } from "@/components/ui/export-button"
import { exportToExcel, ExportColumn } from "@/lib/export-utils"
import { api } from "@/lib/axios"
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend, AreaChart, Area, Cell,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDateRange } from "@/hooks/use-date-range"
import {
    Sparkles, TrendingUp, Trophy, AlertTriangle,
    DollarSign, ArrowUpDown, ChevronUp, ChevronDown,
    Eye, MousePointerClick,
    ArrowDown, Minus, ArrowUp,
} from "lucide-react"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"

interface CreativeData {
    [key: string]: string | number | null
    creative_id: string
    creative_name: string
    campaign_name: string
    orders: number
    revenue_actual: number
    spend: number
    clicks: number
    impressions: number
    roas: number
    ctr: number
    cpc: number
    meta_revenue: number
    revenue_diff: number
    flag: string | null
}

interface TrendPoint { date: string; spend: number; revenue_actual: number; orders: number; clicks: number; impressions: number; roas: number }

interface SummaryData {
    total_spend: number; total_revenue_actual: number; avg_roas: number; total_orders: number
    best_creative: string; best_creative_roas: number
    worst_creative: string; worst_creative_roas: number
    total_creatives: number; over_reporting_count: number
}

interface CreativePerfData { summary: SummaryData; creatives: CreativeData[]; trend: TrendPoint[] }

const COLORS = ["#6366f1","#10b981","#f59e0b","#ef4444","#8b5cf6","#14b8a6","#f97316","#ec4899","#06b6d4","#84cc16","#a855f7","#3b82f6"]
type SortKey = "roas" | "spend" | "revenue_actual" | "orders" | "revenue_diff" | "ctr"

function fmt(v: number): string {
    if (v >= 10000000) return `₹${(v/10000000).toFixed(1)}Cr`
    if (v >= 100000) return `₹${(v/100000).toFixed(1)}L`
    if (v >= 1000) return `₹${(v/1000).toFixed(1)}K`
    return `₹${v.toLocaleString("en-IN")}`
}
function fmtNum(v: number): string { return v >= 1000 ? `${(v/1000).toFixed(1)}K` : v.toLocaleString() }
function roasColor(r: number) { if (r >= 3) return "text-emerald-600"; if (r >= 1) return "text-amber-600"; return "text-rose-600" }
function roasBg(r: number) { if (r >= 3) return "bg-emerald-100 text-emerald-700"; if (r >= 1) return "bg-amber-100 text-amber-700"; return "bg-rose-100 text-rose-700" }
function truncName(n: string, m=20) { return n.length>m ? n.slice(0,m)+"…" : n }

function BarTip({active,payload,label}:any) {
    if (!active||!payload?.length) return null
    const d=payload[0]?.payload

    

        return (<div className="bg-white border border-gray-200 shadow-xl rounded-lg px-4 py-3 text-sm">
        <p className="font-semibold text-gray-800 mb-1 max-w-[220px] truncate">{d?.creative_name||label}</p>
        <p className="text-gray-600">ROAS: <strong className={roasColor(d?.roas||0)}>{(d?.roas||0).toFixed(2)}x</strong></p>
        <p className="text-gray-600">Revenue: <strong className="text-emerald-600">{fmt(d?.revenue_actual||0)}</strong></p>
        <p className="text-gray-600">Spend: <strong className="text-rose-600">{fmt(d?.spend||0)}</strong></p>
        <p className="text-gray-600">Orders: <strong className="text-blue-600">{fmtNum(d?.orders||0)}</strong></p>
    </div>)
}

function TrendTip({active,payload,label}:any) {
    if (!active||!payload?.length) return null
    const prevDate = payload[0]?.payload?.prev_date
    return (<div className="bg-white border border-gray-200 shadow-xl rounded-lg px-4 py-3 text-sm">
        <p className="font-semibold text-gray-800 mb-1">{label}</p>
        {payload.map((p:any)=>(<p key={p.name} className="text-gray-600">{p.name}: <strong style={{color:p.color}}>{p.name==="ROAS"?`${p.value.toFixed(2)}x`:fmt(p.value)}</strong></p>))}
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

export default function CreativePerformancePage() {
    const [data,setData]=useState<CreativePerfData|null>(null)
    const [loading,setLoading]=useState(true)
    const [sortKey,setSortKey]=useState<SortKey>("roas")
    const [sortAsc,setSortAsc]=useState(false)

    const getPastDate=(days:number)=>{const d=new Date();d.setDate(d.getDate()-days);return d.toISOString().split("T")[0]}
    const [startDate, endDate, setDates] = useDateRange()
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<CreativePerfData|null>(null)
    const [compareLoading, setCompareLoading] = useState(false)

    useEffect(()=>{
        (async()=>{
            try { setLoading(true); const r=await api.get("/creative-performance",{params:{start_date:startDate,end_date:endDate}}); if(r.data?.success) setData(r.data.data) }
            catch(e){ console.error("Failed to load Creative Performance",e) }
            finally{ setLoading(false) }
        })()
    },[startDate,endDate])

    useEffect(() => {
        if (!compare.range) { setCompareData(null); return }
        const fetchCompare = async () => {
            try {
                setCompareLoading(true)
                const res = await api.get("/creative-performance", {
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


    const summary=data?.summary
    const compareSummary = compareData?.summary, creatives=data?.creatives||[], trend=data?.trend||[], compareTrend=compareData?.trend||[]
    const handleSort=(k:SortKey)=>{ if(sortKey===k) setSortAsc(!sortAsc); else{setSortKey(k);setSortAsc(k==="roas"?false:true)} }
    const sorted=useMemo(()=>[...creatives].filter(c=>c.spend>0).sort((a,b)=>sortAsc?(a[sortKey] as number)-(b[sortKey] as number):(b[sortKey] as number)-(a[sortKey] as number)),[creatives,sortKey,sortAsc])
    const SortIcon=({col}:{col:SortKey})=>{ if(sortKey!==col) return <ArrowUpDown className="h-3 w-3 opacity-40"/>; return sortAsc?<ChevronUp className="h-3 w-3"/>:<ChevronDown className="h-3 w-3"/> }
    const roasBarData=useMemo(()=>[...creatives].filter(c=>c.spend>0).sort((a,b)=>b.roas-a.roas).slice(0,15),[creatives])

    return (
        <div className="space-y-6 mb-8 w-full max-w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 tracking-tight">Creative-Level Performance</h1>
                    <p className="text-sm text-gray-500">Ad creative performance — Orders-first attribution (actual revenue as source of truth)</p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton
                        disabled={loading || creatives.length === 0}
                        onClick={() => {
                            const cols: ExportColumn[] = [
                                { header: "Creative", key: "creative_name" },
                                { header: "Campaign", key: "campaign_name" },
                                { header: "Orders", key: "orders", format: "number" },
                                { header: "Revenue (₹)", key: "revenue_actual", format: "currency" },
                                { header: "Spend (₹)", key: "spend", format: "currency" },
                                { header: "ROAS", key: "roas", format: "number" },
                                { header: "CTR (%)", key: "ctr", format: "percent" },
                                { header: "Impressions", key: "impressions", format: "number" },
                                { header: "Clicks", key: "clicks", format: "number" },
                            ]
                            exportToExcel(sorted, cols, "Creative_Performance", startDate, endDate)
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
                    <DateRangePicker startDate={startDate} endDate={endDate} onChange={(s,e)=>{setDates(s,e)}} />
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
                    endpoint="/api/creative-performance"
                    currentRange={{ start: startDate, end: endDate }}
                    compareRange={compare.range}
                    title="Creative Performance — Period Comparison"
                />
            )}


            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 shadow-sm border-l-4 border-l-indigo-500">
                    <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-indigo-600 uppercase tracking-widest flex items-center justify-between gap-2">Avg ROAS<Sparkles className="h-4 w-4 text-indigo-500 shrink-0"/></CardTitle></CardHeader>
                    <CardContent><div className={`text-3xl font-extrabold ${roasColor(summary?.avg_roas||0)}`}>{loading?"—":`${(summary?.avg_roas||0).toFixed(2)}x`}</div><p className="text-xs text-indigo-500/70 mt-1">Revenue ÷ Spend (actual)</p><DeltaLine current={summary?.avg_roas} previous={compareSummary?.avg_roas} kind="count" /></CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 shadow-sm border-l-4 border-l-emerald-500">
                    <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-emerald-600 uppercase tracking-widest flex items-center justify-between gap-2">Actual Revenue<DollarSign className="h-4 w-4 text-emerald-500 shrink-0"/></CardTitle></CardHeader>
                    <CardContent><div className="text-3xl font-extrabold text-emerald-700">{loading?"—":fmt(summary?.total_revenue_actual||0)}</div><p className="text-xs text-emerald-500/70 mt-1">{!loading&&summary?`${fmtNum(summary.total_orders)} orders`:"—"}</p><DeltaLine current={summary?.total_revenue_actual} previous={compareSummary?.total_revenue_actual} kind="currency" /></CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 shadow-sm border-l-4 border-l-amber-500">
                    <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-amber-600 uppercase tracking-widest flex items-center justify-between gap-2">Total Spend<DollarSign className="h-4 w-4 text-amber-500 shrink-0"/></CardTitle></CardHeader>
                    <CardContent><div className="text-3xl font-extrabold text-amber-700">{loading?"—":fmt(summary?.total_spend||0)}</div><p className="text-xs text-amber-500/70 mt-1">{!loading&&summary?`${summary.total_creatives} creatives`:"—"}</p><DeltaLine current={summary?.total_spend} previous={compareSummary?.total_spend} kind="currency" lowerIsBetter /></CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-rose-50 to-rose-100/50 shadow-sm border-l-4 border-l-rose-500">
                    <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-rose-600 uppercase tracking-widest flex items-center justify-between gap-2">Over-Reporting<AlertTriangle className="h-4 w-4 text-rose-500 shrink-0"/></CardTitle></CardHeader>
                    <CardContent><div className="text-3xl font-extrabold text-rose-700">{loading?"—":(summary?.over_reporting_count||0)}</div><p className="text-xs text-rose-500/70 mt-1">Creatives with Meta diff &gt;20%</p><DeltaLine current={summary?.over_reporting_count} previous={compareSummary?.over_reporting_count} kind="count" lowerIsBetter /></CardContent>
                </Card>
            </div>

            {/* Insight */}
            {!loading&&creatives.length>0&&(
            <Card className="bg-gradient-to-r from-slate-50 to-indigo-50/30 shadow-sm border-l-4 border-l-indigo-400">
                <CardContent className="py-4">
                    <p className="text-sm text-gray-600 leading-relaxed">
                        <strong className="text-gray-800">💡 Insight:</strong>{" "}
                        {summary?.best_creative&&summary.best_creative!=="N/A"?(
                            <>
                                <strong className="text-emerald-700">{summary.best_creative}</strong> is your top-performing creative with a real ROAS of <strong className="text-emerald-600">{summary.best_creative_roas.toFixed(2)}x</strong>.
                                {summary.worst_creative&&summary.worst_creative!=="N/A"&&summary.worst_creative!==summary.best_creative?(
                                    <> Consider pausing or optimizing <strong className="text-rose-600">{summary.worst_creative}</strong> (ROAS: {summary.worst_creative_roas.toFixed(2)}x).</>
                                ):null}
                                {summary.over_reporting_count>0?(
                                    <> <strong className="text-rose-600">{summary.over_reporting_count} creative{summary.over_reporting_count>1?"s":""}</strong> show Meta over-reporting by &gt;20% — verify attribution.</>
                                ):null}
                                {" "}Across {summary.total_creatives} creatives: avg ROAS <strong className={roasColor(summary.avg_roas)}>{summary.avg_roas.toFixed(2)}x</strong>.
                            </>
                        ):(<>No creative data with spend available. Ensure Meta Ads API is configured and utm_content is set in ad URLs.</>)}
                    </p>
                </CardContent>
            </Card>)}

            {/* Best / Worst */}
            {!loading&&summary&&(summary.best_creative!=="N/A"||summary.worst_creative!=="N/A")&&(
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card className="bg-gradient-to-br from-emerald-50/80 to-teal-50/50 shadow-sm border border-emerald-200">
                    <CardContent className="py-4 flex items-center gap-3"><Trophy className="h-6 w-6 text-emerald-500 shrink-0"/>
                        <div><p className="text-xs text-emerald-600 font-semibold uppercase tracking-widest">Best Creative (ROAS)</p>
                        <p className="text-lg font-bold text-emerald-800 truncate max-w-[300px]">{summary.best_creative}</p>
                        <p className="text-sm text-emerald-600">ROAS: <strong>{summary.best_creative_roas.toFixed(2)}x</strong></p></div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-rose-50/80 to-red-50/50 shadow-sm border border-rose-200">
                    <CardContent className="py-4 flex items-center gap-3"><AlertTriangle className="h-6 w-6 text-rose-500 shrink-0"/>
                        <div><p className="text-xs text-rose-600 font-semibold uppercase tracking-widest">Worst Creative (ROAS)</p>
                        <p className="text-lg font-bold text-rose-800 truncate max-w-[300px]">{summary.worst_creative}</p>
                        <p className="text-sm text-rose-600">ROAS: <strong>{summary.worst_creative_roas.toFixed(2)}x</strong></p></div>
                    </CardContent>
                </Card>
            </div>)}

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="shadow-sm">
                    <CardHeader><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Sparkles className="h-4 w-4 text-gray-500"/>ROAS by Creative<span className="text-xs text-gray-400 font-normal ml-1">Higher = better</span></CardTitle></CardHeader>
                    <CardContent>
                        {loading?(<div className="h-[360px] flex items-center justify-center text-gray-400 text-sm">Loading…</div>):roasBarData.length===0?(<div className="h-[360px] flex items-center justify-center text-gray-400 text-sm">No creative data</div>):(
                        <div className="w-full" style={{height:Math.max(200,roasBarData.length*44+40)}}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={roasBarData} layout="vertical" margin={{top:5,right:30,left:10,bottom:5}}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                                    <XAxis type="number" tick={{fontSize:10,fill:"#9ca3af"}} axisLine={false} tickLine={false} tickFormatter={v=>`${v.toFixed(1)}x`}/>
                                    <YAxis type="category" dataKey="creative_name" width={140} tick={{fontSize:11,fill:"#374151"}} axisLine={false} tickLine={false} tickFormatter={v=>truncName(v)}/>
                                    <Tooltip content={<BarTip/>}/><Bar dataKey="roas" name="ROAS" radius={[0,6,6,0]}>{roasBarData.map((_,i)=>(<Cell key={i} fill={COLORS[i%COLORS.length]}/>))}</Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>)}
                    </CardContent>
                </Card>
                <Card className="shadow-sm">
                    <CardHeader><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><DollarSign className="h-4 w-4 text-gray-500"/>Spend vs Actual Revenue</CardTitle></CardHeader>
                    <CardContent>
                        {loading?(<div className="h-[360px] flex items-center justify-center text-gray-400 text-sm">Loading…</div>):roasBarData.length===0?(<div className="h-[360px] flex items-center justify-center text-gray-400 text-sm">No data</div>):(
                        <div className="h-[360px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={[...creatives].filter(c=>c.spend>0).sort((a,b)=>b.revenue_actual-a.revenue_actual).slice(0,12)} margin={{top:5,right:30,left:0,bottom:5}}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                                    <XAxis dataKey="creative_name" tick={{fontSize:10,fill:"#374151"}} axisLine={false} tickLine={false} tickFormatter={v=>truncName(v,12)}/>
                                    <YAxis tickFormatter={v=>fmt(v)} tick={{fontSize:10,fill:"#9ca3af"}} axisLine={false} tickLine={false}/>
                                    <Tooltip content={<BarTip/>}/><Legend/>
                                    <Bar dataKey="revenue_actual" name="Revenue (Actual)" fill="#10b981" radius={[4,4,0,0]}/>
                                    <Bar dataKey="spend" name="Spend" fill="#f43f5e" radius={[4,4,0,0]}/>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>)}
                    </CardContent>
                </Card>
            </div>

            {/* Trend */}
            {trend.length>0&&(
            <Card className="shadow-sm">
                <CardHeader><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-gray-500"/>Daily ROAS Trend</CardTitle></CardHeader>
                <CardContent>
                    <div className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trend.map((row,i)=>({...row,prev_roas:compareTrend[i]?.roas??null,prev_revenue:compareTrend[i]?.revenue_actual??null,prev_date:compareTrend[i]?.date??null}))} margin={{top:10,right:30,left:0,bottom:0}}>
                                <defs>
                                    <linearGradient id="roasG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/><stop offset="95%" stopColor="#6366f1" stopOpacity={0}/></linearGradient>
                                    <linearGradient id="revG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                                    <linearGradient id="spendG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2}/><stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/></linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                                <XAxis dataKey="date" tick={{fontSize:10,fill:"#9ca3af"}} axisLine={false} tickLine={false}/>
                                <YAxis yAxisId="left" tickFormatter={v=>fmt(v)} tick={{fontSize:10,fill:"#9ca3af"}} axisLine={false} tickLine={false}/>
                                <YAxis yAxisId="right" orientation="right" tickFormatter={v=>`${v}x`} tick={{fontSize:10,fill:"#9ca3af"}} axisLine={false} tickLine={false}/>
                                <Tooltip content={<TrendTip/>}/><Legend/>
                                <Area yAxisId="right" type="monotone" dataKey="roas" name="ROAS" stroke="#6366f1" fill="url(#roasG)" strokeWidth={2.5}/>
                                <Area yAxisId="left" type="monotone" dataKey="revenue_actual" name="Revenue" stroke="#10b981" fill="url(#revG)" strokeWidth={1.5}/>
                                <Area yAxisId="left" type="monotone" dataKey="spend" name="Spend" stroke="#f43f5e" fill="url(#spendG)" strokeWidth={1.5}/>
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
                <CardHeader><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Eye className="h-4 w-4 text-gray-500"/>Creative Breakdown<span className="text-xs text-gray-400 font-normal ml-2">Click headers to sort</span></CardTitle></CardHeader>
                <CardContent>
                    {loading?(<div className="py-12 text-center text-gray-400 text-sm">Loading…</div>):sorted.length===0?(<div className="py-12 text-center text-gray-400 text-sm">No creative data</div>):(
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead><tr className="border-b border-gray-100">
                                <th className="text-left py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Creative</th>
                                <th className="text-left py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Campaign</th>
                                <th className="text-right py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={()=>handleSort("orders")}><span className="inline-flex items-center gap-1">Orders <SortIcon col="orders"/></span></th>
                                <th className="text-right py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={()=>handleSort("revenue_actual")}><span className="inline-flex items-center gap-1">Revenue <SortIcon col="revenue_actual"/></span></th>
                                <th className="text-right py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={()=>handleSort("spend")}><span className="inline-flex items-center gap-1">Spend <SortIcon col="spend"/></span></th>
                                <th className="text-right py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={()=>handleSort("roas")}><span className="inline-flex items-center gap-1">ROAS <SortIcon col="roas"/></span></th>
                                <th className="text-right py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={()=>handleSort("ctr")}><span className="inline-flex items-center gap-1">CTR <SortIcon col="ctr"/></span></th>
                                <th className="text-right py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={()=>handleSort("revenue_diff")}><span className="inline-flex items-center gap-1">Rev Diff% <SortIcon col="revenue_diff"/></span></th>
                            </tr></thead>
                            <tbody>
                                {sorted.map((c,idx)=>{
                                    const isBest=c.creative_name===summary?.best_creative, isWorst=c.creative_name===summary?.worst_creative
                                    const isOverReporting=!!c.flag
                                    return (<tr key={c.creative_id+"-"+idx} className={`border-b border-gray-50 transition-colors hover:bg-gray-50/80 ${isBest?"bg-emerald-50/30":isWorst?"bg-rose-50/20":isOverReporting?"bg-red-50/20":""}`}>
                                        <td className="py-3 px-3 font-medium text-gray-700"><div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full shrink-0" style={{backgroundColor:COLORS[idx%COLORS.length]}}/><span className="truncate max-w-[180px]">{c.creative_name}</span>{isBest&&<span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold shrink-0">BEST</span>}{isWorst&&<span className="text-[9px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full font-semibold shrink-0">LOW</span>}</div></td>
                                        <td className="py-3 px-3 text-gray-500 truncate max-w-[140px]">{c.campaign_name}</td>
                                        <td className="py-3 px-3 text-right text-gray-600 font-medium">{c.orders.toLocaleString()}</td>
                                        <td className="py-3 px-3 text-right text-emerald-600 font-medium">{fmt(c.revenue_actual)}</td>
                                        <td className="py-3 px-3 text-right text-rose-600 font-medium">{fmt(c.spend)}</td>
                                        <td className="py-3 px-3 text-right"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${roasBg(c.roas)}`}>{c.roas>0?`${c.roas.toFixed(2)}x`:"—"}</span></td>
                                        <td className="py-3 px-3 text-right text-gray-600">{c.ctr>0?`${c.ctr.toFixed(2)}%`:"—"}</td>
                                        <td className={`py-3 px-3 text-right font-medium ${isOverReporting?"text-rose-700":"text-gray-500"}`}>
                                            <div className="flex items-center justify-end gap-1.5">
                                                {c.revenue_diff!==0?`${c.revenue_diff>0?"+":""}${c.revenue_diff.toFixed(1)}%`:"—"}
                                                {isOverReporting&&<span className="text-[8px] bg-rose-200 text-rose-800 px-1 py-0.5 rounded font-bold">OVER</span>}
                                            </div>
                                        </td>
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
