import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const hooks = resolve(root, ".githooks");
const configured = spawnSync("git", ["config", "--get", "core.hooksPath"], { cwd: root, encoding: "utf8" });
if (configured.status !== 0 && configured.status !== 1) throw new Error(configured.stderr || "Git 훅 설정을 읽지 못했습니다.");
const current = configured.stdout.trim();
if (current && resolve(root, current) !== hooks) {
  throw new Error(`기존 core.hooksPath(${current})가 있어 설치를 중단했습니다. 기존 훅을 먼저 통합하세요.`);
}
if (!current) {
  const defaults = resolve(root, git("rev-parse", "--git-path", "hooks"));
  if (existsSync(defaults) && readdirSync(defaults).some(name =>
    !name.endsWith(".sample") && statSync(resolve(defaults, name)).isFile() && (statSync(resolve(defaults, name)).mode & 0o111))) {
    throw new Error("기존 .git/hooks의 사용자 훅이 있어 설치를 중단했습니다. 기존 훅을 먼저 통합하세요.");
  }
}
chmodSync(resolve(hooks, "pre-push"), 0o755);
git("config", "--local", "core.hooksPath", ".githooks");
console.log("pre-push 훅 적용 완료: push 전에 빌드와 E2E를 실행합니다.");
