import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const yaml = readFileSync(new URL("../../demo/scenario.yaml", import.meta.url), "utf8");
const iconAssets = "https://studio-assets.example.test/npm/openapi-studio@9.8.7/dist/";
async function openFaviconPage(page: Page, icons = "") {
  await page.route(`${iconAssets}**`, route => {
    const file = new URL(route.request().url()).pathname.split("/").at(-1)!;
    const contentType = file.endsWith(".js") ? "application/javascript; charset=utf-8" : file.endsWith(".svg") ? "image/svg+xml" : "image/png";
    return route.fulfill({ contentType, body: readFileSync(new URL(`../../dist/${file}`, import.meta.url)) });
  });
  await page.route("**/favicon-test.html", route => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><head><meta charset="UTF-8">${icons}</head><body>
      <openapi-studio spec-url="/demo/openapi.json"></openapi-studio>
      <script src="${iconAssets}openapi-studio.standalone.js"></script>
    </body></html>`,
  }));
  await page.goto("/favicon-test.html");
}
async function importScenario(page: Page, source: string) {
  await page.getByRole("tab", { name: /시나리오/ }).click();
  await page.getByRole("button", { name: "YAML 가져오기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "YAML 가져오기" });
  await dialog.getByLabel("YAML 내용", { exact: true }).fill(source);
  await dialog.getByRole("button", { name: "내용 확인" }).click();
  await dialog.getByRole("button", { name: "시나리오 저장", exact: true }).click();
  await expect(dialog).toBeHidden();
}
const sidebar = (page: Page) => page.getByRole("complementary", { name: "저장된 시나리오" });
async function selectScenario(page: Page, name: string) {
  await sidebar(page).getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("article", { name, exact: true })).toBeVisible();
}
async function downloadedYaml(page: Page) {
  const downloaded = page.waitForEvent("download");
  await page.getByRole("article").getByRole("button", { name: "YAML 내보내기", exact: true }).click();
  const download = await downloaded;
  const stream = await download.createReadStream(); const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  return { filename: download.suggestedFilename(), text: Buffer.concat(chunks).toString("utf8") };
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
test("automatic icons use the script's CDN version and are removed and recreated with Studio", async ({ page }) => {
  await openFaviconPage(page);
  await expect(page.getByRole("heading", { name: "Demo Backend API 1.0.0", exact: true })).toBeVisible();
  const icons = page.locator('head link[data-openapi-studio="favicon"]');
  await expect(icons).toHaveCount(2);
  await expect(page.locator('head link[data-openapi-studio="favicon"][rel="icon"]')).toHaveAttribute("href", `${iconAssets}favicon.svg`);
  await expect(page.locator('head link[rel="apple-touch-icon"]')).toHaveAttribute("href", `${iconAssets}apple-touch-icon.png`);
  await page.locator("openapi-studio").evaluate(element => element.remove());
  await expect(icons).toHaveCount(0);
  await page.evaluate(() => {
    const studio = document.createElement("openapi-studio");
    studio.setAttribute("spec-url", "/demo/openapi.json");
    document.body.append(studio);
  });
  await expect(page.getByRole("heading", { name: "Demo Backend API 1.0.0", exact: true })).toBeVisible();
  await expect(icons).toHaveCount(2);
});
for (const rel of ["shortcut ICON", "apple-touch-icon", "mask-icon"]) {
  test(`automatic icons preserve the host's ${rel} icon without adding mixed branding`, async ({ page }) => {
    await openFaviconPage(page, `<link rel="${rel}" href="/host-icon.svg" data-host-icon>`);
    await expect(page.getByRole("heading", { name: "Demo Backend API 1.0.0", exact: true })).toBeVisible();
    await expect(page.locator("head link[data-host-icon]")).toHaveAttribute("href", "/host-icon.svg");
    await expect(page.locator('head link[data-openapi-studio="favicon"]')).toHaveCount(0);
    await page.locator("openapi-studio").evaluate(element => element.remove());
    await expect(page.locator("style[data-openapi-studio]")).toHaveCount(0);
    await expect(page.locator("head link[data-host-icon]")).toHaveCount(1);
  });
}
test("a failed Studio initialization does not add icons to the host page", async ({ page }) => {
  await page.route("**/demo/openapi.json", route => route.fulfill({ status: 503, body: "Unavailable" }));
  await openFaviconPage(page);
  await expect(page.getByRole("alert")).toHaveText("명세를 불러오지 못했습니다 (HTTP 503)");
  await expect(page.locator('head link[data-openapi-studio="favicon"]')).toHaveCount(0);
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
  await selectScenario(page, "로그인 후 항목 생성·조회");
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
  const { filename, text } = await downloadedYaml(page);
  expect(filename).toBe("편집한 시나리오.yaml");
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
  await page.getByRole("article", { name: "입력 테스트", exact: true }).getByRole("button", { name: "다시 실행", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("tab", { name: /API 문서/ })).toBeDisabled();
  await expect(sidebar(page).getByRole("button", { name: "입력 테스트", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "실행 중단", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "입력 테스트 · 취소" })).toBeVisible();
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
  await page.getByRole("button", { name: "저장 후 실행", exact: true }).click();
  await expect(page.getByRole("article", { name: "직접 작성한 로그인", exact: true })).toBeVisible();
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
  await selectScenario(second, "로그인 후 항목 생성·조회");
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

test("scenario sidebar searches names, descriptions, and APIs and opens the selected flow", async ({ page }) => {
  await page.goto("/");
  await importScenario(page, yaml.replace("server: backend", "description: 항목 등록 회귀 검증\nserver: backend"));
  await importScenario(page, "name: 세션 확인\nserver: backend\nsteps:\n  - api: POST /auth/login\n  - api: GET /session\n");
  const tree = sidebar(page);
  const search = tree.getByLabel("시나리오 검색", { exact: true });
  await expect(tree.locator(".api-sidebar-entry")).toHaveCount(2);
  await search.fill("항목 등록 회귀");
  await expect(tree.locator(".api-sidebar-entry")).toHaveCount(1);
  await expect(tree.locator(".api-sidebar-entry")).toContainText("로그인 후 항목 생성·조회");
  await search.fill("세션 확인");
  await expect(tree.locator(".api-sidebar-entry")).toHaveCount(1);
  await expect(tree.locator(".api-sidebar-entry")).toContainText("세션 확인");
  await search.fill("GET /session");
  await expect(tree.locator(".api-sidebar-entry")).toHaveCount(1);
  await expect(tree.locator(".api-sidebar-entry")).toContainText("세션 확인");
  await search.fill("없는 시나리오");
  await expect(tree.getByText("조건에 맞는 시나리오가 없습니다.", { exact: true })).toBeVisible();
  await search.fill("");
  await selectScenario(page, "로그인 후 항목 생성·조회");
  const detail = page.getByRole("article", { name: "로그인 후 항목 생성·조회", exact: true });
  await detail.getByRole("group", { name: "시나리오 보기" }).getByRole("button", { name: "실행 흐름", exact: true }).click();
  await expect(detail.locator(".api-run-step-reference code").filter({ hasText: /^\/items$/ })).toBeVisible();
  await expect(detail.locator(".api-run-step-reference code").filter({ hasText: /^\/items\/\{id\}$/ })).toBeVisible();
  await selectScenario(page, "세션 확인");
  await expect(page.getByRole("article", { name: "세션 확인", exact: true }).locator(".api-run-step-reference code").filter({ hasText: /^\/session$/ })).toBeVisible();
  await expect(page.getByRole("article", { name: "로그인 후 항목 생성·조회", exact: true })).toHaveCount(0);
});

test("recent run results stay attached to their scenario when switching the sidebar", async ({ page }) => {
  await page.goto("/"); await importScenario(page, yaml);
  await page.getByRole("article", { name: "로그인 후 항목 생성·조회" }).getByRole("button", { name: "실행", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "로그인 후 항목 생성·조회 · 통과" })).toBeVisible();
  await importScenario(page, "name: 별도 로그인\nserver: backend\nsteps:\n  - api: POST /auth/login\n");
  const login = page.getByRole("article", { name: "별도 로그인", exact: true });
  await expect(login.getByRole("group", { name: "시나리오 보기" }).getByRole("button", { name: "최근 실행", exact: true })).toBeDisabled();
  await expect(login.locator(".api-run-result-steps")).toHaveCount(0);
  await login.getByRole("button", { name: "실행", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "별도 로그인 · 통과" })).toBeVisible();
  await expect(login.locator(".api-run-result-steps")).toContainText("HTTP 200");
  await expect(login.locator(".api-run-result-steps")).not.toContainText("HTTP 201");
  await selectScenario(page, "로그인 후 항목 생성·조회");
  const items = page.getByRole("article", { name: "로그인 후 항목 생성·조회", exact: true });
  await items.getByRole("group", { name: "시나리오 보기" }).getByRole("button", { name: "최근 실행", exact: true }).click();
  await expect(items.locator(".api-run-result-steps")).toContainText("HTTP 201");
  await expect(items.getByRole("button", { name: "다시 실행", exact: true })).toBeEnabled();
  await selectScenario(page, "별도 로그인");
  await login.getByRole("group", { name: "시나리오 보기" }).getByRole("button", { name: "최근 실행", exact: true }).click();
  await expect(login.locator(".api-run-result-steps")).not.toContainText("HTTP 201");
});

test("duplicate is independently saved and deleting it leaves the original scenario", async ({ page }) => {
  await page.goto("/"); await importScenario(page, yaml);
  await page.getByRole("article", { name: "로그인 후 항목 생성·조회", exact: true }).getByRole("button", { name: "복제", exact: true }).click();
  const copyName = "로그인 후 항목 생성·조회 사본";
  const copy = page.getByRole("article", { name: copyName, exact: true });
  await expect(copy).toBeVisible();
  await expect(sidebar(page).locator(".api-sidebar-entry")).toHaveCount(2);
  await copy.getByRole("button", { name: "수정", exact: true }).click();
  await page.getByRole("textbox", { name: "시나리오 이름" }).fill("별도 보관 시나리오");
  await page.getByRole("button", { name: "시나리오 검사·저장", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "시나리오를 저장했습니다." })).toBeVisible();
  await page.getByRole("button", { name: "시나리오 목록으로", exact: true }).click();
  await selectScenario(page, "로그인 후 항목 생성·조회");
  const original = await downloadedYaml(page);
  expect(original.text).toContain("name: 로그인 후 항목 생성·조회");
  expect(original.text).not.toContain("별도 보관 시나리오");
  await selectScenario(page, "별도 보관 시나리오");
  await page.getByRole("button", { name: "시나리오 삭제", exact: true }).click();
  await expect(sidebar(page).locator(".api-sidebar-entry")).toHaveCount(2);
  await page.getByRole("button", { name: "시나리오 삭제 확인", exact: true }).click();
  await expect(sidebar(page).locator(".api-sidebar-entry")).toHaveCount(1);
  await page.reload(); await page.getByRole("tab", { name: /시나리오/ }).click();
  await expect(sidebar(page).getByRole("button", { name: "별도 보관 시나리오", exact: true })).toHaveCount(0);
  await selectScenario(page, "로그인 후 항목 생성·조회");
  await expect(page.getByRole("article", { name: "로그인 후 항목 생성·조회", exact: true }).locator(".api-run-step-reference code").filter({ hasText: /^\/items$/ })).toBeVisible();
});

