import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readOpenApi } from "../src/core/openapi";
import { jsonEqual } from "../src/core/json-equal";
import { resolveConfiguration } from "../src/browser/config";
import { BrowserWorkspace } from "../src/browser/workspace";
import { buildSpec } from "../src/ui/pages/api-testing/lib/swagger-request";
import type { StudioData } from "../src/browser/storage";

const catalog = readOpenApi(readFileSync(new URL("../demo/openapi.json", import.meta.url), "utf8"));
function memoryStorage() {
  const data: StudioData = { version: 1, scenarios: [], globals: {}, docInputs: {}, requestAuth: null };
  return { data, read: async () => structuredClone(data), update: async <T>(change: (data: StudioData) => T) => change(data), close() {} };
}
test("JSON equality ignores property insertion order without changing array/scalar semantics", () => {
  assert.equal(jsonEqual({ a: 1, b: [null, true] }, { b: [null, true], a: 1 }), true);
  assert.equal(jsonEqual([1,2], [2,1]), false);
  assert.equal(jsonEqual(1, "1"), false);
  assert.equal(jsonEqual({ a: null }, {}), false);
});
test("backend base path, relative servers, variables and override resolve consistently", () => {
  const config = resolveConfiguration({ element: "#app", specUrl: "/docs/openapi.json" }, catalog, "https://backend.test/ui");
  assert.equal(config.baseUrl, "https://backend.test/demo-api");
  const next = { ...catalog, spec: { servers: [{ url: "../{base}", variables: { base: { default: "api" } } }], paths: {} } };
  assert.equal(resolveConfiguration({ element: "#app", specUrl: "/docs/openapi.json" }, next, "https://backend.test/ui").baseUrl, "https://backend.test/api");
  assert.equal(resolveConfiguration({ element: "#app", specUrl: "/docs/openapi.json", baseUrl: "/custom" }, next, "https://backend.test/ui").baseUrl, "https://backend.test/custom");
  assert.throws(() => resolveConfiguration({ element: "#app", specUrl: "/docs", baseUrl: "javascript:alert(1)" }, next, "https://backend.test/ui"));
});
test("operation servers are rejected unless backend override is explicit", () => {
  const next = { ...catalog, spec: { paths: { "/other": { get: { servers: [{ url: "https://other.test" }] } } } } };
  assert.throws(() => resolveConfiguration({ element: "#app", specUrl: "/docs" }, next, "https://backend.test/ui"), /baseUrl/);
});
test("an explicit backend also governs Swagger server selectors without mutating the catalog", () => {
  const spec = { ...catalog.spec as Record<string, unknown>, paths: {
    "/other": { servers: [{ url: "https://path.test" }], get: { servers: [{ url: "https://operation.test" }], responses: { "200": { description: "OK" } } } },
  } };
  const next = { ...catalog, spec };
  const config = resolveConfiguration({ element: "#app", specUrl: "/docs", baseUrl: "/custom" }, next, "https://backend.test/ui");
  const shown = buildSpec(next, config.baseUrl);
  assert.deepEqual(shown.servers, [{ url: "https://backend.test/custom" }]);
  const paths = shown.paths as typeof spec.paths;
  assert.equal(paths["/other"].servers, undefined);
  assert.equal(paths["/other"].get.servers, undefined);
  assert.deepEqual(spec.paths["/other"].get.servers, [{ url: "https://operation.test" }]);
});
test("tokens produced by an earlier login are not blocked by a stale saved value", async () => {
  const storage = memoryStorage(); storage.data.globals.accessToken = { obsolete: true };
  const config = resolveConfiguration({ element: "#app", specUrl: "/demo/openapi.json" }, catalog, "https://backend.test/ui");
  const workspace = new BrowserWorkspace(config, catalog, storage);
  const source = readFileSync(new URL("../demo/scenario.yaml", import.meta.url), "utf8");
  const preview = await workspace.preview(source);
  assert.deepEqual(preview.issues, []); assert.deepEqual(preview.executionIssues, []);
  assert.equal(preview.scenario.valueBindings.length, 1);
});
test("separate backends in YAML cannot be silently routed into the embedded backend", async () => {
  const workspace = new BrowserWorkspace(resolveConfiguration({ element: "#app", specUrl: "/demo/openapi.json" }, catalog, "https://backend.test/ui"), catalog, memoryStorage());
  await assert.rejects(workspace.preview("name: wrong\nsteps:\n  - { server: first, api: POST /auth/login }\n  - { server: second, api: POST /auth/login }\n"), /여러 서버/);
});
test("YAML save preserves portable server names and rejects stale editor overwrites", async () => {
  const workspace = new BrowserWorkspace(resolveConfiguration({ element: "#app", specUrl: "/demo/openapi.json" }, catalog, "https://backend.test/ui"), catalog, memoryStorage());
  const source = "id: same\nname: login\nserver: backend\nsteps:\n  - api: POST /auth/login\n";
  const first = await workspace.save(source);
  assert.match(first.source, /server: backend/);
  await assert.rejects(workspace.save(source), /변경되었습니다/);
  const second = await workspace.save(source, first.updatedAt);
  assert.notEqual(second.updatedAt, first.updatedAt);
  await assert.rejects(workspace.bridge.deleteScenario(workspace.config.scope.projectId, second.id, first.updatedAt));
});
test("browser-managed cookie parameters do not block login followed by a cookie request", async () => {
  const workspace = new BrowserWorkspace(resolveConfiguration({ element: "#app", specUrl: "/demo/openapi.json" }, catalog, "https://backend.test/ui"), catalog, memoryStorage());
  assert.deepEqual((await workspace.preview("name: session\nserver: backend\nsteps:\n  - api: POST /auth/login\n  - api: GET /session\n")).issues, []);
  assert.match((await workspace.preview("name: manual\nserver: backend\nsteps:\n  - api: GET /session\n    cookies: { custom: value }\n")).issues.join("\n"), /직접 쿠키/);
});
test("failed extraction cannot rewrite a global edited in another tab", async t => {
  const storage = memoryStorage(); storage.data.globals.accessToken = "old";
  const workspace = new BrowserWorkspace(resolveConfiguration({ element: "#app", specUrl: "/demo/openapi.json" }, catalog, "https://backend.test/ui"), catalog, storage);
  t.mock.method(globalThis, "fetch", async () => {
    storage.data.globals.accessToken = "changed-in-another-tab";
    return new Response("{}", { status: 200 });
  });
  const scenario = workspace.normalize("name: extraction\nserver: backend\nsteps:\n  - api: POST /auth/login\n    extract: [{ pointer: /missing, target: globals.accessToken }]\n");
  assert.equal((await workspace.run(scenario, {})).status, "failed");
  assert.equal(storage.data.globals.accessToken, "changed-in-another-tab");
});
