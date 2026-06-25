import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  matchesDietary,
  parsePlanningConstraints,
  poiMatchesName,
} from "../engine/constraint-parser";
import type { TripRequest } from "../types";

function baseRequest(overrides: Partial<TripRequest> = {}): TripRequest {
  return {
    city: "苏州",
    days: 3,
    style: "mixed",
    pace: "normal",
    budget: "moderate",
    startDate: "2026-06-27",
    ...overrides,
  };
}

describe("parsePlanningConstraints", () => {
  it("merges form dietary with notes", () => {
    const c = parsePlanningConstraints(
      baseRequest({ dietary: ["清真"], notes: "不吃辣" }),
    );
    assert.ok(c.dietary.includes("清真"));
    assert.ok(c.dietary.includes("不辣"));
  });

  it("detects must visit from notes", () => {
    const c = parsePlanningConstraints(
      baseRequest({ notes: "必去：拙政园、虎丘" }),
    );
    assert.ok(c.mustVisit.some((n) => n.includes("拙政园")));
  });
});

describe("matchesDietary", () => {
  const poi = (name: string, extra = "") => ({
    id: "1",
    name,
    type: "restaurant" as const,
    category: "food" as const,
    lat: 0,
    lng: 0,
    durationMinutes: 60,
    cost: 0,
    pricePerPerson: 50,
    rating: 4.5,
    reviewCount: 100,
    openTime: "09:00",
    closeTime: "21:00",
    indoor: true,
    description: extra,
    tips: "",
    signature: extra,
  });

  it("filters spicy for 不辣", () => {
    assert.equal(matchesDietary(poi("川味麻辣火锅"), ["不辣"]), false);
    assert.equal(matchesDietary(poi("苏帮菜馆"), ["不辣"]), true);
  });

  it("prefers halal hints", () => {
    assert.equal(matchesDietary(poi("清真牛肉面"), ["清真"]), true);
    assert.equal(matchesDietary(poi("川湘杀猪菜"), ["清真"]), false);
  });
});

describe("poiMatchesName", () => {
  it("matches partial scenic names", () => {
    assert.equal(poiMatchesName("拙政园", "拙政园景区"), true);
  });
});
