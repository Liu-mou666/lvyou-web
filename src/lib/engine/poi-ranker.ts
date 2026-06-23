import { authorityBonus, matchAuthorityTag } from "../data/authority-lists";
import type { BudgetLevel, POI, PriorityMode, RankedAttraction, TravelStyle } from "../types";

export type { RankedAttraction };

export interface AttractionRankContext {
  cityName: string;
  style: TravelStyle;
  priority: PriorityMode;
  budget: BudgetLevel;
  totalBudget?: number;
}

function hasPhoto(poi: POI): boolean {
  return Boolean(poi.photoUrl || (poi.photoUrls && poi.photoUrls.length > 0));
}

/** 景点综合分：高德评分 + 5A 权威 + 主题匹配 + 性价比 + 有图加权 */
export function scoreAttraction(poi: POI, ctx: AttractionRankContext): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const rating = poi.compositeRating ?? poi.rating;
  let score = rating * 18;

  const auth = matchAuthorityTag(poi.name, ctx.cityName);
  const authPts = authorityBonus(poi.name, ctx.cityName);
  if (authPts > 0) {
    score += authPts;
    reasons.push(auth ? `文旅部 ${auth.tag}` : "权威景区");
  }

  if (ctx.style === "culture" && /博物|古迹|历史|寺|陵|故居/.test(`${poi.name}${poi.description}`)) {
    score += 12;
    reasons.push("人文主题匹配");
  } else if (ctx.style === "nature" && /公园|风景|湖|山|湿地|森林/.test(`${poi.name}${poi.description}`)) {
    score += 12;
    reasons.push("自然主题匹配");
  } else if (ctx.style === "mixed" || poi.category === ctx.style) {
    score += 6;
  }

  if (poi.reviewCount >= 30000) {
    score += 8;
    reasons.push("高德高热");
  } else if (poi.reviewCount >= 10000) {
    score += 4;
  }

  if (hasPhoto(poi)) {
    score += 5;
  }

  const maxTicket = ctx.budget === "budget" ? 40 : ctx.budget === "moderate" ? 80 : 150;
  if (poi.pricePerPerson > 0 && poi.pricePerPerson <= maxTicket) {
    score += 6;
    reasons.push(`门票约 ¥${poi.pricePerPerson}/人`);
  } else if (poi.pricePerPerson === 0) {
    score += 8;
    reasons.push("免费/未知票价");
  }

  if (ctx.priority === "value" && poi.pricePerPerson > 0) {
    score += Math.max(0, 15 - poi.pricePerPerson * 0.15);
  }
  if (ctx.priority === "experience" && rating >= 4.6) {
    score += 10;
    reasons.push("高分必去");
  }

  if (ctx.totalBudget && ctx.totalBudget > 0 && poi.cost > ctx.totalBudget * 0.15) {
    score *= 0.7;
    reasons.push("占预算偏高");
  }

  reasons.push(`高德 ${poi.rating} 分`);
  return { score: Math.round(Math.min(100, score)), reasons: [...new Set(reasons)].slice(0, 5) };
}

export function rankAttractions(
  pool: POI[],
  ctx: AttractionRankContext,
  limit = 20,
): RankedAttraction[] {
  const seen = new Set<string>();
  const unique = pool.filter((p) => {
    const key = p.id || p.name.slice(0, 10);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique
    .map((poi) => {
      const { score, reasons } = scoreAttraction(poi, ctx);
      return { poi, score, reasons, rank: 0 };
    })
    .sort((a, b) => b.score - a.score || b.poi.rating - a.poi.rating)
    .slice(0, limit)
    .map((item, i) => ({ ...item, rank: i + 1 }));
}
