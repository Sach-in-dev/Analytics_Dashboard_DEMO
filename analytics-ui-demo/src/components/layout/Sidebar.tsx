"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart3,
  Activity,
  Link2,
  ShoppingCart,
  Package,
  Users,
  UsersRound,
  Star,
  PackageOpen,
  Network,
  TrendingUp,
  Repeat,
  Filter,
  CalendarRange,
  CircleDollarSign,
  Megaphone,
  Workflow,
  LayoutDashboard,
  RotateCcw,
  Timer,
  MapPin,
  Undo2,
  Globe,
  Truck,
  ReceiptText,
  PiggyBank,
  Target,
  Coins,
  Sparkles,
  Crown,
  CreditCard,
  Zap,
  BookOpen,
  HeartHandshake,
  Layers,
  UserSearch,
  Clock,
  GitBranch,
  CalendarCheck,
} from "lucide-react"

import { useAuth, permissionMap } from "@/contexts/AuthContext"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

export const menuItems = [
  {
    label: "CEO Dashboard",
    icon: LayoutDashboard,
    href: "/dashboard",
  },
  {
    label: "Order Metrics",
    icon: BarChart3,
    href: "/order-metrics",
  },
  {
    label: "Events",
    icon: Activity,
    href: "/events",
  },
  {
    label: "UTM Reports",
    icon: Link2,
    href: "/utm",
  },
  {
    label: "Searches",
    icon: Activity,
    href: "/searches",
  },
  {
    label: "Active Users",
    icon: Activity,
    href: "/active-users",
  },
  {
    label: "Coupons",
    icon: Link2,
    href: "/coupons",
  },
  {
    label: "Products",
    icon: Package,
    href: "/products",
  },
  {
    label: "Reviews & Ratings",
    icon: Star,
    href: "/reviews",
  },
  {
    label: "Inventory Metrics",
    icon: PackageOpen,
    href: "/inventory",
  },
  {
    label: "What Sells Together",
    icon: Network,
    href: "/correlations",
  },
  {
    label: "Customer Segments",
    icon: UsersRound,
    href: "/rfm-segments",
  },
  {
    label: "Customer LTV",
    icon: TrendingUp,
    href: "/ltv-by-segment",
  },
  {
    label: "Repeat Purchase Rate",
    icon: Repeat,
    href: "/repeat-purchase-rate",
  },
  {
    label: "Funnel Metrics",
    icon: Filter,
    href: "/funnel-metrics",
  },
  {
    label: "Repeat Cohorts",
    icon: CalendarRange,
    href: "/repeat-cohorts",
  },
  {
    label: "Lifetime Cohorts",
    icon: CircleDollarSign,
    href: "/lifetime-cohorts",
  },
  {
    label: "UTM Attribution",
    icon: Megaphone,
    href: "/utm-attribution",
  },
  {
    label: "Flow Attribution",
    icon: Workflow,
    href: "/flow-attribution",
  },
  {
    label: "RTO Rate",
    icon: RotateCcw,
    href: "/rto-rate",
  },
  {
    label: "Delivery Time",
    icon: Timer,
    href: "/delivery-time",
  },
  {
    label: "Failure Zones",
    icon: MapPin,
    href: "/failure-zones",
  },
  {
    label: "Return Rate",
    icon: Undo2,
    href: "/return-rate",
  },
  {
    label: "Geo Revenue",
    icon: Globe,
    href: "/geography-revenue",
  },
  {
    label: "Courier Perf",
    icon: Truck,
    href: "/courier-performance",
  },
  {
    label: "Return Reasons",
    icon: ReceiptText,
    href: "/return-reasons",
  },
  {
    label: "Channel ROI",
    icon: PiggyBank,
    href: "/channel-roi",
  },
  {
    label: "Campaign CAC",
    icon: Target,
    href: "/campaign-cac",
  },
  {
    label: "Marketing Cost",
    icon: Coins,
    href: "/marketing-cost",
  },
  {
    label: "Creative Perf",
    icon: Sparkles,
    href: "/creative-performance",
  },
  {
    label: "Audience ROAS",
    icon: Users,
    href: "/audience-roas",
  },
  {
    label: "Influencer",
    icon: Crown,
    href: "/influencer-attribution",
  },
  {
    label: "Payment Failure",
    icon: CreditCard,
    href: "/payment-failure",
  },
  {
    label: "Carts",
    icon: ShoppingCart,
    href: "/carts",
  },
  {
    label: "Growth",
    icon: Zap,
    href: "/growth",
  },
  {
    label: "Metric Library",
    icon: BookOpen,
    href: "/metric-library",
  },
  {
    label: "Retention",
    icon: HeartHandshake,
    href: "/retention",
  },
  {
    label: "Mktg Platforms",
    icon: Layers,
    href: "/marketing-platforms",
  },
  {
    label: "Customer LTV",
    icon: UserSearch,
    href: "/clv",
  },
  {
    label: "Engagement",
    icon: Clock,
    href: "/engagement",
  },
  {
    label: "Acq. Retention",
    icon: GitBranch,
    href: "/acquisition-retention",
  },
  {
    label: "Signup Cohorts",
    icon: CalendarCheck,
    href: "/signup-cohorts",
  },
]

export function AppSidebar() {
  const pathname = usePathname()
  const { user } = useAuth()

  // Evaluate visible menus
  let visibleItems = menuItems.filter(item => {
    if (user?.role === "admin") return true
    const requiredPerm = permissionMap[item.href]
    if (!requiredPerm) return true
    return user?.permissions.includes(requiredPerm)
  })

  if (user?.role === "admin") {
    visibleItems.push({
      label: "Users & Roles",
      icon: Users,
      href: "/users",
    })
  }

  return (
    <Sidebar collapsible="icon">
      {/* -------- Header -------- */}
      <SidebarHeader className="py-4">
        <div className="flex flex-col gap-1 px-3 group-data-[collapsible=icon]:hidden">
          <span className="text-lg font-bold tracking-tight">
            Analytics Dashboard
          </span>
          <img 
            src="https://blog.beautybarn.in/wp-content/uploads/2025/11/Beauty-Barn_Logo_RGB_Primary_Cherry_Wine-scaled.png"
            alt="Beauty Barn"
            className="h-8 w-auto object-contain mt-1 dark:brightness-150 dark:contrast-125"
          />
        </div>
      </SidebarHeader>

      {/* -------- Content -------- */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-xs tracking-widest">
            APPLICATION
          </SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {visibleItems.map((item) => {
                const active = pathname === item.href

                return (
                    <SidebarMenuItem key={item.label}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                        className={`
                          relative
                          ${active ? "bg-muted font-medium" : ""}
                        `}
                      >
                        <Link href={item.href}>
                          {active && (
                            <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-primary" />
                          )}
                          <item.icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* -------- Rail -------- */}
      <SidebarRail />
    </Sidebar>
  )
}
