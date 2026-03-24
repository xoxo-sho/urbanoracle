import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for page to be interactive (tabs rendered)
    await page.waitForSelector("[data-slot='tabs']", { timeout: 10000 });
  });

  test("displays page title", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("UrbanOracle");
    await expect(page).toHaveTitle(/UrbanOracle/);
  });

  test("shows 5 tabs", async ({ page }) => {
    const tabs = page.locator("[data-slot='tabs-trigger']");
    await expect(tabs).toHaveCount(5);
    await expect(tabs.nth(0)).toContainText("地価");
    await expect(tabs.nth(1)).toContainText("人口");
    await expect(tabs.nth(2)).toContainText("災害");
    await expect(tabs.nth(3)).toContainText("交通");
    await expect(tabs.nth(4)).toContainText("用途地域");
  });

  test("switches tabs", async ({ page }) => {
    // Click demographics tab
    await page.locator("[data-slot='tabs-trigger']").nth(1).click();
    await expect(page.getByText("人口推移")).toBeVisible({ timeout: 5000 });

    // Click transport tab
    await page.locator("[data-slot='tabs-trigger']").nth(3).click();
    await expect(page.getByText("路線別利用規模")).toBeVisible({ timeout: 5000 });
  });

  test("ward selector works", async ({ page }) => {
    const selector = page.locator("select");
    await expect(selector).toBeVisible();

    // Select a ward
    await selector.selectOption("千代田区");
    // Ward name appears in map overlay label
    await expect(page.locator(".glass").first()).toContainText("千代田区");

    // Reset
    await selector.selectOption("");
    await expect(page.locator(".glass").first()).toContainText("全エリア");
  });

  test("key metrics are displayed", async ({ page }) => {
    const metrics = page.locator(".key-metric");
    await expect(metrics).toHaveCount(3);
  });

  test("theme toggle exists", async ({ page }) => {
    const toggle = page.locator("button[title*='モード']");
    await expect(toggle).toBeVisible();
  });

  test("attribution footer is visible", async ({ page }) => {
    await expect(page.getByText("国土数値情報")).toBeVisible();
  });
});

test.describe("Error pages", () => {
  test("404 page for unknown routes", async ({ page }) => {
    await page.goto("/nonexistent-page");
    await expect(page.getByText("ページが見つかりません")).toBeVisible({ timeout: 10000 });
  });
});
