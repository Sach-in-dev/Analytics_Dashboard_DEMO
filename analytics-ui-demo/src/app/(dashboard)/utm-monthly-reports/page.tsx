import OrderMetricsPage from "@/modules/order-metrics/section/OrderMetricsPage"
import UtmTemplate from "@/modules/utm/templates"


export const metadata = {
  title: "UTM Monthly Reports",
  description: "Get monthly insights into your UTM campaign performance to evaluate long-term marketing strategies. Track the sustained impact of your campaigns and refine your attribution models for future planning.",
}

export default function Page() {
  return <UtmTemplate />
}
