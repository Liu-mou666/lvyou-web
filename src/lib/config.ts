/** 高德 Web 服务 Key，在 .env.local 中配置 AMAP_KEY=你的key */
export function getAmapKey(): string {
  const key = process.env.AMAP_KEY;
  if (!key) {
    throw new Error(
      "未配置高德 API Key。请在项目根目录创建 .env.local，添加 AMAP_KEY=你的高德Web服务Key",
    );
  }
  return key;
}

export const CITY_ADCODES: Record<string, string> = {
  北京: "110000",
  上海: "310000",
  杭州: "330100",
  成都: "510100",
  西安: "610100",
  广州: "440100",
  深圳: "440300",
  南京: "320100",
  苏州: "320500",
  重庆: "500000",
  厦门: "350200",
  青岛: "370200",
  大理: "532900",
  丽江: "530700",
  三亚: "460200",
  武汉: "420100",
  长沙: "430100",
  张家界: "430800",
  桂林: "450300",
  昆明: "530100",
  贵阳: "520100",
  哈尔滨: "230100",
  大连: "210200",
  天津: "120000",
  宁波: "330200",
  无锡: "320200",
  福州: "350100",
  合肥: "340100",
  南昌: "360100",
  郑州: "410100",
  济南: "370100",
  太原: "140100",
  兰州: "620100",
  乌鲁木齐: "650100",
  拉萨: "540100",
  海口: "460100",
  珠海: "440400",
  泉州: "350500",
  温州: "330300",
  绍兴: "330600",
  黄山: "341000",
  九寨沟: "513200",
};

/** 热门城市快速联想（全国任意地名均可经高德 geocode 解析，不限此列表） */
export const SUPPORTED_CITIES = Object.keys(CITY_ADCODES);

/** Vercel 等无状态环境：跳过携程索引爬取与重型变体重算 */
export function isServerlessFastPath(): boolean {
  return process.env.VERCEL === "1" || process.env.PREFER_FAST_PATH === "1";
}

