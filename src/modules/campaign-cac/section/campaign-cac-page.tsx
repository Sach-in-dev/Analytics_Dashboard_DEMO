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
    Target, TrendingUp, Trophy,
    ArrowUpDown, ChevronUp, ChevronDown, AlertTriangle,
    DollarSign, Users,
    ArrowDown, Minus, ArrowUp,
} from "lucide-react"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"

interface CampaignData {
    [key: string]: string | number
    campaign_id: string
    campaign_name: string
    total_spend: number
    new_customers: number
    total_orders: number
    total_revenue: number
    cac: number
}

interface TrendPoint { date: string; total_spend: number; new_customers: number; total_orders: number; total_revenue: number; cac: number }

interface SummaryData {
    total_spend: number; total_new_customers: number; total_orders: number; total_revenue: number
    avg_cac: number; best_campaign: string; best_campaign_cac: number
    worst_campaign: string; worst_campaign_cac: number; total_campaigns: number
}

interface CampaignCacData { summary: SummaryData; campaigns: CampaignData[]; trend: TrendPoint[] }

const COLORS = ["#6366f1","#10b981","#f59e0b","#ef4444","#8b5cf6","#14b8a6","#f97316","#ec4899","#06b6d4","#84cc16","#a855f7","#3b82f6"]
type SortKey = "cac" | "total_spend" | "new_customers" | "total_orders" | "total_revenue"

function fmt(v: number): string {
    if (v >= 10000000) return `₹${(v/10000000).toFixed(1)}Cr`
    if (v >= 100000) return `₹${(v/100000).toFixed(1)}L`
    if (v >= 1000) return `₹${(v/1000).toFixed(1)}K`
    return `₹${v.toLocaleString("en-IN")}`
}
function fmtNum(v: number): string { return v >= 1000 ? `${(v/1000).toFixed(1)}K` : v.toLocaleString() }
function cacColor(c: number) { if (!c) return "text-gray-400"; if (c<=300) return "text-emerald-600"; if (c<=600) return "text-amber-600"; return "text-rose-600" }
function cacBg(c: number) { if (!c) return "bg-gray-100 text-gray-500"; if (c<=300) return "bg-emerald-100 text-emerald-700"; if (c<=600) return "bg-amber-100 text-amber-700"; return "bg-rose-100 text-rose-700" }
function truncName(n: string, m=18) { return n.length>m ? n.slice(0,m)+"…" : n }

function BarTip({active,payload,label}:any) {
    if (!active||!payload?.length) return null
    const d=payload[0]?.payload



        return (<div className="bg-white border border-gray-200 shadow-xl rounded-lg px-4 py-3 text-sm">
        <p className="font-semibold text-gray-800 mb-1 max-w-[220px] truncate">{d?.campaign_name||label}</p>
        <p className="text-gray-600">CAC: <strong className={cacColor(d?.cac||0)}>{fmt(d?.cac||0)}</strong></p>
        <p className="text-gray-600">Spend: <strong className="text-rose-600">{fmt(d?.total_spend||0)}</strong></p>
        <p className="text-gray-600">New Cust: <strong className="text-blue-600">{fmtNum(d?.new_customers||0)}</strong></p>
        <p className="text-gray-600">Revenue: <strong className="text-emerald-600">{fmt(d?.total_revenue||0)}</strong></p>
    </div>)
}

