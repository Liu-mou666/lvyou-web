import { resolveCtripCityId } from "../src/lib/scrapers/ctrip-city-index";
import { fetchCtripHotelsInBrowser } from "../src/lib/scrapers/ctrip-browser-fetch";

async function main() {
  const cityId = await resolveCtripCityId("杭州");
  console.log("cityId", cityId);
  const checkIn = "2026-06-26";
  const checkOut = "2026-06-27";
  const hits = await fetchCtripHotelsInBrowser(cityId!, "如家", checkIn, checkOut);
  console.log("hits", hits.length, hits.slice(0, 3));
}

main();
