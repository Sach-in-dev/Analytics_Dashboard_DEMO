import UtmDailyTemplate from "@/modules/active-users/templates"


export const metadata = {
  title: "Daily Active Users",
  description: "Monitor your daily active users to understand short-term engagement and platform adoption. Keep track of daily fluctuations to identify immediate trends and the impact of recent feature releases.",
}

export default function Page() {
    return <UtmDailyTemplate />
}
