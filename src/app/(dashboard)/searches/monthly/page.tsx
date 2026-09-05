import SearchesMonthlyTemplate from "@/modules/searches/templates"


export const metadata = {
  title: "Monthly Search Metrics",
  description: "Review monthly search volume to discover long-term query patterns and seasonal interests. Use this data to plan your content strategy and optimize your product catalog for the most popular terms.",
}

export default function Page() {
    return <SearchesMonthlyTemplate />
}
