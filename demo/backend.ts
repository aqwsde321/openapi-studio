import type { Plugin } from "vite";
import { readFileSync } from "node:fs";

/** Development/test fixture only. The distributed bundle has no server dependency. */
export function demoBackend(): Plugin {
  return { name: "openapi-studio-demo", configureServer(server) {
    let count = 0;
    const items = new Map<string, { id: string; name: string }>();
    server.middlewares.use(async (req, res, next) => {
      const path = new URL(req.url ?? "/", "http://localhost").pathname;
      if (path === "/demo/openapi.json") { res.setHeader("Content-Type", "application/json"); res.end(readFileSync(new URL("./openapi.json", import.meta.url), "utf8")); return; }
      if (!path.startsWith("/demo-api/")) return next();
      res.setHeader("Content-Type", "application/json");
      const send = (status: number, data: unknown) => { res.statusCode = status; res.end(JSON.stringify(data)); };
      if (path === "/demo-api/slow") { const timer = setTimeout(() => send(200, { ok: true }), 2_000); res.on("close", () => clearTimeout(timer)); return; }
      if (path === "/demo-api/auth/login" && req.method === "POST") { res.setHeader("Set-Cookie", "studio-session=demo; Path=/demo-api; HttpOnly; SameSite=Lax"); send(200, { accessToken: "demo-access-token" }); return; }
      if (path === "/demo-api/session" && req.method === "GET") { send(req.headers.cookie?.includes("studio-session=demo") ? 200 : 401, { authenticated: req.headers.cookie?.includes("studio-session=demo") ?? false }); return; }
      if (req.headers.authorization !== "Bearer demo-access-token") { send(401, { message: "로그인이 필요합니다" }); return; }
      if (path === "/demo-api/items" && req.method === "POST") {
        try {
          let raw = "";
          for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) throw new Error("too large"); }
          const body = JSON.parse(raw);
          if (typeof body.name !== "string" || !body.name) { send(400, { message: "name이 필요합니다" }); return; }
          const item = { id: String(++count), name: body.name }; items.set(item.id, item); send(201, item);
        } catch { send(400, { message: "JSON을 확인하세요" }); }
        return;
      }
      if (path.startsWith("/demo-api/items/") && req.method === "GET") { const item = items.get(path.split("/").pop()!); send(item ? 200 : 404, item ?? { message: "없음" }); return; }
      send(404, { message: "API 없음" });
    });
  } };
}
