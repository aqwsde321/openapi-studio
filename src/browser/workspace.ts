import { z } from "zod";
import { ApiRunner } from "../core/execution";
import { GlobalStore } from "../core/variables";
import { parseScenario, stringifyScenario, scenarioSchema, scenarioStepInputs, type Json, type Scenario } from "../core/shared/scenario";
import type { ApiCatalog, ApiTestingBridge, ApiScenarioPreview, ApiScenarioResult, ApiScenarioInputRequest, ApiScenarioInputSubmission, SavedApiScenario, ApiResponse, ApiSidebarMetadata } from "../core/shared/workspace";
import { docInputFromRequest } from "../core/shared/doc-inputs";
import { StudioStorage } from "./storage";
import type { resolveConfiguration } from "./config";
import { pickYaml } from "./files";

type Configuration = ReturnType<typeof resolveConfiguration>;
export class BrowserWorkspace {
  active: AbortController | null = null;
  pending: { request: ApiScenarioInputRequest; resolve: (value: Json | undefined) => void } | null = null;
  constructor(readonly config: Configuration, readonly catalog: ApiCatalog, readonly storage: Pick<StudioStorage, "read" | "update" | "close">) {}
  private idle() { if (this.active) throw new Error("실행 중에는 설정을 변경할 수 없습니다"); }
  normalize(source: string): Scenario {
    if (new TextEncoder().encode(source).byteLength > 1_000_000) throw new Error("YAML은 1MB 이하만 지원합니다");
    const scenario = parseScenario(source);
    if (new Set(scenario.steps.map(step => step.server)).size > 1) throw new Error("현재 버전은 한 백엔드만 지원합니다. 여러 서버가 있는 YAML은 가져올 수 없습니다.");
    return { ...scenario, steps: scenario.steps.map(step => ({ ...step, server: this.config.scope.serverId })) };
  }
  async preview(source: string): Promise<ApiScenarioPreview> {
    const scenario = this.normalize(source);
    const issues: string[] = [], executionIssues: string[] = [];
    const globals = (await this.storage.read()).globals;
    const available = new Set(Object.entries(globals).filter(([,value]) => value !== "" && value !== null).map(([name]) => name));
    const produced = new Set<string>();
    if (scenario.environments && !scenario.environments.includes(this.config.project.environments[0].name))
      issues.push(`지원 환경: ${scenario.environments.join(", ")} · 현재 환경: ${this.config.project.environments[0].name}. 초기 설정의 environmentName을 확인하세요.`);
    for (const [index, step] of scenario.steps.entries()) {
      const label = `${index+1}단계 · ${step.name || step.id}`;
      const matches = this.catalog.operations.filter(op => "operationId" in step.api ? op.operationId === step.api.operationId : op.method === step.api.method && op.path === step.api.path);
      if (matches.length !== 1) { issues.push(`${label}: 현재 API 명세에서 API를 찾을 수 없습니다`); continue; }
      const op = matches[0];
      issues.push(...op.warnings.map(warning => `${label}: ${warning}`));
      const auth = step.auth === "none" ? undefined : step.auth ?? scenario.auth;
      if (auth) {
        const name = auth.slice(8);
        if (Object.keys(step.request.headers ?? {}).some(key => key.toLowerCase() === "authorization")) issues.push(`${label}: 인증과 Authorization 헤더가 중복됩니다`);
        if (!available.has(name)) executionIssues.push(`${label}: 인증 전역변수 '${name}' 값이 없습니다. 전역변수에서 설정하세요`);
        else if (!produced.has(name) && (typeof globals[name] !== "string" || !/^[A-Za-z0-9._~+/-]+=*$/.test(globals[name] as string))) executionIssues.push(`${label}: 인증 전역변수 '${name}'는 Bearer 접두사 없는 토큰 문자열이어야 합니다`);
      }
      for (const p of op.parameters.filter(p => p.required && p.location !== "cookie")) {
        if (p.location === "header" && p.name.toLowerCase() === "authorization" && auth) continue;
        const values = p.location === "path" ? step.request.pathParams : p.location === "query" ? step.request.query : step.request.headers;
        if (!Object.entries(values ?? {}).some(([key,value]) => (p.location === "header" ? key.toLowerCase() === p.name.toLowerCase() : key === p.name) && value !== "" && value !== null)) issues.push(`${label}: 필수 입력 '${p.name}'이 없습니다`);
      }
      if (op.bodyRequired && step.request.body === undefined) issues.push(`${label}: 요청 본문이 필요합니다`);
      if (Object.keys(step.request.cookies ?? {}).length || Object.keys(step.request.headers ?? {}).some(key => key.toLowerCase() === "cookie")) issues.push(`${label}: 쿠키는 브라우저가 자동으로 관리합니다. 직접 쿠키 설정을 제거하세요.`);
      for (const match of JSON.stringify([step.request, step.expect]).matchAll(/\{\{globals\.([A-Za-z][A-Za-z0-9_]*)\}\}/g))
        if (!available.has(match[1])) executionIssues.push(`${label}: 전역변수 '${match[1]}' 값이 없습니다. 전역변수에서 설정하세요`);
      for (const extraction of step.extract) if (extraction.target.startsWith("globals.")) {
        const name = extraction.target.slice(8); available.add(name); produced.add(name);
      }
    }
    return { scenario, issues: [...new Set(issues)], executionIssues: [...new Set(executionIssues)] };
  }
  async save(source: string, expectedUpdatedAt?: string, draft = false, metadata?: ApiSidebarMetadata): Promise<SavedApiScenario> {
    this.idle();
    const preview = await this.preview(source);
    if (!draft && preview.issues.length) throw new Error(preview.issues.join("\n"));
    const scenario = preview.scenario;
    return this.storage.update(data => {
      const index = data.scenarios.findIndex(saved => saved.id === scenario.id);
      const previous = data.scenarios[index];
      if (previous && previous.updatedAt !== expectedUpdatedAt) throw new Error("같은 시나리오가 변경되었습니다. 목록에서 최신 내용을 다시 여세요.");
      const item: SavedApiScenario = {
        id: scenario.id, name: scenario.name, source: stringifyScenario(scenario, true, undefined, { [this.config.scope.serverId]: this.config.project.servers[0].name }),
        bindings: {}, updatedAt: new Date(Math.max(Date.now(), previous ? Date.parse(previous.updatedAt)+1 : 0)).toISOString(), draft,
        ...(metadata ?? {}),
      };
      if (index < 0) data.scenarios.push(item); else data.scenarios[index] = item;
      return item;
    });
  }
  async run(scenario: Scenario, inputs: Record<string, Json>): Promise<ApiScenarioResult> {
    this.idle();
    const controller = new AbortController(); this.active = controller;
    const globals = new GlobalStore();
    const details = new Map<string, { request?: ApiResponse["request"]; headers?: Record<string,string>; body?: Json }>();
    let variables: Record<string, Json> = {};
    try {
      globals.commit(this.config.scope.projectId, (await this.storage.read()).globals);
      const result = await new ApiRunner(globals).run(scenario, {
        projectId: this.config.scope.projectId, environment: this.config.scope.environmentId,
        servers: { [this.config.scope.serverId]: { baseUrl: this.config.baseUrl } }, inputs,
        signal: controller.signal, credentials: this.config.credentials, runId: crypto.randomUUID(),
        resolveOperation: (_server, api) => {
          const op = this.catalog.operations.filter(op => "operationId" in api ? op.operationId === api.operationId : op.method === api.method && op.path === api.path);
          if (op.length !== 1) throw new Error("API 명세가 변경되었습니다");
          return op[0];
        },
        onRequest: (request, id) => details.set(id, { ...details.get(id), request }),
        onResponse: (response, id) => details.set(id, { ...details.get(id), ...response }),
        onVariables: value => { variables = value; },
        requestInput: request => new Promise(resolve => { this.pending = { request: { ...request, requestId: crypto.randomUUID() }, resolve }; }),
      });
      // Only extracted globals changed by this run are written; values changed in another tab survive.
      const after = globals.snapshot(this.config.scope.projectId);
      const completed = new Set(result.steps.filter(step => step.status === "passed").map(step => step.id));
      const written = new Set(scenario.steps.filter(step => completed.has(step.id)).flatMap(step => step.extract.filter(e => e.target.startsWith("globals.")).map(e => e.target.slice(8))));
      await this.storage.update(data => { for (const name of written) if (Object.hasOwn(after, name)) data.globals[name] = after[name]; });
      return { ...result, variables, steps: result.steps.map(step => ({ ...step, ...details.get(step.id) })) };
    } finally { this.pending?.resolve(undefined); this.pending = null; this.active = null; }
  }
  cancel() { this.active?.abort(); this.pending?.resolve(undefined); this.pending = null; }
  readonly bridge: ApiTestingBridge = {
    getCatalog: async () => this.catalog,
    listGlobals: async () => Object.entries((await this.storage.read()).globals).map(([name,value]) => ({ name, type: value === null ? "null" : Array.isArray(value) ? "array" : typeof value, displayValue: typeof value === "string" ? value : JSON.stringify(value) })),
    setGlobal: async (_scope, name, value) => {
      this.idle(); if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) throw new Error("변수 이름을 확인하세요");
      const parsed = z.json().parse(value); await this.storage.update(data => { data.globals[name] = parsed; });
    },
    deleteGlobal: async (_scope, name) => { this.idle(); await this.storage.update(data => { delete data.globals[name]; }); },
    getRequestAuth: async () => (await this.storage.read()).requestAuth,
    setRequestAuth: async (_scope, name) => { this.idle(); await this.storage.update(data => { data.requestAuth = name; }); },
    getDocInputs: async () => (await this.storage.read()).docInputs,
    forgetDocInput: async (_scope, key) => { await this.storage.update(data => { delete data.docInputs[key]; }); },
    listScenarios: async () => (await this.storage.read()).scenarios,
    previewScenario: async (_scope, source) => this.preview(source),
    saveScenario: async (_scope, source, _bindings, expected, metadata) => this.save(source, expected, false, metadata),
    saveScenarioDraft: async (_scope, source, _bindings, expected, metadata) => this.save(source, expected, true, metadata),
    deleteScenario: async (_project, id, expected) => {
      this.idle(); await this.storage.update(data => {
        const item = data.scenarios.find(item => item.id === id);
        if (item && item.updatedAt !== expected) throw new Error("시나리오가 변경되었습니다. 목록을 새로고침하세요.");
        data.scenarios = data.scenarios.filter(item => item.id !== id);
      });
    },
    runScenario: async (_scope, source, _bindings, inputs) => {
      const preview = await this.preview(source);
      if (preview.issues.length || preview.executionIssues?.length) throw new Error([...preview.issues, ...(preview.executionIssues ?? [])].join("\n"));
      return this.run(preview.scenario, inputs);
    },
    execute: async (_scope, key, request) => {
      const operation = this.catalog.operations.find(op => op.key === key);
      if (!operation) throw new Error("API를 찾을 수 없습니다");
      if (operation.warnings.length) throw new Error(operation.warnings.join("\n"));
      const auth = (await this.storage.read()).requestAuth;
      const scenario = scenarioSchema.parse({ version: 1, id: "try", name: key, steps: [{ id: "try", server: this.config.scope.serverId, api: { method: operation.method, path: operation.path }, request, extract: [] }], ...(auth ? { auth: `globals.${auth}` } : {}) });
      const remembered = docInputFromRequest(scenario.steps[0].request);
      await this.storage.update(data => { if (remembered) data.docInputs[key] = remembered; else delete data.docInputs[key]; });
      const result = await this.run(scenario, {}); return result.steps[0];
    },
    cancel: async () => this.cancel(),
    getPendingScenarioInput: async () => this.pending?.request ?? null,
    submitScenarioInput: async (_scope, submission: ApiScenarioInputSubmission) => {
      const pending = this.pending;
      if (!pending || ["requestId","runId","stepId","name"].some(key => pending.request[key as keyof ApiScenarioInputRequest] !== submission[key as keyof ApiScenarioInputSubmission])) throw new Error("실행 입력 요청이 만료되었습니다");
      const definition = pending.request;
      if (definition.required && (submission.value === null || (typeof submission.value === "string" && !submission.value.trim()))) throw new Error("필수 입력값을 입력하세요");
      const actualType = Array.isArray(submission.value) ? "array" : typeof submission.value;
      if (submission.value !== null && actualType !== definition.type) throw new Error("입력값 형식이 올바르지 않습니다");
      this.pending = null; pending.resolve(submission.value);
    },
    readScenarioFile: pickYaml,
  } as ApiTestingBridge;
  destroy() { this.cancel(); this.storage.close(); }
}
