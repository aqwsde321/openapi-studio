import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LocalScenarioFolder, newLocalFilename, type LocalDirectory } from "../src/browser/local-scenarios";
import { parseScenario, stringifyScenario } from "../src/core/shared/scenario";
import { BrowserWorkspace } from "../src/browser/workspace";
import { readOpenApi } from "../src/core/openapi";
import { resolveConfiguration } from "../src/browser/config";
import type { StudioData } from "../src/browser/storage";

const yaml = readFileSync(new URL("../demo/scenario.yaml", import.meta.url), "utf8");
const catalog = readOpenApi(readFileSync(new URL("../demo/openapi.json", import.meta.url), "utf8"));
const missing = () => new DOMException("missing", "NotFoundError");
function filesystem(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  const controls = { failWrite: "", failClose: "", beforeCloseCheck: undefined as undefined | ((path: string) => void) };
  const directory = (prefix = ""): LocalDirectory => ({
    name: prefix || "api-scenarios",
    async getDirectoryHandle(name) {
      const child = `${prefix}${name}/`;
      if (![...files.keys()].some(path => path.startsWith(child))) throw missing();
      return directory(child);
    },
    async getFileHandle(name, options) {
      const path = prefix + name;
      if (!files.has(path)) { if (!options?.create) throw missing(); files.set(path, ""); }
      return {
        async getFile() { if (!files.has(path)) throw missing(); const text = files.get(path)!; return { size: new TextEncoder().encode(text).byteLength, text: async () => text }; },
        async createWritable() {
          if (controls.failWrite === path) throw new DOMException("permission denied", "NotAllowedError");
          let buffer = "";
          return {
            async write(text: string) { buffer = text; controls.beforeCloseCheck?.(path); },
            async close() { if (controls.failClose === path) throw new Error("disk full"); files.set(path, buffer); },
            async abort() {},
          };
        },
      };
    },
  });
  const handle = directory();
  return { files, controls, handle, folder: new LocalScenarioFolder(handle, parseScenario, {}) };
}
const index = (entries: Array<{ file: string; groupPath?: string[]; tags?: string[] }>) => JSON.stringify({ version: 1, scenarios: entries });

test("an empty folder accepts a new YAML and list entry without exporting browser identity or global values", async () => {
  const { folder, files } = filesystem(); await folder.reload();
  const saved = await folder.save("login.yaml", yaml, { groupPath: ["인증"], tags: ["회귀"] });
  assert.equal(saved.localFile, "login.yaml"); assert.equal(parseScenario(saved.source).id, saved.id);
  assert.doesNotMatch(files.get("login.yaml")!, /^id:/m);
  assert.match(files.get("login.yaml")!, /\{\{steps\.2\.response\.body\.\/id\}\}/);
  assert.deepEqual(JSON.parse(files.get("index.json")!), { version: 1, scenarios: [{ file: "login.yaml", groupPath: ["인증"], tags: ["회귀"] }] });
  await assert.rejects(folder.save("login.yaml", yaml, {}), /이미 등록/);
});

test("existing nested files can be updated while unrelated files and metadata remain intact", async () => {
  const originalIndex = index([{ file: "auth/login.yaml", groupPath: ["인증"] }, { file: "other.yaml", tags: ["기존"] }]);
  const { folder, files } = filesystem({ "index.json": originalIndex, "auth/login.yaml": yaml, "other.yaml": yaml, "notes.txt": "keep" });
  await folder.reload(); const current = folder.items[0];
  const updated = await folder.save(current.localFile!, yaml.replace("로그인 후 항목 생성·조회", "수정된 시나리오"), { groupPath: ["회원"] }, current.updatedAt);
  assert.equal(updated.id, current.id); assert.notEqual(updated.updatedAt, current.updatedAt);
  assert.match(files.get("auth/login.yaml")!, /수정된 시나리오/);
  assert.equal(files.get("other.yaml"), yaml); assert.equal(files.get("notes.txt"), "keep");
  assert.deepEqual(JSON.parse(files.get("index.json")!).scenarios[1], { file: "other.yaml", tags: ["기존"] });
  await assert.rejects(folder.save(current.localFile!, yaml, {}, current.updatedAt), /변경/);
});

test("external YAML, list edits, and deletions block stale saves without overwriting external contents", async () => {
  for (const changed of ["flow.yaml", "index.json", "deleted"]) {
    const { folder, files } = filesystem({ "index.json": index([{ file: "flow.yaml" }]), "flow.yaml": yaml });
    await folder.reload(); const current = folder.items[0];
    if (changed === "deleted") files.delete("flow.yaml"); else files.set(changed, "external edit");
    const before = new Map(files);
    await assert.rejects(folder.save("flow.yaml", yaml, {}, current.updatedAt), /변경/);
    assert.deepEqual(files, before);
  }
});

test("edits made while bytes are staged abort the file commit", async () => {
  const { folder, files, controls } = filesystem({ "index.json": index([{ file: "flow.yaml" }]), "flow.yaml": yaml });
  await folder.reload();
  controls.beforeCloseCheck = path => { if (path === "flow.yaml") files.set(path, "external edit during save"); };
  await assert.rejects(folder.save("flow.yaml", yaml, {}, folder.items[0].updatedAt), /변경/);
  assert.equal(files.get("flow.yaml"), "external edit during save");
});

