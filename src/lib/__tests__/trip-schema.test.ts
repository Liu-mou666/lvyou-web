import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTripRequest, tripRequestSchema } from "../validation/trip-schema";

describe("tripRequestSchema", () => {
  it("accepts up to 14 days", () => {
    const parsed = tripRequestSchema.safeParse({
      city: "杭州",
      days: 14,
      style: "mixed",
      pace: "normal",
      budget: "moderate",
      startDate: "2026-07-01",
      travelers: 2,
    });
    assert.equal(parsed.success, true);
  });

  it("rejects 15 days", () => {
    const parsed = tripRequestSchema.safeParse({
      city: "杭州",
      days: 15,
      style: "mixed",
      pace: "normal",
      budget: "moderate",
      startDate: "2026-07-01",
      travelers: 2,
    });
    assert.equal(parsed.success, false);
  });

  it("defaults seatPref and dietary", () => {
    const req = buildTripRequest({
      city: "苏州",
      days: 2,
      style: "mixed",
      pace: "normal",
      budget: "budget",
      startDate: "2026-06-01",
      travelers: 2,
    });
    assert.equal(req.seatPref, "second");
    assert.equal(req.maxHotelPerNight, 0);
  });
});
