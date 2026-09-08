import { Monitor } from "lucide-react"

/**
 * MobileNotice
 *
 * Full-screen overlay shown ONLY on small screens (phones / narrow tablets,
 * < 768px). It is rendered with Tailwind's `md:hidden`, so on desktop/laptop
 * (>= 768px) it is `display:none` and has zero effect on the layout — the
 * desktop dashboard is completely untouched.
 *
 * Because it is plain server-rendered markup gated purely by a CSS media
 * query, it paints immediately on load (no JS flash) and covers the
 * non-responsive dashboard so mobile users are guided to a desktop instead.
 */
export function MobileNotice() {
  return (
    <div className="md:hidden fixed inset-0 z-[99999] flex flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Monitor className="h-10 w-10" />
      </div>

      <h1 className="text-xl font-bold text-foreground">
        Best viewed on Desktop
      </h1>

      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        This dashboard is designed for Desktop/Laptop viewing. Open this link on
        a Desktop or Laptop to access the complete dashboard and all features.
      </p>

      <div className="mt-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        📈&nbsp; BeautyBarn Analytics
      </div>
    </div>
  )
}
