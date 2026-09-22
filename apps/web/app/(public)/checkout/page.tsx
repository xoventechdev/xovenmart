// Force dynamic rendering so Next 15 doesn't pre-render this client-only
// page during `next build` (no API available at build time, the
// useDeliveryPublic/useGeneralSettings hooks would hang for 60s).
export const dynamic = "force-dynamic";

import { CheckoutView } from "./checkout-view";

export const metadata = {
  title: "Checkout — XovenMart",
};

export default function CheckoutPage() {
  return <CheckoutView />;
}
