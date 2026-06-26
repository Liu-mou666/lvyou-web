import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { poiToPriceTruth, trainToPriceTruth, formatPriceTruth } from "../price-truth";
import type { POI, TrainRoute } from "../types";

describe("price-truth", () => {
  it("formats per-person price", () => {
    assert.equal(
      formatPriceTruth({
        amount: 120,
        unit: "per_person",
        source: "amap",
        confidence: "high",
        label: "test",
      }),
      "¥120/人",
    );
  });

  it("infers amap from poi note", () => {
    const poi = {
      id: "x",
      name: "故宫",
      type: "attraction",
      pricePerPerson: 60,
      priceNote: "高德收录 ¥60/人",
      priceConfidence: "high",
    } as POI;
    const truth = poiToPriceTruth(poi);
    assert.equal(truth.source, "amap");
    assert.equal(truth.amount, 60);
  });

  it("maps verified train to juhe", () => {
    const route = {
      id: "t1",
      type: "direct",
      title: "G123",
      legs: [],
      totalHours: 5,
      totalPrice: 553,
      transferMinutes: 0,
      description: "",
      score: 90,
      recommended: true,
      bookingUrl: "https://example.com",
      links: [],
      verified: true,
      dataSource: "12306",
    } as TrainRoute;
    const truth = trainToPriceTruth(route);
    assert.equal(truth.source, "juhe");
    assert.equal(truth.confidence, "high");
  });
});
