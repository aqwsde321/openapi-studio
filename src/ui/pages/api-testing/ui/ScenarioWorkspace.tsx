import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { SavedApiScenario, ApiScenarioPreview } from "../../../../core/shared/workspace";
import { stringifyScenario } from "../../../../core/shared/scenario";
import type { BrowserWorkspace } from "../../../../browser/workspace";
import { downloadYaml } from "../../../../browser/files";
import { pickLocalFolder, supportsLocalFolders } from "../../../../browser/local-scenarios";
import { ScenarioSidebarTree, readLastRun, writeLastRun, runStatusName, type ScenarioLastRun } from "../../../entities/api-testing";
import { useGlobalVariableAccess } from "../../../features/api-testing/configure-globals";
import { ResizeHandle, useStoredWidth } from "../../../shared/ui/ResizeHandle";
import { Icon } from "../../../shared/ui/Icon";
import { filterScenarios, parseRunInputs } from "../model/scenario-workspace";
import { ScenarioDetail } from "./ScenarioDetail";

type Props = {
  workspace: BrowserWorkspace;
  scenarios: SavedApiScenario[];
  selectedId: string | null;
  busy: boolean;
  runSaved: SavedApiScenario | null;
  onBusy: (busy: boolean) => void;
  onSelect: (id: string | null) => void;
  onCreate: () => void;
  onEdit: (saved: SavedApiScenario) => void;
  onImport: () => void;
  onRefresh: () => Promise<void>;
  onReloadProject: () => Promise<void>;
  onFolderChanged: () => Promise<void>;
  onRunConsumed: () => void;
};
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

