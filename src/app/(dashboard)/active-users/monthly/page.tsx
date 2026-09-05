import UtmMonthlyTemplate from "@/modules/active-users/templates"


export const metadata = {
  title: "Monthly Active Users",
  description: "Analyze your monthly active users to gauge long-term retention and overall platform growth. Uncover macro-level usage patterns and seasonal trends that drive your core business metrics.",
}

export default function Page() {
    return <UtmMonthlyTemplate />
}
