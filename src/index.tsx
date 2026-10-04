import { createRoot } from "react-dom/client";
import { StudioApp } from "./ui/StudioApp";
import { readOpenApi } from "./core/openapi";
import { resolveConfiguration, type StudioOptions } from "./browser/config";
import { StudioStorage } from "./browser/storage";
import { BrowserWorkspace } from "./browser/workspace";
import { installFavicon } from "./browser/favicon";
import swaggerStyles from "swagger-ui-react/swagger-ui.css?inline";
import apiStyles from "./ui/pages/api-testing/ui/api-testing.css?inline";
import popoverStyles from "./ui/styles/popover.css?inline";
import tokenStyles from "./styles/tokens.css?inline";
import appStyles from "./styles/studio.css?inline";

import { configureMermaid } from "./ui/pages/api-testing/lib/mermaid-engine";

export type { StudioOptions } from "./browser/config";
export type StudioHandle = { destroy(): void };
let mounted = false;
// Captured while the standalone script runs so companion assets can be found beside it.
const scriptUrl = document.currentScript instanceof HTMLScriptElement ? document.currentScript.src : "";

function mermaidSource(option: StudioOptions["mermaid"]): string | undefined {
  if (!option) return undefined;
  if (typeof option === "string") {
    const url = new URL(option, window.location.href);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("mermaid 주소는 HTTP(S) 주소여야 합니다");
    return url.href;
  }
  if (scriptUrl) return new URL("openapi-studio.mermaid.js", scriptUrl).href;
  if (import.meta.env.DEV) return "";
  throw new Error("Mermaid 파일 위치를 알 수 없습니다. mermaid에 openapi-studio.mermaid.js 주소를 지정하세요");
}

/** Browser entry point. React, CSS and execution/storage dependencies are bundled. */
export async function init(options: StudioOptions): Promise<StudioHandle> {
  if (!options || typeof options.specUrl !== "string" || !options.specUrl.trim()) throw new Error("specUrl에 OpenAPI 명세 주소를 지정하세요");
  if (mounted) throw new Error("한 페이지에는 하나의 OpenAPI Studio만 사용할 수 있습니다");
  const element = typeof options.element === "string" ? document.querySelector<HTMLElement>(options.element) : options.element;
  if (!(element instanceof HTMLElement)) throw new Error("OpenAPI Studio를 표시할 element를 찾을 수 없습니다");
  const specUrl = new URL(options.specUrl, window.location.href);
  if (!["http:", "https:"].includes(specUrl.protocol) || specUrl.username || specUrl.password) throw new Error("명세 주소는 HTTP(S) 주소여야 합니다");
  const diagrams = mermaidSource(options.mermaid);
  mounted = true;
  configureMermaid(diagrams);
  const style = document.createElement("style");
  style.dataset.openapiStudio = "";
  style.textContent = [tokenStyles, swaggerStyles, apiStyles, popoverStyles, appStyles].join("\n");
  document.head.append(style);
  element.classList.add("openapi-studio");
  element.textContent = "API 명세를 불러오는 중…";
  let workspace: BrowserWorkspace | undefined;
  try {
    const response = await fetch(specUrl, { credentials: options.credentials ?? "same-origin" });
    if (!response.ok) throw new Error(`명세를 불러오지 못했습니다 (HTTP ${response.status})`);
    const catalog = readOpenApi(await response.text());
    const config = resolveConfiguration({ ...options, specUrl: response.url || specUrl.href }, catalog, window.location.href);
    const storage = await StudioStorage.open(config.key);
    workspace = new BrowserWorkspace(config, catalog, storage);
    const root = createRoot(element); root.render(<StudioApp workspace={workspace} />);
    const removeFavicon = installFavicon(scriptUrl);
    let destroyed = false;
    return { destroy() {
      if (destroyed) return; destroyed = true;
      workspace?.destroy(); root.unmount(); element.classList.remove("openapi-studio"); style.remove(); removeFavicon(); configureMermaid(undefined); mounted = false;
    } };
  } catch (error) {
    workspace?.destroy(); configureMermaid(undefined); mounted = false;
    const alert = document.createElement("p"); alert.setAttribute("role", "alert");
    alert.textContent = error instanceof Error ? error.message : "OpenAPI Studio를 시작하지 못했습니다";
    element.replaceChildren(alert); style.remove(); element.classList.remove("openapi-studio");
    throw error;
  }
}

const mermaidAttribute = (value: string | null): StudioOptions["mermaid"] => value === null || value === "false" ? false : value === "" || value === "true" ? true : value;

/** Declarative form: <openapi-studio spec-url="/v3/api-docs"></openapi-studio> mounts on insertion and unmounts on removal. */
class OpenApiStudioElement extends HTMLElement {
  private handle?: Promise<StudioHandle | undefined>;
  connectedCallback() {
    if (this.handle) return;
    const attribute = (name: string) => this.getAttribute(name) ?? undefined;
    this.handle = init({
      element: this, specUrl: attribute("spec-url") ?? "",
      storageKey: attribute("storage-key"), baseUrl: attribute("base-url"),
      serverName: attribute("server-name"), environmentName: attribute("environment-name"),
      credentials: attribute("credentials") as RequestCredentials | undefined,
      mermaid: mermaidAttribute(this.getAttribute("mermaid")),
    }).catch(error => { console.error(error); return undefined; });
  }
  disconnectedCallback() {
    // Moving the element fires disconnect then connect; only a real removal tears down.
    queueMicrotask(() => {
      if (this.isConnected) return;
      const handle = this.handle; this.handle = undefined;
      void handle?.then(studio => studio?.destroy());
    });
  }
}
if (!customElements.get("openapi-studio")) customElements.define("openapi-studio", OpenApiStudioElement);
