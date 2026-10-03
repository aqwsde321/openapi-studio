import type { ApiCatalog, ApiProject, ApiScope } from "../core/shared/workspace";
export type StudioOptions = {
  element: string | HTMLElement;
  specUrl: string;
  storageKey?: string;
  baseUrl?: string;
  serverName?: string;
  environmentName?: string;
  credentials?: RequestCredentials;
  /** Render Mermaid blocks in descriptions. true loads openapi-studio.mermaid.js next to the main script; a string is that file's URL. */
  mermaid?: boolean | string;
};
const object = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value : {};

export function resolveConfiguration(options: StudioOptions, catalog: ApiCatalog, pageUrl: string) {
  const specUrl = new URL(options.specUrl, pageUrl);
  if (!["http:", "https:"].includes(specUrl.protocol) || specUrl.username || specUrl.password) throw new Error("명세 주소는 HTTP(S) 주소여야 합니다");
  const spec = object(catalog.spec);
  if (!options.baseUrl && Object.values(object(spec.paths)).some(raw => {
    const path = object(raw);
    return path.servers?.length || Object.values(path).some(operation => object(operation).servers?.length);
  })) throw new Error("API별 servers 주소는 아직 지원하지 않습니다. 사용할 백엔드 주소를 baseUrl로 지정하세요.");
  const server = object(spec.servers?.[0]);
  let configured = options.baseUrl ?? (typeof server.url === "string" ? server.url : specUrl.origin);
  if (!options.baseUrl) configured = configured.replace(/\{([^}]+)\}/g, (_match, key) => {
    const defaultValue = object(object(server.variables)[key]).default;
    if (typeof defaultValue !== "string") throw new Error(`서버 변수 ${key}의 기본값이 없습니다. baseUrl을 지정하세요.`);
    return defaultValue;
  });
  const base = new URL(configured, specUrl);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error("기본 주소는 쿼리·인증정보 없는 HTTP(S) 주소여야 합니다");
  const serverId = "00000000-0000-4000-8000-000000000002";
  const environmentId = "00000000-0000-4000-8000-000000000003";
  const key = options.storageKey?.trim() || specUrl.href;
  const scope: ApiScope = { projectId: `studio:${key}`, serverId, environmentId };
  const project: ApiProject = { id: scope.projectId, name: catalog.title || "OpenAPI Studio", servers: [{ id: serverId, name: options.serverName || "backend" }], environments: [{ id: environmentId, name: options.environmentName || "default", baseUrls: { [serverId]: base.href.replace(/\/$/, "") } }] };
  return { key, scope, project, baseUrl: project.environments[0].baseUrls[serverId], credentials: options.credentials ?? "same-origin" };
}
