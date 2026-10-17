import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseScenario, stringifyScenario } from "../src/core/shared/scenario";
import { readOpenApi } from "../src/core/openapi";
import { resolveConfiguration } from "../src/browser/config";
import { loadProjectScenarios } from "../src/browser/project-scenarios";
import { BrowserWorkspace } from "../src/browser/workspace";
import type { StudioData } from "../src/browser/storage";

const manifestUrl = "https://backend.test/studio/api-scenarios/index.json";
const yaml = readFileSync(new URL("../demo/scenario.yaml", import.meta.url), "utf8");
const catalog = readOpenApi(readFileSync(new URL("../demo/openapi.json", import.meta.url), "utf8"));
const load = () => loadProjectScenarios(manifestUrl, "include", parseScenario, {}, new AbortController().signal);
function setup() {
  const data: StudioData = { version: 1, scenarios: [], globals: {}, docInputs: {}, requestAuth: null };
  const config = resolveConfiguration({ element: "#app", specUrl: "/demo/openapi.json", scenariosUrl: manifestUrl }, catalog, "https://backend.test/studio/");
  const workspace = new BrowserWorkspace(config, catalog, { read: async () => structuredClone(data), update: async change => change(data), close() {} });
  return { data, workspace };
}

test("scenario list URLs resolve against the page and reject unsupported addresses", () => {
  const options = { element: "#app", specUrl: "https://api.test/openapi.json", scenariosUrl: "./api-scenarios/index.json" };
  assert.equal(resolveConfiguration(options, catalog, "https://backend.test/studio/index.html").scenariosUrl, manifestUrl);
  for (const scenariosUrl of ["file:///tmp/index.json", "https://user:secret@backend.test/index.json", ""]) {
    assert.throws(() => resolveConfiguration({ ...options, scenariosUrl }, catalog, "https://backend.test/"), /시나리오/);
  }
});

test("project files load with metadata, stable URL identities and explicit browser credentials", async t => {
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    requests.push(url);
    assert.equal(init.credentials, "include"); assert.equal(init.cache, "no-store"); assert.equal(init.redirect, "error");
    assert.equal(new Headers(init.headers).has("Authorization"), false);
    return url === manifestUrl ? Response.json({ version: 1, scenarios: [{ file: "auth/login.yaml", groupPath: ["인증"], tags: ["회귀"] }, { file: "other.yaml" }] }) : new Response(yaml);
  });
  const first = await load(); const second = await load();
  assert.equal(first.length, 2); assert.deepEqual(first.map(item => item.id), second.map(item => item.id));
  assert.notEqual(first[0].id, first[1].id); // Identical YAML names must not collide.
  assert.equal(first[0].sourceUrl, "https://backend.test/studio/api-scenarios/auth/login.yaml");
  assert.deepEqual(first[0].groupPath, ["인증"]);
  assert.deepEqual(first[0].tags, ["회귀"]);
  assert.equal(parseScenario(first[0].source).id, first[0].id);
  assert.equal(requests.length, 6);
});

test("invalid manifests, duplicate files and off-folder paths fail before requesting YAML", async t => {
  for (const files of [["../outside.yaml"], ["https://other.test/file.yaml"], ["a.yaml?key=x"], ["a.yaml#x"], ["a.json"], ["a.yaml", "./a.yaml"]]) {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => { calls++; return Response.json({ version: 1, scenarios: files.map(file => ({ file })) }); });
    await assert.rejects(load()); assert.equal(calls, 1);
  }
  for (const manifest of [{ version: 2, scenarios: [] }, { version: 1, scenarios: Array.from({ length: 101 }, (_, i) => ({ file: `${i}.yaml` })) }, { version: 1, scenarios: [{ file: "a.yaml", unknown: true }] }]) {
    t.mock.method(globalThis, "fetch", async () => Response.json(manifest));
    await assert.rejects(load(), /목록을 읽지 못했습니다/);
  }
});

test("HTTP, malformed YAML, oversized files and aborted loads report failures", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("", { status: 401 }));
  await assert.rejects(load(), /HTTP 401/);
  for (const source of ["name: [broken", "x".repeat(1_000_001)]) {
    t.mock.method(globalThis, "fetch", async (url: string) => url === manifestUrl ? Response.json({ version: 1, scenarios: [{ file: "broken.yaml" }] }) : new Response(source));
    await assert.rejects(load(), /broken.yaml/);
  }
  const controller = new AbortController(); controller.abort();
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => { init.signal!.throwIfAborted(); return new Response(); });
  await assert.rejects(loadProjectScenarios(manifestUrl, "same-origin", parseScenario, {}, controller.signal));
});

test("refresh replaces project files atomically while browser copies remain editable", async t => {
  const { data, workspace } = setup();
  let files = ["a.yaml"]; let source = yaml; let broken = false;
  t.mock.method(globalThis, "fetch", async (url: string) => url === manifestUrl
    ? Response.json({ version: 1, scenarios: files.map(file => ({ file })) })
    : new Response(broken && url.endsWith("b.yaml") ? "name: [broken" : source));
  await workspace.reloadProjectScenarios();
  const [project] = await workspace.bridge.listScenarios(workspace.config.project.id);
  assert.equal(data.scenarios.length, 0);
  await assert.rejects(workspace.save(project.source), /원본 YAML/);
  await assert.rejects(workspace.bridge.deleteScenario(workspace.config.project.id, project.id, project.updatedAt), /원본 YAML/);
  const copy = await workspace.save(stringifyScenario({ ...workspace.normalize(project.source), id: "browser-copy", name: "브라우저 사본" }, true));
  files = ["a.yaml", "b.yaml"]; broken = true;
  await assert.rejects(workspace.reloadProjectScenarios(), /b.yaml/);
  assert.deepEqual((await workspace.bridge.listScenarios(workspace.config.project.id)).map(item => item.name), [project.name, "브라우저 사본"]);
  files = ["a.yaml"]; broken = false; source = yaml.replace("로그인 후 항목 생성·조회", "수정된 프로젝트");
  await workspace.reloadProjectScenarios();
  const updated = await workspace.bridge.listScenarios(workspace.config.project.id);
  assert.equal(updated[0].id, project.id); assert.equal(updated[0].name, "수정된 프로젝트");
  assert.deepEqual(updated[1], copy);
  files = []; await workspace.reloadProjectScenarios();
  assert.deepEqual(await workspace.bridge.listScenarios(workspace.config.project.id), [copy]);
  await workspace.bridge.deleteScenario(workspace.config.project.id, copy.id, copy.updatedAt);
  assert.equal(data.scenarios.length, 0);
});

test("bundled authoring examples and guide YAML match the supported format", async () => {
  const source = readFileSync(new URL("../templates/api-scenarios/login-and-create.example.yaml", import.meta.url), "utf8");
  assert.equal(parseScenario(source).steps.length, 3);
  const { workspace } = setup();
  assert.deepEqual((await workspace.preview(source)).issues, []);
  const guide = readFileSync(new URL("../docs/scenarios.md", import.meta.url), "utf8");
  const snippets = [...guide.matchAll(/```yaml\n([\s\S]*?)```/g)];
  assert.equal(snippets.length, 3);
  for (const [, snippet] of snippets) assert.ok(parseScenario(snippet).steps.length);
  const empty = JSON.parse(readFileSync(new URL("../templates/api-scenarios/index.json", import.meta.url), "utf8"));
  assert.deepEqual(empty, { version: 1, scenarios: [] });
});
