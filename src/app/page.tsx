import TripPlanner from "@/components/TripPlanner";
import TripPlannerV2 from "@/components/TripPlannerV2";
import { isV2UiEnabled } from "@/lib/config/feature-flags";

export default function HomePage() {
  if (isV2UiEnabled()) {
    return <TripPlannerV2 />;
  }
  return <TripPlanner />;
}
