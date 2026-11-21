import { createServer } from "node:http";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, extname, basename } from "node:path";
import { randomUUID } from "node:crypto";
import {
  FRONTEND_ROOT,
  ANALYSIS_ROOT,
  HISTORICAL_DB,
  OPERATIONAL_DB,
} from "./paths.mjs";
import {
  openStore,
  getState,
  createRecord,
  reviewReading,
  correctReading,
  importLegacy,
  audit,
} from "./store.mjs";
import {
  loadHistorical,
  buildAnalytics,
  mapFeatures,
  stationComparison,
  operationalAlerts,
} from "./analytics.mjs";
import {
  HttpError,
  ROLE_LABELS,
  createSession,
  sessionUser,
  publicUser,
  requireRole,
  requireView,
  hashPassword,
  passwordMatches,
  validateNewUser,
} from "./auth.mjs";
import { isDate } from "../model.mjs";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".geojson": "application/geo+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".csv": "text/csv; charset=utf-8",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".R": "text/plain; charset=utf-8",
};
const PUBLIC_FILES = new Set([
  "index.html",
  "styles.css",
  "app.js",
  "model.mjs",
  "workspace.css",
  "logo-argos-clean.png",
  "favicon.svg",
  "ui/workspace.mjs",
  "ui/field-overview.mjs",
  "ui/panels.mjs",
  "ui/map.mjs",
  "ui/api.mjs",
  "ui/icons.mjs",
  "ui/operations.mjs",
  "ui/forms.mjs",
  "assets/recife.geojson",
]);

function json(response, status, data, headers = {}) {
  response.writeHead(status, { "Content-Type": MIME[".json"], ...headers });
  response.end(JSON.stringify(data));
}
async function body(request) {
  let size = 0;
  const parts = [];
  for await (const part of request) {
    size += part.length;
    if (size > 3 * 1024 * 1024)
      throw new HttpError(413, "O envio excede o limite de 3 MB.");
    parts.push(part);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw new HttpError(400, "Envie um JSON válido.");
  }
}
function listAnalysisFiles() {
  const files = [];
  for (const dir of ["graficos", "tabelas", "r"]) {
    for (const name of readdirSync(resolve(ANALYSIS_ROOT, dir))) {
      if ([".png", ".pdf", ".csv", ".R"].includes(extname(name)))
        files.push(dir + "/" + name);
    }
  }
  files.push("ARGOS_tabelas_de_analise.xlsx");
  return files;
}

