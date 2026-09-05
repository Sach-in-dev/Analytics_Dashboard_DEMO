import { EventStats } from "@/modules/even-stats/even-stats"
import EventsPage from "@/modules/events/section/events"


export const metadata = {
  title: "Event Stats",
  description: "Review event statistics and user interactions across your platform to understand engagement levels. Analyze key actions to optimize the user journey and drive higher conversion rates.",
}

export default function Page() {
  return <EventStats startAt={0} endAt={0} />
}
