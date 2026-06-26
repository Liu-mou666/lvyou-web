import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ctripTicketSearchUrl,
  getCtripCityId,
  meituanSearchUrl,
} from "../data/platform-urls";

describe("platform-urls OTA deep links", () => {
  it("meituan avoids mob.meituan.com and uses i.meituan.com", () => {
    const url = meituanSearchUrl("苏州", "藕纪 藕粉圆", 6);
    assert.match(url, /^https:\/\/i\.meituan\.com\/poi\/search\?/);
    assert.doesNotMatch(url, /mob\.meituan\.com/);
    assert.match(url, /ci=6/);
    assert.match(url, /%E8%97%95%E7%BA%AA/);
  });

  it("ctrip ticket uses piao dest slug instead of huodong list", () => {
    const url = ctripTicketSearchUrl("苏州", "藕纪 藕粉圆", getCtripCityId("320500"));
    assert.match(url, /^https:\/\/piao\.ctrip\.com\/ticket\/dest\/t-/);
    assert.doesNotMatch(url, /huodong\.ctrip\.com/);
    assert.doesNotMatch(url, /\/ticket\/list/);
  });

  it("ctrip ticket works without cityId", () => {
    const url = ctripTicketSearchUrl("苏州", "拙政园", null);
    assert.equal(
      url,
      "https://piao.ctrip.com/ticket/dest/t-%E8%8B%8F%E5%B7%9E-%E8%8B%8F%E5%B7%9E%20%E6%8B%99%E6%94%BF%E5%9B%AD.html",
    );
  });
});
