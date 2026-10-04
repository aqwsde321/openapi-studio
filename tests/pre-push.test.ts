import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

const hook = readFileSync(new URL("../.githooks/pre-push", import.meta.url), "utf8");
const installer = readFileSync(new URL("../scripts/install-hooks.mjs", import.meta.url), "utf8");

function fixture(t: TestContext, install = true) {
  const root = mkdtempSync(join(tmpdir(), "studio-pre-push-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const work = join(root, "work");
  const remote = join(root, "remote.git");
  const bin = join(root, "bin");
  const log = join(root, "npm.log");
  mkdirSync(work);
  mkdirSync(bin);
  const env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(root, "empty-global.gitconfig"),
    CI: "", OPENAPI_STUDIO_E2E_PORT: "", HOOK_TEST_LOG: log, HOOK_NPM_MODE: "" };
  const git = (...args: string[]) => {
    const result = spawnSync("git", args, { cwd: work, env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim();
  };
  git("init", "--bare", "--template=", remote);
  git("init", "--template=", "-b", "main");
  git("config", "user.name", "Hook Test");
  git("config", "user.email", "hook-test@example.invalid");
  mkdirSync(join(work, ".githooks"));
  mkdirSync(join(work, "scripts"));
  writeFileSync(join(work, ".githooks/pre-push"), hook, { mode: 0o755 });
  writeFileSync(join(work, "scripts/install-hooks.mjs"), installer);
  writeFileSync(join(work, "tracked.txt"), "original\n");
  git("add", ".");
  git("commit", "-m", "initial");
  git("remote", "add", "origin", remote);
  if (install) git("config", "--local", "core.hooksPath", ".githooks");
  writeFileSync(join(bin, "npm"), `#!/bin/sh
set -eu
printf '%s|%s|%s\\n' "$*" "\${CI-}" "\${OPENAPI_STUDIO_E2E_PORT-}" >> "$HOOK_TEST_LOG"
if [ "$*" = "run build" ] && [ "\${HOOK_NPM_MODE-}" = "fail-build" ]; then exit 1; fi
if [ "$*" = "run test:e2e" ]; then
  case "\${HOOK_NPM_MODE-}" in
    fail-e2e) exit 1 ;;
    edit-source) printf 'changed\\n' >> tracked.txt ;;
    move-head) git commit --allow-empty -m 'changed during tests' >/dev/null ;;
  esac
fi
`, { mode: 0o755 });
  const push = (...args: string[]) => spawnSync("git", ["push", "origin", ...args], { cwd: work, env, encoding: "utf8" });
  const calls = () => {
    try { return readFileSync(log, "utf8").trim().split("\n"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  };
  const remoteRef = (ref = "refs/heads/main") => spawnSync("git", ["--git-dir", remote, "rev-parse", "--verify", ref], { env, encoding: "utf8" });
  const runInstaller = () => spawnSync(process.execPath, ["scripts/install-hooks.mjs"], { cwd: work, env, encoding: "utf8" });
  return { work, env, git, push, calls, remoteRef, runInstaller };
}

test("pre-push verifies HEAD once for a branch and its annotated release tag", t => {
  const f = fixture(t);
  const head = f.git("rev-parse", "HEAD");
  f.git("tag", "-a", "v1.0.0", "-m", "release");
  const result = f.push("main", "v1.0.0");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(f.calls(), ["run build||", "run test:e2e|1|5185"]);
  assert.equal(f.remoteRef().stdout.trim(), head);
  assert.equal(f.remoteRef("refs/tags/v1.0.0^{commit}").stdout.trim(), head);
});

test("pre-push blocks both build and E2E failures before updating the remote", async t => {
  for (const mode of ["fail-build", "fail-e2e"]) await t.test(mode, child => {
    const f = fixture(child);
    f.env.HOOK_NPM_MODE = mode;
    assert.notEqual(f.push("main").status, 0);
    assert.notEqual(f.remoteRef().status, 0);
    assert.deepEqual(f.calls(), mode === "fail-build" ? ["run build||"] : ["run build||", "run test:e2e|1|5185"]);
  });
});

test("pre-push rejects tracked, staged, and untracked source changes without running tests", async t => {
  for (const kind of ["tracked", "staged", "index-only", "untracked"]) await t.test(kind, child => {
    const f = fixture(child);
    writeFileSync(join(f.work, kind === "untracked" ? "new-source.txt" : "tracked.txt"), "changed\n");
    if (kind === "staged" || kind === "index-only") f.git("add", "tracked.txt");
    if (kind === "index-only") writeFileSync(join(f.work, "tracked.txt"), "original\n");
    const result = f.push("main");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /push할 커밋과 테스트 소스가 달라졌습니다/);
    assert.deepEqual(f.calls(), []);
    assert.notEqual(f.remoteRef().status, 0);
  });
});

test("pre-push rejects a ref whose commit is not the checked out HEAD", t => {
  const f = fixture(t);
  const oldHead = f.git("rev-parse", "HEAD");
  f.git("commit", "--allow-empty", "-m", "new head");
  const result = f.push(`${oldHead}:refs/heads/older`);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /push할 커밋을 checkout한 뒤/);
  assert.deepEqual(f.calls(), []);
  assert.notEqual(f.remoteRef("refs/heads/older").status, 0);
});

test("pre-push skips deletion-only pushes even when the working tree is dirty", t => {
  const f = fixture(t);
  f.git("push", "--no-verify", "origin", "HEAD:refs/heads/removable");
  writeFileSync(join(f.work, "tracked.txt"), "changed\n");
  const result = f.push("--delete", "removable");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(f.calls(), []);
  assert.notEqual(f.remoteRef("refs/heads/removable").status, 0);
});

test("pre-push rechecks source and HEAD after E2E before permitting the push", async t => {
  for (const mode of ["edit-source", "move-head"]) await t.test(mode, child => {
    const f = fixture(child);
    f.env.HOOK_NPM_MODE = mode;
    const result = f.push("main");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /push할 커밋과 테스트 소스가 달라졌습니다/);
    assert.deepEqual(f.calls(), ["run build||", "run test:e2e|1|5185"]);
    assert.notEqual(f.remoteRef().status, 0);
  });
});

test("hook installer is idempotent and makes the installed hook executable", t => {
  const f = fixture(t, false);
  chmodSync(join(f.work, ".githooks/pre-push"), 0o644);
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = f.runInstaller();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(f.git("config", "--local", "--get", "core.hooksPath"), ".githooks");
    assert.ok(statSync(join(f.work, ".githooks/pre-push")).mode & 0o111);
  }
});

test("hook installer preserves both a configured hooks directory and default user hooks", async t => {
  for (const kind of ["configured", "default"]) await t.test(kind, child => {
    const f = fixture(child, false);
    if (kind === "configured") f.git("config", "--local", "core.hooksPath", "existing-hooks");
    else {
      mkdirSync(join(f.work, ".git/hooks"), { recursive: true });
      writeFileSync(join(f.work, ".git/hooks/pre-commit"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    }
    const result = f.runInstaller();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /기존.*훅|기존 core.hooksPath/);
    if (kind === "configured") assert.equal(f.git("config", "--local", "--get", "core.hooksPath"), "existing-hooks");
    else {
      const setting = spawnSync("git", ["config", "--local", "--get", "core.hooksPath"], { cwd: f.work, env: f.env, encoding: "utf8" });
      assert.equal(setting.status, 1);
      assert.equal(readFileSync(join(f.work, ".git/hooks/pre-commit"), "utf8"), "#!/bin/sh\nexit 0\n");
    }
  });
});
