"use client"

import { useState, useEffect } from "react"
import { api } from "@/lib/axios"
import { 
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "components/ui/input"
import { Label } from "components/ui/label"
import {
    Loader2, UserPlus, Pencil, ShieldAlert, KeyRound, Ban, ArrowUp, ArrowDown, Minus
} from "lucide-react"

export interface UserDTO {
  id: string
  email: string
  name: string
  role: string
  permissions: string[]
  is_active: boolean
}

const ALL_PERMISSIONS = [
  // Core
  "ceo_dashboard", "orders", "events", "utm", "searches", "active-users", "coupons", "products", "carts", "reviews", "inventory", "correlations", "export",
  // Customer Analytics
  "rfm", "ltv", "rpr", "funnel_metrics", "repeat_cohorts", "lifetime_cohorts",
  // Attribution
  "utm_attribution", "flow_attribution",
  // Fulfillment
  "rto_metrics", "delivery_time", "failure_zones", "return_rate", "geography_revenue", "courier_performance", "return_reasons",
  // Marketing
  "channel_roi", "campaign_cac", "marketing_cost", "creative_performance", "audience_roas", "influencer_attribution", "payment_failure",
  // New Metrics
  "growth", "metric_library", "retention", "marketing_platforms", "clv", "engagement", "acquisition_retention", "signup_cohorts",
]

export function UsersPage() {
  const [users, setUsers] = useState<UserDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)

  // Dialog States
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)

  // Form State
  const [formData, setFormData] = useState<Partial<UserDTO> & { password?: string }>({
    email: "", name: "", password: "", role: "user", permissions: []
  })
  
  const [formLoading, setFormLoading] = useState(false)

  useEffect(() => {
    async function fetchUsers() {
      try {
        const res = await api.get("/users")
        setUsers(res.data.data)
      } catch (err) {
        console.error("Failed to fetch users", err)
      } finally {
        setLoading(false)
      }
    }
    fetchUsers()
  }, [refresh])

  const handleToggleActive = async (userId: string, currentStatus: boolean) => {
    try {
      await api.put(`/users/${userId}/status`, { is_active: !currentStatus })
      setRefresh(r => r + 1)
    } catch(err) {
      alert("Failed to toggle status. Cannot disable yourself?")
    }
  }

  const handleResetPassword = async (userId: string) => {
    const newPass = prompt("Enter new password (min 6 chars):")
    if (!newPass) return
    if (newPass.length < 6) return alert("Must be 6 chars")
    
    try {
      await api.put(`/users/${userId}/reset-password`, { new_password: newPass })
      alert("Password reset successfully")
    } catch(err) {
      alert("Failed to reset password")
    }
  }

  const openCreate = () => {
    setFormData({ email: "", name: "", password: "", role: "user", permissions: [] })
    setIsCreateOpen(true)
  }

  const openEdit = (user: UserDTO) => {
    setFormData({ id: user.id, email: user.email, name: user.name, role: user.role, permissions: user.permissions })
    setIsEditOpen(true)
  }

  const handlePermissionToggle = (perm: string) => {
    setFormData(prev => {
      const perms = prev.permissions || []
      if (perms.includes(perm)) {
        return { ...prev, permissions: perms.filter(p => p !== perm) }
      } else {
        return { ...prev, permissions: [...perms, perm] }
      }
    })
  }

  const submitCreate = async () => {
    setFormLoading(true)
    try {
      await api.post("/users", formData)
      setIsCreateOpen(false)
      setRefresh(r => r + 1)
    } catch(err: any) {
      alert(err.response?.data?.message || "Failed to create user")
    } finally {
      setFormLoading(false)
    }
  }

  const submitEdit = async () => {
    setFormLoading(true)
    try {
      // we need to call update role and update permissions independently if they changed
      await api.put(`/users/${formData.id}/role`, { role: formData.role })
      await api.put(`/users/${formData.id}/permissions`, { permissions: formData.permissions })
      setIsEditOpen(false)
      setRefresh(r => r + 1)
    } catch(err: any) {
      alert(err.response?.data?.message || "Failed to update user")
    } finally {
      setFormLoading(false)
    }
  }

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-gray-500" /></div>

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Configuration & Roles</h2>
          <p className="text-muted-foreground text-sm mt-1">Manage platform access and permissions.</p>
        </div>
        <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700">
          <UserPlus className="mr-2" size={16} /> Add User
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 font-medium">
              <tr>
                <th className="px-6 py-4">Name / Email</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Permissions Config</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50/50">
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900">{u.name}</p>
                    <p className="text-gray-500 text-xs">{u.email}</p>
                  </td>
                  <td className="px-6 py-4 uppercase text-xs font-semibold">{u.role}</td>
                  <td className="px-6 py-4">
                    {u.role === 'admin' ? (
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">All Access</span>
                    ) : (
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {u.permissions.map(p => (
                          <span key={p} className="text-[10px] bg-gray-100 border text-gray-600 px-1 rounded">{p}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {u.is_active ? 
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">Active</span> :
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">Disabled</span>
                    }
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="icon" onClick={() => openEdit(u)} title="Edit Config">
                         <Pencil size={14} />
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => handleResetPassword(u.id)} title="Reset Password">
                         <KeyRound size={14} />
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => handleToggleActive(u.id, u.is_active)} title="Toggle Status">
                         <Ban size={14} className={u.is_active ? "text-red-500" : "text-emerald-500"} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Basic Dialog implemented with absolute positioning to avoid adding uninstalled radix primitives manually */}
      {(isCreateOpen || isEditOpen) && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md animate-in fade-in zoom-in-95">
            <CardHeader>
              <CardTitle>{isCreateOpen ? "Create New User" : "Edit User Config"}</CardTitle>
              <CardDescription>Manage user credentials and UI access.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              
              {isCreateOpen && (
                <>
                  <div className="space-y-1">
                    <Label>Full Name</Label>
                    <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <Label>Email</Label>
                    <Input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <Label>Temporary Password</Label>
                    <Input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                  </div>
                </>
              )}

              <div className="space-y-1 pt-2">
                <Label>Role</Label>
                <select 
                  className="w-full h-10 border rounded-md px-3 bg-transparent text-sm"
                  value={formData.role} 
                  onChange={e => setFormData({...formData, role: e.target.value as "admin" | "user"})}
                >
                  <option value="user">User</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              {formData.role !== "admin" && (
                <div className="space-y-3 pt-4 border-t">
                  <Label>Module Access (RBAC)</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {ALL_PERMISSIONS.map(perm => (
                      <div key={perm} className="flex items-center space-x-2">
                        <input 
                          type="checkbox"
                          id={`perm-${perm}`} 
                          checked={formData.permissions?.includes(perm) || false}
                          onChange={() => handlePermissionToggle(perm)}
                          className="w-4 h-4 text-emerald-600 bg-gray-100 border-gray-300 rounded focus:ring-emerald-500"
                        />
                        <Label htmlFor={`perm-${perm}`} className="text-sm font-normal uppercase">
                          {perm === "ceo_dashboard" ? "CEO Dashboard Access" : perm.replace(/_/g, " ")}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-6">
                <Button variant="outline" onClick={() => { setIsCreateOpen(false); setIsEditOpen(false) }}>Cancel</Button>
                <Button 
                  disabled={formLoading || (isCreateOpen && (!formData.email || !formData.password || !formData.name))} 
                  onClick={isCreateOpen ? submitCreate : submitEdit}
                  className="bg-emerald-600"
                >
                  {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Setup
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  )
}
