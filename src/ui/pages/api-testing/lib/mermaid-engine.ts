type Mermaid = typeof import("mermaid")["default"];
declare global { interface Window { OpenAPIStudioMermaid?: Mermaid } }

/** Script URL of the separately built Mermaid bundle; undefined keeps diagrams as code. */
let source: string | undefined;
let engine: Promise<Mermaid> | undefined;

export function configureMermaid(url: string | undefined) { source = url; engine = undefined; }
export const mermaidEnabled = () => source !== undefined;

function loadScript(url: string): Promise<Mermaid> {
  if (window.OpenAPIStudioMermaid) return Promise.resolve(window.OpenAPIStudioMermaid);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url; script.async = true; script.dataset.openapiStudio = "mermaid";
    script.onload = () => window.OpenAPIStudioMermaid ? resolve(window.OpenAPIStudioMermaid) : reject(new Error("Mermaid 스크립트가 엔진을 등록하지 않았습니다"));
    script.onerror = () => { script.remove(); reject(new Error(`Mermaid 스크립트를 불러오지 못했습니다: ${url}`)); };
    document.head.append(script);
  });
}

export function loadMermaid(): Promise<Mermaid> {
  if (source === undefined) return Promise.reject(new Error("Mermaid가 설정되지 않았습니다"));
  if (engine) return engine;
  // The dev server has no built bundle; this branch is removed from production builds.
  const loaded = import.meta.env.DEV && !source ? import("mermaid").then(module => module.default) : loadScript(source);
  return engine = loaded.then(mermaid => {
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", maxTextSize: 50_000,
      suppressErrorRendering: true, flowchart: { htmlLabels: false }, htmlLabels: false });
    return mermaid;
  }).catch(error => { engine = undefined; throw error; });
}
