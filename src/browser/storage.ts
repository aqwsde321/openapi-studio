import type { Json } from "../core/shared/scenario";
import type { ApiDocInput, SavedApiScenario } from "../core/shared/workspace";

export type StudioData = {
  version: 1;
  scenarios: SavedApiScenario[];
  globals: Record<string, Json>;
  docInputs: Record<string, ApiDocInput>;
  requestAuth: string | null;
};
const empty = (): StudioData => ({ version: 1, scenarios: [], globals: {}, docInputs: {}, requestAuth: null });

/** Each update reads and writes in one transaction, including checks for stale editors. */
export class StudioStorage {
  private constructor(private readonly db: IDBDatabase, readonly key: string) {}
  static async open(key: string, factory: IDBFactory = indexedDB): Promise<StudioStorage> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open("openapi-studio", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("workspaces");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("브라우저 저장 공간을 열지 못했습니다", { cause: request.error }));
      request.onblocked = () => reject(new Error("다른 탭의 OpenAPI Studio를 닫고 다시 접속하세요"));
    });
    db.onversionchange = () => db.close();
    return new StudioStorage(db, key);
  }
  read(): Promise<StudioData> {
    return new Promise((resolve, reject) => {
      const request = this.db.transaction("workspaces").objectStore("workspaces").get(this.key);
      request.onsuccess = () => resolve(request.result ?? empty());
      request.onerror = () => reject(request.error);
    });
  }
  update<T>(change: (data: StudioData) => T): Promise<T> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("workspaces", "readwrite");
      const store = tx.objectStore("workspaces");
      const request = store.get(this.key);
      let value: T, failure: unknown;
      request.onsuccess = () => {
        try {
          const data: StudioData = request.result ?? empty();
          value = change(data);
          store.put(data, this.key);
        } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => resolve(value);
      tx.onabort = tx.onerror = () => reject(failure ?? tx.error ?? new Error("브라우저 저장에 실패했습니다"));
    });
  }
  close() { this.db.close(); }
}
