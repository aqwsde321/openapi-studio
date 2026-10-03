import { useCallback, useEffect, useState } from "react";
import type { SavedApiScenario, ApiScenarioPreview, ApiScenarioInputRequest } from "../core/shared/workspace";
import { stringifyScenario } from "../core/shared/scenario";
import { BrowserWorkspace } from "../browser/workspace";
import { ApiDocumentation } from "./pages/api-testing/ui/ApiDocumentation";
import { ApiTestingProviders } from "./pages/api-testing/ui/ApiTestingProviders";
import { ScenarioWorkspace } from "./pages/api-testing/ui/ScenarioWorkspace";
import { scenarioGroupPaths } from "./pages/api-testing/model/scenario-workspace";
import { GlobalVariableMenu } from "./features/api-testing/configure-globals";
import { RunInputModal } from "./features/api-testing/submit-run-input";

const ignoreRunAction = () => {};
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

export function StudioApp({ workspace }: { workspace: BrowserWorkspace }) {
  const { project, scope, baseUrl } = workspace.config;
  const bridge = workspace.bridge;
  const [tab, setTab] = useState<"docs" | "scenarios">("docs");
  const [scenarios, setScenarios] = useState<SavedApiScenario[]>([]);
  const [editor, setEditor] = useState<{ saved: SavedApiScenario; scenario: ApiScenarioPreview["scenario"] } | "new" | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runSaved, setRunSaved] = useState<SavedApiScenario | null>(null);
  const [groupPath, setGroupPath] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<ApiScenarioInputRequest | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importSource, setImportSource] = useState("");
  const [importPreview, setImportPreview] = useState<ApiScenarioPreview | null>(null);
  const [importError, setImportError] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const refresh = useCallback(async () => setScenarios(await bridge.listScenarios(project.id)), [bridge, project.id]);
  const consumeRun = useCallback(() => setRunSaved(null), []);
  useEffect(() => { void refresh().catch(error => setError(message(error))); }, [refresh]);
  useEffect(() => {
    if (!busy) { setPending(null); return; }
    const timer = setInterval(() => setPending(workspace.pending?.request ?? null), 100);
    return () => clearInterval(timer);
  }, [busy, workspace]);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  const navigate = (next: "docs" | "scenarios") => {
    if (dirty && !window.confirm("저장되지 않은 시나리오 변경사항을 버리고 이동할까요?")) return;
    setDirty(false); setEditor(null); setTab(next); setError("");
  };
  const edit = async (saved: SavedApiScenario) => {
    try { setEditor({ saved, scenario: workspace.normalize(saved.source) }); setGroupPath(saved.groupPath ?? []); setSelectedId(saved.id); setError(""); }
    catch (error) { setError(message(error)); }
  };
  const create = () => { setEditor("new"); setGroupPath([]); setError(""); };
  const openImport = () => { setImportOpen(true); setImportSource(""); setImportPreview(null); setImportError(""); };
  const run = (saved: SavedApiScenario) => {
    setSelectedId(saved.id); setRunSaved(saved); setEditor(null); setDirty(false); setError("");
  };
  return <ApiTestingProviders projectId={project.id} bridge={bridge}>
    <main className="api-testing-page studio-page">
      <header className="studio-header">
        <div><span className="studio-brand">OpenAPI Studio</span><h1>{workspace.catalog.title || "API 문서"} <small>{workspace.catalog.version}</small></h1><code>{baseUrl}</code></div>
        <GlobalVariableMenu projectId={project.id} bridge={bridge} disabled={busy} />
      </header>
      <nav className="studio-tabs" aria-label="작업 탭">
        <button type="button" role="tab" aria-selected={tab === "docs"} disabled={busy} onClick={() => navigate("docs")}>API 문서 <small>{workspace.catalog.operations.length}</small></button>
        <button type="button" role="tab" aria-selected={tab === "scenarios"} disabled={busy} onClick={() => navigate("scenarios")}>시나리오 <small>{scenarios.length}</small></button>
        <span>이 브라우저에 저장</span>
        {busy && <button type="button" onClick={() => workspace.cancel()}>실행 중단</button>}
      </nav>
      {error && <p className="api-warning" role="alert">{error}</p>}
      {tab === "docs" && <ApiDocumentation catalog={workspace.catalog} project={project} scope={scope} bridge={bridge} baseUrl={baseUrl} busy={busy} onBusy={setBusy} onRunAction={ignoreRunAction} />}
      {tab === "scenarios" && (editor ? <ApiDocumentation key={editor === "new" ? "new" : editor.saved.id} mode="compose" initialEdit={editor === "new" ? undefined : editor}
        catalog={workspace.catalog} project={project} scope={scope} bridge={bridge} baseUrl={baseUrl} busy={busy} onBusy={setBusy} onRunAction={ignoreRunAction}
        sidebarGroupPath={groupPath} sidebarGroupPaths={scenarioGroupPaths(scenarios)} onSidebarGroupPathChange={setGroupPath} onNewScenario={create} sidebarMetadata={{ groupPath, ...(editor !== "new" && editor.saved.tags ? { tags: editor.saved.tags } : {}) }}
        onUnsavedChange={setDirty} onCloseComposer={() => { setEditor(null); setDirty(false); }} onSaved={async saved => { await refresh(); setSelectedId(saved.id); }} onExecuteSaved={run} />
        : <ScenarioWorkspace workspace={workspace} scenarios={scenarios} selectedId={selectedId} busy={busy} runSaved={runSaved} onBusy={setBusy} onSelect={setSelectedId} onCreate={create} onEdit={saved => void edit(saved)} onImport={openImport} onRefresh={refresh} onRunConsumed={consumeRun} />)}
      {pending && <RunInputModal key={pending.requestId} request={pending} scope={scope} bridge={bridge} onSubmitted={() => setPending(null)} onCancel={() => { setPending(null); workspace.cancel(); }} />}
      {importOpen && <div className="api-confirm-dialog-backdrop"><section className="api-confirm-dialog studio-import" role="dialog" aria-modal="true" aria-label="YAML 가져오기">
        <h2>YAML 가져오기</h2><p>이 페이지의 백엔드 명세에 연결합니다. 파일을 선택하거나 YAML을 붙여넣으세요.</p>
        <input type="file" aria-label="시나리오 YAML 파일" accept=".yaml,.yml" disabled={importBusy} onChange={async event => {
          const file = event.target.files?.[0]; if (!file) return;
          setImportSource(""); setImportPreview(null); setImportError("");
          if (file.size > 1_000_000) { setImportError("YAML은 1MB 이하만 지원합니다"); return; }
          setImportBusy(true);
          try { setImportSource(await file.text()); } catch (error) { setImportError(message(error)); } finally { setImportBusy(false); }
        }} />
        <label>YAML 내용<textarea aria-label="YAML 내용" value={importSource} disabled={importBusy} onChange={event => { setImportSource(event.target.value); setImportPreview(null); setImportError(""); }} /></label>
        {importPreview && <><p>{importPreview.scenario.name} · {importPreview.scenario.steps.length}개 단계</p>{[...importPreview.issues, ...(importPreview.executionIssues ?? [])].length > 0 && <ul className="api-warning">{[...importPreview.issues, ...(importPreview.executionIssues ?? [])].map((issue,index) => <li key={index}>{issue}</li>)}</ul>}</>}
        {importError && <p role="alert" className="api-warning">{importError}</p>}
        <div className="api-actions"><button disabled={importBusy} onClick={() => setImportOpen(false)}>닫기</button><button disabled={importBusy || !importSource.trim()} onClick={async () => { setImportBusy(true); setImportError(""); try { setImportPreview(await workspace.preview(importSource)); } catch (error) { setImportError(message(error)); } finally { setImportBusy(false); } }}>내용 확인</button>
        {importPreview && <button className="api-primary" disabled={importBusy} onClick={async () => {
          setImportBusy(true); setImportError("");
          try {
            const scenario = { ...importPreview.scenario, id: `scenario-${crypto.randomUUID()}` };
            const saved = await workspace.save(stringifyScenario(scenario, true, undefined, { [scope.serverId]: project.servers[0].name }), undefined, Boolean(importPreview.issues.length));
            await refresh(); setSelectedId(saved.id); setImportOpen(false);
          } catch (error) { setImportError(message(error)); } finally { setImportBusy(false); }
        }}>{importPreview.issues.length ? "초안으로 저장" : "시나리오 저장"}</button>}</div>
      </section></div>}
    </main>
  </ApiTestingProviders>;
}
