import { useEffect, useState } from "react";
import type { ApiCatalog, ApiScenarioPreview, SavedApiScenario } from "../../../../core/shared/workspace";
import { stringifyScenario } from "../../../../core/shared/scenario";
import { groupMissingGlobals, issueGlobal } from "../../../../core/shared/preflight-issues";
import { DeleteAction, GlobalVariableSetupLink, ScenarioRunFlow, ScenarioRunResult, YamlCode, operationForStep, runStatusName, type ScenarioLastRun } from "../../../entities/api-testing";
import { useGlobalVariableAccess } from "../../../features/api-testing/configure-globals";

type Props = {
  saved: SavedApiScenario;
  preview: ApiScenarioPreview | null;
  snapshot: ScenarioLastRun | null;
  catalogs: Record<string, ApiCatalog | null>;
  serverNames: Record<string, string>;
  inputs: Record<string, string>;
  busy: boolean;
  checking: boolean;
  running: boolean;
  error: string;
  notice: string;
  onInput: (name: string, value: string) => void;
  onRun: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => Promise<void>;
  onExport: () => void;
  onRecheck: () => void;
};

export function ScenarioDetail({ saved, preview, snapshot, catalogs, serverNames, inputs, busy, checking, running, error, notice, onInput, onRun, onEdit, onDuplicate, onDelete, onExport, onRecheck }: Props) {
  const globalAccess = useGlobalVariableAccess();
  const [view, setView] = useState<"preview" | "result">(snapshot ? "result" : "preview");
  const [focusPreview, setFocusPreview] = useState<{ index: number; request: number } | null>(null);
  const [focusResult, setFocusResult] = useState<{ stepId: string; request: number } | null>(null);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  useEffect(() => { if (snapshot) setView("result"); }, [snapshot]);
  const issues = preview?.executionIssues ?? [];
  const canRun = Boolean(preview && !saved.draft && !preview.issues.length && !issues.length);
  const result = snapshot?.result;
  const resultView = running || (view === "result" && Boolean(snapshot));
  const yaml = preview ? stringifyScenario(preview.scenario, false, step => operationForStep(step, catalogs, {}), serverNames) : saved.source;
  const focusStep = (index: number) => {
    setView("preview");
    setFocusPreview(previous => ({ index, request: (previous?.request ?? 0) + 1 }));
  };
  return <article className="api-request-panel api-scenario-detail" aria-label={saved.name}>
    <header className="api-detail-heading">
      <div><h2 title={saved.name}>{saved.name}</h2><p className="api-description">{preview?.scenario.description ?? ""}</p></div>
      <div className="api-actions api-detail-actions">
        <span className="api-action-group" role="group" aria-label="실행"><button type="button" className="api-primary" disabled={busy || checking || !canRun} onClick={onRun}>{running ? "실행 중…" : result ? "다시 실행" : "실행"}</button></span>
        <span className="api-action-group" role="group" aria-label="편집"><button type="button" disabled={busy} onClick={onEdit}>수정</button><button type="button" disabled={busy || checking || !preview} onClick={onDuplicate}>복제</button></span>
        <span className="api-action-group" role="group" aria-label="관리"><button type="button" disabled={busy} onClick={onExport}>YAML 내보내기</button><DeleteAction key={saved.id} label="시나리오 삭제" text="삭제" disabled={busy} description={`‘${saved.name}’을 이 브라우저에서 삭제합니다.`} onDelete={onDelete} /></span>
      </div>
    </header>
    {checking && <p role="status">시나리오를 확인하는 중…</p>}
    {preview && <>
      <section className="api-run-summary" aria-label="시나리오 실행 준비">
        {!!issues.length && <div role="alert" className="api-warning"><strong>실행 전 설정 필요</strong><ul>{(() => {
          const { globals, others } = groupMissingGlobals(issues);
          return <>
            {globals.map(({ name, steps }) => <li key={name}><code>{name}</code> 값 없음{steps.length > 0 && <> · {steps.map((step, index) => <span key={step}>{index > 0 && "·"}<button type="button" className="api-issue-step-link" onClick={() => focusStep(step - 1)}>{step}</button></span>)}단계</>} <GlobalVariableSetupLink onConfigure={globalAccess.open} name={name} /></li>)}
            {others.map(issue => <li key={issue}>{issue}{issueGlobal(issue) && <> <GlobalVariableSetupLink onConfigure={globalAccess.open} name={issueGlobal(issue)!} /></>}</li>)}
          </>;
        })()}</ul><button type="button" disabled={busy || checking} onClick={onRecheck}>설정 다시 확인</button></div>}
        {saved.draft && <p className="api-run-notice">초안은 아직 실행할 수 없습니다. 수정에서 요청값과 검증을 보완한 뒤 저장하세요.</p>}
        {!!preview.issues.length && <details className="api-run-issues" open><summary>보완이 필요한 항목 {preview.issues.length}개</summary><ul>{preview.issues.map(issue => <li key={issue}>{issue}</li>)}</ul></details>}
        {!!Object.keys(preview.scenario.inputs).length && <fieldset disabled={busy}><legend>실행 입력</legend><p className="api-field-help">실행할 때만 사용하는 값입니다.</p>{Object.entries(preview.scenario.inputs).map(([name, definition]) => <label key={name}>{name}{definition.required ? " *" : ""} · {definition.type}<input aria-label={`시나리오 입력 ${name}`} autoComplete="off" value={inputs[name] ?? ""} onChange={event => onInput(name, event.target.value)} /></label>)}</fieldset>}
      </section>
      <div className="api-run-view-bar">
        <div className="api-run-view-switch" role="group" aria-label="시나리오 보기"><button type="button" disabled={running} aria-pressed={!resultView} onClick={() => setView("preview")}>실행 흐름</button><button type="button" aria-pressed={resultView} disabled={!snapshot || running} onClick={() => setView("result")}>최근 실행</button></div>
        <p className="api-spec-meta">{preview.scenario.steps.length}개 API · 순서대로 호출{!resultView && <span className={`api-run-status${saved.draft ? " is-draft" : canRun ? " is-ready" : " is-review"}`}>{saved.draft ? "초안" : canRun ? "실행 가능" : "설정 필요"}</span>}</p>
      </div>
      <div hidden={resultView}><ScenarioRunFlow key={saved.id} preview={preview} catalogs={catalogs} bindings={{}} serverNames={serverNames} focusRequest={focusPreview} onConfigureGlobal={globalAccess.open} /></div>
    </>}
    {result && result.status !== "passed" && result.status !== "cancelled" && <div role="alert" className="api-warning api-run-last-problem"><strong>최근 실행 {runStatusName(result.status)}</strong>{result.steps.map((step, index) => step.error && <button key={step.id} type="button" className="api-result-error-link" disabled={running} title={step.error} onClick={() => { setView("result"); setFocusResult(previous => ({ stepId: step.id, request: (previous?.request ?? 0) + 1 })); }}>{index + 1}단계 · {step.name}</button>)}</div>}
    {notice && <p role="status">{notice}</p>}{error && <p className="api-warning" role="alert">{error}</p>}
    {running ? <section className="api-response api-response-running" aria-label="시나리오 실행 중"><p role="status">시나리오 실행 중…</p></section> : snapshot && <section hidden={!resultView} className="api-response" aria-label="시나리오 실행 결과"><ScenarioRunResult completedAt={snapshot.completedAt} result={snapshot.result} preview={snapshot.preview} catalogs={catalogs} bindings={snapshot.bindings} serverNames={serverNames} focusRequest={focusResult} /></section>}
    <details className="api-scenario-yaml" onToggle={event => setYamlOpen(event.currentTarget.open)}><summary>YAML 보기</summary>{yamlOpen && <>
      <div className="api-scenario-yaml-tools"><small>공유할 때 쓰는 시나리오 YAML입니다.</small><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(yaml); setCopied(true); setCopyError(""); } catch { setCopyError("복사하지 못했습니다. YAML 내보내기를 사용하세요."); } }}>{copied ? "복사됨" : "YAML 복사"}</button></div>
      {copyError && <p role="alert">{copyError}</p>}<YamlCode label="시나리오 YAML" source={yaml} />
    </>}</details>
  </article>;
}
