import { getCtripSession } from "../src/lib/scrapers/ctrip-session";
import { resolveCtripCityId } from "../src/lib/scrapers/ctrip-city-index";

async function main() {
  const session = await getCtripSession();
  if (!session) {
    console.log("no session");
    return;
  }
  console.log("cookies:", Object.keys(session.cookies).join(", "));
  const cityId = await resolveCtripCityId("杭州");
  const checkIn = "2026-06-26";
  const checkOut = "2026-06-27";
  const body = {
    hotelIdFilter: { hotelAldyShown: [] },
    destination: {
      type: 1,
      geo: { cityId, countryId: 1 },
      keyword: { word: "如家" },
    },
    date: {
      dateType: 1,
      dateInfo: { checkInDate: "20260626", checkOutDate: "20260627" },
    },
    filters: [],
    extraFilter: { childInfoItems: [], sessionId: "" },
    paging: { pageCode: "102002", pageIndex: 1, pageSize: 10 },
    roomQuantity: 1,
    recommend: { nearbyHotHotel: {} },
    genk: true,
    residenceCode: "CN",
    head: {
      platform: "PC",
      cid: session.cid,
      cver: "hotels",
      bu: "HBU",
      group: "ctrip",
      aid: "",
      sid: "",
      ouid: "",
      locale: "zh-CN",
      timezone: "8",
      currency: "CNY",
      pageId: "102002",
      vid: session.vid,
      guid: session.guid,
      isSSR: false,
    },
    ServerData: "",
  };

  const res = await fetch("https://m.ctrip.com/restapi/soa2/31454/json/fetchHotelList", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://hotels.ctrip.com",
      Referer: "https://hotels.ctrip.com/",
      Cookie: session.cookieHeader,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2).slice(0, 3000));
}

main();
