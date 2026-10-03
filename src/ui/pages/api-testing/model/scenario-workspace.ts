import { parseScenario, type Json, type Scenario } from "../../../../core/shared/scenario";
import type { SavedApiScenario } from "../../../../core/shared/workspace";
import { scenarioSearch, type SearchableScenario } from "../../../entities/api-testing/lib/scenario-search";

export function filterScenarios(items: SavedApiScenario[], query: string, baseUrl: string): {
  items: SavedApiScenario[];
  reasons: Map<string, string>;
} {
  const matches = scenarioSearch(query, [baseUrl]);
  const reasons = new Map<string, string>();
  const filtered = items.filter(item => {
    let searchable: SearchableScenario = { name: item.name, groupPath: item.groupPath ?? [], apis: [] };
    try {
      const scenario = parseScenario(item.source);
      searchable = {
        ...searchable,
        description: scenario.description,
        apis: [...new Set(scenario.steps.map(step => "operationId" in step.api
          ? step.api.operationId
          : `${step.api.method.toUpperCase()} ${step.api.path}`))],
      };
    } catch {
      // An invalid draft still belongs in name and group searches.
    }
    const reason = matches(searchable);
    if (reason === null) return false;
    if (query.trim()) {
      const text = [
        ...(reason.description ? ["설명"] : []),
        ...(reason.apis.length ? [`API ${reason.apis.slice(0, 2).join(", ")}${reason.apis.length > 2 ? ` 외 ${reason.apis.length - 2}개` : ""}`] : []),
      ].join(" · ");
      if (text) reasons.set(item.id, text);
    }
    return true;
  });
  return { items: filtered, reasons };
}

export function scenarioGroupPaths(items: SavedApiScenario[]): string[][] {
  const paths = new Map<string, string[]>();
  for (const item of items) {
    const group = item.groupPath ?? [];
    for (let depth = 1; depth <= group.length; depth++) {
      const path = group.slice(0, depth);
      paths.set(JSON.stringify(path), path);
    }
  }
  return [...paths.values()].sort((left, right) => left.join(" › ").localeCompare(right.join(" › "), "ko"));
}

const inputTypeLabel: Record<Scenario["inputs"][string]["type"], string> = {
  string: "문자열",
  number: "숫자",
  boolean: "불리언(true 또는 false)",
  object: "객체",
  array: "배열",
};

function finiteJson(value: Json): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finiteJson);
  if (value !== null && typeof value === "object") return Object.values(value).every(finiteJson);
  return true;
}

export function parseRunInputs(definitions: Scenario["inputs"], values: Record<string, string>): Record<string, Json> {
  const parsed: Array<[string, Json]> = [];
  for (const [name, definition] of Object.entries(definitions)) {
    const label = "label" in definition && typeof definition.label === "string" && definition.label.trim()
      ? definition.label.trim() : name;
    const text = Object.hasOwn(values, name) ? values[name] : "";
    if (!text.trim()) {
      if (definition.required) throw new Error(`${label}: 필수 입력값을 입력하세요.`);
      continue;
    }
    if (definition.type === "string") {
      parsed.push([name, text]);
      continue;
    }
    let value: Json;
    try { value = JSON.parse(text) as Json; }
    catch { throw new Error(`${label}: ${inputTypeLabel[definition.type]} 입력은 JSON 형식으로 입력하세요.`); }
    const actualType = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
    if (actualType !== definition.type) throw new Error(`${label}: ${inputTypeLabel[definition.type]} 형식으로 입력하세요.`);
    if (!finiteJson(value)) throw new Error(`${label}: 유한한 숫자만 입력할 수 있습니다.`);
    parsed.push([name, value]);
  }
  return Object.fromEntries(parsed);
}
