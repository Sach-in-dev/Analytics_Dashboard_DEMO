import ProductsMonthlyTemplate from "@/modules/products/templates"


export const metadata = {
  title: "Monthly Product Metrics",
  description: "Analyze monthly product trends and revenue contributions to guide your long-term inventory planning. Identify seasonal bestsellers and underperforming items to optimize your product mix.",
}

export default function Page() {
    return <ProductsMonthlyTemplate />
}
