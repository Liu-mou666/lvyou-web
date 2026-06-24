import type { POI, WeatherForecast } from "../types";
import { timeToMinutes } from "../realtime-engine";

/** 简易人流模型：节假日 + 时段 + 评分热度 + 室内豁免 */
export function estimateCrowdLevel(
  poi: POI,
  date: string,
  timeStr: string,
  avoidCrowd: boolean,
): { level: number; waitMinutes: number; reason: string } {
  const hour = Math.floor(timeToMinutes(timeStr) / 60);
  let level = 2;
  const reasons: string[] = [];

  const popularity = poi.reviewCountEstimated
    ? Math.min(5, poi.rating * 1.1)
    : Math.min(5, Math.log10(Math.max(poi.reviewCount, 100)) * 1.2);

  if (poi.rating >= 4.7) {
    level += 1;
    reasons.push("高评分热门");
  }
  if (popularity >= 4) level += 0.5;

  // 高峰时段
  if (hour >= 10 && hour <= 14) {
    level += 1;
    reasons.push("午间高峰");
  }
  if (hour >= 17 && hour <= 20) {
    level += 1;
    reasons.push("傍晚高峰");
  }

  // 周末
  const dow = new Date(date).getDay();
  if (dow === 0 || dow === 6) {
    level += 0.8;
    reasons.push("周末");
  }

  if (poi.indoor) level -= 0.3;

  level = Math.max(1, Math.min(5, Math.round(level)));
  const waitMinutes = Math.round((level - 1) * 12 + (avoidCrowd ? level * 5 : 0));
  const reason = reasons.length > 0 ? reasons.join("、") : "常规客流";

  return { level, waitMinutes, reason };
}

export function crowdPenalty(
  poi: POI,
  date: string,
  timeStr: string,
  avoidCrowd: boolean,
): number {
  if (!avoidCrowd) return 0;
  const { level } = estimateCrowdLevel(poi, date, timeStr, avoidCrowd);
  return (level - 2) * 18;
}
