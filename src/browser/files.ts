export async function pickYaml(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".yaml,.yml";
    input.oncancel = () => resolve(null);
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      if (file.size > 1_000_000) return reject(new Error("YAML은 1MB 이하만 지원합니다"));
      try { resolve(await file.text()); } catch (error) { reject(error); }
    };
    input.click();
  });
}
export function downloadYaml(name: string, source: string) {
  const url = URL.createObjectURL(new Blob([source], { type: "application/yaml;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = `${name.replace(/[\\/:*?"<>|]/g, "_")}.yaml`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
