"use client"

import { useEffect, useState } from "react"
import { api as axios } from "@/lib/axios"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ExportButton } from "@/components/ui/export-button"
import { exportToExcel, ExportColumn } from "@/lib/export-utils"
import {
    TrendingUp, TrendingDown, DollarSign, ShoppingCart, Percent, Package, Users, BarChart3, Megaphone, Filter, Truck, Repeat, Minus, AlertCircle, Settings2, ArrowUp, ArrowDown
} from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { Input } from "@/components/ui/input"
import { useDateRange } from "@/hooks/use-date-range"
import { useCompareRange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════
interface TrendMetric {
  current: number
  previous: number
  delta?: number
  delta_pct?: number
  static?: boolean
}

interface KpiMetric {
  current: number
  target: number
  target_baseline?: number
  target_baseline_days?: number
  range_days?: number
  status: "on_track" | "watch" | "needs_attention"
  static?: boolean
}

interface Issue {
  area: string
  issue: string
  owner: string
  week: string
  status: "open" | "in_progress" | "resolved"
}

interface CeoDashboardData {
  week_number: number
  period: {
    current_start: string
    current_end: string
    prev_start: string
    prev_end: string
  }
  executive_summary: {
    gmv: KpiMetric
    cac: KpiMetric
    conversion_rate: KpiMetric
    aov: KpiMetric
    rpr_60d: KpiMetric
    dead_inventory: KpiMetric
    marketing_salary: { target: number }
  }
  demand: {
    sessions: TrendMetric
    new_users: TrendMetric
    paid_vs_organic: {
      paid_pct: number
      organic_pct: number
      prev_paid_pct: number
      prev_organic_pct: number
    }
    influencer_traffic: TrendMetric
  }
  conversion: {
    add_to_cart_rate: TrendMetric
    checkout_completion: TrendMetric
    hero_sku_sellthrough: TrendMetric
    discount_dependency: TrendMetric
  }
  inventory: {
    stock_out_skus: TrendMetric
    inventory_coverage_days: TrendMetric
    aging_stock_pct: TrendMetric
    gross_margin: TrendMetric
  }
  fulfillment: {
    avg_delivery_days: TrendMetric
    sla_pct: TrendMetric
    rto_rate: TrendMetric
    support_tickets_per_1k: TrendMetric
  }
  retention: {
    cohort_rebuy_30d: TrendMetric
    email_revenue_share: TrendMetric
    nps: TrendMetric
    complaint_rate: TrendMetric
  }
  issues: Issue[]
  contribution_margin?: any
  north_star_trend?: any[]
  channel_drilldown?: any[]
  metric_library?: any
  operations?: any
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
function formatCurrency(value: number): string {
    if (typeof value !== "number" || isNaN(value)) return "₹0";
  if (value >= 1_00_00_000) return `₹${(value / 1_00_00_000)?.toFixed(1)}Cr`
  if (value >= 1_00_000) return `₹${(value / 1_00_000)?.toFixed(1)}L`
  if (value >= 1_000) return `₹${value?.toLocaleString("en-IN")}`
  return `₹${value}`
}

function formatNumber(value: number): string {
  if (value >= 1_00_000) return `${(value / 1_000)?.toFixed(0)}K`
  if (value >= 1_000) return value?.toLocaleString("en-IN")
  return `${value}`
}

// ═══════════════════════════════════════════════════════════
// STATUS PILL (light theme)
// ═══════════════════════════════════════════════════════════
function StatusPill({ status }: { status: string }) {
  const config: Record<string, { label: string; classes: string }> = {
    on_track: {
      label: "On Track",
      classes: "bg-emerald-500 text-white border-emerald-600",
    },
    watch: {
      label: "On Watch",
      classes: "bg-amber-400 text-amber-950 border-amber-500",
    },
    needs_attention: {
      label: "Attention",
      classes: "bg-red-500 text-white border-red-600",
    },
  }
  const s = config[status] || config.watch
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-extrabold uppercase tracking-wide whitespace-nowrap ${s.classes}`}
    >
      {s.label}
    </span>
  )
}

// ═══════════════════════════════════════════════════════════
// ISSUE STATUS PILL (light theme)
// ═══════════════════════════════════════════════════════════
function IssueStatusPill({ status }: { status: string }) {
  const config: Record<string, { label: string; classes: string }> = {
    open: {
      label: "Open",
      classes: "bg-red-50 text-red-700 border-red-200",
    },
    in_progress: {
      label: "In Progress",
      classes: "bg-amber-50 text-amber-700 border-amber-200",
    },
    resolved: {
      label: "Resolved",
      classes: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
  }
  const s = config[status] || config.open
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${s.classes}`}
    >
      {s.label}
    </span>
  )
}

// ═══════════════════════════════════════════════════════════
// TREND ROW (light theme)
// ═══════════════════════════════════════════════════════════
interface TrendRowProps {
  label: string
  current: string
  previous: string
  delta: string
  direction: "up" | "down" | "flat"
  upIsGood?: boolean
  isStatic?: boolean
}