test("group edits persist in the sidebar and later scenario edits preserve the group", async ({ page }) => {
  await page.goto("/"); await importScenario(page, yaml);
  await page.getByRole("article", { name: "로그인 후 항목 생성·조회", exact: true }).getByRole("button", { name: "수정", exact: true }).click();
  const metadata = page.getByRole("region", { name: "시나리오 분류" });
  await metadata.getByRole("button", { name: "새 그룹 폴더 만들기", exact: true }).click();
  const folder = metadata.getByRole("group", { name: "새 그룹 폴더 만들기", exact: true });
  await folder.getByLabel("폴더 이름", { exact: true }).fill("등록 회귀");
  await folder.getByRole("button", { name: "만들기", exact: true }).click();
  await expect(metadata.getByRole("combobox", { name: "그룹", exact: true })).toHaveValue('["등록 회귀"]');
  await page.getByRole("button", { name: "시나리오 검사·저장", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "시나리오를 저장했습니다." })).toBeVisible();
  await page.getByRole("button", { name: "시나리오 목록으로", exact: true }).click();
  await page.reload(); await page.getByRole("tab", { name: /시나리오/ }).click();
  await expect(sidebar(page).locator("summary").filter({ hasText: "등록 회귀" })).toBeVisible();
  await selectScenario(page, "로그인 후 항목 생성·조회");
  await page.getByRole("article", { name: "로그인 후 항목 생성·조회", exact: true }).getByRole("button", { name: "수정", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "그룹", exact: true })).toHaveValue('["등록 회귀"]');
  await page.getByRole("textbox", { name: "시나리오 이름" }).fill("그룹 유지 확인");
  await page.getByRole("button", { name: "시나리오 검사·저장", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "시나리오를 저장했습니다." })).toBeVisible();
  await page.getByRole("button", { name: "시나리오 목록으로", exact: true }).click();
  await page.reload(); await page.getByRole("tab", { name: /시나리오/ }).click();
  const group = sidebar(page).locator("details").filter({ has: page.locator("summary").filter({ hasText: "등록 회귀" }) });
  await expect(group.getByRole("button", { name: "그룹 유지 확인", exact: true })).toBeVisible();
  await selectScenario(page, "그룹 유지 확인");
});