function TrendTip({active,payload,label}:any) {
    if (!active||!payload?.length) return null
    const prevDate = payload[0]?.payload?.prev_date
    return (<div className="bg-white border border-gray-200 shadow-xl rounded-lg px-4 py-3 text-sm">
        <p className="font-semibold text-gray-800 mb-1">{label}</p>
        {payload.map((p:any)=>(<p key={p.name} className="text-gray-600">{p.name}: <strong style={{color:p.color}}>{p.name==="CAC"?fmt(p.value):p.name==="New Customers"?fmtNum(p.value):fmt(p.value)}</strong></p>))}
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

export default function CampaignCacPage() {
    const [data,setData]=useState<CampaignCacData|null>(null)
    const [loading,setLoading]=useState(true)
    const [sortKey,setSortKey]=useState<SortKey>("cac")
    const [sortAsc,setSortAsc]=useState(true)

    const getPastDate=(days:number)=>{const d=new Date();d.setDate(d.getDate()-days);return d.toISOString().split("T")[0]}
    const [startDate, endDate, setDates] = useDateRange()
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<CampaignCacData|null>(null)
    const [compareLoading, setCompareLoading] = useState(false)

    useEffect(()=>{
        (async()=>{
            try { setLoading(true); const r=await api.get("/campaign-cac",{params:{start_date:startDate,end_date:endDate}}); if(r.data?.success) setData(r.data.data) }
            catch(e){ console.error("Failed to load Campaign CAC",e) }
            finally{ setLoading(false) }
        })()
    },[startDate,endDate])

    useEffect(() => {
        if (!compare.range) { setCompareData(null); return }
        const fetchCompare = async () => {
            try {
                setCompareLoading(true)
                const res = await api.get("/campaign-cac", {
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
    const compareSummary = compareData?.summary, campaigns=data?.campaigns||[], trend=data?.trend||[], compareTrend=compareData?.trend||[]
    const handleSort=(k:SortKey)=>{ if(sortKey===k) setSortAsc(!sortAsc); else{setSortKey(k);setSortAsc(k==="cac")} }
    const sorted=useMemo(()=>[...campaigns].filter(c=>c.total_spend>0).sort((a,b)=>sortAsc?(a[sortKey] as number)-(b[sortKey] as number):(b[sortKey] as number)-(a[sortKey] as number)),[campaigns,sortKey,sortAsc])
    const SortIcon=({col}:{col:SortKey})=>{ if(sortKey!==col) return <ArrowUpDown className="h-3 w-3 opacity-40"/>; return sortAsc?<ChevronUp className="h-3 w-3"/>:<ChevronDown className="h-3 w-3"/> }
    const cacBarData=useMemo(()=>[...campaigns].filter(c=>c.total_spend>0&&c.new_customers>0).sort((a,b)=>a.cac-b.cac),[campaigns])

    return (
        <div className="space-y-6 mb-8 w-full max-w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 tracking-tight">CAC by Campaign</h1>
                    <p className="text-sm text-gray-500">Customer Acquisition Cost per Meta Ads campaign — lower is better</p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton
                        disabled={loading || campaigns.length === 0}
                        onClick={() => {
                            const cols: ExportColumn[] = [
                                { header: "Campaign", key: "campaign_name" },
                                { header: "Spend (₹)", key: "total_spend", format: "currency" },
                                { header: "New Customers", key: "new_customers", format: "number" },
                                { header: "Total Orders", key: "total_orders", format: "number" },
                                { header: "Total Revenue (₹)", key: "total_revenue", format: "currency" },
                                { header: "CAC (₹)", key: "cac", format: "currency" },
                            ]
                            exportToExcel(sorted, cols, "Campaign_CAC", startDate, endDate)
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
                    endpoint="/api/campaign-cac"
                    currentRange={{ start: startDate, end: endDate }}
                    compareRange={compare.range}
                    title="Campaign Cac — Period Comparison"
                />
            )}


            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 shadow-sm border-l-4 border-l-indigo-500">
                    <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-indigo-600 uppercase tracking-widest flex items-center justify-between gap-2">Avg CAC<Target className="h-4 w-4 text-indigo-500 shrink-0"/></CardTitle></CardHeader>
                    <CardContent><div className={`text-3xl font-extrabold ${cacColor(summary?.avg_cac||0)}`}>{loading?"—":fmt(summary?.avg_cac||0)}</div><p className="text-xs text-indigo-500/70 mt-1">Cost to acquire one customer</p><DeltaLine current={summary?.avg_cac} previous={compareSummary?.avg_cac} kind="currency" lowerIsBetter /></CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 shadow-sm border-l-4 border-l-emerald-500">
                    <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-emerald-600 uppercase tracking-widest flex items-center justify-between gap-2">Best Campaign<Trophy className="h-4 w-4 text-emerald-500 shrink-0"/></CardTitle></CardHeader>
                    <CardContent><div className="text-xl font-extrabold text-emerald-700 truncate">{loading?"—":summary?.best_campaign||"N/A"}</div><p className="text-xs text-emerald-500/70 mt-1">CAC: {loading?"—":fmt(summary?.best_campaign_cac||0)}</p></CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-rose-50 to-rose-100/50 shadow-sm border-l-4 border-l-rose-500">
                    <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-rose-600 uppercase tracking-widest flex items-center justify-between gap-2">Worst Campaign<AlertTriangle className="h-4 w-4 text-rose-500 shrink-0"/></CardTitle></CardHeader>
                    <CardContent><div className="text-xl font-extrabold text-rose-700 truncate">{loading?"—":summary?.worst_campaign||"N/A"}</div><p className="text-xs text-rose-500/70 mt-1">CAC: {loading?"—":fmt(summary?.worst_campaign_cac||0)}</p></CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 shadow-sm border-l-4 border-l-amber-500">
                    <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-amber-600 uppercase tracking-widest flex items-center justify-between gap-2">Total Spend<DollarSign className="h-4 w-4 text-amber-500 shrink-0"/></CardTitle></CardHeader>
                    <CardContent><div className="text-3xl font-extrabold text-amber-700">{loading?"—":fmt(summary?.total_spend||0)}</div><p className="text-xs text-amber-500/70 mt-1">{!loading&&summary?`${fmtNum(summary.total_new_customers)} new customers`:"—"}</p><DeltaLine current={summary?.total_spend} previous={compareSummary?.total_spend} kind="currency" lowerIsBetter /></CardContent>
                </Card>
            </div>

            {/* Insight */}
            {!loading&&campaigns.length>0&&(
            <Card className="bg-gradient-to-r from-slate-50 to-indigo-50/30 shadow-sm border-l-4 border-l-indigo-400">
                <CardContent className="py-4">
                    <p className="text-sm text-gray-600 leading-relaxed">
                        <strong className="text-gray-800">💡 Insight:</strong>{" "}
                        {summary?.best_campaign&&summary.best_campaign!=="N/A"?(
                            <><strong className="text-emerald-700">{summary.best_campaign}</strong> is your most efficient campaign with a CAC of <strong className="text-emerald-600">{fmt(summary.best_campaign_cac)}</strong>.
                            {summary.worst_campaign&&summary.worst_campaign!=="N/A"&&summary.worst_campaign!==summary.best_campaign?(<> Consider optimizing <strong className="text-rose-600">{summary.worst_campaign}</strong> (CAC: {fmt(summary.worst_campaign_cac)}) — it costs {summary.best_campaign_cac>0?`${(summary.worst_campaign_cac/summary.best_campaign_cac).toFixed(1)}x`:"—"} more per acquisition.</>):null}
                            {" "}Average CAC across {summary.total_campaigns} campaigns: <strong className={cacColor(summary.avg_cac)}>{fmt(summary.avg_cac)}</strong>.</>
                        ):(<>No campaign data with spend available. Ensure Meta Ads API is configured.</>)}
                    </p>
                </CardContent>
            </Card>)}

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="shadow-sm">
                    <CardHeader><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Target className="h-4 w-4 text-gray-500"/>CAC by Campaign<span className="text-xs text-gray-400 font-normal ml-1">Lower = better</span></CardTitle></CardHeader>
                    <CardContent>
                        {loading?(<div className="h-[360px] flex items-center justify-center text-gray-400 text-sm">Loading…</div>):cacBarData.length===0?(<div className="h-[360px] flex items-center justify-center text-gray-400 text-sm">No campaign data</div>):(
                        <div className="w-full" style={{height:Math.max(200,cacBarData.length*48+40)}}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={cacBarData} layout="vertical" margin={{top:5,right:30,left:10,bottom:5}}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                                    <XAxis type="number" tickFormatter={v=>fmt(v)} tick={{fontSize:10,fill:"#9ca3af"}} axisLine={false} tickLine={false}/>
                                    <YAxis type="category" dataKey="campaign_name" width={130} tick={{fontSize:11,fill:"#374151"}} axisLine={false} tickLine={false} tickFormatter={v=>truncName(v)}/>
                                    <Tooltip content={<BarTip/>}/><Bar dataKey="cac" name="CAC" radius={[0,6,6,0]}>{cacBarData.map((_,i)=>(<Cell key={i} fill={COLORS[i%COLORS.length]}/>))}</Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>)}
                    </CardContent>
                </Card>
                <Card className="shadow-sm">
                    <CardHeader><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><DollarSign className="h-4 w-4 text-gray-500"/>Spend vs Revenue</CardTitle></CardHeader>
                    <CardContent>
                        {loading?(<div className="h-[360px] flex items-center justify-center text-gray-400 text-sm">Loading…</div>):cacBarData.length===0?(<div className="h-[360px] flex items-center justify-center text-gray-400 text-sm">No data</div>):(
                        <div className="h-[360px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={[...campaigns].filter(c=>c.total_spend>0).sort((a,b)=>b.total_revenue-a.total_revenue)} margin={{top:5,right:30,left:0,bottom:5}}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                                    <XAxis dataKey="campaign_name" tick={{fontSize:10,fill:"#374151"}} axisLine={false} tickLine={false} tickFormatter={v=>truncName(v,12)}/>
                                    <YAxis tickFormatter={v=>fmt(v)} tick={{fontSize:10,fill:"#9ca3af"}} axisLine={false} tickLine={false}/>
                                    <Tooltip content={<BarTip/>}/><Legend/>
                                    <Bar dataKey="total_revenue" name="Revenue" fill="#10b981" radius={[4,4,0,0]}/>
                                    <Bar dataKey="total_spend" name="Spend" fill="#f43f5e" radius={[4,4,0,0]}/>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>)}
                    </CardContent>
                </Card>
            </div>

            {/* Trend */}
            {trend.length>0&&(
            <Card className="shadow-sm">
                <CardHeader><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-gray-500"/>Daily CAC Trend</CardTitle></CardHeader>
                <CardContent>
                    <div className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trend.map((row,i)=>({...row,prev_cac:compareTrend[i]?.cac??null,prev_spend:compareTrend[i]?.total_spend??null,prev_date:compareTrend[i]?.date??null}))} margin={{top:10,right:30,left:0,bottom:0}}>
                                <defs>
                                    <linearGradient id="cacG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/><stop offset="95%" stopColor="#6366f1" stopOpacity={0}/></linearGradient>
                                    <linearGradient id="spG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2}/><stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/></linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                                <XAxis dataKey="date" tick={{fontSize:10,fill:"#9ca3af"}} axisLine={false} tickLine={false}/>
                                <YAxis tickFormatter={v=>fmt(v)} tick={{fontSize:10,fill:"#9ca3af"}} axisLine={false} tickLine={false}/>
                                <Tooltip content={<TrendTip/>}/><Legend/>
                                <Area type="monotone" dataKey="cac" name="CAC" stroke="#6366f1" fill="url(#cacG)" strokeWidth={2.5}/>
                                <Area type="monotone" dataKey="total_spend" name="Spend" stroke="#f43f5e" fill="url(#spG)" strokeWidth={1.5}/>
                                {compare.range && (
                                    <Area type="monotone" dataKey="prev_cac" name="CAC (previous)" stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={2} fill="transparent" dot={false} connectNulls />
                                )}
                                {compare.range && (
                                    <Area type="monotone" dataKey="prev_spend" name="Spend (previous)" stroke="#fda4af" strokeDasharray="5 5" strokeWidth={2} fill="transparent" dot={false} connectNulls />
                                )}
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>)}

            {/* Table */}
            <Card className="shadow-sm">
                <CardHeader><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Users className="h-4 w-4 text-gray-500"/>Campaign Breakdown<span className="text-xs text-gray-400 font-normal ml-2">Click headers to sort</span></CardTitle></CardHeader>
                <CardContent>
                    {loading?(<div className="py-12 text-center text-gray-400 text-sm">Loading…</div>):sorted.length===0?(<div className="py-12 text-center text-gray-400 text-sm">No campaign data</div>):(
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead><tr className="border-b border-gray-100">
                                <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Campaign</th>
                                <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={()=>handleSort("cac")}><span className="inline-flex items-center gap-1">CAC <SortIcon col="cac"/></span></th>
                                <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={()=>handleSort("total_spend")}><span className="inline-flex items-center gap-1">Spend <SortIcon col="total_spend"/></span></th>
                                <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={()=>handleSort("new_customers")}><span className="inline-flex items-center gap-1">New Cust. <SortIcon col="new_customers"/></span></th>
                                <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={()=>handleSort("total_revenue")}><span className="inline-flex items-center gap-1">Revenue <SortIcon col="total_revenue"/></span></th>
                                <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={()=>handleSort("total_orders")}><span className="inline-flex items-center gap-1">Orders <SortIcon col="total_orders"/></span></th>
                            </tr></thead>
                            <tbody>
                                {sorted.map((ch,idx)=>{
                                    const isBest=ch.campaign_name===summary?.best_campaign, isWorst=ch.campaign_name===summary?.worst_campaign
                                    return (<tr key={ch.campaign_id} className={`border-b border-gray-50 transition-colors hover:bg-gray-50/80 ${isBest?"bg-emerald-50/30":isWorst?"bg-rose-50/20":""}`}>
                                        <td className="py-3 px-4 font-medium text-gray-700"><div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full shrink-0" style={{backgroundColor:COLORS[idx%COLORS.length]}}/><span className="truncate max-w-[200px]">{ch.campaign_name}</span>{isBest&&<span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold shrink-0">BEST</span>}{isWorst&&<span className="text-[9px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full font-semibold shrink-0">HIGH</span>}</div></td>
                                        <td className="py-3 px-4 text-right"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cacBg(ch.cac)}`}>{ch.cac>0?fmt(ch.cac):"—"}</span></td>
                                        <td className="py-3 px-4 text-right text-rose-600 font-medium">{fmt(ch.total_spend)}</td>
                                        <td className="py-3 px-4 text-right text-blue-600 font-medium">{ch.new_customers.toLocaleString()}</td>
                                        <td className="py-3 px-4 text-right text-emerald-600 font-medium">{fmt(ch.total_revenue)}</td>
                                        <td className="py-3 px-4 text-right text-gray-600 font-medium">{ch.total_orders.toLocaleString()}</td>
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
