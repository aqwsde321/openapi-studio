import type { ApiSidebarMetadata, SavedApiScenario } from "../core/shared/workspace";
import { stringifyScenario, type Scenario } from "../core/shared/scenario";
import { manifestSchema } from "./project-scenarios";

type Writer = { write(data: string): Promise<void>; close(): Promise<void>; abort(): Promise<void> };
type LocalFile = { getFile(): Promise<{ size: number; text(): Promise<string> }>; createWritable(): Promise<Writer> };
export type LocalDirectory = {
  name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<LocalFile>;
  getDirectoryHandle(name: string): Promise<LocalDirectory>;
};
type Manifest = ReturnType<typeof manifestSchema.parse>;
const emptyManifest = (): Manifest => ({ version: 1, scenarios: [] });
const conflict = () => new Error("로컬 파일이 다른 곳에서 변경되었습니다. 폴더를 다시 불러온 뒤 수정하세요. 현재 편집 내용은 YAML로 보관할 수 있습니다.");
const missing = (error: unknown) => error instanceof Error && error.name === "NotFoundError";

export function supportsLocalFolders(): boolean {
  return window.isSecureContext && typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
}
export async function pickLocalFolder(): Promise<LocalDirectory> {
  if (!supportsLocalFolders()) throw new Error("이 브라우저에서는 폴더 연결을 사용할 수 없습니다. 지원 브라우저의 localhost 또는 HTTPS에서 열거나 YAML 내보내기를 사용하세요.");
  return (window as Window & { showDirectoryPicker?: (options: { id: string; mode: "readwrite" }) => Promise<LocalDirectory> })
    .showDirectoryPicker!({ id: "openapi-studio-scenarios", mode: "readwrite" });
}

