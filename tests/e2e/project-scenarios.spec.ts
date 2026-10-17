import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const yaml = readFileSync(new URL("../../demo/scenario.yaml", import.meta.url), "utf8");
async function projectPage(page: Page) {
  await page.goto("/tests/fixtures/project-scenarios.html");
  await page.getByRole("tab", { name: /시나리오/ }).click();
}
const list = (page: Page) => page.getByRole("complementary", { name: "저장된 시나리오" });

test("project YAML runs on demand, exports, and refreshes without changing a browser copy", async ({ page }) => {
  let source = yaml; let files = ["flow.yaml"]; let calls = 0;
  await page.route("**/test-scenarios/index.json", route => route.fulfill({ json: { version: 1, scenarios: files.map(file => ({ file })) } }));
  await page.route("**/test-scenarios/flow.yaml", route => route.fulfill({ contentType: "application/yaml", body: source }));
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/demo-api/")) calls++; });
  await projectPage(page);
  const name = "로그인 후 항목 생성·조회";
  await list(page).getByText(name, { exact: true }).click();
  let detail = page.getByRole("article", { name, exact: true });
  await expect(detail.getByRole("button", { name: "실행", exact: true })).toBeEnabled();
  expect(calls).toBe(0);
  await expect(detail.getByRole("button", { name: "수정", exact: true })).toHaveCount(0);
  await expect(detail.getByRole("button", { name: "삭제", exact: true })).toHaveCount(0);
  await detail.getByRole("button", { name: "실행", exact: true }).click();
  await expect(detail.getByRole("status")).toContainText("통과");
  expect(calls).toBe(3);
  const downloadPromise = page.waitForEvent("download");
  await detail.getByRole("button", { name: "YAML 내보내기" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream(); const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const exported = Buffer.concat(chunks).toString("utf8");
  expect(exported).toContain("{{steps.2.response.body./id}}");
  expect(exported).not.toContain("project:"); expect(exported).not.toContain("demo-access-token");
  await detail.getByRole("button", { name: "브라우저 사본 만들기" }).click();
  await expect(page.getByRole("article", { name: `${name} 사본`, exact: true }).getByRole("button", { name: "수정", exact: true })).toBeVisible();
  await list(page).getByText(name, { exact: true }).click();
  source = yaml.replace(name, "파일에서 수정한 흐름");
  await page.getByRole("button", { name: "프로젝트 다시 불러오기" }).click();
  detail = page.getByRole("article", { name: "파일에서 수정한 흐름", exact: true });
  await expect(detail).toBeVisible();
  await expect(detail.locator(".api-run-result-steps")).toHaveCount(0);
  await expect(list(page).getByText(`${name} 사본`, { exact: true })).toBeVisible();
  await page.reload(); await page.getByRole("tab", { name: /시나리오/ }).click();
  await expect(list(page).getByText("파일에서 수정한 흐름", { exact: true })).toBeVisible();
  await expect(list(page).getByText(`${name} 사본`, { exact: true })).toBeVisible();
  files = []; await page.getByRole("button", { name: "프로젝트 다시 불러오기" }).click();
  await expect(list(page).getByText("파일에서 수정한 흐름", { exact: true })).toHaveCount(0);
  await expect(list(page).getByText(`${name} 사본`, { exact: true })).toBeVisible();
});

test("project file errors keep API docs available and allow retry without losing the last list", async ({ page }) => {
  let fail = true;
  await page.route("**/test-scenarios/index.json", route => route.fulfill({ json: { version: 1, scenarios: [{ file: "flow.yaml" }] } }));
  await page.route("**/test-scenarios/flow.yaml", route => route.fulfill(fail ? { status: 404, body: "missing" } : { contentType: "application/yaml", body: yaml }));
  await projectPage(page);
  await expect(page.getByRole("alert")).toContainText("flow.yaml: HTTP 404");
  await page.getByRole("tab", { name: /API 문서/ }).click();
  await expect(page.getByRole("textbox", { name: "API 문서 검색" })).toBeVisible();
  await page.getByRole("tab", { name: /시나리오/ }).click();
  fail = false; await page.getByRole("button", { name: "프로젝트 다시 불러오기" }).click();
  await expect(list(page).getByText("로그인 후 항목 생성·조회", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  fail = true; await page.getByRole("button", { name: "프로젝트 다시 불러오기" }).click();
  await expect(page.getByRole("alert")).toContainText("기존 목록을 유지");
  await expect(list(page).getByText("로그인 후 항목 생성·조회", { exact: true })).toBeVisible();
});
