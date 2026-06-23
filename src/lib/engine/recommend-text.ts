import type { POI, RealtimeMetrics } from "../types";

/** 格式化餐饮/景点推荐理由 */
export function buildPoiRecommendNote(
  poi: POI,
  rt: RealtimeMetrics,
  role: "visit" | "meal" | "hotel",
  rankAmong?: number,
  totalCandidates?: number,
): string {
  const parts: string[] = [];

  if (role === "meal") {
    parts.push("推荐用餐");
    if (rankAmong === 1 && totalCandidates && totalCandidates > 1) {
      parts.push(`周边 ${totalCandidates} 家中综合分最高`);
    }
    if (poi.reviewCount >= 500) {
      parts.push(`高德收录 ${formatCount(poi.reviewCount)} 条评价`);
    }
    if (poi.pricePerPerson > 0) {
      parts.push(`高德人均约 ¥${poi.pricePerPerson}（以点评/美团当日为准）`);
    }
  } else if (role === "hotel") {
    parts.push("推荐住宿");
    parts.push(`${poi.rating} 分`);
    if (poi.pricePerPerson > 0) {
      parts.push(`高德参考 ¥${poi.pricePerPerson}/晚（携程查当日实价）`);
    }
  } else {
    parts.push(`综合 ${rt.score} 分`);
    if (poi.authorityTag) parts.push(`文旅部 ${poi.authorityTag}`);
    if (poi.reviewCount >= 1000) parts.push(`评价热度 ${formatCount(poi.reviewCount)}`);
  }

  if (rt.valueRank === "high") parts.push("性价比优");
  if (rt.scoreReasons.length) {
    for (const r of rt.scoreReasons.slice(0, 3)) {
      if (!parts.some((p) => p.includes(r))) parts.push(r);
    }
  }

  return parts.filter(Boolean).join(" · ");
}

export function buildAlternativeNote(poi: POI, rt: RealtimeMetrics): string {
  const bits = [`${poi.rating} 分`, `综合 ${rt.score}`];
  if (poi.pricePerPerson > 0) bits.push(`约 ¥${poi.pricePerPerson}/人`);
  if (poi.reviewCount >= 200) bits.push(`${formatCount(poi.reviewCount)} 评`);
  return bits.join(" · ");
}

function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function buildTrainRecommendReason(
  route: { totalPrice: number; totalHours: number; type: string; transferCity?: string },
  ctx: { priority: string; totalBudget: number; verifiedCount: number },
): string {
  const parts: string[] = [];
  if (ctx.verifiedCount > 1) {
    parts.push(`在 ${ctx.verifiedCount} 条已验证有票方案中`);
  }
  if (ctx.priority === "value" || ctx.totalBudget > 0) {
    parts.push("票价最低");
  } else if (ctx.priority === "time") {
    parts.push("耗时最短");
  } else {
    parts.push("综合评分最高");
  }
  if (route.type === "transfer" && route.transferCity) {
    parts.push(`经 ${route.transferCity} 中转`);
  }
  parts.push(`全程约 ${route.totalHours}h · 二等座 ¥${route.totalPrice}（2人合计·API 实时）`);
  return parts.join("，");
}
