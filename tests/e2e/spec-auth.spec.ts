import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const spec = readFileSync(new URL("../../demo/openapi.json", import.meta.url), "utf8");
async function openProtectedSpec(page: import("@playwright/test").Page) {
  await page.route("**/demo/openapi.json", route => route.fulfill(
    route.request().headers().authorization === `Basic ${Buffer.from("docs:secret").toString("base64")}`
      ? { contentType: "application/json", body: spec }
      : { status: 401, headers: { "WWW-Authenticate": 'Basic realm="docs"' }, body: "Unauthorized" },
  ));
  await page.goto("/");
  return page.getByRole("form", { name: "API 명세 인증" });
}
test("spec account form retries an invalid password and keeps API authorization separate", async ({ page }) => {
  const form = await openProtectedSpec(page);
  await expect(form).toBeVisible();
  await form.getByLabel("아이디", { exact: true }).fill("docs");
  await form.getByLabel("비밀번호", { exact: true }).fill("wrong");
  await form.getByRole("button", { name: "명세 불러오기" }).click();
  await expect(form.getByRole("alert")).toContainText("인증에 실패");
  await expect(form.getByLabel("비밀번호", { exact: true })).toHaveValue("");
  await form.getByLabel("아이디", { exact: true }).fill("docs");
  await form.getByLabel("비밀번호", { exact: true }).fill("secret");
  await form.getByRole("button", { name: "명세 불러오기" }).click();
  await expect(page.getByRole("heading", { name: "Demo Backend API 1.0.0", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Authorize/ }).first().click();
  const auth = page.getByRole("dialog", { name: "API 요청 인증" });
  await expect(auth).toContainText("연결된 토큰 없음");
  await expect(auth.getByLabel("새 API 인증 토큰")).toHaveValue("");
  await page.reload();
  await expect(form).toBeVisible();
});
test("spec account form supports cancellation", async ({ page }) => {
  const form = await openProtectedSpec(page);
  await form.getByRole("button", { name: "취소", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("명세 인증을 취소했습니다");
  await expect(form).toHaveCount(0);
});
