import CouponsDailyTemplate from "@/modules/coupons/templates"


export const metadata = {
  title: "Daily Coupon Metrics",
  description: "Monitor daily coupon usage and its immediate impact on sales volume and average order value. Adjust your promotional strategies on the fly based on real-time discount redemption rates.",
}

export default function Page() {
    return <CouponsDailyTemplate />
}
