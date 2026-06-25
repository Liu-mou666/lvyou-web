const checkIn = "2026-06-25";
const checkOut = "2026-06-26";
const cityId = 14;
const kw = "汉庭";

const body = {
  date: {
    dateType: 1,
    dateInfo: {
      checkInDate: checkIn.replace(/-/g, ""),
      checkOutDate: checkOut.replace(/-/g, ""),
    },
  },
  destination: {
    type: 1,
    geo: { cityId, countryId: 1 },
    keyword: { word: kw },
  },
  paging: { pageIndex: 1, pageSize: 10, pageCode: "10650171192" },
  head: {
    platform: "PC",
    cver: "0",
    bu: "HBU",
    group: "ctrip",
    locale: "zh-CN",
    timezone: "8",
    currency: "CNY",
    pageId: "10650171192",
    guid: "",
    isSSR: false,
    extension: [
      { name: "cityId", value: String(cityId) },
      { name: "checkIn", value: checkIn.replace(/-/g, "/") },
      { name: "checkOut", value: checkOut.replace(/-/g, "/") },
      { name: "region", value: "CN" },
    ],
  },
};

const urls = [
  "https://m.ctrip.com/restapi/soa2/34951/fetchHotelList",
  "https://m.ctrip.com/restapi/soa2/31454/json/fetchHotelList",
];

async function main() {
for (const url of urls) {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://hotels.ctrip.com",
      Referer: "https://hotels.ctrip.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  console.log("URL:", url);
  console.log("Status:", r.status, "Len:", text.length);
  console.log("Preview:", text.slice(0, 800));
  console.log("---");
}
}
main();
