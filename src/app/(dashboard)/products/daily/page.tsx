import ProductsDailyTemplate from "@/modules/products/templates"


export const metadata = {
  title: "Daily Product Metrics",
  description: "Track daily product performance and sales velocity to identify fast-moving inventory. Make informed restocking decisions and capitalize on sudden spikes in product popularity.",
}

export default function Page() {
    return <ProductsDailyTemplate />
}
