"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { api } from "@/lib/axios"

export interface User {
  id: string
  email: string
  name: string
  role: "admin" | "user"
  permissions: string[]
}

interface AuthContextType {
  user: User | null
  loading: boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: () => {},
})

// These map pathnames to the required permission string.
export const permissionMap: Record<string, string> = {
  "/dashboard": "ceo_dashboard",
  "/order-metrics": "orders",
  "/events": "events",
  "/utm": "utm",
  "/searches": "searches",
  "/active-users": "active-users",
  "/coupons": "coupons",
  "/products": "products",
  "/carts": "carts",
  "/users": "admin",
  "/reviews": "reviews",
  "/inventory": "inventory",
  "/correlations": "correlations",
  "/rfm-segments": "rfm",
  "/ltv-by-segment": "ltv",
  "/repeat-purchase-rate": "rpr",
  "/funnel-metrics": "funnel_metrics",
  "/repeat-cohorts": "repeat_cohorts",
  "/lifetime-cohorts": "lifetime_cohorts",
  "/utm-attribution": "utm_attribution",
  "/flow-attribution": "flow_attribution",
  "/rto-rate": "rto_metrics",
  "/delivery-time": "delivery_time",
  "/failure-zones": "failure_zones",
  "/return-rate": "return_rate",
  "/geography-revenue": "geography_revenue",
  "/courier-performance": "courier_performance",
  "/return-reasons": "return_reasons",
  "/channel-roi": "channel_roi",
  "/campaign-cac": "campaign_cac",
  "/marketing-cost": "marketing_cost",
  "/creative-performance": "creative_performance",
  "/audience-roas": "audience_roas",
  "/influencer-attribution": "influencer_attribution",
  "/payment-failure": "payment_failure",
  "/growth": "growth",
  "/metric-library": "metric_library",
  "/retention": "retention",
  "/marketing-platforms": "marketing_platforms",
  "/clv": "clv",
  "/engagement": "engagement",
  "/acquisition-retention": "acquisition_retention",
  "/signup-cohorts": "signup_cohorts",
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // DEMO MODE: Skip auth API call, use hardcoded admin user
    setUser({
      id: "demo-admin",
      email: "admin@demo.com",
      name: "Demo Admin",
      role: "admin",
      permissions: Object.values(permissionMap),
    });
    setLoading(false);
  }, [])

  // Strict route guard logic
  useEffect(() => {
    if (loading) return

    if (!user) {
      if (pathname !== "/login") {
        router.push("/login")
      }
      return
    }

    if (pathname === "/login") {
      if (user.role === "admin" || user.permissions.includes("ceo_dashboard")) {
        router.push("/dashboard")
      } else {
        router.push("/order-metrics")
      }
      return
    }

    // Check permissions
    const basePath = "/" + pathname.split("/")[1]
    const requiredPermission = permissionMap[basePath]

    if (requiredPermission) {
      if (user.role === "admin") {
        return // admin has access to everything
      }
      
      if (!user.permissions.includes(requiredPermission)) {
        // Redirect to first available permitted page
        const firstPerm = user.permissions[0]
        if (firstPerm) {
          const redirectPath = Object.keys(permissionMap).find(k => permissionMap[k] === firstPerm)
          if (redirectPath) {
            router.push(redirectPath)
            return
          }
        }
        
        // Fallback if they have no valid UI permissions mapped
        if (pathname !== "/unauthorized") {
            router.push("/unauthorized")
        }
      }
    }
  }, [user, loading, pathname, router])

  const logout = async () => {
    try {
      await api.post("/auth/logout")
    } catch(err) {}
    setUser(null)
    localStorage.removeItem("token")
    router.push("/login")
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
