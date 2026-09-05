"use client"

import { useEffect, useState } from "react"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { api } from "@/lib/axios"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useDateRange } from "@/hooks/use-date-range"
import {
    Sparkles, Crown, DollarSign, Users, TrendingUp, ArrowUp, ArrowDown, Minus
} from "lucide-react"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"

function fmt(v: number) {
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`
  return `₹${v.toLocaleString("en-IN")}`
}

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#f97316"]





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

export default function MarketingPlatformsPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<"meta" | "influencers" | "google">("meta")
  const [startDate, endDate, setDates] = useDateRange()
  const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<any>(null)
    const [compareLoading, setCompareLoading] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        const r = await api.get("/marketing-platforms", { params: { start_date: startDate, end_date: endDate } })
        if (r.data?.success) setData(r.data.data)
      } catch (e) { console.error(e) } finally { setLoading(false) }
    })()
  }, [startDate, endDate])

    useEffect(() => {
        if (!compare.range) { setCompareData(null); return }
        const fetchCompare = async () => {
            try {
                setCompareLoading(true)
                const res = await api.get("/marketing-platforms", {
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


  const meta = data?.meta_ads
  const inf = data?.influencers


  

  return (
    <div className="space-y-6 mb-8 w-full max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800 tracking-tight">Marketing Platforms</h1>
          <p className="text-sm text-gray-500">Meta Ads Creative Performance + Influencer Attribution</p>
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

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 border-l-4 border-l-indigo-500 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-indigo-600 uppercase tracking-widest flex items-center justify-between">Meta Spend<Sparkles className="h-4 w-4 opacity-70" /></CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-extrabold text-indigo-700">{loading ? "—" : fmt(meta?.total_spend || 0)}</div><p className="text-xs text-indigo-500/70 mt-1">{meta?.total_orders_attributed || 0} orders attributed</p><DeltaLine current={meta?.total_spend} previous={compareData?.meta?.total_spend} kind="currency" lowerIsBetter /></CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-rose-50 to-rose-100/50 border-l-4 border-l-rose-500 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-rose-600 uppercase tracking-widest flex items-center justify-between">Avg CAC<Target className="h-4 w-4 opacity-70" /></CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-extrabold text-rose-700">{loading ? "—" : fmt(meta?.avg_cac || 0)}</div><p className="text-xs text-rose-500/70 mt-1">{meta?.new_customers || 0} new customers</p><DeltaLine current={meta?.avg_cac} previous={compareData?.meta?.avg_cac} kind="currency" lowerIsBetter /></CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-l-4 border-l-emerald-500 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-emerald-600 uppercase tracking-widest flex items-center justify-between">Influencer Revenue<Crown className="h-4 w-4 opacity-70" /></CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-extrabold text-emerald-700">{loading ? "—" : fmt(inf?.total_revenue || 0)}</div><p className="text-xs text-emerald-500/70 mt-1">{inf?.total_influencers || 0} active influencers</p><DeltaLine current={inf?.total_revenue} previous={compareData?.influencer?.total_revenue} kind="currency" /></CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 border-l-4 border-l-amber-500 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-amber-600 uppercase tracking-widest flex items-center justify-between">Influencer Orders<Users className="h-4 w-4 opacity-70" /></CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-extrabold text-amber-700">{loading ? "—" : (inf?.total_orders || 0).toLocaleString()}</div><p className="text-xs text-amber-500/70 mt-1">UTM-attributed</p><DeltaLine current={inf?.total_orders} previous={compareData?.influencer?.total_orders} kind="count" /></CardContent>
        </Card>
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
              endpoint="/api/marketing-platforms"
              currentRange={{ start: startDate, end: endDate }}
              compareRange={compare.range}
              title="Marketing Platforms — Period Comparison"
          />
      )}


      {/* Insight */}
      {!loading && data && (
        <Card className="bg-gradient-to-r from-slate-50 to-indigo-50/30 shadow-sm border-l-4 border-l-indigo-400">
          <CardContent className="py-4">
            <p className="text-sm text-gray-600 leading-relaxed">
              <strong className="text-gray-800">💡 Insight:</strong>{" "}
              {meta?.top_creatives?.length > 0 ? (
                <>Top creative <strong className="text-indigo-700">{meta.top_creatives[0].ad_name}</strong> achieves <strong className="text-emerald-600">{meta.top_creatives[0].roas}x ROAS</strong> on ₹{Math.round(meta.top_creatives[0].spend / 1000)}K spend.{" "}
                Total Meta spend ₹{Math.round((meta.total_spend || 0) / 100000 * 10) / 10}L drove <strong>{(meta.total_orders_attributed || 0).toLocaleString()}</strong> orders with avg CAC of <strong className="text-rose-600">₹{(meta.avg_cac || 0).toLocaleString()}</strong>.</>
              ) : <>No Meta Ads data available for this period.</>}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {([
          { key: "meta", label: "Meta Ads Creatives" },
          { key: "influencers", label: "Influencers" },
          { key: "google", label: "Google Ads" },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? "border-indigo-500 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "meta" && (
        <>
          <Card className="shadow-sm">
            <CardHeader><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Sparkles className="h-4 w-4 text-gray-500" />Creative ROAS (Top 10)</CardTitle></CardHeader>
            <CardContent>
              {loading ? <div className="h-64 flex items-center justify-center text-gray-400 text-sm">Loading…</div> : (meta?.top_creatives || []).length === 0 ? <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No creative data</div> : (
                <div style={{ height: Math.max(200, (meta.top_creatives.slice(0, 10).length) * 44 + 40) }} className="w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[...meta.top_creatives].slice(0, 10).sort((a: any, b: any) => a.roas - b.roas)} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="ad_name" width={140} tick={{ fontSize: 10, fill: "#374151" }} axisLine={false} tickLine={false} tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 18) + "…" : v} />
                      <Tooltip formatter={(v: any) => [fmt(Number(v)), ""]} />
                      <Bar dataKey="roas" name="ROAS" fill="#6366f1" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader><CardTitle className="text-sm font-semibold text-gray-700">Creative Breakdown</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Creative</TableHead><TableHead className="text-right">Spend</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">ROAS</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">CTR</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {loading ? <TableRow><TableCell colSpan={6} className="text-center text-gray-400 py-8">Loading…</TableCell></TableRow> :
                      (meta?.top_creatives || []).map((c: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium max-w-[200px] truncate" title={c.ad_name}>{c.ad_name}</TableCell>
                          <TableCell className="text-right">{fmt(c.spend)}</TableCell>
                          <TableCell className="text-right text-emerald-600">{fmt(c.revenue)}</TableCell>
                          <TableCell className="text-right"><span className={`font-semibold ${c.roas >= 2 ? "text-emerald-600" : c.roas >= 1 ? "text-amber-600" : "text-rose-600"}`}>{c.roas.toFixed(2)}x</span></TableCell>
                          <TableCell className="text-right">{c.orders}</TableCell>
                          <TableCell className="text-right">{c.ctr}%</TableCell>
                        </TableRow>
                      ))
                    }
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {tab === "google" && (
        <Card className="shadow-sm border-amber-200 bg-amber-50/30">
          <CardHeader><CardTitle className="text-sm font-semibold text-amber-700 flex items-center gap-2">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            Google Ads
          </CardTitle></CardHeader>
          <CardContent>
            <div className="py-6 text-center space-y-3">
              <div className="text-4xl">🔍</div>
              <p className="text-base font-semibold text-amber-800">Google Ads Not Integrated</p>
              <p className="text-sm text-amber-700 max-w-md mx-auto">
                This analytics platform currently tracks <strong>Meta Ads</strong> and <strong>Influencer Attribution</strong>.
                Google Ads data is not available because no Google Ads API credentials are configured in the system.
              </p>
              <div className="bg-white rounded-lg border border-amber-200 p-4 text-left max-w-sm mx-auto mt-4">
                <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">To enable Google Ads:</p>
                <ol className="text-xs text-gray-600 space-y-1 list-decimal list-inside">
                  <li>Add <code className="bg-gray-100 px-1 rounded">GOOGLE_ADS_DEVELOPER_TOKEN</code> to .env</li>
                  <li>Add <code className="bg-gray-100 px-1 rounded">GOOGLE_ADS_CUSTOMER_ID</code> to .env</li>
                  <li>Connect a Google Ads pipeline action</li>
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "influencers" && (
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Crown className="h-4 w-4 text-gray-500" />Influencer Leaderboard</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Influencer</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">AOV</TableHead><TableHead className="text-right">Active Days</TableHead></TableRow></TableHeader>
                <TableBody>
                  {loading ? <TableRow><TableCell colSpan={6} className="text-center text-gray-400 py-8">Loading…</TableCell></TableRow> :
                    (inf?.top_influencers || []).map((inf: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell><span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-gray-100 text-gray-600" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-gray-50 text-gray-500"}`}>{i + 1}</span></TableCell>
                        <TableCell className="font-medium">{inf.influencer_name}</TableCell>
                        <TableCell className="text-right text-emerald-600 font-semibold">{fmt(inf.revenue)}</TableCell>
                        <TableCell className="text-right">{inf.orders}</TableCell>
                        <TableCell className="text-right">{fmt(inf.avg_order_value)}</TableCell>
                        <TableCell className="text-right">{inf.active_days}d</TableCell>
                      </TableRow>
                    ))
                  }
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Target(props: any) { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg> }
