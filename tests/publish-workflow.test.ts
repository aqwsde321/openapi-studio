import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import YAML from "yaml";

const { waitForVerifiedPackage, verifyPackedPackage } = createRequire(import.meta.url)("../.github/scripts/verified-package.cjs");
const owner = "aqwsde321";
const repo = "openapi-studio";
const sha = "a".repeat(40);
const otherSha = "b".repeat(40);

type Run = {
  id: number;
  head_sha: string;
  event: string;
  head_branch: string;
  head_repository: { full_name: string } | null;
  status: string;
  conclusion: string | null;
  run_attempt: number;
};
type Artifact = { id: number; name: string; expired: boolean };
type RunQuery = {
  owner: string; repo: string; workflow_id: string; event: string;
  branch: string; head_sha: string; per_page: number;
};
type ArtifactQuery = { owner: string; repo: string; run_id: number; per_page: number };

const run = (changes: Partial<Run> = {}): Run => ({
  id: 10, head_sha: sha, event: "push", head_branch: "main",
  head_repository: { full_name: `${owner}/${repo}` },
  status: "completed", conclusion: "success", run_attempt: 1, ...changes,
});
const artifact = (changes: Partial<Artifact> = {}): Artifact => ({
  id: 70, name: `npm-package-${sha}-1`, expired: false, ...changes,
});

function fakeActions(frames: Run[][], artifacts: Artifact[] = [artifact()]) {
  const runQueries: RunQuery[] = [];
  const artifactQueries: ArtifactQuery[] = [];
  const waits: number[] = [];
  const logs: string[] = [];
  let clock = 0;
  const listWorkflowRunArtifacts = async () => {
    throw new Error("Artifact listing must use paginate");
  };
  const github = {
    rest: { actions: {
      listWorkflowRuns: async (query: RunQuery) => {
        const index = runQueries.length;
        runQueries.push(query);
        return { data: { workflow_runs: frames[Math.min(index, frames.length - 1)] ?? [] } };
      },
      listWorkflowRunArtifacts,
    } },
    paginate: async (method: unknown, query: ArtifactQuery) => {
      assert.equal(method, listWorkflowRunArtifacts);
      artifactQueries.push(query);
      return artifacts;
    },
  };
  return {
    runQueries, artifactQueries, waits, logs,
    options: {
      github, owner, repo, sha, timeoutMs: 100, intervalMs: 10,
      now: () => clock,
      sleep: async (ms: number) => { assert.ok(ms > 0); waits.push(ms); clock += ms; },
      log: (message: string) => logs.push(message),
    },
  };
}

test("release selects only the exact SHA main push from this repository", async () => {
  const actions = fakeActions([[
    run({ head_repository: { full_name: "AQWSDE321/OpenAPI-Studio" } }),
    run({ id: 91, head_sha: otherSha, conclusion: "failure" }),
    run({ id: 92, head_branch: "feature/release", conclusion: "failure" }),
    run({ id: 93, event: "pull_request", conclusion: "failure" }),
    run({ id: 94, head_repository: { full_name: "fork/openapi-studio" }, conclusion: "failure" }),
    run({ id: 95, head_repository: null, conclusion: "failure" }),
  ]], [artifact({ id: 71, name: `npm-package-${otherSha}-1` }), artifact({ id: 72 })]);
  assert.deepEqual(await waitForVerifiedPackage(actions.options), { runId: 10, artifactId: 72 });
  assert.deepEqual(actions.runQueries, [{ owner, repo, workflow_id: "ci.yml", event: "push", branch: "main", head_sha: sha, per_page: 100 }]);
  assert.deepEqual(actions.artifactQueries, [{ owner, repo, run_id: 10, per_page: 100 }]);
  assert.deepEqual(actions.waits, []);
});