function localPath(file: string): string[] {
  const parts = file.split("/");
  if (!/\.ya?ml$/i.test(file) || parts.some(part => !part || part === "." || part === ".." || /[\\:%?#<>"*|\x00-\x1f]/.test(part)))
    throw new Error("같은 폴더 또는 하위 폴더의 YAML 상대 경로를 사용하세요");
  return parts;
}
export function newLocalFilename(file: string): string {
  if (localPath(file).length !== 1 || file.trim() !== file) throw new Error("새 시나리오는 폴더 경로 없이 파일명.yaml로 저장하세요");
  return file;
}

/** The chosen directory is held only for this tab. No permission or path is silently restored. */
export class LocalScenarioFolder {
  private manifest: Manifest = emptyManifest();
  private manifestSource: string | null = null;
  private originals = new Map<string, string>();
  private pending: { file: string; source: string } | null = null;
  private changing = false;
  items: SavedApiScenario[] = [];
  constructor(readonly directory: LocalDirectory, private normalize: (source: string) => Scenario, private serverNames: Record<string, string>) {}
  get name() { return this.directory.name; }
  private async target(file: string, create = false): Promise<LocalFile> {
    const parts = localPath(file);
    let directory = this.directory;
    for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
    return directory.getFileHandle(parts.at(-1)!, { create });
  }
  private async text(handle: LocalFile): Promise<string> {
    const file = await handle.getFile();
    if (file.size > 1_000_000) throw new Error("파일은 1MB 이하로 제공하세요");
    return file.text();
  }
  private async readManifest(): Promise<string | null> {
    try { return await this.text(await this.directory.getFileHandle("index.json")); }
    catch (error) { if (missing(error)) return null; throw error; }
  }
  private async readFile(file: string): Promise<string | null> {
    try { return await this.text(await this.target(file)); }
    catch (error) { if (missing(error)) return null; throw error; }
  }
  private item(file: string, source: string, metadata: ApiSidebarMetadata, previous?: SavedApiScenario): SavedApiScenario {
    const scenario = this.normalize(source);
    const id = `local:${file}`;
    return { id, name: scenario.name, localFile: file, bindings: {},
      source: stringifyScenario({ ...scenario, id }, true, undefined, this.serverNames),
      updatedAt: new Date(Math.max(Date.now(), previous ? Date.parse(previous.updatedAt) + 1 : 0)).toISOString(), ...metadata };
  }
  private async exclusively<T>(action: () => Promise<T>): Promise<T> {
    if (this.changing) throw new Error("로컬 폴더 작업이 진행 중입니다");
    this.changing = true;
    try { return await action(); } finally { this.changing = false; }
  }
  async reload(): Promise<void> {
    await this.exclusively(async () => {
      const source = await this.readManifest();
      const manifest = source === null ? emptyManifest() : manifestSchema.parse(JSON.parse(source));
      const originals = new Map<string, string>(); const items: SavedApiScenario[] = [];
      for (const { file, ...metadata } of manifest.scenarios) {
        localPath(file);
        if (originals.has(file)) throw new Error(`${file}: 중복된 시나리오 파일입니다`);
        const yaml = await this.readFile(file);
        if (yaml === null) throw new Error(`${file}: 파일을 찾을 수 없습니다`);
        originals.set(file, yaml); items.push(this.item(file, yaml, metadata));
      }
      // Do not install a mixed snapshot if an editor changed the list while loading.
      if (await this.readManifest() !== source) throw conflict();
      this.manifest = manifest; this.manifestSource = source; this.originals = originals; this.items = items; this.pending = null;
    });
  }
  private async write(handle: LocalFile, text: string, unchanged: () => Promise<boolean>): Promise<void> {
    const writer = await handle.createWritable();
    try {
      await writer.write(text);
      // createWritable stages bytes; compare the original again before committing.
      if (!await unchanged()) throw conflict();
      await writer.close();
    } catch (error) { await writer.abort().catch(() => {}); throw error; }
  }
  async save(file: string, source: string, metadata: ApiSidebarMetadata, expectedUpdatedAt?: string): Promise<SavedApiScenario> {
    return this.exclusively(async () => {
      localPath(file);
      if (this.pending && this.pending.file !== file) throw new Error("이전 YAML의 목록 갱신이 끝나지 않았습니다. 같은 파일을 다시 저장하거나 폴더를 다시 불러오세요.");
      const previous = this.items.find(item => item.localFile === file);
      if (expectedUpdatedAt === undefined) {
        newLocalFilename(file);
        if (previous) throw new Error("같은 파일이 이미 등록되어 있습니다. 로컬 시나리오를 선택해 수정하거나 다른 파일명을 쓰세요.");
      } else if (!previous || previous.updatedAt !== expectedUpdatedAt) throw conflict();
      const yaml = stringifyScenario(this.normalize(source), false, undefined, this.serverNames);
      if (new TextEncoder().encode(yaml).byteLength > 1_000_000) throw new Error("YAML은 1MB 이하만 지원합니다");
      const item = this.item(file, yaml, metadata, previous);
      const manifest: Manifest = { version: 1, scenarios: previous
        ? this.manifest.scenarios.map(entry => entry.file === file ? { file, ...metadata } : entry)
        : [...this.manifest.scenarios, { file, ...metadata }] };
      manifestSchema.parse(manifest);
      const nextManifest = JSON.stringify(manifest, null, 2) + "\n";
      if (new TextEncoder().encode(nextManifest).byteLength > 1_000_000) throw new Error("목록은 1MB 이하만 지원합니다");
      const expected = this.pending?.file === file ? this.pending.source : this.originals.get(file) ?? null;
      if (await this.readManifest() !== this.manifestSource) throw conflict();
      if (await this.readFile(file) !== expected) {
        if (expected === null) throw new Error("같은 이름의 파일이 이미 있습니다. 다른 파일명을 쓰세요.");
        throw conflict();
      }
      const target = await this.target(file, expected === null);
      await this.write(target, yaml, async () => {
        const current = await this.readFile(file);
        return current === (expected ?? "") && await this.readManifest() === this.manifestSource;
      });
      this.pending = { file, source: yaml };
      try {
        if (await this.readManifest() !== this.manifestSource) throw conflict();
        // Two files cannot be committed atomically through this browser API.
        if (nextManifest !== this.manifestSource) {
          const index = await this.directory.getFileHandle("index.json", { create: true });
          await this.write(index, nextManifest, async () => (await this.readManifest()) === (this.manifestSource ?? ""));
        }
      } catch (error) {
        // A failed first index write can leave an empty file. Keep retries conservative.
        if (this.manifestSource === null && await this.readManifest() === "") this.manifestSource = "";
        throw new Error(`YAML은 저장했지만 index.json 갱신에 실패했습니다. 다시 저장하거나 목록을 직접 수정하세요. ${error instanceof Error ? error.message : String(error)}`);
      }
      this.manifest = manifest; this.manifestSource = nextManifest; this.originals.set(file, yaml); this.pending = null;
      this.items = previous ? this.items.map(entry => entry.id === item.id ? item : entry) : [...this.items, item];
      return item;
    });
  }
}