test("unlisted files, invalid names, and escaping paths are never overwritten", async () => {
  const { folder, files } = filesystem({ "already.yaml": yaml }); await folder.reload();
  await assert.rejects(folder.save("already.yaml", yaml, {}), /이미 있습니다/);
  for (const name of ["../outside.yaml", "/outside.yaml", "folder/a.yaml", "a\\b.yaml", "a%2fb.yaml", "a.yaml?x", "x.txt", "https://host/a.yaml"]) {
    assert.throws(() => newLocalFilename(name));
  }
  assert.equal(newLocalFilename("새 시나리오.yaml"), "새 시나리오.yaml");
  assert.deepEqual(files, new Map([["already.yaml", yaml]]));
});

test("permission and disk errors preserve existing YAML and keep the connection usable", async () => {
  const { folder, files, controls } = filesystem({ "index.json": index([{ file: "flow.yaml" }]), "flow.yaml": yaml });
  await folder.reload(); const current = folder.items[0];
  controls.failWrite = "flow.yaml";
  await assert.rejects(folder.save("flow.yaml", yaml, {}, current.updatedAt), /permission/);
  assert.equal(files.get("flow.yaml"), yaml);
  controls.failWrite = ""; controls.failClose = "flow.yaml";
  await assert.rejects(folder.save("flow.yaml", yaml, {}, current.updatedAt), /disk full/);
  assert.equal(files.get("flow.yaml"), yaml);
  controls.failClose = ""; await folder.save("flow.yaml", yaml, {}, current.updatedAt);
});

test("partial list write failures explain what was saved and permit a safe retry", async () => {
  const { folder, files, controls } = filesystem(); await folder.reload();
  controls.failWrite = "index.json";
  await assert.rejects(folder.save("flow.yaml", yaml, {}), /YAML은 저장했지만 index.json/);
  assert.ok(files.get("flow.yaml")?.includes("로그인"));
  assert.equal(files.get("index.json"), "");
  await assert.rejects(folder.save("other.yaml", yaml, {}), /이전 YAML/);
  controls.failWrite = "";
  await folder.save("flow.yaml", yaml, {});
  assert.equal(JSON.parse(files.get("index.json")!).scenarios.length, 1);
  assert.equal(folder.items.length, 1);
});

test("reload installs complete snapshots and handles removed entries without touching files", async () => {
  const { folder, files } = filesystem({ "index.json": index([{ file: "flow.yaml" }]), "flow.yaml": yaml });
  await folder.reload(); const before = folder.items;
  files.set("index.json", index([{ file: "missing.yaml" }]));
  await assert.rejects(folder.reload(), /파일을 찾을 수 없습니다/); assert.deepEqual(folder.items, before);
  files.set("index.json", index([])); await folder.reload();
  assert.deepEqual(folder.items, []); assert.equal(files.get("flow.yaml"), yaml);
});

test("workspace local editing routes to the folder, browser copies stay separate, and disconnect restores HTTP sources", async t => {
  const config = resolveConfiguration({ element: "#app", specUrl: "/demo/openapi.json", scenariosUrl: "/scenarios/index.json" }, catalog, "https://backend.test/");
  const data: StudioData = { version: 1, scenarios: [], globals: { token: "private" }, docInputs: {}, requestAuth: null };
  const workspace = new BrowserWorkspace(config, catalog, { read: async () => structuredClone(data), update: async change => change(data), close() {} });
  t.mock.method(globalThis, "fetch", async (url: string) => url.endsWith("index.json") ? Response.json({ version: 1, scenarios: [{ file: "remote.yaml" }] }) : new Response(yaml));
  await workspace.reloadProjectScenarios();
  const memory = filesystem({ "index.json": index([{ file: "flow.yaml" }]), "flow.yaml": yaml });
  const browser = await workspace.save(stringifyScenario({ ...parseScenario(yaml), id: "browser", name: "브라우저" }, true));
  await workspace.connectLocalFolder(memory.handle);
  const [local] = await workspace.bridge.listScenarios(config.project.id);
  assert.equal(local.localFile, "flow.yaml");
  const updated = await workspace.save(local.source.replace("로그인 후 항목 생성·조회", "로컬 수정"), local.updatedAt);
  assert.match(memory.files.get("flow.yaml")!, /로컬 수정/); assert.equal(updated.localFile, "flow.yaml");
  const created = await workspace.saveToLocalFolder(browser, "browser.yaml");
  assert.equal(created.name, "브라우저"); assert.equal(data.scenarios.length, 1);
  assert.doesNotMatch(memory.files.get("browser.yaml")!, /private/);
  await assert.rejects(workspace.bridge.deleteScenario(config.project.id, local.id, updated.updatedAt), /로컬 파일/);
  workspace.disconnectLocalFolder();
  const listed = await workspace.bridge.listScenarios(config.project.id);
  assert.ok(listed[0].sourceUrl); assert.deepEqual(listed[1], browser);
  await assert.rejects(workspace.save(updated.source, updated.updatedAt), /연결이 해제/);
});
