export type OtaPlatform = "ctrip" | "fliggy" | "amap" | "meituan";

/** scraped=真爬/API；reference=公开价库/市场参考，不得标成爬取 */
export type OtaPriceKind = "scraped" | "reference";

export interface OtaScrapeResult {
  price: number;
  platform: OtaPlatform;
  /** 展示用来源说明 */
  source: string;
  scrapedAt: string;
  url: string;
  confidence: "high" | "medium";
  /** 页面上匹配到的标题 */
  matchedTitle?: string;
  priceKind: OtaPriceKind;
}

export interface OtaScrapeContext {
  cityName: string;
  adcode?: string;
  checkIn?: string;
  checkOut?: string;
  travelers?: number;
}
