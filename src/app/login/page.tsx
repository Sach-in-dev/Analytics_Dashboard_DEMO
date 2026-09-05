// "use client"

// import { useState } from "react"
// import Image from "next/image"
// import Link from "next/link"
// import { EyeIcon, EyeOffIcon } from "lucide-react"
// import { useRouter } from "next/navigation"

// import { Card, CardContent, CardHeader } from "@/components/ui/card"
// import { Button } from "@/components/ui/button"
// import { Label } from "components/ui/label"
// import { Input } from "components/ui/input"
// import { Checkbox } from "components/ui/checkbox"

// export default function AuthPage() {
//   const router = useRouter()

//   const [isRegister, setIsRegister] = useState(false)
//   const [showPassword, setShowPassword] = useState(false)

//   const [form, setForm] = useState({
//     firstName: "",
//     lastName: "",
//     phone: "",
//     email: "",
//     password: "",
//   })

//   const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     setForm({ ...form, [e.target.name]: e.target.value })
//   }

//   const isLoginValid = Boolean(form.email && form.password)
//   const isRegisterValid = Boolean(
//     form.firstName && form.lastName && form.email && form.password
//   )

//   const handleSubmit = (e: React.FormEvent) => {
//     e.preventDefault()

//     if (!isRegister && !isLoginValid) return
//     if (isRegister && !isRegisterValid) return

//     // ✅ Navigate to dashboard
//     router.push("/order-metrics")
//   }

//   return (
//     <div className="flex min-h-screen items-center justify-center bg-black/40 p-4">
//       <Card className="relative w-full max-w-[440px] rounded-2xl bg-white shadow-2xl">
//         {/* Header */}
//         <CardHeader className="flex flex-col items-center gap-2 pt-8 pb-4">
//           <h2 className="text-xl font-semibold text-gray-900">
//             {isRegister ? "Sign Up" : "Login"}
//           </h2>

//           {!isRegister && (
//             <p className="text-center text-sm text-gray-500 max-w-xs">
//               Enter your details to continue.
//             </p>
//           )}
//         </CardHeader>

//         <CardContent className="space-y-5 px-6 pb-6">
//           {/* Social Login */}
//           <div className="flex justify-center gap-8">
//             <Image
//               src="https://www.svgrepo.com/show/475656/google-color.svg"
//               alt="Google"
//               width={36}
//               height={36}
//             />
//             <Image
//               src="/facebook.png"
//               alt="Facebook"
//               width={36}
//               height={36}
//             />
//           </div>

//           {/* Divider */}
//           <div className="flex items-center gap-3 text-xs text-gray-400">
//             <div className="flex-1 border-t" />
//             Or Continue With
//             <div className="flex-1 border-t" />
//           </div>

//           {/* FORM */}
//           <form onSubmit={handleSubmit} className="space-y-4">
//             {/* Register Fields */}
//             {isRegister && (
//               <>
//                 <div className="grid grid-cols-2 gap-3">
//                   <div>
//                     <Label className="text-gray-700">First Name *</Label>
//                     <Input
//                       name="firstName"
//                       placeholder="First Name"
//                       onChange={handleChange}
//                       className="h-11"
//                     />
//                   </div>
//                   <div>
//                     <Label className="text-gray-700">Last Name *</Label>
//                     <Input
//                       name="lastName"
//                       placeholder="Last Name"
//                       onChange={handleChange}
//                       className="h-11"
//                     />
//                   </div>
//                 </div>

//                 <div>
//                   <Label className="text-gray-700">Phone</Label>
//                   <Input
//                     name="phone"
//                     placeholder="Phone"
//                     onChange={handleChange}
//                     className="h-11"
//                   />
//                 </div>
//               </>
//             )}

//             {/* Email */}
//             <div>
//               <Label className="text-foreground">Email *</Label>
//               <Input
//                 name="email"
//                 placeholder="Email"
//                 onChange={handleChange}
//                 className="h-11"
//               />
//             </div>

//             {/* Password */}
//             <div className="relative">
//               <Label className="text-foreground">Password *</Label>
//               <Input
//                 type={showPassword ? "text" : "password"}
//                 name="password"
//                 placeholder="Password"
//                 onChange={handleChange}
//                 className="h-11 pr-10"
//               />
//               <button
//                 type="button"
//                 onClick={() => setShowPassword(!showPassword)}
//                 className="absolute right-3 top-9 text-muted-foreground hover:text-foreground"
//               >
//                 {showPassword ? (
//                   <EyeOffIcon size={18} />
//                 ) : (
//                   <EyeIcon size={18} />
//                 )}
//               </button>
//             </div>

//             {/* Remember Me (Login only) */}
//             {!isRegister && (
//               <div className="flex items-center gap-2">
//                 <Checkbox />
//                 <span className="text-sm text-muted-foreground">Remember me</span>
//               </div>
//             )}

