/**
 * 旅优 2.0 冒烟 E2E（需 dev 服务运行: npm run dev）
 * 运行: npx playwright test tests/e2e/smoke.spec.ts
 */
import { test, expect } from "@playwright/test";

test.describe("旅优 2.0 首页", () => {
  test("显示三屏向导标题", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("旅优 2.0")).toBeVisible();
    await expect(page.getByText("意图")).toBeVisible();
    await expect(page.getByText("决策")).toBeVisible();
    await expect(page.getByText("行程")).toBeVisible();
  });

  test("健康检查 API", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.version).toBe("2.0.0");
  });
});