test("saving a missing global refreshes selected scenario validation and enables execution", async ({ page }) => {
  await page.goto("/");
  await importScenario(page, "name: 전역변수 인증\nserver: backend\nsteps:\n  - api: POST /items\n    auth: globals.savedToken\n    body: { name: 변수로 생성 }\n");
  const detail = page.getByRole("article", { name: "전역변수 인증", exact: true });
  await expect(detail.getByRole("button", { name: "실행", exact: true })).toBeDisabled();
  await expect(detail).toContainText("savedToken");
  await page.getByRole("button", { name: "{ } 전역변수", exact: true }).click();
  const globals = page.getByRole("dialog", { name: /전역변수/ });
  await globals.getByRole("button", { name: "+ 변수 추가", exact: true }).click();
  await globals.getByRole("textbox", { name: "전역변수 이름", exact: true }).fill("savedToken");
  await globals.getByRole("textbox", { name: "전역변수 값", exact: true }).fill("demo-access-token");
  await globals.getByRole("button", { name: "전역변수 저장", exact: true }).click();
  await expect(globals.locator(".api-global-row")).toContainText("savedToken");
  await page.keyboard.press("Escape");
  await expect(globals).toBeHidden();
  await expect(detail.getByRole("button", { name: "실행", exact: true })).toBeEnabled();
  await detail.getByRole("button", { name: "실행", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "전역변수 인증 · 통과" })).toBeVisible();
  await expect(detail.locator(".api-run-result-steps")).toContainText("HTTP 201");
});
