import SignupCohortsPage from "@/modules/signup-cohorts/section/signup-cohorts-page"

export const metadata = {
  title: "Signup Cohorts",
  description: "Customer cohorts by registration month with retention heatmap",
}

export default function Page() {
  return <SignupCohortsPage />
}
