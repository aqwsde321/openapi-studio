import assert from "node:assert/strict";
import test from "node:test";
import type { Scenario } from "../src/core/shared/scenario";
import type { SavedApiScenario } from "../src/core/shared/workspace";
import { filterScenarios, parseRunInputs, scenarioGroupPaths } from "../src/ui/pages/api-testing/model/scenario-workspace";

function saved(id: string, name: string, source: string, groupPath?: string[]): SavedApiScenario {
  return { id, name, source, groupPath, bindings: {}, updatedAt: "2026-10-04T00:00:00.000Z" };
}
const baseUrl = "https://backend.example.test/gateway/api";
const orders = saved("orders", "사용자 주문 확인", "name: 사용자 주문 확인\ndescription: 취소된 주문도 확인\nserver: backend\nsteps:\n  - api: GET /users/{userId}/orders\n", ["회원", "주문"]);
const create = saved("create", "새 주문", "name: 새 주문\nserver: backend\nsteps:\n  - api: POST /users/{userId}/orders\n", ["회원", "주문"]);
const invalid = { ...saved("draft", "미완성 초안", "name: [broken", ["관리", "검토"]), draft: true };

test("scenario search matches a pasted request through a gateway and explains the hidden API", () => {
  const found = filterScenarios([orders, create, invalid], "GET https://backend.example.test/gateway/api/users/7/orders?page=2", baseUrl);
  assert.deepEqual(found.items, [orders]);
  assert.equal(found.reasons.get("orders"), "API GET /users/{userId}/orders");
  assert.deepEqual(filterScenarios([orders, create], "/gateway/api/users/7/orders", baseUrl).items, [orders, create]);
  assert.deepEqual(filterScenarios([orders, create], "DELETE /users/7/orders", baseUrl).items, []);
});

test("name and group searches need every word, while descriptions produce a useful reason", () => {
  const grouped = filterScenarios([orders, create, invalid], "회원 확인", baseUrl);
  assert.deepEqual(grouped.items, [orders]);
  assert.equal(grouped.reasons.size, 0);
  const described = filterScenarios([orders, create, invalid], "취소", baseUrl);
  assert.deepEqual(described.items, [orders]);
  assert.equal(described.reasons.get("orders"), "설명");
  assert.deepEqual(filterScenarios([orders, create], "회원 없는단어", baseUrl).items, []);
});

test("invalid drafts remain searchable by their listed name and group, and an empty query keeps them", () => {
  assert.deepEqual(filterScenarios([orders, invalid], "검토 초안", baseUrl).items, [invalid]);
  assert.deepEqual(filterScenarios([orders, invalid], "GET /users/7/orders", baseUrl).items, [orders]);
  const all = filterScenarios([orders, invalid], "   ", baseUrl);
  assert.deepEqual(all.items, [orders, invalid]);
  assert.equal(all.reasons.size, 0);
});

test("multiple hidden API matches are deduplicated and their reason stays short", () => {
  const workflow = saved("flow", "전체 처리", "name: 전체 처리\ndescription: 상태를 확인\nserver: backend\nsteps:\n  - api: GET /status/a\n  - api: GET /status/a\n  - api: GET /status/b\n  - api: GET /status/c\n");
  const found = filterScenarios([workflow], "상태 status", baseUrl);
  assert.deepEqual(found.items, [workflow]);
  assert.equal(found.reasons.get("flow"), "설명 · API GET /status/a, GET /status/b 외 1개");
});

test("group choices contain each complete prefix once and do not alter saved metadata", () => {
  const items = [
    saved("a", "a", "", ["B", "Z"]), saved("b", "b", "", ["A", "X", "Y"]),
    saved("c", "c", "", ["A", "X"]), saved("d", "d", ""),
  ];
  const groups = scenarioGroupPaths(items);
  assert.deepEqual(groups, [["A"], ["A", "X"], ["A", "X", "Y"], ["B"], ["B", "Z"]]);
  groups[0].push("changed");
  assert.deepEqual(items[1].groupPath, ["A", "X", "Y"]);
  assert.deepEqual(scenarioGroupPaths([]), []);
});

test("run inputs preserve strings, parse JSON types and ignore undefined or blank optional inputs", () => {
  const definitions: Scenario["inputs"] = {
    title: { type: "string", required: true }, count: { type: "number", required: true },
    enabled: { type: "boolean", required: true }, body: { type: "object", required: true },
    ids: { type: "array", required: true }, optionalText: { type: "string", required: false },
    optionalNumber: { type: "number", required: false }, missing: { type: "object", required: false },
  };
  assert.deepEqual(parseRunInputs(definitions, {
    title: "  true  ", count: " 1.5 ", enabled: "false", body: '{"id":1,"extra":null}',
    ids: '[1,"2",null]', optionalText: " \t ", optionalNumber: "", unrelated: "ignored",
  }), { title: "  true  ", count: 1.5, enabled: false, body: { id: 1, extra: null }, ids: [1, "2", null] });
  assert.deepEqual(parseRunInputs({ zero: { type: "number", required: true }, emptyList: { type: "array", required: true }, emptyObject: { type: "object", required: true } }, { zero: "0", emptyList: "[]", emptyObject: "{}" }), { zero: 0, emptyList: [], emptyObject: {} });
});

test("required absent or whitespace inputs fail with their name or available label", () => {
  const definitions: Scenario["inputs"] = { amount: { type: "number", required: true } };
  for (const text of [undefined, "", " \t\n "]) {
    assert.throws(() => parseRunInputs(definitions, text === undefined ? {} : { amount: text }), /amount: 필수 입력값/);
  }
  const labeled = { code: { type: "string" as const, required: true, label: "인증번호" } };
  assert.throws(() => parseRunInputs(labeled, { code: " " }), /인증번호: 필수 입력값/);
});

test("JSON syntax, mismatched scalar/container types and non-finite numbers fail before execution", () => {
  const cases: Array<[Scenario["inputs"][string]["type"], string]> = [
    ["number", "NaN"], ["number", '"1"'], ["number", "true"], ["number", "null"],
    ["boolean", "0"], ["boolean", '"false"'], ["object", "[]"], ["object", "null"],
    ["array", "{}"], ["array", "null"], ["object", "{broken"],
  ];
  for (const [type, text] of cases) {
    assert.throws(() => parseRunInputs({ value: { type, required: true } }, { value: text }), /value: /, `${type}: ${text}`);
  }
  for (const [type, text] of [["number", "1e400"], ["object", '{"count":1e400}'], ["array", "[1e400]"]] as const) {
    assert.throws(() => parseRunInputs({ value: { type, required: true } }, { value: text }), /value: 유한한 숫자/);
  }
});