function TrendRow({
  label,
  current,
  previous,
  delta,
  direction,
  upIsGood = true,
  isStatic = false,
}: TrendRowProps) {
  let DeltaIcon = Minus
  let arrowColor = "text-gray-400"

  if (direction === "up") {
    DeltaIcon = TrendingUp
    arrowColor = upIsGood ? "text-emerald-600" : "text-red-500"
  } else if (direction === "down") {
    DeltaIcon = TrendingDown
    arrowColor = upIsGood ? "text-red-500" : "text-emerald-600"
  }

  return (
    <div className="flex items-center justify-between py-2.5 text-sm border-b border-gray-100 last:border-b-0">
      <div className="flex flex-col justify-center">
        <span className="text-gray-600">{label}</span>
        {isStatic && (
          <span className="text-[9px] mt-0.5 uppercase tracking-wider font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded w-fit">
            In Dev
          </span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-end">
          <span className="text-sm font-semibold text-gray-800">
            {isStatic ? "—" : current}
          </span>
          <span className="text-[11px] text-gray-400">
            {isStatic ? "" : previous}
          </span>
        </div>
        {!isStatic && (
          <div className={`flex items-center gap-1 min-w-[80px] justify-end ${arrowColor}`}>
            <DeltaIcon className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">{delta}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
export default function CeoDashboardPage() {
  const [data, setData] = useState<CeoDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Targets Modal State
  const [isTargetsOpen, setIsTargetsOpen] = useState(false)
  const [targetForms, setTargetForms] = useState({
    gmv: 0,
    cac: 0,
    conversion_rate: 0,
    aov: 0,
    rpr_60d: 0,
    dead_inventory: 0,
    marketing_salary: 0,
  })
  const [isSavingTargets, setIsSavingTargets] = useState(false)

  // Date range state — default: last 90 days
  const getPastDate = (days: number) => {
    const d = new Date()
    d.setDate(d.getDate() - days)
    return d.toISOString().split("T")[0]
  }
  const [startDate, endDate, setDates] = useDateRange()
  const compare = useCompareRange(startDate, endDate)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await axios.get("/ceo-dashboard", {
          params: { start_date: startDate, end_date: endDate },
        })
        if (res.data?.success) {
          const d = res.data.data
          setData(d)
          setTargetForms({
            gmv: d.executive_summary.gmv.target_baseline ?? d.executive_summary.gmv.target,
            cac: d.executive_summary.cac.target,
            conversion_rate: d.executive_summary.conversion_rate.target,
            aov: d.executive_summary.aov.target,
            rpr_60d: d.executive_summary.rpr_60d.target,
            dead_inventory: d.executive_summary.dead_inventory.target,
            marketing_salary: d.executive_summary.marketing_salary?.target || 0,
          })
        } else {
          setError("Failed to load dashboard data")
        }
      } catch (e: any) {
        console.error("CEO Dashboard fetch failed:", e)
        setError(e?.response?.data?.message || "Failed to load dashboard data")
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [startDate, endDate])

  // ── LOADING STATE ──
  if (loading) {
    return (
      <div className="space-y-6 mb-8 w-full max-w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="h-6 w-48 bg-gray-200 rounded animate-pulse mb-2" />
            <div className="h-4 w-72 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="shadow-sm animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-3 w-28 bg-gray-200 rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-24 bg-gray-200 rounded mb-2" />
                <div className="h-3 w-40 bg-gray-100 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="shadow-sm animate-pulse">
              <CardContent className="pt-6">
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((j) => (
                    <div key={j} className="h-5 bg-gray-100 rounded w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  // ── ERROR STATE ──
  if (error || !data) {
    return (
      <div className="space-y-6 mb-8 w-full max-w-full flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <p className="text-red-600 text-sm font-medium mb-2">
            {error || "Unable to load dashboard"}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const handleSaveTargets = async () => {
    setIsSavingTargets(true)
    try {
      // Execute the POST request to our API
      const response = await axios.post("/ceo-dashboard/targets", targetForms)
      if (response.data?.success) {
         // Reload data immediately to reflect the new API DB state
         setIsTargetsOpen(false)
         window.location.reload()
      } else {
         alert("Failed to save targets.")
      }
    } catch (e: any) {
      alert(e?.response?.data?.message || "You don't have admin permissions to edit targets.")
    } finally {
      setIsSavingTargets(false)
    }
  }

  const { executive_summary: es, demand, conversion, inventory, fulfillment, retention } = data

  // ── KPI card definitions ──
  const kpiCards = [
    {
      label: "GMV",
      value: formatCurrency(es.gmv.current),
      target: `Target: ${formatCurrency(es.gmv.target)}`,
      status: es.gmv.status,
      isStatic: es.gmv.static,
      subtitle: "Total revenue across BeautyBarn D2C store.",
      icon: DollarSign,
      borderColor: "border-l-black",
      iconColor: "text-black",
      bgGradient: "bg-white",
    },
    {
      label: "Blended CAC",
      value: `₹${es.cac.current}`,
      target: `Target: < ₹${es.cac.target}`,
      status: es.cac.status,
      isStatic: es.cac.static,
      subtitle: "Includes Meta, Google, influencer & affiliate.",
      icon: Megaphone,
      borderColor: "border-l-black",
      iconColor: "text-black",
      bgGradient: "bg-white",
    },
    {
      label: "Conversion Rate",
      value: `${es.conversion_rate.current}%`,
      target: `Target: ≥ ${es.conversion_rate.target}%`,
      status: es.conversion_rate.status,
      isStatic: es.conversion_rate.static,
      subtitle: "Sessions to orders on BeautyBarn website.",
      icon: Filter,
      borderColor: "border-l-black",
      iconColor: "text-black",
      bgGradient: "bg-white",
    },
    {
      label: "Average Order Value",
      value: `₹${es.aov.current?.toLocaleString("en-IN")}`,
      target: `Target: ≥ ₹${es.aov.target?.toLocaleString("en-IN")}`,
      status: es.aov.status,
      isStatic: es.aov.static,
      subtitle: "Higher AOV via bundles & upsells.",
      icon: ShoppingCart,
      borderColor: "border-l-black",
      iconColor: "text-black",
      bgGradient: "bg-white",
    },
    {
      label: "Repeat Purchase Rate (60d)",
      value: `${es.rpr_60d.current}%`,
      target: `Target: ≥ ${es.rpr_60d.target}%`,
      status: es.rpr_60d.status,
      isStatic: es.rpr_60d.static,
      subtitle: "Returning customers / total within 60 days.",
      icon: Repeat,
      borderColor: "border-l-black",
      iconColor: "text-black",
      bgGradient: "bg-white",
    },
    {
      label: "Dead Inventory (>90d)",
      value: `${es.dead_inventory.current}%`,
      target: `Target: < ${es.dead_inventory.target}%`,
      status: es.dead_inventory.status,
      isStatic: es.dead_inventory.static,
      subtitle: "Share of inventory not moving in 90+ days.",
      icon: Package,
      borderColor: "border-l-black",
      iconColor: "text-black",
      bgGradient: "bg-white",
    },
  ]

  return (
    <div className="space-y-6 mb-8 w-full max-w-full">
      {/* ═══════ PAGE HEADER ═══════ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800 tracking-tight">
            CEO Dashboard
          </h1>
          <p className="text-sm text-gray-500">
            Weekly command center — demand, conversion, inventory, fulfillment & retention
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <ExportButton
            disabled={loading || !data}
            onClick={() => {
              if (!data) return
              const { executive_summary: es, demand, conversion, inventory, fulfillment, retention } = data
              const rows = [
                { metric: "GMV", current: es.gmv.current, target: es.gmv.target, status: es.gmv.status },
                { metric: "Blended CAC", current: es.cac.current, target: es.cac.target, status: es.cac.status },
                { metric: "Conversion Rate (%)", current: es.conversion_rate.current, target: es.conversion_rate.target, status: es.conversion_rate.status },
                { metric: "AOV", current: es.aov.current, target: es.aov.target, status: es.aov.status },
                { metric: "RPR 60d (%)", current: es.rpr_60d.current, target: es.rpr_60d.target, status: es.rpr_60d.status },
                { metric: "Dead Inventory (%)", current: es.dead_inventory.current, target: es.dead_inventory.target, status: es.dead_inventory.status },
                { metric: "Sessions", current: demand.sessions.current, target: demand.sessions.previous, status: "" },
                { metric: "New Users", current: demand.new_users.current, target: demand.new_users.previous, status: "" },
                { metric: "Add to Cart Rate (%)", current: conversion.add_to_cart_rate.current, target: conversion.add_to_cart_rate.previous, status: "" },
                { metric: "Checkout Completion (%)", current: conversion.checkout_completion.current, target: conversion.checkout_completion.previous, status: "" },
                { metric: "Avg Delivery Days", current: fulfillment.avg_delivery_days.current, target: fulfillment.avg_delivery_days.previous, status: "" },
                { metric: "RTO Rate (%)", current: fulfillment.rto_rate.current, target: fulfillment.rto_rate.previous, status: "" },
                { metric: "Cohort Rebuy 30d (%)", current: retention.cohort_rebuy_30d.current, target: retention.cohort_rebuy_30d.previous, status: "" },
              ]
              const cols: ExportColumn[] = [
                { header: "Metric", key: "metric" },
                { header: "Current", key: "current", format: "number" },
                { header: "Target / Previous", key: "target", format: "number" },
                { header: "Status", key: "status" },
              ]
              exportToExcel(rows, cols, "CEO_Dashboard", startDate, endDate)
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
            onChange={(start, end) => { setDates(start, end); }}
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


      {/* ═══════ EXECUTIVE SUMMARY ═══════ */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-gray-500" />
            Executive Summary
          </h2>

          <Sheet open={isTargetsOpen} onOpenChange={setIsTargetsOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs bg-white text-gray-600 hover:text-gray-900 border-gray-200 shadow-sm">
                <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                Adjust Targets
              </Button>
            </SheetTrigger>
            <SheetContent className="sm:max-w-[425px] overflow-y-auto w-full">
              <SheetHeader>
                <SheetTitle>Edit CEO KPI Targets</SheetTitle>
                <p className="text-xs text-gray-500 mt-1">GMV target is a 30-day baseline and auto-scales to the selected date range. Rate metrics (CAC, conversion, AOV, RPR, dead inventory) are scale-invariant.</p>
              </SheetHeader>
              <div className="grid gap-4 py-4 mt-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <label className="text-right text-xs font-medium text-gray-700">GMV (₹/30d)</label>
                  <Input className="col-span-3 h-8 text-sm" type="number"
                    value={targetForms.gmv} onChange={e => setTargetForms({...targetForms, gmv: Number(e.target.value)})} />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label className="text-right text-xs font-medium text-gray-700">CAC (₹)</label>
                  <Input className="col-span-3 h-8 text-sm" type="number" 
                    value={targetForms.cac} onChange={e => setTargetForms({...targetForms, cac: Number(e.target.value)})} />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label className="text-right text-xs font-medium text-gray-700">Conv (%)</label>
                  <Input className="col-span-3 h-8 text-sm" type="number" step="0.1" 
                    value={targetForms.conversion_rate} onChange={e => setTargetForms({...targetForms, conversion_rate: Number(e.target.value)})} />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label className="text-right text-xs font-medium text-gray-700">AOV (₹)</label>
                  <Input className="col-span-3 h-8 text-sm" type="number" 
                    value={targetForms.aov} onChange={e => setTargetForms({...targetForms, aov: Number(e.target.value)})} />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label className="text-right text-xs font-medium text-gray-700">RPR 60d (%)</label>
                  <Input className="col-span-3 h-8 text-sm" type="number" step="0.1" 
                    value={targetForms.rpr_60d} onChange={e => setTargetForms({...targetForms, rpr_60d: Number(e.target.value)})} />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label className="text-right text-xs font-medium text-gray-700">Dead Inv (%)</label>
                  <Input className="col-span-3 h-8 text-sm" type="number" step="0.1" 
                    value={targetForms.dead_inventory} onChange={e => setTargetForms({...targetForms, dead_inventory: Number(e.target.value)})} />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label className="text-right text-xs font-medium text-gray-700">Mktg Salary (₹/d)</label>
                  <Input className="col-span-3 h-8 text-sm" type="number" 
                    value={targetForms.marketing_salary} onChange={e => setTargetForms({...targetForms, marketing_salary: Number(e.target.value)})} />
                </div>
              </div>
              <Button onClick={handleSaveTargets} disabled={isSavingTargets} className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white">
                {isSavingTargets ? "Saving..." : "Save Benchmark Targets"}
              </Button>
            </SheetContent>
          </Sheet>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {kpiCards.map((kpi) => (
            <Card
              key={kpi.label}
              className={`shadow-sm border-l-4 ${kpi.borderColor} ${kpi.bgGradient}`}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {kpi.label}
                    {kpi.isStatic && (
                      <span className="text-[9px] uppercase tracking-wider font-semibold bg-gray-100/80 text-gray-400 px-1.5 py-0.5 rounded">
                        In Dev
                      </span>
                    )}
                  </div>
                  <kpi.icon className={`h-4 w-4 ${kpi.iconColor} shrink-0`} />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-3xl font-extrabold text-gray-800">
                    {kpi.isStatic ? "—" : kpi.value}
                  </span>
                  {!kpi.isStatic && <StatusPill status={kpi.status} />}
                </div>
                <p className="text-xs text-gray-500 mb-0.5">
                  {kpi.isStatic ? "Target: —" : kpi.target}
                </p>
                <p className="text-xs text-gray-400">{kpi.subtitle}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ═══════ TREND SECTIONS (2-col layout) ═══════ */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* ── DEMAND ENGINE ── */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-gray-500" />
              Demand Engine
            </CardTitle>
            <p className="text-xs text-gray-400">Traffic, CAC and channel mix</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Weekly Trends
                </p>
                <TrendRow
                  label="Sessions"
                  current={formatNumber(demand.sessions.current)}
                  previous={`prev ${formatNumber(demand.sessions.previous)}`}
                  delta={`${demand.sessions.delta_pct! >= 0 ? "+" : ""}${demand.sessions.delta_pct}%`}
                  direction={demand.sessions.delta_pct! > 0 ? "up" : demand.sessions.delta_pct! < 0 ? "down" : "flat"}
                  isStatic={demand.sessions.static}
                />
                <TrendRow
                  label="New Users"
                  current={formatNumber(demand.new_users.current)}
                  previous={`prev ${formatNumber(demand.new_users.previous)}`}
                  delta={`${demand.new_users.delta_pct! >= 0 ? "+" : ""}${demand.new_users.delta_pct}%`}
                  direction={demand.new_users.delta_pct! > 0 ? "up" : demand.new_users.delta_pct! < 0 ? "down" : "flat"}
                  isStatic={demand.new_users.static}
                />
                <TrendRow
                  label="Paid vs Organic"
                  current={`${demand.paid_vs_organic.paid_pct}% / ${demand.paid_vs_organic.organic_pct}%`}
                  previous={`prev ${demand.paid_vs_organic.prev_paid_pct}% / ${demand.paid_vs_organic.prev_organic_pct}%`}
                  delta={
                    demand.paid_vs_organic.organic_pct > demand.paid_vs_organic.prev_organic_pct
                      ? "More organic"
                      : demand.paid_vs_organic.organic_pct < demand.paid_vs_organic.prev_organic_pct
                      ? "More paid"
                      : "Flat"
                  }
                  direction={
                    demand.paid_vs_organic.organic_pct > demand.paid_vs_organic.prev_organic_pct
                      ? "up"
                      : demand.paid_vs_organic.organic_pct < demand.paid_vs_organic.prev_organic_pct
                      ? "down"
                      : "flat"
                  }
                />
                <TrendRow
                  label="Influencer Traffic"
                  current={formatNumber(demand.influencer_traffic.current)}
                  previous={`prev ${formatNumber(demand.influencer_traffic.previous)}`}
                  delta={`${demand.influencer_traffic.delta_pct! >= 0 ? "+" : ""}${demand.influencer_traffic.delta_pct}%`}
                  direction={demand.influencer_traffic.delta_pct! > 0 ? "up" : demand.influencer_traffic.delta_pct! < 0 ? "down" : "flat"}
                  isStatic={demand.influencer_traffic.static}
                />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Focus Notes
                </p>
                <ul className="text-xs text-gray-500 list-disc pl-4 space-y-1.5 leading-relaxed">
                  <li>Push organic levers: SEO, YouTube &amp; influencer UGC.</li>
                  <li>Protect CAC by tightening cold audience targeting on Meta.</li>
                  <li>Double down on high-intent search terms from GA4 site search.</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── CONVERSION ENGINE ── */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              Conversion Engine
            </CardTitle>
            <p className="text-xs text-gray-400">From sessions to orders</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Funnel Health
                </p>
                <TrendRow
                  label="Add to Cart Rate"
                  current={`${conversion.add_to_cart_rate.current}%`}
                  previous={`prev ${conversion.add_to_cart_rate.previous}%`}
                  delta={`${conversion.add_to_cart_rate.delta! >= 0 ? "+" : ""}${conversion.add_to_cart_rate.delta} pts`}
                  direction={conversion.add_to_cart_rate.delta! > 0 ? "up" : conversion.add_to_cart_rate.delta! < 0 ? "down" : "flat"}
                  isStatic={conversion.add_to_cart_rate.static}
                />
                <TrendRow
                  label="Checkout Completion"
                  current={`${conversion.checkout_completion.current}%`}
                  previous={`prev ${conversion.checkout_completion.previous}%`}
                  delta={`${conversion.checkout_completion.delta! >= 0 ? "+" : ""}${conversion.checkout_completion.delta} pts`}
                  direction={conversion.checkout_completion.delta! > 0 ? "up" : conversion.checkout_completion.delta! < 0 ? "down" : "flat"}
                  isStatic={conversion.checkout_completion.static}
                />
                <TrendRow
                  label="Hero SKU Sell-through"
                  current={`${conversion.hero_sku_sellthrough.current}%`}
                  previous={`prev ${conversion.hero_sku_sellthrough.previous}%`}
                  delta={`${conversion.hero_sku_sellthrough.delta! >= 0 ? "+" : ""}${conversion.hero_sku_sellthrough.delta} pts`}
                  direction={conversion.hero_sku_sellthrough.delta! > 0 ? "up" : conversion.hero_sku_sellthrough.delta! < 0 ? "down" : "flat"}
                  isStatic={conversion.hero_sku_sellthrough.static}
                />
                <TrendRow
                  label="Discount Dependency"
                  current={`${conversion.discount_dependency.current}%`}
                  previous={`prev ${conversion.discount_dependency.previous}%`}
                  delta={`${conversion.discount_dependency.delta! >= 0 ? "+" : ""}${conversion.discount_dependency.delta} pts`}
                  direction={conversion.discount_dependency.delta! < 0 ? "up" : conversion.discount_dependency.delta! > 0 ? "down" : "flat"}
                  upIsGood={true}
                  isStatic={conversion.discount_dependency.static}
                />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Immediate Levers
                </p>
                <ul className="text-xs text-gray-500 list-disc pl-4 space-y-1.5 leading-relaxed">
                  <li>A/B test checkout flow, especially payment step friction.</li>
                  <li>Surface routine-based bundles to lift AOV without deep discounts.</li>
                  <li>Ensure top K-beauty categories have complete PDP content.</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── INVENTORY & CASH ENGINE ── */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Package className="h-4 w-4 text-gray-500" />
              Inventory &amp; Cash Engine
            </CardTitle>
            <p className="text-xs text-gray-400">Cash trapped in shelves vs working capital</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Stock &amp; Margin
                </p>
                <TrendRow
                  label="Stock-out SKUs"
                  current={`${inventory.stock_out_skus.current}`}
                  previous={inventory.stock_out_skus.previous != null ? `prev ${inventory.stock_out_skus.previous}` : ""}
                  delta={inventory.stock_out_skus.previous != null ? `${inventory.stock_out_skus.current - inventory.stock_out_skus.previous} SKUs` : "—"}
                  direction={inventory.stock_out_skus.previous != null ? (inventory.stock_out_skus.current < inventory.stock_out_skus.previous ? "up" : "down") : "flat"}
                  upIsGood={true}
                  isStatic={inventory.stock_out_skus.static}
                />
                <TrendRow
                  label="Inventory Coverage"
                  current={`${inventory.inventory_coverage_days.current} days`}
                  previous={`prev ${inventory.inventory_coverage_days.previous} days`}
                  delta={`${inventory.inventory_coverage_days.delta} days`}
                  direction={inventory.inventory_coverage_days.delta! < 0 ? "down" : "up"}
                  upIsGood={false}
                  isStatic={inventory.inventory_coverage_days.static}
                />
                <TrendRow
                  label="Aging Stock (>120d)"
                  current={`${inventory.aging_stock_pct.current}%`}
                  previous={inventory.aging_stock_pct.previous != null ? `prev ${inventory.aging_stock_pct.previous}%` : ""}
                  delta={inventory.aging_stock_pct.previous != null ? `${(inventory.aging_stock_pct.current - inventory.aging_stock_pct.previous)?.toFixed(1)} pts` : "—"}
                  direction={inventory.aging_stock_pct.previous != null ? (inventory.aging_stock_pct.current < inventory.aging_stock_pct.previous ? "up" : "down") : "flat"}
                  upIsGood={true}
                  isStatic={inventory.aging_stock_pct.static}
                />
                <TrendRow
                  label="Gross Margin"
                  current={`${inventory.gross_margin.current}%`}
                  previous={`prev ${inventory.gross_margin.previous}%`}
                  delta={`${inventory.gross_margin.delta! >= 0 ? "+" : ""}${inventory.gross_margin.delta} pts`}
                  direction={inventory.gross_margin.delta! > 0 ? "up" : inventory.gross_margin.delta! < 0 ? "down" : "flat"}
                  isStatic={inventory.gross_margin.static}
                />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  CEO Watchpoints
                </p>
                <ul className="text-xs text-gray-500 list-disc pl-4 space-y-1.5 leading-relaxed">
                  <li>Aging SKUs &gt; 120 days should trigger clearance or kit bundles.</li>
                  <li>Keep hero SKUs fully in stock — build buffer into forecasting.</li>
                  <li>Maintain margin while testing marketplace-style commission models.</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── FULFILLMENT & RETENTION ── */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Truck className="h-4 w-4 text-gray-500" />
              Fulfillment &amp; Retention
            </CardTitle>
            <p className="text-xs text-gray-400">Delivery experience + reasons to come back</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Fulfillment */}
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Fulfillment
                </p>
                <TrendRow
                  label="Avg Delivery Time"
                  current={`${fulfillment.avg_delivery_days.current} days`}
                  previous={`prev ${fulfillment.avg_delivery_days.previous} days`}
                  delta={`${fulfillment.avg_delivery_days.delta} days`}
                  direction={fulfillment.avg_delivery_days.delta! < 0 ? "up" : "down"}
                  upIsGood={true}
                  isStatic={fulfillment.avg_delivery_days.static}
                />
                <TrendRow
                  label="Orders within SLA"
                  current={`${fulfillment.sla_pct.current}%`}
                  previous={`prev ${fulfillment.sla_pct.previous}%`}
                  delta={`${fulfillment.sla_pct.delta! >= 0 ? "+" : ""}${fulfillment.sla_pct.delta} pts`}
                  direction={fulfillment.sla_pct.delta! > 0 ? "up" : fulfillment.sla_pct.delta! < 0 ? "down" : "flat"}
                  isStatic={fulfillment.sla_pct.static}
                />
                <TrendRow
                  label="RTO Rate"
                  current={`${fulfillment.rto_rate.current}%`}
                  previous={`prev ${fulfillment.rto_rate.previous}%`}
                  delta={`${fulfillment.rto_rate.delta! >= 0 ? "+" : ""}${fulfillment.rto_rate.delta} pts`}
                  direction={fulfillment.rto_rate.delta! > 0 ? "down" : "up"}
                  upIsGood={true}
                  isStatic={fulfillment.rto_rate.static}
                />
                <TrendRow
                  label="Support Tickets / 1K"
                  current={`${fulfillment.support_tickets_per_1k.current}`}
                  previous={`prev ${fulfillment.support_tickets_per_1k.previous}`}
                  delta={`${fulfillment.support_tickets_per_1k.delta}`}
                  direction={fulfillment.support_tickets_per_1k.delta! < 0 ? "up" : "down"}
                  upIsGood={true}
                  isStatic={fulfillment.support_tickets_per_1k.static}
                />
              </div>

              {/* Retention */}
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Retention
                </p>
                <TrendRow
                  label="30d Cohort Rebuy"
                  current={`${retention.cohort_rebuy_30d.current}%`}
                  previous={`prev ${retention.cohort_rebuy_30d.previous}%`}
                  delta={`${retention.cohort_rebuy_30d.delta! >= 0 ? "+" : ""}${retention.cohort_rebuy_30d.delta} pt`}
                  direction={retention.cohort_rebuy_30d.delta! > 0 ? "up" : retention.cohort_rebuy_30d.delta! < 0 ? "down" : "flat"}
                  isStatic={retention.cohort_rebuy_30d.static}
                />
                <TrendRow
                  label="Email Revenue Share"
                  current={`${retention.email_revenue_share.current}%`}
                  previous={`prev ${retention.email_revenue_share.previous}%`}
                  delta={`${retention.email_revenue_share.delta! >= 0 ? "+" : ""}${retention.email_revenue_share.delta} pt`}
                  direction={retention.email_revenue_share.delta! > 0 ? "up" : retention.email_revenue_share.delta! < 0 ? "down" : "flat"}
                  isStatic={retention.email_revenue_share.static}
                />
                <TrendRow
                  label="NPS (Last 7d)"
                  current={`${retention.nps.current}`}
                  previous={`prev ${retention.nps.previous}`}
                  delta={`${retention.nps.delta! >= 0 ? "+" : ""}${retention.nps.delta}`}
                  direction={retention.nps.delta! > 0 ? "up" : retention.nps.delta! < 0 ? "down" : "flat"}
                  isStatic={retention.nps.static}
                />
                <TrendRow
                  label="Complaint Rate"
                  current={`${retention.complaint_rate.current}%`}
                  previous={`prev ${retention.complaint_rate.previous}%`}
                  delta={`${retention.complaint_rate.delta! >= 0 ? "+" : ""}${retention.complaint_rate.delta} pts`}
                  direction={retention.complaint_rate.delta! > 0 ? "down" : "up"}
                  upIsGood={true}
                  isStatic={retention.complaint_rate.static}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══════ Executive Summary Table ═══════ */}
      {data && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b bg-gray-50/50">
            <h3 className="font-semibold text-gray-700">Executive Summary — Tabular Data</h3>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Section</TableHead>
                  <TableHead>Metric</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Target / Previous</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { section: "Executive", metric: "GMV", current: data.executive_summary.gmv.current, target: data.executive_summary.gmv.target, status: data.executive_summary.gmv.status },
                  { section: "Executive", metric: "Blended CAC", current: data.executive_summary.cac.current, target: data.executive_summary.cac.target, status: data.executive_summary.cac.status },
                  { section: "Executive", metric: "Conversion Rate", current: `${data.executive_summary.conversion_rate.current}%`, target: `${data.executive_summary.conversion_rate.target}%`, status: data.executive_summary.conversion_rate.status },
                  { section: "Executive", metric: "AOV", current: data.executive_summary.aov.current, target: data.executive_summary.aov.target, status: data.executive_summary.aov.status },
                  { section: "Executive", metric: "RPR 60d", current: `${data.executive_summary.rpr_60d.current}%`, target: `${data.executive_summary.rpr_60d.target}%`, status: data.executive_summary.rpr_60d.status },
                  { section: "Executive", metric: "Dead Inventory", current: `${data.executive_summary.dead_inventory.current}%`, target: `${data.executive_summary.dead_inventory.target}%`, status: data.executive_summary.dead_inventory.status },
                  { section: "Demand", metric: "Sessions", current: data.demand.sessions.current, target: data.demand.sessions.previous, status: "" },
                  { section: "Demand", metric: "New Users", current: data.demand.new_users.current, target: data.demand.new_users.previous, status: "" },
                  { section: "Conversion", metric: "Add to Cart Rate", current: `${data.conversion.add_to_cart_rate.current}%`, target: `${data.conversion.add_to_cart_rate.previous}%`, status: "" },
                  { section: "Conversion", metric: "Checkout Completion", current: `${data.conversion.checkout_completion.current}%`, target: `${data.conversion.checkout_completion.previous}%`, status: "" },
                  { section: "Fulfillment", metric: "Avg Delivery Days", current: data.fulfillment.avg_delivery_days.current, target: data.fulfillment.avg_delivery_days.previous, status: "" },
                  { section: "Fulfillment", metric: "RTO Rate", current: `${data.fulfillment.rto_rate.current}%`, target: `${data.fulfillment.rto_rate.previous}%`, status: "" },
                  { section: "Retention", metric: "Cohort Rebuy 30d", current: `${data.retention.cohort_rebuy_30d.current}%`, target: `${data.retention.cohort_rebuy_30d.previous}%`, status: "" },
                ].map((row, i) => (
                  <TableRow key={i} className="hover:bg-gray-50/50">
                    <TableCell className="text-xs uppercase text-gray-400 font-semibold">{row.section}</TableCell>
                    <TableCell className="font-medium text-gray-800">{row.metric}</TableCell>
                    <TableCell className="text-right tabular-nums font-bold text-gray-800">{typeof row.current === 'number' ? row.current?.toLocaleString() : row.current}</TableCell>
                    <TableCell className="text-right tabular-nums text-gray-500">{typeof row.target === 'number' ? row.target?.toLocaleString() : row.target}</TableCell>
                    <TableCell className="text-center">
                      {row.status === "on_track" && <span className="px-3 py-1 rounded-full text-sm font-extrabold bg-emerald-500 text-white border border-emerald-600">On Track</span>}
                      {row.status === "watch" && <span className="px-3 py-1 rounded-full text-sm font-extrabold bg-amber-400 text-amber-950 border border-amber-500">On Watch</span>}
                      {row.status === "needs_attention" && <span className="px-3 py-1 rounded-full text-sm font-extrabold bg-red-500 text-white border border-red-600">Attention</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* ── North Star Trend ── */}
      {data?.north_star_trend && (data.north_star_trend as any[]).length > 0 && (
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-sm font-semibold text-gray-700">⭐ North Star Trend — Daily GMV</CardTitle></CardHeader>
          <CardContent>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.north_star_trend as any[]} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false}
                    tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false}
                    tickFormatter={(v: number) => v >= 100000 ? `₹${(v/100000)?.toFixed(0)}L` : `₹${(v/1000)?.toFixed(0)}K`} />
                  <Tooltip formatter={(v: any) => [`₹${Number(v)?.toLocaleString("en-IN")}`, "GMV"]} labelFormatter={(l: string) => `Date: ${l}`} />
                  <Area type="monotone" dataKey="gmv" stroke="#6366f1" fill="#e0e7ff" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Retention Live Data ── */}
      {data?.retention && (data.retention as any).rpr_percentage !== undefined && (
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-sm font-semibold text-gray-700">🔄 Retention Live Data</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              {[
                { label: "Repeat Purchase Rate", value: `${(data.retention as any).rpr_percentage||0}%`, color: "text-emerald-600" },
                { label: "Avg M1 Retention", value: `${(data.retention as any).avg_month1_retention||0}%`, color: "text-indigo-600" },
                { label: "Loyal Customer %", value: `${(data.retention as any).loyal_customer_pct||0}%`, color: "text-blue-600" },
              ].map(k => (
                <div key={k.label} className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-xs text-gray-500 mb-1">{k.label}</p>
                  <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
                </div>
              ))}
            </div>
            {(data.retention as any).rfm_distribution && Object.keys((data.retention as any).rfm_distribution).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">RFM Segment Distribution</p>
                <div className="space-y-2">
                  {Object.entries((data.retention as any).rfm_distribution as Record<string,number>).map(([seg, count]) => {
                    const total = Object.values((data.retention as any).rfm_distribution as Record<string,number>).reduce((a,b)=>a+b,0) || 1
                    const pct = Math.round((count/total)*100)
                    const colors: Record<string,string> = {"Champions":"bg-emerald-500","Loyal Customers":"bg-indigo-500","Potential Loyalists":"bg-amber-500","At Risk":"bg-orange-500","Lost Customers":"bg-gray-400"}
                    return (
                      <div key={seg} className="flex items-center gap-3">
                        <div className="w-32 text-xs text-gray-600 font-medium truncate">{seg}</div>
                        <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${colors[seg]||"bg-blue-400"}`} style={{width:`${pct}%`}} />
                        </div>
                        <div className="w-20 text-xs text-right font-semibold text-gray-700">{count?.toLocaleString()} ({pct}%)</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Contribution Margin ── */}
      {data?.contribution_margin && (
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-sm font-semibold text-gray-700">💰 Contribution Margin</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total Revenue", value: `₹${((data.contribution_margin.total_revenue||0)/100000)?.toFixed(1)}L`, color: "text-emerald-600" },
                { label: "Gross Profit (42%)", value: `₹${((data.contribution_margin.gross_profit||0)/100000)?.toFixed(1)}L`, color: "text-blue-600" },
                { label: "Marketing Spend", value: `₹${((data.contribution_margin.marketing_spend||0)/100000)?.toFixed(1)}L`, color: "text-rose-600" },
                { label: "Contribution Margin", value: `₹${((data.contribution_margin.contribution_margin||0)/100000)?.toFixed(1)}L (${data.contribution_margin.contribution_margin_pct||0}%)`, color: (data.contribution_margin.contribution_margin||0) > 0 ? "text-emerald-600 font-bold" : "text-rose-600 font-bold" },
              ].map(k => (
                <div key={k.label} className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">{k.label}</p>
                  <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Channel Drilldown ── */}
      {data?.channel_drilldown && (data.channel_drilldown as any[]).length > 0 && (
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-sm font-semibold text-gray-700">📡 Channel Drilldown — Revenue by Source</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-xs uppercase text-gray-400 border-b">
                  <th className="pb-2 text-left font-semibold">Source</th>
                  <th className="pb-2 text-right font-semibold">Revenue</th>
                  <th className="pb-2 text-right font-semibold">Orders</th>
                  <th className="pb-2 text-right font-semibold">Sessions</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {(data.channel_drilldown as any[]).map((ch: any, i: number) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="py-2 font-medium text-gray-700">{ch.source}</td>
                      <td className="py-2 text-right text-emerald-600 font-semibold">₹{((ch.revenue||0)/100000)?.toFixed(1)}L</td>
                      <td className="py-2 text-right text-gray-600">{(ch.orders||0)?.toLocaleString()}</td>
                      <td className="py-2 text-right text-gray-500">{(ch.sessions||0)?.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Metric Library ── */}
      {data?.metric_library && (
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-sm font-semibold text-gray-700">📚 Metric Library</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "MER", value: `${(data.metric_library as any).mer||0}x`, color: "text-indigo-600" },
                { label: "Avg CAC", value: `₹${((data.metric_library as any).avg_cac||0)?.toLocaleString()}`, color: "text-rose-600" },
                { label: "LTV:CAC", value: `${(data.metric_library as any).ltv_cac_ratio||0}x`, color: ((data.metric_library as any).ltv_cac_ratio||0) >= 3 ? "text-emerald-600" : "text-amber-600" },
                { label: "CAC Payback", value: `${(data.metric_library as any).cac_payback_months||0} mo`, color: "text-blue-600" },
              ].map(k => (
                <div key={k.label} className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-xs text-gray-500 mb-1">{k.label}</p>
                  <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Operations ── */}
      {data?.operations && (
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-sm font-semibold text-gray-700">⚙️ Operations Overview</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              {[
                { label: "RTO Rate", value: `${(data.operations as any).rto_rate||0}%`, color: ((data.operations as any).rto_rate||0) > 10 ? "text-rose-600" : "text-emerald-600" },
                { label: "Avg Delivery", value: `${(data.operations as any).avg_delivery_days||0}d`, color: ((data.operations as any).avg_delivery_days||0) > 5 ? "text-amber-600" : "text-emerald-600" },
                { label: "P90 Delivery", value: `${(data.operations as any).p90_delivery_days||0}d`, color: "text-blue-600" },
                { label: "Top Couriers", value: `${((data.operations as any).top_couriers||[]).length} active`, color: "text-gray-600" },
              ].map(k => (
                <div key={k.label} className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-xs text-gray-500 mb-1">{k.label}</p>
                  <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
                </div>
              ))}
            </div>
            {((data.operations as any).top_failure_zones||[]).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Top Failure Zones</p>
                <div className="flex flex-wrap gap-2">
                  {((data.operations as any).top_failure_zones as any[]).slice(0,5).map((z: any, i: number) => (
                    <span key={i} className="px-2 py-1 rounded-full text-xs bg-rose-50 text-rose-700 font-medium">{z.city}, {z.state} ({z.failed} failed)</span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  )
}
