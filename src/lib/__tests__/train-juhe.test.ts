import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { segmentPriceForSeat } from "../data/providers/train-juhe";

describe("segmentPriceForSeat", () => {
  it("scales first class reference price", () => {
    assert.equal(segmentPriceForSeat(200, "first"), 330);
    assert.equal(segmentPriceForSeat(200, "second"), 200);
  });
});
