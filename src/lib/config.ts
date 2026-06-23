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

export const SUPPORTED_CITIES = [
  "北京", "上海", "杭州", "成都", "西安", "广州", "深圳", "南京", "苏州", "重庆",
  "厦门", "青岛", "大理", "丽江", "三亚",
] as const;

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
};