/** Searchable list and selected scenario detail; storage stays in the browser adapter. */
export function ScenarioWorkspace({ workspace, scenarios, selectedId, busy, runSaved, onBusy, onSelect, onCreate, onEdit, onImport, onRefresh, onReloadProject, onFolderChanged, onRunConsumed }: Props) {
  const { scope, project, baseUrl } = workspace.config;
  const bridge = workspace.bridge;
  const globalAccess = useGlobalVariableAccess();
  const current = scenarios.find(item => item.id === selectedId) ?? null;
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [checking, setChecking] = useState(false);
  const [running, setRunning] = useState(false);
  const [checked, setChecked] = useState<{ id: string; source: string; preview: ApiScenarioPreview } | null>(null);
  const [snapshot, setSnapshot] = useState<ScenarioLastRun | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [folderError, setFolderError] = useState("");
  const [saveLocal, setSaveLocal] = useState<SavedApiScenario | null>(null);
  const [filename, setFilename] = useState("");
  const [saveLocalError, setSaveLocalError] = useState("");
  const [revision, setRevision] = useState(0);
  const columns = useRef<HTMLDivElement>(null);
  const live = useRef(true);
  const [width, setWidth] = useStoredWidth("scenario-list");
  const preview = current && checked?.id === current.id && checked.source === current.source ? checked.preview : null;
  const selectedSnapshot = snapshot?.preview.scenario.id === current?.id && (!(current?.sourceUrl || current?.localFile) || snapshot?.source === current.source) ? snapshot : null;
  const filtered = useMemo(() => filterScenarios(scenarios, query, baseUrl), [scenarios, query, baseUrl]);
  const catalogs = useMemo(() => ({ [scope.serverId]: workspace.catalog }), [scope.serverId, workspace.catalog]);
  const serverNames = useMemo(() => Object.fromEntries(project.servers.map(server => [server.id, server.name])), [project.servers]);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    setInputs({}); setError(""); setNotice("");
    setSnapshot(current ? readLastRun(scope.projectId, scope.environmentId, current.id) : null);
  }, [current?.id, scope.projectId, scope.environmentId]);
  useEffect(() => {
    if (!current) { setChecked(null); setChecking(false); return; }
    if (busy) return;
    let active = true;
    setChecking(true);
    void bridge.previewScenario(scope, current.source, {}).then(next => { if (active) { setChecked({ id: current.id, source: current.source, preview: next }); setError(""); } }).catch(error => { if (active) { setChecked(null); setError(errorText(error)); } }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [bridge, scope, current?.id, current?.source, current?.updatedAt, globalAccess.revision, revision, busy]);
  const run = useCallback(async () => {
    if (!current || busy || checking || current.draft) return;
    onBusy(true); setRunning(true); setError(""); setNotice("");
    try {
      const ready = await bridge.previewScenario(scope, current.source, {});
      setChecked({ id: current.id, source: current.source, preview: ready });
      const issues = [...ready.issues, ...(ready.executionIssues ?? [])];
      if (issues.length) throw new Error(issues.join("\n"));
      const result = await bridge.runScenario(scope, current.source, {}, parseRunInputs(ready.scenario.inputs, inputs));
      const next = { result, preview: ready, source: current.source, bindings: {}, completedAt: new Date().toISOString() };
      writeLastRun(scope.projectId, scope.environmentId, current.id, next);
      if (live.current) { setSnapshot(next); setNotice(`${current.name} · ${runStatusName(result.status)}`); globalAccess.saved(); }
    } catch (error) { if (live.current) setError(errorText(error)); }
    finally { if (live.current) { setRunning(false); onBusy(false); } }
  }, [current, busy, checking, bridge, scope, inputs, onBusy, globalAccess]);
  useEffect(() => {
    if (!runSaved || !current || current.id !== runSaved.id || checking || busy || !preview || preview.scenario.id !== current.id) return;
    onRunConsumed();
    if (Object.keys(preview.scenario.inputs).length) setNotice("실행 입력을 확인한 뒤 실행을 누르세요.");
    else void run();
  }, [runSaved, current, checking, busy, preview, run, onRunConsumed]);
  const duplicate = async () => {
    if (!current || !preview || busy) return;
    onBusy(true); setError("");
    try {
      const base = `${current.name.replace(/ 사본(?: \d+)?$/, "")} 사본`;
      const names = new Set(scenarios.map(item => item.name));
      let name = base;
      for (let index = 2; names.has(name); index++) name = `${base} ${index}`;
      const copy = { ...preview.scenario, id: `scenario-${crypto.randomUUID()}`, name };
      const source = stringifyScenario(copy, true, undefined, serverNames);
      const save = current.draft || preview.issues.length ? bridge.saveScenarioDraft : bridge.saveScenario;
      const created = await save(scope, source, {}, undefined, { groupPath: current.groupPath ?? [], tags: current.tags ?? [] });
      await onRefresh(); onSelect(created.id);
    } catch (error) { setError(errorText(error)); }
    finally { onBusy(false); }
  };
  const remove = async () => {
    if (!current) return;
    onBusy(true);
    try { await bridge.deleteScenario(project.id, current.id, current.updatedAt); await onRefresh(); onSelect(null); }
    finally { onBusy(false); }
  };
  const refresh = async () => {
    setError("");
    try { await (workspace.localFolder || workspace.config.scenariosUrl ? onReloadProject() : onRefresh()); setRevision(value => value + 1); } catch (error) { setError(errorText(error)); }
  };
  const connectFolder = async () => {
    onBusy(true); setFolderError("");
    try { const directory = await pickLocalFolder(); await workspace.connectLocalFolder(directory); await onFolderChanged(); onSelect(null); }
    catch (error) { if (!(error instanceof Error && error.name === "AbortError")) setFolderError(errorText(error)); }
    finally { onBusy(false); }
  };
  const disconnectFolder = async () => {
    onBusy(true); setFolderError("");
    try { workspace.disconnectLocalFolder(); await onReloadProject(); onSelect(null); }
    catch (error) { setFolderError(errorText(error)); }
    finally { onBusy(false); }
  };
  return <div ref={columns} className="api-columns api-scenarios api-scenario-run studio-scenarios" style={width === null ? undefined : { "--api-list-width": `${width}px` } as CSSProperties}>
    <aside aria-label="저장된 시나리오">
      <input aria-label="시나리오 검색" placeholder="이름·그룹·설명·API 검색" value={query} disabled={busy} onChange={event => setQuery(event.target.value)} />
      <section className="api-sidebar-section">
        <header><button type="button" className="api-sidebar-section-toggle" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><span className="api-sidebar-section-label">시나리오<small>{filtered.items.length}{filtered.items.length !== scenarios.length ? ` / ${scenarios.length}` : ""}</small></span><Icon name="expand_more" size={18} className="api-sidebar-chevron" /></button><button type="button" className="api-sidebar-add" disabled={busy} onClick={onCreate}>+ 새 시나리오</button></header>
        {expanded && <ScenarioSidebarTree kind="scenario" expandAll={Boolean(query.trim())} items={filtered.items} reasons={filtered.reasons} selectedId={selectedId} disabled={busy} onSelect={item => onSelect(item.id)} />}
      </section>
      <div className="studio-sidebar-tools"><button type="button" disabled={busy} onClick={onImport}>YAML 가져오기</button><button type="button" disabled={busy} onClick={() => void refresh()}>{workspace.localFolder ? "폴더 다시 불러오기" : workspace.config.scenariosUrl ? "프로젝트 다시 불러오기" : "목록 새로고침"}</button></div>
      <section className="studio-local-folder" aria-label="로컬 시나리오 폴더">
        {workspace.localFolder ? <><strong>연결됨 · {workspace.localFolder.name}</strong><p>로컬 파일을 직접 읽고 저장합니다. 연결은 현재 탭에서 유지됩니다.</p><button type="button" disabled={busy} onClick={() => void disconnectFolder()}>폴더 연결 해제</button></>
          : <><button type="button" disabled={busy || !supportsLocalFolders()} onClick={() => void connectFolder()}>로컬 폴더 연결</button><p>{supportsLocalFolders() ? "index.json과 YAML을 둘 api-scenarios 폴더를 선택하세요. 새로고침 후에는 다시 연결합니다." : "이 환경에서는 폴더 연결을 지원하지 않습니다. 지원 브라우저의 localhost 또는 HTTPS에서 열거나 YAML 내보내기를 사용하세요."}</p></>}
        {folderError && <p role="alert" className="api-warning">{folderError}</p>}
      </section>
    </aside>
    {current ? <ScenarioDetail key={current.id} saved={current} preview={preview} snapshot={selectedSnapshot} catalogs={catalogs} serverNames={serverNames} inputs={inputs} busy={busy} checking={checking} running={running} error={error} notice={notice}
      onInput={(name, value) => setInputs(previous => ({ ...previous, [name]: value }))} onRun={() => void run()} onEdit={() => onEdit(current)} onDuplicate={() => void duplicate()} onDelete={remove}
      onSaveLocal={workspace.localFolder && !current.localFile ? () => { setSaveLocal(current); setFilename(`${current.name.replace(/[\\/:*?"<>|%#\x00-\x1f]/g, "_").trim() || "scenario"}.yaml`); setSaveLocalError(""); } : undefined}
      onExport={() => { try { downloadYaml(current.name, stringifyScenario(workspace.normalize(current.source), false, undefined, serverNames)); } catch (error) { setError(errorText(error)); } }} onRecheck={() => setRevision(value => value + 1)} />
      : <article className="api-request-panel api-scenario-detail"><div className="api-empty"><h3>{scenarios.length ? "시나리오를 고르거나 새로 만드세요" : "저장된 시나리오가 없습니다."}</h3><p>목록에서 고르면 실행 흐름과 최근 결과를 여기서 봅니다.</p><div className="api-actions"><button type="button" className="api-primary" disabled={busy} onClick={onCreate}>새 시나리오 만들기</button></div></div>{error && <p className="api-warning" role="alert">{error}</p>}</article>}
    <ResizeHandle label="시나리오 목록 폭" container={columns} min={200} max={0.45} onChange={setWidth} />
    {saveLocal && <div className="api-confirm-dialog-backdrop"><form className="api-confirm-dialog" role="dialog" aria-modal="true" aria-label="프로젝트에 저장" onSubmit={async event => {
      event.preventDefault(); onBusy(true); setSaveLocalError("");
      try { const saved = await workspace.saveToLocalFolder(saveLocal, filename); await onRefresh(); setSaveLocal(null); onSelect(saved.id); }
      catch (error) { setSaveLocalError(errorText(error)); }
      finally { onBusy(false); }
    }}>
      <h2>프로젝트에 저장</h2><p>{workspace.localFolder?.name} 폴더에 YAML을 만들고 index.json에 등록합니다. 브라우저 사본은 유지됩니다.</p>
      <label>파일명<input aria-label="프로젝트 YAML 파일명" required value={filename} disabled={busy} onChange={event => setFilename(event.target.value)} /></label>
      {saveLocalError && <p role="alert" className="api-warning">{saveLocalError}</p>}
      <div className="api-actions"><button type="button" disabled={busy} onClick={() => setSaveLocal(null)}>취소</button><button type="submit" className="api-primary" disabled={busy}>프로젝트에 저장</button></div>
    </form></div>}
  </div>;
}
