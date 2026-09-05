"use client"

import { useEffect, useState } from "react"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { api } from "@/lib/axios"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDateRange } from "@/hooks/use-date-range"
import {
    TrendingUp, Target, DollarSign, Users, Calendar, Repeat, ArrowUp, ArrowDown, Minus
} from "lucide-react"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"

function fmt(v: number) {
  if (v >= 10000000) return `₹${(v / 10000000)?.toFixed(1)}Cr`
  if (v >= 100000) return `₹${(v / 100000)?.toFixed(1)}L`
  if (v >= 1000) return `₹${(v / 1000)?.toFixed(1)}K`
  return `₹${v?.toLocaleString("en-IN")}`
}

interface LibraryData {
  mer: number; avg_cac: number; avg_aov: number; estimated_ltv: number
  ltv_cac_ratio: number; cac_payback_months: number; rpr_pct: number
  gross_margin_pct: number; contribution_margin: number; contribution_margin_pct: number
  total_revenue: number; total_spend: number; new_customers: number; runway_days: number | null; period_days: number
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

export default function MetricLibraryPage() {
  const [data, setData] = useState<LibraryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [startDate, endDate, setDates] = useDateRange()
  const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<LibraryData | null>(null)
    const [compareLoading, setCompareLoading] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        const r = await api.get("/metric-library", { params: { start_date: startDate, end_date: endDate } })
        if (r.data?.success) setData(r.data.data)
      } catch (e) { console.error(e) } finally { setLoading(false) }
    })()
  }, [startDate, endDate])

    useEffect(() => {
        if (!compare.range) { setCompareData(null); return }
        const fetchCompare = async () => {
            try {
                setCompareLoading(true)
                const res = await api.get("/metric-library", {
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


  const metrics = [
    { label: "MER", current: data?.mer, previous: compareData?.mer, kind: "count", value: data ? `${data.mer?.toFixed(2)}x` : "—", sub: "Marketing Efficiency Ratio", desc: "Revenue ÷ Total Ad Spend", icon: BarChart2Icon, color: "indigo" },
    { label: "Avg CAC", current: data?.avg_cac, previous: compareData?.avg_cac, kind: "currency", lowerIsBetter: true, value: data ? fmt(data.avg_cac) : "—", sub: "Customer Acquisition Cost", desc: "Ad Spend ÷ New Customers", icon: Target, color: "rose" },
    { label: "Avg AOV", current: data?.avg_aov, previous: compareData?.avg_aov, kind: "currency", value: data ? fmt(data.avg_aov) : "—", sub: "Average Order Value", desc: "Revenue ÷ Total Orders", icon: DollarSign, color: "emerald" },
    { label: "Estimated LTV", current: data?.estimated_ltv, previous: compareData?.estimated_ltv, kind: "currency", value: data ? fmt(data.estimated_ltv) : "—", sub: "Customer Lifetime Value", desc: "AOV ÷ (1 − RPR%)", icon: TrendingUp, color: "blue" },
    { label: "LTV:CAC", current: data?.ltv_cac_ratio, previous: compareData?.ltv_cac_ratio, kind: "count", value: data ? `${data.ltv_cac_ratio?.toFixed(2)}x` : "—", sub: "LTV to CAC Ratio", desc: ">3x is healthy", icon: Repeat, color: data && data.ltv_cac_ratio >= 3 ? "emerald" : data && data.ltv_cac_ratio >= 1 ? "amber" : "rose" },
    { label: "CAC Payback", current: data?.cac_payback_months, previous: compareData?.cac_payback_months, kind: "count", lowerIsBetter: true, value: data ? `${data.cac_payback_months} mo` : "—", sub: "Months to recover CAC", desc: "CAC ÷ (AOV × Gross Margin)", icon: Calendar, color: data && data.cac_payback_months <= 6 ? "emerald" : data && data.cac_payback_months <= 12 ? "amber" : "rose" },
    { label: "RPR", current: data?.rpr_pct, previous: compareData?.rpr_pct, kind: "percent", value: data ? `${data.rpr_pct?.toFixed(1)}%` : "—", sub: "Repeat Purchase Rate", desc: "Returning buyers %", icon: Users, color: "violet" },
    { label: "Gross Margin", current: data?.gross_margin_pct, previous: compareData?.gross_margin_pct, kind: "percent", value: data ? `${data.gross_margin_pct}%` : "—", sub: "Estimated gross margin", desc: "42% estimated (update w/ COGS)", icon: DollarSign, color: "slate" },
    { label: "Contribution Margin", current: data?.contribution_margin, previous: compareData?.contribution_margin, kind: "currency", value: data ? fmt(data.contribution_margin) : "—", sub: `${data ? data.contribution_margin_pct?.toFixed(1) : "—"}% of revenue`, desc: "Gross Profit − Ad Spend", icon: TrendingUp, color: data && data.contribution_margin > 0 ? "emerald" : "rose" },
    { label: "Runway (days)", current: data?.runway_days, previous: compareData?.runway_days, kind: "count", value: data?.runway_days ? `${data.runway_days}d` : "—", sub: "Contribution Margin ÷ Daily Spend", desc: "Estimated operational runway", icon: Calendar, color: "amber" },
    { label: "Total Revenue", current: data?.total_revenue, previous: compareData?.total_revenue, kind: "currency", value: data ? fmt(data.total_revenue) : "—", sub: `Over ${data?.period_days || 0} days`, desc: "All paid orders", icon: DollarSign, color: "emerald" },
    { label: "New Customers", current: data?.new_customers, previous: compareData?.new_customers, kind: "count", value: data ? data.new_customers?.toLocaleString() : "—", sub: "Paid acquisition", desc: "From campaign CAC pipeline", icon: Users, color: "blue" },
  ]

  const colorMap: Record<string, string> = {
    indigo: "from-indigo-50 to-indigo-100/50 border-l-indigo-500 text-indigo-700 dark:from-indigo-950/60 dark:to-indigo-900/30 dark:border-l-indigo-400 dark:text-indigo-300",
    emerald: "from-emerald-50 to-emerald-100/50 border-l-emerald-500 text-emerald-700 dark:from-emerald-950/60 dark:to-emerald-900/30 dark:border-l-emerald-400 dark:text-emerald-300",
    blue: "from-blue-50 to-blue-100/50 border-l-blue-500 text-blue-700 dark:from-blue-950/60 dark:to-blue-900/30 dark:border-l-blue-400 dark:text-blue-300",
    amber: "from-amber-50 to-amber-100/50 border-l-amber-500 text-amber-700 dark:from-amber-950/60 dark:to-amber-900/30 dark:border-l-amber-400 dark:text-amber-300",
    rose: "from-rose-50 to-rose-100/50 border-l-rose-500 text-rose-700 dark:from-rose-950/60 dark:to-rose-900/30 dark:border-l-rose-400 dark:text-rose-300",
    violet: "from-violet-50 to-violet-100/50 border-l-violet-500 text-violet-700 dark:from-violet-950/60 dark:to-violet-900/30 dark:border-l-violet-400 dark:text-violet-300",
    slate: "from-slate-50 to-slate-100/50 border-l-slate-500 text-slate-700 dark:from-slate-950/60 dark:to-slate-900/30 dark:border-l-slate-400 dark:text-slate-300",
  }


  

  return (
    <div className="space-y-6 mb-8 w-full max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Metric Library</h1>
          <p className="text-sm text-muted-foreground">MER, CAC Payback, LTV:CAC ratio, Runway and financial health KPIs</p>
        </div>
        <DateRangePicker startDate={startDate} endDate={endDate} onChange={setDates} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {metrics.map(m => (
          <Card key={m.label} className={`bg-gradient-to-br ${colorMap[m.color]} shadow-sm border-l-4`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-widest flex items-center justify-between gap-2">
                {m.label}<m.icon className="h-4 w-4 shrink-0 opacity-70" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold">{loading ? "—" : m.value}</div>
              <p className="text-xs opacity-80 mt-0.5 font-medium">{m.sub}</p>
              <DeltaLine current={m.current ?? undefined} previous={m.previous ?? undefined} kind={m.kind as any} lowerIsBetter={(m as any).lowerIsBetter} />
              <p className="text-xs opacity-60 mt-0.5">{m.desc}</p>
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
              endpoint="/api/metric-library"
              currentRange={{ start: startDate, end: endDate }}
              compareRange={compare.range}
              title="Metric Library — Period Comparison"
          />
      )}


      {/* Insight — after KPI grid, same pattern as older metrics */}
      {!loading && data && (
        <Card className="bg-gradient-to-r from-slate-50 to-indigo-50/30 dark:from-slate-950/60 dark:to-indigo-950/30 shadow-sm border-l-4 border-l-indigo-400 dark:border-l-indigo-500">
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              <strong className="text-foreground">💡 Health Check:</strong>{" "}
              {data.ltv_cac_ratio >= 3
                ? <span className="text-emerald-700">LTV:CAC of <strong>{data.ltv_cac_ratio?.toFixed(2)}x</strong> is healthy (target ≥3x).</span>
                : <span className="text-amber-700">LTV:CAC of <strong>{data.ltv_cac_ratio?.toFixed(2)}x</strong> is below target (3x). Consider reducing CAC or improving retention.</span>
              }{" "}
              CAC payback is <strong>{data.cac_payback_months} months</strong>.{" "}
              MER of <strong>{data.mer?.toFixed(2)}x</strong> means every ₹1 in ads returns ₹{data.mer?.toFixed(2)} in revenue.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function BarChart2Icon(props: any) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  )
}