//             {/* Submit Button */}
//             <Button
//               type="submit"
//               disabled={isRegister ? !isRegisterValid : !isLoginValid}
//               className="
//                 h-12 w-full rounded-full
//                 bg-[#962E3C] text-white
//                 hover:bg-[#7f2632]
//                 disabled:bg-gray-200
//                 disabled:text-[#962E3C]
//                 disabled:opacity-100
//               "
//             >
//               {isRegister ? "Sign Up" : "Sign In"}
//             </Button>
//           </form>

//           {/* Footer Toggle */}
//           <div className="text-center text-sm">
//             {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
//             <button
//               type="button"
//               onClick={() => setIsRegister(!isRegister)}
//               className="font-bold text-[#7D1F35] hover:underline"
//             >
//               {isRegister ? "Sign In" : "Register"}
//             </button>
//           </div>

//           {/* Terms */}
//           <p className="px-8 text-center text-[10px] leading-relaxed text-slate-400">
//             By continuing, you agree to Beauty Barn&apos;s{" "}
//             <Link
//               href="#"
//               className="text-[#7D1F35] underline underline-offset-2"
//             >
//               Terms of Use
//             </Link>{" "}
//             and{" "}
//             <Link
//               href="#"
//               className="text-[#7D1F35] underline underline-offset-2"
//             >
//               Privacy Policy
//             </Link>
//             .
//           </p>
//         </CardContent>
//       </Card>
//     </div>
//   )
// }
"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { EyeIcon, EyeOffIcon, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "components/ui/label"
import { Input } from "components/ui/input"
import { Checkbox } from "components/ui/checkbox"
import { api } from "@/lib/axios"
import { ThemeToggle } from "@/components/theme-toggle"

export default function AuthPage() {
  const router = useRouter()

  // 🔒 UI state stays (design requirement)
  const [isRegister, setIsRegister] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // ✅ Only login data is used
  const [form, setForm] = useState({
    email: "",
    password: "",
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const isLoginValid = Boolean(form.email && form.password)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLoginValid) return

    try {
      setLoading(true)
      setError(null)

      const res = await api.post("/auth/login", {
        email: form.email,
        password: form.password,
      })

      if (res.data?.data?.token) {
        localStorage.setItem("token", res.data.data.token)
      }

      const user = res.data?.data?.user
      if (user?.role === "admin" || user?.permissions?.includes("ceo_dashboard")) {
        router.push("/dashboard")
      } else {
        router.push("/order-metrics")
      }
    } catch (err: any) {
      setError(
        err?.response?.data?.message || "Invalid email or password"
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">

      {/* ── Theme toggle — top-right corner ── */}
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      <Card className="relative w-full max-w-[440px] rounded-2xl bg-card shadow-2xl border border-border">
        {/* Header */}
        <CardHeader className="flex flex-col items-center gap-2 pt-8 pb-4">
          <h2 className="text-xl font-semibold text-foreground">
            Login
          </h2>
          <p className="text-center text-sm text-muted-foreground max-w-xs">
            Enter your details to continue.
          </p>
        </CardHeader>

        <CardContent className="space-y-5 px-6 pb-6">
          {/* Social Login (UI only) */}
          {/* <div className="flex justify-center gap-8">
            <Image
              src="https://www.svgrepo.com/show/475656/google-color.svg"
              alt="Google"
              width={36}
              height={36}
            />
            <Image
              src="/facebook.png"
              alt="Facebook"
              width={36}
              height={36}
            />
          </div>

          Divider
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <div className="flex-1 border-t" />
            Or Continue With
            <div className="flex-1 border-t" />
          </div> */}

          {/* FORM */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <Label className="text-foreground">Email *</Label>
              <Input
                name="email"
                placeholder="Email"
                onChange={handleChange}
                className="h-11"
              />
            </div>

            {/* Password */}
            <div className="relative">
              <Label className="text-foreground">Password *</Label>
              <Input
                type={showPassword ? "text" : "password"}
                name="password"
                placeholder="Password"
                onChange={handleChange}
                className="h-11 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-9 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOffIcon size={18} />
                ) : (
                  <EyeIcon size={18} />
                )}
              </button>
            </div>

            {/* Remember Me */}
            <div className="flex items-center gap-2">
              <Checkbox />
              <span className="text-sm text-muted-foreground">Remember me</span>
            </div>

            {/* API Error */}
            {error && (
              <p className="text-sm text-red-600 text-center">
                {error}
              </p>
            )}

            {/* Submit */}
            <Button
              type="submit"
              disabled={!isLoginValid || loading}
              className="
                h-12 w-full rounded-full
                bg-[#962E3C] text-white
                hover:bg-[#7f2632]
                disabled:bg-gray-200
                disabled:text-[#962E3C]
                disabled:opacity-100
              "
            >
              {loading ? (
                <Loader2 className="animate-spin" />
              ) : (
                "Sign In"
              )}
            </Button>
          </form>


          {/* Terms */}
          <p className="px-8 text-center text-[10px] leading-relaxed text-slate-400">
            By continuing, you agree to Beauty Barn&apos;s{" "}
            <Link
              href="#"
              className="text-[#7D1F35] underline underline-offset-2"
            >
              Terms of Use
            </Link>{" "}
            and{" "}
            <Link
              href="#"
              className="text-[#7D1F35] underline underline-offset-2"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
