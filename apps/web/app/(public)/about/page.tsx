import { AboutView } from "./about-view";


// Force dynamic rendering so Next 15 doesn't pre-render this page
// during `next build`. The underlying view uses client hooks
// (useDeliveryPublic / useGeneralSettings) that fetch from the api
// at localhost:3001 — there's no api at build time, so each hook
// blocks until the 60s connect timeout and Next aborts the export.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: "About — XovenMart",
};

export default function AboutPage() {
  return <AboutView />;
}
