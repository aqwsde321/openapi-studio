import { test } from "node:test";
import assert from "node:assert/strict";
import { docInputFromRequest } from "../src/core/shared/doc-inputs";

test("docs inputs keep plain values and drop secrets (body keys stay, emptied)", () => {
  assert.deepEqual(docInputFromRequest({
    pathParams: { id: 7 }, query: { page: 2, accessToken: "q-secret", empty: "" },
    headers: { Authorization: "Bearer h-secret", "X-Trace": "abc", "x-api-key": "k-secret" }, cookies: { sessionId: "c-secret", theme: "dark" },
    body: { loginId: "tester", password: "b-secret", profile: { nick: "a", refreshToken: "r-secret" }, items: [{ otpCode: "1", qty: 2 }] },
  }), {
    pathParams: { id: 7 }, query: { page: 2 }, headers: { "X-Trace": "abc" }, cookies: { theme: "dark" },
    body: { loginId: "tester", password: "", profile: { nick: "a", refreshToken: "" }, items: [{ otpCode: "", qty: 2 }] },
  });
  assert.equal(docInputFromRequest({ headers: { Authorization: "Bearer x" }, query: {} }), undefined);
});
