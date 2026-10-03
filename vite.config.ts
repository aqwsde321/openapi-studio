import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";
import { demoBackend } from "./demo/backend";

const licenseName = (manifest: any): string => typeof manifest.license === "string" ? manifest.license
  : (manifest.license?.type ?? (Array.isArray(manifest.licenses) ? manifest.licenses.map((entry: any) => entry.type ?? entry).join(" OR ") : "")) || "UNKNOWN";

/** The bundles inline their dependencies, so ship each bundled package's license beside them. */
function thirdPartyLicenses(fileName: string): Plugin {
  return {
    name: "openapi-studio-third-party-licenses",
    apply: "build",
    generateBundle(_options, bundle) {
      const packages = new Map<string, { name: string; version: string; license: string; text: string }>();
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk") continue;
        for (const id of Object.keys(chunk.modules)) {
          let dir = dirname(id.replace(/^\0/, "").split("?")[0]);
          if (!dir.includes("node_modules")) continue;
          while (dir !== dirname(dir) && (!existsSync(join(dir, "package.json")) || !JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).name)) dir = dirname(dir);
          if (packages.has(dir) || !existsSync(join(dir, "package.json"))) continue;
          const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
          const files = readdirSync(dir, { withFileTypes: true }).filter(file => file.isFile() && /^(licen[cs]e|copying|notice)/i.test(file.name)).map(file => file.name).sort();
          const text = files.map(file => readFileSync(join(dir, file), "utf8").trim()).join("\n\n");
          packages.set(dir, { name: manifest.name, version: manifest.version, license: licenseName(manifest), text });
        }
      }
      const entries = [...new Map([...packages.values()].map(entry => [`${entry.name}@${entry.version}`, entry])).values()].sort((a, b) => a.name.localeCompare(b.name));
      const source = entries.map(entry => `${entry.name}@${entry.version} (${entry.license})\n\n${entry.text || "License text not included in the package."}`).join(`\n\n${"-".repeat(72)}\n\n`);
      this.emitFile({ type: "asset", fileName, source: `Third-party software bundled in this file\n\n${"=".repeat(72)}\n\n${source}\n` });
    },
  };
}

/** Contain all bundled CSS inside the mounting element, including Swagger styles. */
const scopeStyles = {
  postcssPlugin: "openapi-studio-scope",
  Rule(rule: any) {
    let parent = rule.parent;
    while (parent) { if (parent.type === "atrule" && /keyframes$/.test(parent.name)) return; parent = parent.parent; }
    rule.selectors = rule.selectors.map((selector: string) => selector.startsWith(".openapi-studio") ? selector : `.openapi-studio ${selector}`);
  },
};
// `--mode mermaid` builds the optional diagram engine as its own file beside the main script.
export default defineConfig(({ mode }) => ({
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  plugins: [react(), demoBackend(), thirdPartyLicenses(mode === "mermaid" ? "openapi-studio.mermaid.LICENSES.txt" : "openapi-studio.standalone.LICENSES.txt")],
  css: { postcss: { plugins: [scopeStyles] } },
  build: {
    lib: mode === "mermaid"
      ? { entry: "src/mermaid.ts", name: "OpenAPIStudioMermaidBundle", formats: ["iife"], fileName: () => "openapi-studio.mermaid.js" }
      : { entry: "src/index.tsx", name: "OpenAPIStudio", formats: ["iife"], fileName: () => "openapi-studio.standalone.js" },
    emptyOutDir: mode !== "mermaid",
    rollupOptions: { output: { inlineDynamicImports: true } },
    target: "es2022",
  },
}));
