export type TravelStyle = "culture" | "food" | "nature" | "shopping" | "mixed";
export type TravelPace = "relaxed" | "normal" | "intense";
export type BudgetLevel = "budget" | "moderate" | "luxury";
export type POIType = "attraction" | "restaurant" | "cafe" | "shopping" | "hotel";
export type MealTime = "breakfast" | "lunch" | "dinner" | "snack" | "any";
export type TransportMode = "walk" | "bike" | "subway" | "bus" | "taxi";
export type PriorityMode = "value" | "time" | "experience";
export type TransportPref = "transit" | "taxi" | "walk" | "mixed";
export type MealPref = "local" | "fast" | "any";

export interface TripRequest {
  city: string;
  departureCity?: string;
  days: number;
  style: TravelStyle;
  pace: TravelPace;
  budget: BudgetLevel;
  startDate: string;
  travelers?: number;
  priority?: PriorityMode;
  transportPref?: TransportPref;
  mealPref?: MealPref;
  avoidCrowd?: boolean;
  maxMealBudget?: number;
  /** 全程总预算（含去程交通+住宿+餐饮景点，0=不限） */
  totalBudget?: number;
  notes?: string;
}

export interface Location {
  lat: number;
  lng: number;
}

export interface PlatformLink {
  platform: "amap" | "dianping" | "meituan" | "ctrip" | "fliggy" | "xiecheng";
  label: string;
  url: string;
  action: string;
}

export interface EvidenceSource {
  name: string;
  value: string;
  fetchedAt: string;
  url?: string;
}

export interface Evidence {
  claim: string;
  sources: EvidenceSource[];
  confidence: "high" | "medium" | "low";
  alternatives?: string[];
}

export interface DealInfo {
  platform: string;
  originalPrice?: number;
  dealPrice: number;
  discount?: string;
  label: string;
  url: string;
}

export interface POI extends Location {
  id: string;
  name: string;
  type: POIType;
  category: TravelStyle;
  durationMinutes: number;
  cost: number;
  pricePerPerson: number;
  rating: number;
  reviewCount: number;
  openTime: string;
  closeTime: string;
  indoor: boolean;
  description: string;
  tips: string;
  mealTime?: MealTime;
  signature?: string;
  address?: string;
  source?: string;
  photoUrl?: string;
  /** 高德实拍图（最多4张） */
  photoUrls?: string[];
  tel?: string;
  valueScore?: number;
  links?: PlatformLink[];
  deals?: DealInfo[];
  authorityTag?: string;
  compositeRating?: number;
  priceNote?: string;
  evidence?: Evidence[];
  /** 高德无票价且名称暗示免费开放 */
  freeAttraction?: boolean;
}

export interface WeatherForecast {
  date: string;
  condition: "sunny" | "cloudy" | "rainy" | "snowy";
  tempHigh: number;
  tempLow: number;
  rainProbability: number;
}

export interface RealtimeMetrics {
  crowdLevel?: number;
  waitMinutes?: number;
  popularity: number;
  isOpen: boolean;
  score: number;
  scoreReasons: string[];
  dataTimestamp: string;
  dataSources: string[];
  valueRank?: "high" | "medium" | "low";
  crowdAvailable?: boolean;
}

export interface TransportLeg {
  mode: TransportMode;
  from: string;
  to: string;
  distanceKm: number;
  durationMinutes: number;
  cost: number;
  reason: string;
  navUrl?: string;
}

export interface TrainLeg {
  from: string;
  to: string;
  durationHours: number;
  price: number;
  /** 本段独立查票链接（中转方案每段可点） */
  bookingLinks?: PlatformLink[];
}

export interface TrainRoute {
  id: string;
  type: "direct" | "transfer";
  title: string;
  transferCity?: string;
  legs: TrainLeg[];
  totalHours: number;
  totalPrice: number;
  transferMinutes: number;
  departTime?: string;
  arriveTime?: string;
  description: string;
  score: number;
  recommended: boolean;
  bookingUrl: string;
  links: PlatformLink[];
  evidence?: Evidence[];
  trainNumbers?: string[];
  dataSource?: string;
  /** 是否经 12306 数据源验证当日有列次 */
  verified?: boolean;
  verifiedAt?: string;
  /** 为何推荐此方案 */
  recommendReason?: string;
  priceNote?: string;
}

export interface TravelTicketOption {
  type: "train" | "flight" | "bus";
  title: string;
  description: string;
  estimatedHours: string;
  estimatedPrice?: number;
  score?: number;
  recommended?: boolean;
  links: PlatformLink[];
}

export interface TimelineItem {
  kind: "transport" | "visit" | "meal";
  startTime: string;
  endTime: string;
  transport?: TransportLeg;
  poi?: POI;
  realtime?: RealtimeMetrics;
  note?: string;
  alternatives?: POI[];
  evidence?: Evidence[];
}

export interface DayPlan {
  day: number;
  date: string;
  weather: WeatherForecast;
  items: TimelineItem[];
  /** 当晚住宿（距当日最后一站最近） */
  hotel?: POI;
  hotelAlternatives?: POI[];
  totalCost: number;
  totalDistance: number;
  summary: string;
}

export interface RankedAttraction {
  rank: number;
  poi: POI;
  score: number;
  reasons: string[];
}

export interface Itinerary {
  city: string;
  cityInfo?: { name: string; province: string; adcode: string; formattedAddress: string };
  /** 火车方案（含直达+多条中转） */
  trainRoutes?: TrainRoute[];
  flightOption?: TrainRoute;
  busOption?: TrainRoute;
  recommendedTransport?: string;
  routeDistanceKm?: number;
  days: DayPlan[];
  totalCost: number;
  generatedAt: string;
  optimizationScore: number;
  realtimeNote: string;
  dataSources: string[];
  transportEvidence?: Evidence[];
  totalBudget?: number;
  budgetBreakdown?: BudgetBreakdown;
  /** 目的地大数据筛选必去榜 */
  topAttractions?: RankedAttraction[];
}

export interface BudgetBreakdown {
  limit: number;
  travel: number;
  lodging: number;
  meals: number;
  attractions: number;
  localTransport: number;
  total: number;
  status: "within" | "tight" | "over" | "unset";
  savingsTips: string[];
}

export interface RealtimeContext {
  city: string;
  date: string;
  currentTime: string;
  weather: WeatherForecast;
  budget: BudgetLevel;
  style: TravelStyle;
  travelers: number;
  priority: PriorityMode;
  avoidCrowd: boolean;
  maxMealBudget: number;
  totalBudget: number;
  days: number;
}
