import PaymentFailurePage from "@/modules/payment-failure/section/payment-failure-page"

export const metadata = {
  title: "Payment Failure Analytics | BeautyBarn",
  description: "Monitor payment failure rates to improve checkout success and recover lost revenue. Identify common error codes, payment gateway issues, and friction points in the transaction process.",
}

export default function Page() {
  return <PaymentFailurePage />
}
