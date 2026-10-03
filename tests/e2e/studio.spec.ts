import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const yaml = readFileSync(new URL("../../demo/scenario.yaml", import.meta.url), "utf8");
async function importScenario(page: Page, source: string) {
  await page.getByRole("tab", { name: /시나리오/ }).click();
  await page.getByRole("button", { name: "YAML 가져오기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "YAML 가져오기" });
  await dialog.getByLabel("YAML 내용", { exact: true }).fill(source);
  await dialog.getByRole("button", { name: "내용 확인" }).click();
  await dialog.getByRole("button", { name: "시나리오 저장", exact: true }).click();
  await expect(dialog).toBeHidden();
}
test("standalone script loads with contained styles and no Node RPC", async ({ page }) => {
  const calls: string[] = []; page.on("request", request => calls.push(request.url()));
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/standalone.html");
  await expect(page.getByRole("heading", { name: "Demo Backend API 1.0.0", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Authorize/ }).first()).toBeVisible();
  await page.evaluate(() => { const button = document.createElement("button"); button.id = "host-test"; button.textContent = "host"; document.body.prepend(button); });
  expect(await page.locator("#host-test").evaluate(el => getComputedStyle(el).borderRadius)).not.toBe("4px");
  expect(calls.some(url => url.includes("__api-testing"))).toBe(false);
  expect(errors).toEqual([]);
});
test("<openapi-studio> tag mounts from attributes alone and unmounts on removal", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/element.html");
  await expect(page.getByRole("heading", { name: "Demo Backend API 1.0.0", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "설명 보기" }).click();
  await page.getByRole("button", { name: "Mermaid 다이어그램 보기" }).click();
  await expect(page.locator("dialog.api-diagram-dialog svg")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator("openapi-studio").evaluate(element => element.remove());
  await expect.poll(() => page.locator("style[data-openapi-studio]").count()).toBe(0);
  expect(errors).toEqual([]);
});
test("Mermaid is off by default and descriptions keep the diagram source as code", async ({ page }) => {
  const calls: string[] = []; page.on("request", request => calls.push(request.url()));
  await page.goto("/standalone.html");
  await page.getByRole("button", { name: "설명 보기" }).click();
  await expect(page.locator(".info code").filter({ hasText: "flowchart LR" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mermaid 다이어그램 보기" })).toHaveCount(0);
  expect(calls.some(url => url.includes("openapi-studio.mermaid.js"))).toBe(false);
});
test("mermaid option loads the separate bundle on demand and renders the diagram", async ({ page }) => {
  const calls: string[] = []; page.on("request", request => calls.push(request.url()));
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/standalone.html?mermaid");
  await page.getByRole("button", { name: "설명 보기" }).click();
  const trigger = page.getByRole("button", { name: "Mermaid 다이어그램 보기" });
  await expect(trigger).toBeVisible();
  expect(calls.some(url => url.includes("openapi-studio.mermaid.js"))).toBe(false);
  await trigger.click();
  const dialog = page.locator("dialog.api-diagram-dialog");
  await expect(dialog.locator("svg")).toBeVisible();
  await expect(dialog).toContainText("항목 생성");
  expect(calls.filter(url => url.includes("/dist/openapi-studio.mermaid.js"))).toHaveLength(1);
  expect(errors).toEqual([]);
});
test("search matches paths and descriptions and tags expand/collapse", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("textbox", { name: /검색/ }).first();
  await search.fill("POST /items");
  await expect(page.locator(".opblock")).toHaveCount(1);
  await expect(page.locator(".opblock")).toContainText("항목 생성");
  await search.fill("");
  await page.getByRole("button", { name: "태그 모두 펼치기" }).click();
  await expect(page.locator(".opblock")).toHaveCount(5);
  await page.getByRole("button", { name: "태그 모두 접기" }).click();
  await expect(page.locator(".opblock")).toHaveCount(0);
});
test("YAML login → token → create → linked id → get runs and survives reload", async ({ page }) => {
  await page.goto("/"); await importScenario(page, yaml);
  const row = page.getByRole("article", { name: "로그인 후 항목 생성·조회" });
  await row.getByRole("button", { name: "실행", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "로그인 후 항목 생성·조회 · 통과" })).toBeVisible();
  await expect(page.locator(".api-run-result-steps")).toContainText("HTTP 201");
  await page.reload(); await page.getByRole("tab", { name: /시나리오/ }).click();
  await expect(row).toBeVisible();
  await page.getByRole("button", { name: /전역변수/ }).click();
  await expect(page.getByRole("dialog", { name: /전역변수/ })).toContainText("accessToken");
});
test("request values edit in the reused builder and download as compatible YAML", async ({ page }) => {
  await page.goto("/"); await importScenario(page, yaml);
  const row = page.getByRole("article", { name: "로그인 후 항목 생성·조회" });
  await row.getByRole("button", { name: "수정", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "시나리오 이름" })).toBeVisible();
  await page.getByRole("textbox", { name: "시나리오 이름" }).fill("편집한 시나리오");
  await page.getByRole("button", { name: "시나리오 검사·저장", exact: true }).click();
  await expect(page.getByText(/시나리오를 저장했습니다\.|저장됨 · 실행 전 설정 필요/)).toBeVisible();
  await page.getByRole("button", { name: "시나리오 목록으로" }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("article", { name: "편집한 시나리오" }).getByRole("button", { name: "YAML 내보내기" }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("편집한 시나리오.yaml");
  const stream = await download.createReadStream(); const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  expect(text).toContain("{{steps.2.response.body./id}}"); expect(text).not.toContain("demo-access-token");
});
test("browser cookies support login and required cookie calls", async ({ page }) => {
  await page.goto("/"); await importScenario(page, "name: 쿠키 로그인\nserver: backend\nsteps:\n  - api: POST /auth/login\n  - api: GET /session\n    expect:\n      - { source: body, pointer: /authenticated, operator: equals, value: true }\n");
  await page.getByRole("article", { name: "쿠키 로그인" }).getByRole("button", { name: "실행", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "쿠키 로그인 · 통과" })).toBeVisible();
});
test("run input pauses the next request and cancel stops subsequent calls", async ({ page }) => {
  await page.goto("/");
  await importScenario(page, "name: 입력 테스트\nserver: backend\nsteps:\n  - api: POST /auth/login\n    inputs: [{ name: verification, label: 확인값 }]\n    body: { code: '{{inputs.verification}}' }\n");
  await page.getByRole("article", { name: "입력 테스트" }).getByRole("button", { name: "실행", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "확인값" });
  await expect(dialog).toBeVisible(); await dialog.getByLabel("확인값", { exact: true }).fill("1234");
  await dialog.getByRole("button", { name: "입력 완료 · 계속" }).click();
  await expect(page.getByRole("status").filter({ hasText: "입력 테스트 · 통과" })).toBeVisible();
  await importScenario(page, "name: 중단 테스트\nserver: backend\nsteps:\n  - api: GET /slow\n  - api: POST /auth/login\n");
  let loginCalls = 0; page.on("request", req => { if (req.url().endsWith("/auth/login")) loginCalls++; });
  await page.getByRole("article", { name: "중단 테스트" }).getByRole("button", { name: "실행", exact: true }).click();
  await page.getByRole("button", { name: "실행 중단", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "중단 테스트 · 취소" })).toBeVisible();
  expect(loginCalls).toBe(0);
});
test("storage keys isolate independent embeds on the same backend", async ({ page }) => {
  await page.goto("/"); await importScenario(page, yaml);
  await page.goto("/standalone.html"); await page.getByRole("tab", { name: /시나리오/ }).click();
  await expect(page.getByText("저장된 시나리오가 없습니다.", { exact: true })).toBeVisible();
});
test("unavailable spec renders a clear error without initializing a workspace", async ({ page }) => {
  await page.route("**/demo/openapi.json", route => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto("/"); await expect(page.getByRole("alert")).toHaveText("명세를 불러오지 못했습니다 (HTTP 503)");
});
test("new scenario is composed by picking an API and runs after saving", async ({ page }) => {
  await page.goto("/"); await page.getByRole("tab", { name: /시나리오/ }).click();
  await page.getByRole("button", { name: "+ 새 시나리오" }).click();
  const login = page.locator('.opblock[data-studio-path="/auth/login"]');
  await login.getByRole("button", { name: "시나리오에 API 추가" }).click();
  await page.getByRole("button", { name: /값 설정/ }).click();
  await page.getByRole("textbox", { name: "시나리오 이름" }).fill("직접 작성한 로그인");
  await page.getByRole("button", { name: "시나리오 검사·저장" }).click();
  await expect(page.getByText(/시나리오를 저장했습니다\./)).toBeVisible();
  await page.getByRole("button", { name: "시나리오 목록으로" }).click();
  await page.getByRole("article", { name: "직접 작성한 로그인" }).getByRole("button", { name: "실행", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "직접 작성한 로그인 · 통과" })).toBeVisible();
});
test("Authorize token drives individual Swagger calls and persists in the browser", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Authorize/ }).first().click();
  const auth = page.getByRole("dialog", { name: "API 요청 인증" });
  await auth.getByLabel("새 API 인증 토큰").fill("demo-access-token");
  await auth.getByRole("button", { name: "저장 후 연결" }).click();
  await expect(auth).toContainText("연결됨");
  await auth.getByRole("button", { name: "인증 설정 닫기" }).click();
  await page.getByRole("textbox", { name: "API 문서 검색" }).fill("POST /items");
  const item = page.locator(".opblock"); await item.locator(".opblock-summary-control").click();
  await item.getByRole("button", { name: "Try it out", exact: true }).click();
  await item.getByRole("button", { name: "Execute", exact: true }).click();
  await expect(item.getByRole("region", { name: "API 응답", exact: true })).toContainText("201");
  await page.reload(); await page.getByRole("button", { name: /Authorize/ }).first().click();
  await expect(page.getByRole("dialog", { name: "API 요청 인증" })).toContainText("연결됨 · docsToken");
});
test("two editors use an IndexedDB transaction to reject a stale save", async ({ page, context }) => {
  await page.goto("/"); await importScenario(page, yaml);
  const second = await context.newPage(); await second.goto("/"); await second.getByRole("tab", { name: /시나리오/ }).click();
  for (const editorPage of [page, second]) await editorPage.getByRole("article", { name: "로그인 후 항목 생성·조회" }).getByRole("button", { name: "수정", exact: true }).click();
  await page.getByRole("textbox", { name: "시나리오 이름" }).fill("먼저 저장함");
  await page.getByRole("button", { name: "시나리오 검사·저장" }).click();
  await expect(page.getByRole("status").filter({ hasText: "시나리오를 저장했습니다." })).toBeVisible();
  await second.getByRole("textbox", { name: "시나리오 이름" }).fill("오래된 편집");
  await second.getByRole("button", { name: "시나리오 검사·저장" }).click();
  await expect(second.getByRole("alert")).toContainText("같은 시나리오가 변경되었습니다");
  await second.close();
});
test("standalone editor saves at a narrow viewport without a covered footer", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/standalone.html"); await importScenario(page, yaml);
  await page.getByRole("article", { name: "로그인 후 항목 생성·조회" }).getByRole("button", { name: "수정", exact: true }).click();
  await page.getByRole("textbox", { name: "시나리오 이름" }).fill("좁은 화면 편집");
  await page.getByRole("button", { name: "시나리오 검사·저장", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "시나리오를 저장했습니다." })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("narrow-editor.png"), fullPage: true });
  await page.getByRole("button", { name: "시나리오 목록으로" }).click();
  await expect(page.getByRole("article", { name: "좁은 화면 편집" })).toBeVisible();
});
