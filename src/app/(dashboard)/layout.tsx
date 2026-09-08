// import { ReactNode } from "react"
// import Sidebar from "@/components/layout/Sidebar"
// import Header from "@/components/layout/Header"

// export default function DashboardLayout({ children }: { children: ReactNode }) {
//   return (
//     <div className="flex h-screen bg-gray-50">
//       {/* Sidebar */}
//       <Sidebar />

//       {/* Main */}
//       <div className="flex flex-1 flex-col">
//         <Header />

//         <main className="flex-1 overflow-y-auto p-6">
//           {children}
//         </main>
//       </div>
//     </div>
//   )
// }



import Header from "@/components/layout/Header"
import { AppSidebar } from "@/components/layout/Sidebar"
import { MobileNotice } from "@/components/layout/MobileNotice"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AuthProvider } from "@/contexts/AuthContext"

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      {/* Mobile-only full-screen notice (md:hidden — no effect on desktop) */}
      <MobileNotice />
      <SidebarProvider>
        <AppSidebar />
        <main className="relative flex min-h-screen flex-1 flex-col min-w-0 overflow-x-hidden">
          <header className="flex h-16 items-center border-b px-4 gap-4">
            <SidebarTrigger />
            <Header />
          </header>
          <div className="flex-1 p-4 md:p-6 min-w-0 w-full overflow-x-hidden relative" id="exportable-area">
            {children}
          </div>
          <footer className="border-t border-border bg-background px-6 py-4">
            <div className="flex items-center justify-center text-sm text-muted-foreground">
              <span>© {new Date().getFullYear()}</span>
              <span className="mx-1.5">-</span>
              <span className="font-semibold text-foreground">BeautyBarn Analytics</span>
              <span className="mx-2 text-yellow-500">⚡</span>
              <span>by</span>
              <a href="https://superlabs.co" target="_blank" rel="noopener noreferrer" className="ml-1 font-semibold text-blue-600 hover:text-blue-700 hover:underline transition-colors">
                SuperLabs
              </a>
            </div>
          </footer>
        </main>
      </SidebarProvider>
    </AuthProvider>
  )
}