export function createApplication(options = {}) {
  const host = options.host || process.env.ARGOS_HOST || "127.0.0.1";
  const demoEnabled =
    ["127.0.0.1", "localhost", "::1"].includes(host) &&
    process.env.ARGOS_ALLOW_DEMO !== "false";
  const history = loadHistorical(options.historicalPath || HISTORICAL_DB);
  const { db, initialPassword } = openStore(
    options.dbPath || OPERATIONAL_DB,
    [...history.ovts, ...history.edls],
    options.adminPassword || process.env.ARGOS_ADMIN_PASSWORD,
  );
  const areas = JSON.parse(
    readFileSync(resolve(FRONTEND_ROOT, "territorios.json"), "utf8"),
  );
  const files = listAnalysisFiles();
  const attempts = new Map();
  const secure = process.env.ARGOS_HTTPS === "true";

  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "SAMEORIGIN");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    try {
      const url = new URL(request.url, "http://localhost");
      const path = decodeURIComponent(url.pathname);
      const method = request.method;
      const user = sessionUser(db, request);
      if (!["GET", "HEAD", "POST", "PUT"].includes(method))
        throw new HttpError(405, "Método não permitido.");
      const write = method === "POST" || method === "PUT";
      if (write) {
        const origin = request.headers.origin;
        if (
          origin &&
          origin !== (secure ? "https://" : "http://") + request.headers.host
        ) {
          throw new HttpError(403, "Origem da requisição inválida.");
        }
      }
      if (path === "/api/config" && method === "GET")
        return json(response, 200, { demoEnabled, roles: ROLE_LABELS });
      if (["/api/login", "/api/demo"].includes(path) && method === "POST") {
        const input = await body(request);
        let account;
        if (path === "/api/demo") {
          if (!demoEnabled)
            throw new HttpError(
              403,
              "Demonstração disponível apenas no servidor local.",
            );
          account = db
            .prepare("SELECT * FROM users WHERE id=? AND demo=1")
            .get("demo-" + input.role);
        } else {
          const key = request.socket.remoteAddress;
          const entry = attempts.get(key);
          if (entry && entry.expires > Date.now() && entry.count >= 10)
            throw new HttpError(
              429,
              "Aguarde 15 minutos para tentar novamente.",
            );
          account = db
            .prepare("SELECT * FROM users WHERE email=? AND demo=0")
            .get(String(input.email || "").toLowerCase());
          const valid =
            account &&
            typeof input.password === "string" &&
            passwordMatches(input.password, account.password_hash);
          if (!valid) {
            const current =
              entry && entry.expires > Date.now()
                ? entry
                : { count: 0, expires: Date.now() + 900000 };
            current.count++;
            attempts.set(key, current);
            throw new HttpError(401, "E-mail ou senha incorretos.");
          }
          attempts.delete(key);
        }
        if (!account) throw new HttpError(400, "Selecione um perfil válido.");
        const session = createSession(db, account, secure);
        return json(
          response,
          200,
          { user: publicUser(account), csrf: session.csrf },
          { "Set-Cookie": session.cookie },
        );
      }
      if (path.startsWith("/api/") || path.startsWith("/analysis-files/")) {
        if (!user) throw new HttpError(401, "Entre no ARGOS para continuar.");
        if (write && request.headers["x-csrf-token"] !== user.csrf)
          throw new HttpError(
            403,
            "Sessão de formulário inválida. Atualize a página.",
          );
      }
      if (path === "/api/me" && method === "GET")
        return json(response, 200, { user: publicUser(user), csrf: user.csrf });
      if (path === "/api/logout" && method === "POST") {
        db.prepare("DELETE FROM sessions WHERE user_id=? AND csrf=?").run(
          user.id,
          user.csrf,
        );
        return json(
          response,
          200,
          { ok: true },
          {
            "Set-Cookie":
              "argos_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
          },
        );
      }
      if (path === "/api/state" && method === "GET")
        return json(response, 200, { state: getState(db, user), areas });
      if (path.startsWith("/api/records/") && method === "POST") {
        const record = createRecord(
          db,
          user,
          path.split("/")[3],
          await body(request),
          areas,
        );
        return json(response, 201, { record });
      }
      const review = path.match(/^\/api\/readings\/([^/]+)\/review$/);
      if (review && method === "POST") {
        const input = await body(request);
        return json(response, 200, {
          record: reviewReading(db, user, review[1], input.status, input.note),
        });
      }
      const correction = path.match(/^\/api\/readings\/([^/]+)$/);
      if (correction && method === "PUT") {
        return json(response, 200, {
          record: correctReading(
            db,
            user,
            correction[1],
            await body(request),
            areas,
          ),
        });
      }
      if (path === "/api/import" && method === "POST") {
        return json(response, 200, {
          imported: importLegacy(db, user, await body(request), areas),
        });
      }
      if (path === "/api/analytics" && method === "GET") {
        return json(
          response,
          200,
          buildAnalytics(history, getState(db, user), url.searchParams),
        );
      }
      if (path === "/api/map" && method === "GET") {
        requireView(user, "map");
        return json(response, 200, {
          features: mapFeatures(history, getState(db, user), url.searchParams),
        });
      }
      if (path === "/api/station" && method === "GET") {
        requireView(user, "analysis");
        return json(
          response,
          200,
          stationComparison(history, getState(db, user), url.searchParams),
        );
      }
      if (path === "/api/alerts" && method === "GET") {
        return json(response, 200, {
          alerts: operationalAlerts(db, getState(db, user)),
        });
      }
      if (path === "/api/maintenance" && method === "GET") {
        requireView(user, "priority");
        return json(response, 200, {
          items: db
            .prepare(
              "SELECT trap_id,next_on,note,updated_at FROM maintenance ORDER BY next_on",
            )
            .all(),
        });
      }
      if (path === "/api/maintenance" && method === "POST") {
        requireRole(user, ["gestao"]);
        const input = await body(request);
        if (
          !db
            .prepare("SELECT id FROM traps WHERE id=? AND kind='edl'")
            .get(input.trap_id)
        )
          throw new HttpError(404, "Local de EDL não encontrado.");
        if (!isDate(input.next_on))
          throw new HttpError(
            400,
            "Informe uma data válida para a manutenção.",
          );
        const note = String(input.note || "").slice(0, 500);
        db.prepare(
          "INSERT INTO maintenance VALUES (?,?,?,?,?) ON CONFLICT(trap_id) DO UPDATE SET next_on=excluded.next_on,note=excluded.note,updated_by=excluded.updated_by,updated_at=excluded.updated_at",
        ).run(
          input.trap_id,
          input.next_on,
          note,
          user.id,
          new Date().toISOString(),
        );
        audit(db, user, "schedule:maintenance", input.trap_id);
        return json(response, 200, { ok: true });
      }
      if (path === "/api/users" && method === "GET") {
        requireRole(user, ["gestao"]);
        return json(response, 200, {
          users: db
            .prepare(
              "SELECT id,name,email,role,demo FROM users ORDER BY demo,name",
            )
            .all()
            .map(publicUser),
        });
      }
      if (path === "/api/users" && method === "POST") {
        requireRole(user, ["gestao"]);
        const input = await body(request);
        validateNewUser(input);
        const id = randomUUID();
        db.prepare("INSERT INTO users VALUES (?,?,?,?,?,0)").run(
          id,
          input.name.trim(),
          input.email.toLowerCase().trim(),
          input.role,
          hashPassword(input.password),
        );
        audit(db, user, "create:user", id);
        return json(response, 201, { ok: true });
      }
      if (path === "/api/password" && method === "POST") {
        const input = await body(request);
        if (user.demo)
          throw new HttpError(
            400,
            "Use uma conta cadastrada para alterar a senha.",
          );
        if (
          typeof input.current !== "string" ||
          !passwordMatches(input.current, user.password_hash)
        )
          throw new HttpError(400, "A senha atual está incorreta.");
        validateNewUser({
          name: user.name,
          email: user.email,
          role: user.role,
          password: input.password,
        });
        db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(
          hashPassword(input.password),
          user.id,
        );
        db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
        return json(
          response,
          200,
          { ok: true },
          {
            "Set-Cookie":
              "argos_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
          },
        );
      }
      if (path === "/api/files" && method === "GET") {
        requireView(user, "reports");
        return json(response, 200, { files });
      }
      let file;
      if (
        path.startsWith("/analysis-files/") &&
        ["GET", "HEAD"].includes(method)
      ) {
        requireView(user, "reports");
        const name = path.slice("/analysis-files/".length);
        if (
          !files.includes(name) &&
          name !== "graficos/barras_com_filtros.html"
        )
          throw new HttpError(404, "Arquivo não encontrado.");
        file = resolve(ANALYSIS_ROOT, name);
        if (url.searchParams.has("download"))
          response.setHeader(
            "Content-Disposition",
            'attachment; filename="' + basename(name) + '"',
          );
      } else if (path.startsWith("/vendor/leaflet/")) {
        const name = path.slice("/vendor/leaflet/".length);
        if (
          ![
            "leaflet.js",
            "leaflet.css",
            "images/marker-icon.png",
            "images/marker-icon-2x.png",
            "images/marker-shadow.png",
            "images/layers.png",
            "images/layers-2x.png",
          ].includes(name)
        ) {
          throw new HttpError(404, "Arquivo não encontrado.");
        }
        file = resolve(FRONTEND_ROOT, "node_modules/leaflet/dist", name);
      } else {
        const name =
          path === "/" || path === "/login" ? "index.html" : path.slice(1);
        if (!PUBLIC_FILES.has(name) || write)
          throw new HttpError(404, "Página não encontrada.");
        file = resolve(FRONTEND_ROOT, name);
      }
      if (!existsSync(file))
        throw new HttpError(404, "Arquivo não encontrado.");
      const data = readFileSync(file);
      response.writeHead(200, {
        "Content-Type": MIME[extname(file)] || "application/octet-stream",
        "Content-Length": data.length,
      });
      response.end(method === "HEAD" ? undefined : data);
    } catch (error) {
      const constraint =
        String(error.code || "").includes("CONSTRAINT") ||
        /UNIQUE constraint/.test(error.message);
      const status = error.status || (constraint ? 409 : 500);
      if (status === 500) console.error("Falha da API:", error.message);
      json(response, status, {
        message: constraint
          ? "Já existe um registro com este identificador."
          : error.status
            ? error.message
            : "Não foi possível concluir a operação.",
        errors: error.errors,
      });
    }
  });
  return { server, db, history, host, demoEnabled, initialPassword };
}
