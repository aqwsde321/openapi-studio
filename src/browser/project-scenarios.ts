import { z } from "zod";
import { stringifyScenario, type Scenario } from "../core/shared/scenario";
import type { SavedApiScenario } from "../core/shared/workspace";

const manifestSchema = z.object({
  version: z.literal(1),
  scenarios: z.array(z.object({
    file: z.string().min(1),
    groupPath: z.array(z.string().trim().min(1)).optional(),
    tags: z.array(z.string().trim().min(1)).optional(),
  }).strict()).max(100),
}).strict();

/** Project files are a read-only snapshot, separate from browser-owned scenarios. */
export async function loadProjectScenarios(
  manifestUrl: string,
  credentials: RequestCredentials,
  normalize: (source: string) => Scenario,
  serverNames: Record<string, string>,
  signal: AbortSignal,
): Promise<SavedApiScenario[]> {
  const read = async (url: string) => {
    const response = await fetch(url, { credentials, cache: "no-store", redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const source = await response.text();
    if (new TextEncoder().encode(source).byteLength > 1_000_000) throw new Error("파일은 1MB 이하로 제공하세요");
    return source;
  };
  let manifest: z.infer<typeof manifestSchema>;
  try { manifest = manifestSchema.parse(JSON.parse(await read(manifestUrl))); }
  catch (error) { throw new Error(`프로젝트 시나리오 목록을 읽지 못했습니다: ${error instanceof Error ? error.message : String(error)}`); }
  const directory = new URL(".", manifestUrl);
  const seen = new Set<string>();
  const entries = manifest.scenarios.map(entry => {
    const url = new URL(entry.file, directory);
    if (url.origin !== directory.origin || !url.pathname.startsWith(directory.pathname) || url.username || url.password || url.search || url.hash || !/\.ya?ml$/i.test(url.pathname))
      throw new Error(`${entry.file}: 목록과 같은 폴더 또는 하위 폴더의 YAML 파일을 지정하세요`);
    if (seen.has(url.href)) throw new Error(`${entry.file}: 중복된 시나리오 파일입니다`);
    seen.add(url.href);
    return { ...entry, url: url.href };
  });
  const items: SavedApiScenario[] = [];
  for (const entry of entries) {
    try {
      const scenario = normalize(await read(entry.url));
      const id = `project:${entry.url}`;
      items.push({
        id, name: scenario.name, source: stringifyScenario({ ...scenario, id }, true, undefined, serverNames),
        sourceUrl: entry.url, bindings: {}, updatedAt: new Date().toISOString(),
        groupPath: entry.groupPath, tags: entry.tags,
      });
    } catch (error) { throw new Error(`${entry.file}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  return items;
}
