import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchSpec } from "../src/browser/spec-auth";

const url = "https://backend.test/openapi.json";
test("public specifications use browser credentials without requesting an account", async t => {
  const requests: RequestInit[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => { requests.push(options); return new Response("{}"); });
  assert.equal(await (await fetchSpec(url, "include", async () => { assert.fail("unexpected login"); })).text(), "{}");
  assert.deepEqual(requests, [{ credentials: "include" }]);
});
test("Basic authentication retries failed accounts and encodes Unicode credentials", async t => {
  const requests: RequestInit[] = [];
  t.mock.method(globalThis, "fetch", async (target: string, options: RequestInit) => {
    assert.equal(target, url); requests.push(options);
    return requests.length < 3 ? new Response("", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="docs", charset="UTF-8"' } }) : new Response("{}");
  });
  const prompts: boolean[] = [];
  await fetchSpec(url, "same-origin", async request => { assert.equal(request.url, url); prompts.push(request.failed); return { username: "사용자", password: "비밀번호" }; });
  assert.deepEqual(prompts, [false, true]);
  assert.equal(new Headers(requests[2].headers).get("Authorization"), `Basic ${Buffer.from("사용자:비밀번호").toString("base64")}`);
  assert.equal(requests[2].redirect, "error");
});
test("unexposed challenges allow an account but explicit Bearer challenges do not", async t => {
  let attempts = 0;
  t.mock.method(globalThis, "fetch", async () => ++attempts === 1 ? new Response("", { status: 401 }) : new Response("{}"));
  await fetchSpec(url, "same-origin", async () => ({ username: "docs", password: "secret" }));
  t.mock.method(globalThis, "fetch", async () => new Response("", { status: 401, headers: { "WWW-Authenticate": "Bearer" } }));
  await assert.rejects(fetchSpec(url, "same-origin", async () => { assert.fail("unexpected Basic login"); }), /HTTP 401/);
});
test("cancel and forbidden responses do not send an account", async t => {
  let attempts = 0;
  t.mock.method(globalThis, "fetch", async () => { attempts++; return new Response("", { status: 401 }); });
  await assert.rejects(fetchSpec(url, "same-origin", async () => null), /취소/);
  assert.equal(attempts, 1);
  t.mock.method(globalThis, "fetch", async () => new Response("", { status: 403 }));
  await assert.rejects(fetchSpec(url, "same-origin", async () => { assert.fail("unexpected login"); }), /HTTP 403/);
});
test("invalid usernames and redirects fail without another account prompt", async t => {
  let attempts = 0;
  t.mock.method(globalThis, "fetch", async () => { attempts++; return new Response("", { status: 401 }); });
  await assert.rejects(fetchSpec(url, "same-origin", async () => ({ username: "docs:admin", password: "secret" })), /콜론/);
  assert.equal(attempts, 1);
  attempts = 0;
  t.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    if (++attempts === 1) return new Response("", { status: 401 });
    assert.equal(options.redirect, "error"); throw new TypeError("redirect blocked");
  });
  await assert.rejects(fetchSpec(url, "same-origin", async () => ({ username: "docs", password: "secret" })), /redirect blocked/);
  assert.equal(attempts, 2);
});
