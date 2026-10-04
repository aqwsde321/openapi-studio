const { execFileSync } = require('node:child_process');
const { readFileSync, readdirSync } = require('node:fs');
const { resolve } = require('node:path');

async function waitForVerifiedPackage({
  github, owner, repo, sha, log = () => {},
  timeoutMs = 10 * 60 * 1000, intervalMs = 15 * 1000,
  now = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid release commit SHA');
  const deadline = now() + timeoutMs;
  while (true) {
    const { data } = await github.rest.actions.listWorkflowRuns({
      owner, repo, workflow_id: 'ci.yml', event: 'push', branch: 'main', head_sha: sha, per_page: 100,
    });
    const run = data.workflow_runs
      .filter((item) => item.head_sha === sha && item.event === 'push' && item.head_branch === 'main'
        && item.head_repository?.full_name?.toLowerCase() === `${owner}/${repo}`.toLowerCase())
      .sort((a, b) => b.id - a.id)[0];
    if (run?.status === 'completed') {
      if (run.conclusion !== 'success') {
        throw new Error(`Main CI ${run.id} ended with ${run.conclusion}; rerun CI before publishing`);
      }
      const name = `npm-package-${sha}-${run.run_attempt}`;
      const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, {
        owner, repo, run_id: run.id, per_page: 100,
      });
      const artifact = artifacts.find((item) => item.name === name && !item.expired);
      if (!artifact) {
        throw new Error(`Verified package ${name} is missing or expired; rerun main CI, then rerun Publish`);
      }
      log(`Using package ${artifact.id} from successful main CI ${run.id}, attempt ${run.run_attempt}`);
      return { runId: run.id, artifactId: artifact.id };
    }
    if (now() >= deadline) {
      throw new Error(`Timed out waiting for main CI at ${sha}; push this commit to main and rerun Publish after CI succeeds`);
    }
    log(run ? `Waiting for main CI ${run.id} (${run.status})` : `Waiting for main CI to start at ${sha}`);
    await sleep(Math.max(0, Math.min(intervalMs, deadline - now())));
  }
}

function verifyPackedPackage(directory, expected) {
  const files = readdirSync(directory);
  const filename = `${expected.name}-${expected.version}.tgz`;
  if (files.length !== 1 || files[0] !== filename) {
    throw new Error(`Expected exactly one verified package: ${filename}`);
  }
  const tarball = resolve(directory, filename);
  const manifest = JSON.parse(execFileSync('tar', ['-xOf', tarball, 'package/package.json'], { encoding: 'utf8' }));
  if (manifest.name !== expected.name || manifest.version !== expected.version) {
    throw new Error('Packed package name/version does not match the release tag');
  }
  const entries = new Set(execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).trim().split('\n'));
  for (const file of [
    'README.md', 'LICENSE', 'dist/openapi-studio.standalone.js', 'dist/openapi-studio.mermaid.js',
    'dist/openapi-studio.standalone.LICENSES.txt', 'dist/openapi-studio.mermaid.LICENSES.txt',
    'dist/favicon.svg', 'dist/favicon-32.png', 'dist/apple-touch-icon.png',
  ]) {
    if (!entries.has(`package/${file}`)) throw new Error(`Verified package is missing ${file}`);
  }
  return tarball;
}

module.exports = { waitForVerifiedPackage, verifyPackedPackage };

if (require.main === module) {
  const expected = JSON.parse(readFileSync('package.json', 'utf8'));
  console.log(`tarball=${verifyPackedPackage(process.argv[2], expected)}`);
}
