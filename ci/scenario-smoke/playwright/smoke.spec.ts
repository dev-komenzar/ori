import { test, expect } from "@playwright/test";

// scenario-smoke: compose-service descriptor が実際に起動していることの実在性チェック。
// app (node:22-slim + corepack + pnpm dev) が runtime.ports 宣言どおり 5173 で応答する。

test("compose-service app responds on the declared port", async ({ page }) => {
  const res = await page.goto("http://localhost:5173/");
  expect(res?.status()).toBe(200);
  await expect(page.locator("body")).toContainText("hello from myapp");
});