test("simultaneous main and tag pushes wait for CI to appear and finish", async () => {
  const actions = fakeActions([
    [], [run({ status: "queued", conclusion: null })],
    [run({ status: "in_progress", conclusion: null })], [run()],
  ]);
  assert.deepEqual(await waitForVerifiedPackage(actions.options), { runId: 10, artifactId: 70 });
  assert.equal(actions.runQueries.length, 4);
  assert.equal(actions.artifactQueries.length, 1);
  assert.deepEqual(actions.waits, [10, 10, 10]);
  assert.ok(actions.logs.some(message => message.includes("to start")));
});

test("the newest failed or cancelled main run blocks an older successful run immediately", async () => {
  for (const conclusion of ["failure", "cancelled"]) {
    const actions = fakeActions([[run(), run({ id: 20, conclusion })]]);
    await assert.rejects(waitForVerifiedPackage(actions.options), new RegExp(`Main CI 20 ended with ${conclusion}`));
    assert.deepEqual(actions.waits, []);
    assert.deepEqual(actions.artifactQueries, []);
  }
});

test("waiting has a finite deadline and does not sleep beyond it", async () => {
  const actions = fakeActions([[], [run({ status: "queued", conclusion: null })]]);
  await assert.rejects(waitForVerifiedPackage({ ...actions.options, timeoutMs: 25 }), /Timed out waiting for main CI/);
  assert.equal(actions.runQueries.length, 4);
  assert.deepEqual(actions.waits, [10, 10, 5]);
  assert.deepEqual(actions.artifactQueries, []);
});

test("a pending second CI attempt waits and selects only its new artifact", async () => {
  const actions = fakeActions([
    [run({ run_attempt: 2, status: "in_progress", conclusion: null })],
    [run({ run_attempt: 2 })],
  ], [artifact(), artifact({ id: 80, name: `npm-package-${sha}-2` })]);
  assert.deepEqual(await waitForVerifiedPackage(actions.options), { runId: 10, artifactId: 80 });
  assert.deepEqual(actions.waits, [10]);
  assert.equal(actions.artifactQueries.length, 1);
});

test("a failed second attempt cannot reuse the first attempt artifact", async () => {
  const actions = fakeActions([[run({ run_attempt: 2, conclusion: "failure" })]], [artifact()]);
  await assert.rejects(waitForVerifiedPackage(actions.options), /ended with failure/);
  assert.deepEqual(actions.waits, []);
  assert.deepEqual(actions.artifactQueries, []);
});

test("a successful second attempt without its own artifact cannot fall back to attempt one", async () => {
  const actions = fakeActions([[run({ run_attempt: 2 })]], [artifact()]);
  await assert.rejects(waitForVerifiedPackage(actions.options), /npm-package-.*-2 is missing or expired/);
  assert.deepEqual(actions.waits, []);
});

test("missing or expired verified artifacts stop publishing immediately", async () => {
  for (const artifacts of [[], [artifact({ expired: true })]]) {
    const actions = fakeActions([[run()]], artifacts);
    await assert.rejects(waitForVerifiedPackage(actions.options), /is missing or expired/);
    assert.deepEqual(actions.waits, []);
    assert.equal(actions.artifactQueries.length, 1);
  }
});

test("invalid release SHAs are rejected before any API request", async () => {
  for (const invalid of ["", "main", "a".repeat(39), "g".repeat(40)]) {
    const actions = fakeActions([[run()]]);
    await assert.rejects(waitForVerifiedPackage({ ...actions.options, sha: invalid }), /Invalid release commit SHA/);
    assert.deepEqual(actions.runQueries, []);
  }
});

