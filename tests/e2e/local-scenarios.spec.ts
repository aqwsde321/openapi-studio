import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const yaml = readFileSync(new URL("../../demo/scenario.yaml", import.meta.url), "utf8");
// Exercise real browser file streams in an isolated OPFS directory; only the native picker is substituted.
async function useTestFolder(page: Page, files: Record<string, string> = {}) {
  await page.addInitScript(seed => {
    Object.defineProperty(window, "showDirectoryPicker", { configurable: true, value: async () => {
      const root = await navigator.storage.getDirectory();
      const directory = await root.getDirectoryHandle("test-api-scenarios", { create: true });
      for (const [name, source] of Object.entries(seed)) {
        const writer = await (await directory.getFileHandle(name, { create: true })).createWritable();
        await writer.write(source); await writer.close();
      }
      return directory;
    } });
  }, files);
}
async function readLocal(page: Page, file: string) {
  return page.evaluate(async name => {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle("test-api-scenarios");
    return (await (await directory.getFileHandle(name)).getFile()).text();
  }, file);
}
async function writeLocal(page: Page, file: string, source: string) {
  await page.evaluate(async ({ file, source }) => {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle("test-api-scenarios");
    const writer = await (await directory.getFileHandle(file, { create: true })).createWritable();
    await writer.write(source); await writer.close();
  }, { file, source });
}
async function openScenarios(page: Page) {
  await page.goto("/"); await page.getByRole("tab", { name: /시나리오/ }).click();
}

test("browser additions save to a local folder, edit in place, and reject an external edit", async ({ page }) => {
  await useTestFolder(page); await openScenarios(page);
  await page.getByRole("button", { name: "YAML 가져오기", exact: true }).click();
  const importer = page.getByRole("dialog", { name: "YAML 가져오기" });
  await importer.getByLabel("YAML 내용", { exact: true }).fill(yaml);
  await importer.getByRole("button", { name: "내용 확인" }).click();
  await importer.getByRole("button", { name: "시나리오 저장", exact: true }).click();
  await page.getByRole("button", { name: "로컬 폴더 연결", exact: true }).click();
  await expect(page.getByRole("region", { name: "로컬 시나리오 폴더" })).toContainText("연결됨");
  await page.getByRole("complementary").getByText("로그인 후 항목 생성·조회", { exact: true }).click();
  await page.getByRole("article").getByRole("button", { name: "프로젝트에 저장", exact: true }).click();
  const save = page.getByRole("dialog", { name: "프로젝트에 저장" });
  await save.getByLabel("프로젝트 YAML 파일명").fill("flow.yaml");
  await save.getByRole("button", { name: "프로젝트에 저장", exact: true }).click();
  await expect(save).toBeHidden();
  expect(JSON.parse(await readLocal(page, "index.json")).scenarios[0].file).toBe("flow.yaml");
  expect(await readLocal(page, "flow.yaml")).not.toContain("id: scenario-");
  await expect(page.getByRole("article")).toContainText("로컬 YAML");
  await page.getByRole("article").getByRole("button", { name: "수정", exact: true }).click();
  await page.getByRole("textbox", { name: "시나리오 이름" }).fill("브라우저에서 수정한 원본");
  await page.getByRole("button", { name: "프로젝트에 저장", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "프로젝트에 저장했습니다" })).toBeVisible();
  const written = await readLocal(page, "flow.yaml");
  expect(written).toContain("브라우저에서 수정한 원본");
  await page.getByRole("textbox", { name: "시나리오 이름" }).fill("저장하면 안 되는 수정");
  const external = written.replace("브라우저에서 수정한 원본", "에이전트가 수정한 원본");
  await writeLocal(page, "flow.yaml", external);
  await page.getByRole("button", { name: "프로젝트에 저장", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("다른 곳에서 변경");
  expect(await readLocal(page, "flow.yaml")).toBe(external);
  await expect(page.getByRole("textbox", { name: "시나리오 이름" })).toHaveValue("저장하면 안 되는 수정");
});

test("folder refresh reads agent edits and disconnect leaves local files intact", async ({ page }) => {
  await useTestFolder(page, { "index.json": JSON.stringify({ version: 1, scenarios: [{ file: "flow.yaml" }] }), "flow.yaml": yaml });
  let apiCalls = 0;
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/demo-api/")) apiCalls++; });
  await openScenarios(page);
  await page.getByRole("button", { name: "로컬 폴더 연결", exact: true }).click();
  const list = page.getByRole("complementary");
  await expect(list.getByText("로그인 후 항목 생성·조회", { exact: true })).toBeVisible();
  const external = yaml.replace("로그인 후 항목 생성·조회", "파일에서 변경");
  await writeLocal(page, "flow.yaml", external);
  await page.getByRole("button", { name: "폴더 다시 불러오기" }).click();
  await expect(list.getByText("파일에서 변경", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "폴더 연결 해제" }).click();
  await expect(list.getByText("파일에서 변경", { exact: true })).toHaveCount(0);
  expect(await readLocal(page, "flow.yaml")).toBe(external);
  expect(apiCalls).toBe(0);
});

test("cancelled pickers and unsupported browsers keep the normal import flow available", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "showDirectoryPicker", { configurable: true, value: async () => { throw new DOMException("cancelled", "AbortError"); } }));
  await openScenarios(page);
  await page.getByRole("button", { name: "로컬 폴더 연결", exact: true }).click();
  await expect(page.getByRole("button", { name: "YAML 가져오기", exact: true })).toBeEnabled();
  await expect(page.getByRole("region", { name: "로컬 시나리오 폴더" }).getByRole("alert")).toHaveCount(0);
  await page.evaluate(() => Object.defineProperty(window, "showDirectoryPicker", { configurable: true, value: undefined }));
  await page.getByRole("tab", { name: /API 문서/ }).click();
  await page.getByRole("tab", { name: /시나리오/ }).click();
  await expect(page.getByRole("button", { name: "로컬 폴더 연결", exact: true })).toBeDisabled();
  await expect(page.getByRole("region", { name: "로컬 시나리오 폴더" })).toContainText("지원하지 않습니다");
});