const expectedPackage = { name: "openapi-studio", version: "0.1.4" };
const requiredFiles = [
  "README.md", "LICENSE", "dist/openapi-studio.standalone.js", "dist/openapi-studio.mermaid.js",
  "dist/openapi-studio.standalone.LICENSES.txt", "dist/openapi-studio.mermaid.LICENSES.txt",
  "dist/favicon.svg", "dist/favicon-32.png", "dist/apple-touch-icon.png",
];
function packedFixture(options: { manifest?: { name: string; version: string }; omit?: string; filename?: string } = {}) {
  const root = mkdtempSync(join(tmpdir(), "openapi-studio-packed-test-"));
  const source = join(root, "source");
  const directory = join(root, "artifact");
  mkdirSync(join(source, "package"), { recursive: true });
  mkdirSync(directory);
  try {
    writeFileSync(join(source, "package/package.json"), JSON.stringify(options.manifest ?? expectedPackage));
    for (const file of requiredFiles.filter(file => file !== options.omit)) {
      const path = join(source, "package", file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `fixture for ${file}`);
    }
    const tarball = join(directory, options.filename ?? "openapi-studio-0.1.4.tgz");
    execFileSync("tar", ["-czf", tarball, "-C", source, "package"]);
    return { directory, tarball, close: () => rmSync(root, { recursive: true, force: true }) };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

test("a complete verified tarball is returned unchanged for publication", () => {
  const fixture = packedFixture();
  try { assert.equal(verifyPackedPackage(fixture.directory, expectedPackage), fixture.tarball); }
  finally { fixture.close(); }
});

test("the packed manifest must match both release package name and version", () => {
  for (const manifest of [
    { name: "other-package", version: "0.1.4" },
    { name: "openapi-studio", version: "0.1.3" },
  ]) {
    const fixture = packedFixture({ manifest });
    try { assert.throws(() => verifyPackedPackage(fixture.directory, expectedPackage), /name\/version does not match/); }
    finally { fixture.close(); }
  }
});

test("published bundles, licenses and icon files must all be present", () => {
  for (const omit of requiredFiles) {
    const fixture = packedFixture({ omit });
    try {
      assert.throws(() => verifyPackedPackage(fixture.directory, expectedPackage), error =>
        error instanceof Error && error.message === `Verified package is missing ${omit}`);
    } finally { fixture.close(); }
  }
});

test("multiple downloaded files or an unexpected tarball filename are rejected", () => {
  const multiple = packedFixture();
  try {
    writeFileSync(join(multiple.directory, "other-0.1.4.tgz"), "unexpected second tarball");
    assert.throws(() => verifyPackedPackage(multiple.directory, expectedPackage), /Expected exactly one verified package/);
  } finally { multiple.close(); }
  const renamed = packedFixture({ filename: "openapi-studio-0.1.3.tgz" });
  try { assert.throws(() => verifyPackedPackage(renamed.directory, expectedPackage), /Expected exactly one verified package/); }
  finally { renamed.close(); }
});

test("only main CI builds and tests, while tag publishing consumes its verified package", () => {
  const ci = YAML.parse(readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"));
  const publish = YAML.parse(readFileSync(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8"));
  assert.deepEqual(ci.on, { push: { branches: ["main"] } });
  assert.deepEqual(publish.on, { push: { tags: ["v*"] } });
  const ciSteps = ci.jobs.verify.steps as Array<{ run?: string; uses?: string; with?: Record<string, unknown> }>;
  const e2e = ciSteps.findIndex(step => step.run === "npm run test:e2e");
  const pack = ciSteps.findIndex(step => step.run?.includes("npm pack --ignore-scripts"));
  assert.ok(e2e >= 0 && pack > e2e, "only a fully tested package can be stored");
  const upload = ciSteps.find(step => step.with?.name === "npm-package-${{ github.sha }}-${{ github.run_attempt }}");
  assert.ok(upload?.uses?.startsWith("actions/upload-artifact@"));
  assert.equal(upload?.with?.["if-no-files-found"], "error");
  const publishSteps = publish.jobs.publish.steps as Array<{ run?: string; uses?: string; with?: Record<string, unknown> }>;
  assert.ok(publishSteps.some(step => step.uses?.startsWith("actions/download-artifact@")));
  assert.ok(publishSteps.some(step => step.run?.includes('npm publish "$PACKAGE_TARBALL" --ignore-scripts')));
  assert.ok(!publishSteps.some(step => step.run && /npm ci|npm run build|npm test|playwright|npm run test:e2e/.test(step.run)));
  assert.equal(publish.permissions.actions, "read");
  assert.equal(publish.permissions["id-token"], "write");
});
