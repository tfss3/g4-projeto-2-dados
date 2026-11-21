import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createApplication } from "../backend/http.mjs";
import { HISTORICAL_DB } from "../backend/paths.mjs";

const hash = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

test("API integrada preserva histórico, autentica perfis e persiste o fluxo campo/laboratório", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "argos-api-"));
  const historyHash = hash(HISTORICAL_DB);
  const dbPath = join(directory, "operacao.db");
  const password = "Senha-Local-de-Teste-2026";
  let app = createApplication({ dbPath, adminPassword: password });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  let base = "http://127.0.0.1:" + app.server.address().port;
  const clients = {};

  async function request(
    path,
    { client, method = "GET", body, csrf = true } = {},
  ) {
    const headers = {};
    if (client) headers.Cookie = client.cookie;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      if (client && csrf) headers["X-CSRF-Token"] = client.csrf;
    }
    const response = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    return {
      status: response.status,
      data,
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  async function demo(role) {
    const result = await request("/api/demo", {
      method: "POST",
      body: { role },
    });
    assert.equal(result.status, 200);
    return (clients[role] = { cookie: result.cookie, csrf: result.data.csrf });
  }
  try {
    await t.test(
      "autenticação, CSRF e permissões são exigidos na API",
      async () => {
        assert.equal((await request("/api/state")).status, 401);
        const admin = await request("/api/login", {
          method: "POST",
          body: { email: "admin@argos.local", password },
        });
        assert.equal(admin.status, 200);
        assert.equal(admin.data.user.role, "gestao");
        for (const role of ["gestao", "campo", "laboratorio", "diretoria"])
          await demo(role);
        assert.equal(
          (
            await request("/api/records/ovt", {
              client: clients.diretoria,
              method: "POST",
              body: {},
            })
          ).status,
          403,
        );
        assert.equal(
          (await request("/api/map", { client: clients.campo })).status,
          403,
        );
        assert.equal(
          (
            await request("/api/records/ovt", {
              client: clients.gestao,
              method: "POST",
              body: {},
              csrf: false,
            })
          ).status,
          403,
        );
        assert.equal((await fetch(base + "/backend/schema.sql")).status, 404);
        assert.equal(
          (await fetch(base + "/runtime/operacional.db")).status,
          404,
        );
      },
    );
    await t.test(
      "os totais observados e consolidados conciliam com a main",
      async () => {
        const main = await request("/api/analytics", {
          client: clients.gestao,
        });
        assert.equal(main.data.summary.eggs, 6109375);
        assert.equal(main.data.summary.examined, 30473);
        assert.equal(main.data.summary.imputed, 1011);
        const observed = await request("/api/analytics?mode=observed", {
          client: clients.gestao,
        });
        assert.equal(observed.data.summary.eggs, 5907811);
        assert.equal(observed.data.summary.examined, 29462);
        assert.equal(observed.data.summary.imputed, 0);
        assert.equal(main.data.dataQuality.edlLocations, 378);
        assert.equal(main.data.dataQuality.edlStations, 1429);
      },
    );
    let ovt;
    let collection;
    let reading;
    await t.test(
      "coleta sem ovos, duplicidade e leitura pendente compartilhada entre perfis",
      async () => {
        const data = {
          code: "SAMTEST1001",
          district: "IV",
          neighborhood: "VÁRZEA",
          latitude: "-8.052",
          longitude: "-34.954",
          installed_on: "2026-01-01",
          status: "Ativa",
          responsible: "Equipe de teste",
        };
        let result = await request("/api/records/ovt", {
          client: clients.gestao,
          method: "POST",
          body: data,
        });
        assert.equal(result.status, 201, JSON.stringify(result.data));
        ovt = result.data.record;
        result = await request("/api/records/ovt", {
          client: clients.gestao,
          method: "POST",
          body: data,
        });
        assert.equal(result.status, 422);
        const payload = {
          ovt_id: ovt.id,
          sample_code: "AM-API-C01",
          cycle: "1",
          collected_on: "2026-11-01",
          delivered_on: "2026-11-02",
          responsible: "Outro agente",
          egg_count: "999",
        };
        result = await request("/api/records/collection", {
          client: clients.campo,
          method: "POST",
          body: payload,
        });
        assert.equal(result.status, 201, JSON.stringify(result.data));
        collection = result.data.record;
        assert.equal(Object.hasOwn(collection, "egg_count"), false);
        assert.equal(collection.responsible, "Agente de Campo · demonstração");
        result = await request("/api/records/reading", {
          client: clients.campo,
          method: "POST",
          body: {},
        });
        assert.equal(result.status, 403);
        result = await request("/api/records/reading", {
          client: clients.laboratorio,
          method: "POST",
          body: {
            collection_id: collection.id,
            read_on: "2026-11-03",
            responsible: "Laboratório",
            examination: "Examinada",
            egg_count: "0",
          },
        });
        assert.equal(result.status, 201, JSON.stringify(result.data));
        reading = result.data.record;
        assert.equal(reading.egg_count, 0);
        assert.equal(reading.review_status, "Pendente");
        const state = await request("/api/state", { client: clients.campo });
        assert.equal(state.data.state.reading[0].review_status, "Pendente");
      },
    );
    await t.test(
      "revisão, correção e validação atualizam indicadores operacionais",
      async () => {
        let result = await request("/api/readings/" + reading.id + "/review", {
          client: clients.laboratorio,
          method: "POST",
          body: { status: "Em revisão", note: "Conferir a amostra." },
        });
        assert.equal(result.status, 200);
        let state = await request("/api/state", { client: clients.campo });
        assert.equal(
          state.data.state.reading[0].review_note,
          "Conferir a amostra.",
        );
        result = await request("/api/readings/" + reading.id, {
          client: clients.laboratorio,
          method: "PUT",
          body: {
            read_on: "2026-11-03",
            responsible: "Laboratório",
            examination: "Examinada",
            egg_count: "12",
          },
        });
        assert.equal(result.status, 200, JSON.stringify(result.data));
        assert.equal(result.data.record.review_status, "Pendente");
        await request("/api/readings/" + reading.id + "/review", {
          client: clients.laboratorio,
          method: "POST",
          body: { status: "Validado" },
        });
        const analytics = await request("/api/analytics?source=operational", {
          client: clients.gestao,
        });
        assert.equal(analytics.data.summary.eggs, 12);
        assert.equal(analytics.data.summary.examined, 1);
        assert.equal(analytics.data.operational.pending, 0);
        assert.equal(analytics.data.operational.validated, 1);
        state = await request("/api/state", { client: clients.campo });
        assert.equal(state.data.state.reading[0].review_status, "Validado");
      },
    );
    await t.test(
      "mapa contém pontos reais e janela por EDL depende de dia exato",
      async () => {
        const map = await request("/api/map?district=IV", {
          client: clients.gestao,
        });
        assert.equal(map.status, 200);
        assert.ok(map.data.features.length > 100);
        assert.ok(map.data.features.every((row) => row.district === "IV"));
        const newTrap = map.data.features.find(
          (row) => row.code === "SAMTEST1001",
        );
        assert.equal(newTrap.kind, "ovt");
        assert.equal(newTrap.operationalSummary.idv, 12);
        assert.equal(newTrap.summary.idv, null);
        const state = (await request("/api/state", { client: clients.gestao }))
          .data.state;
        const missing = state.edl.find((row) => !row.installed_on);
        const unavailable = await request("/api/station?edl=" + missing.id, {
          client: clients.gestao,
        });
        assert.equal(unavailable.data.available, false);
        const station = state.edl.find(
          (row) => row.date_precision === "dia" && row.latitude !== null,
        );
        const available = await request(
          "/api/station?" +
            new URLSearchParams({
              edl: station.id,
              mode: "observed",
              radius: "300",
            }),
          { client: clients.gestao },
        );
        assert.equal(available.data.windowDays, 28);
        assert.equal(available.data.weeks.length, 8);
        assert.ok(
          Object.values(available.data.groups).every(
            (row) => row.imputed === 0,
          ),
        );
      },
    );

    await t.test(
      "novos locais alimentam mapa, manutenção e análise operacional",
      async () => {
        const result = await request("/api/records/edl", {
          client: clients.gestao,
          method: "POST",
          body: {
            code: "EDL-API-LOCAL",
            district: "IV",
            neighborhood: "VÁRZEA",
            latitude: "-8.052",
            longitude: "-34.954",
            installed_on: "2026-10-25",
            status: "Ativa",
            responsible: "Equipe QA",
            quantity: "3",
            maintenance_on: "2026-12-01",
          },
        });
        assert.equal(result.status, 201, JSON.stringify(result.data));
        const id = result.data.record.id;
        const comparison = await request(
          "/api/station?" +
            new URLSearchParams({
              edl: id,
              source: "operational",
              radius: "400",
            }),
          { client: clients.gestao },
        );
        assert.equal(comparison.data.groups.insideAfter.eggs, 12);
        const maintenance = await request("/api/maintenance", {
          client: clients.gestao,
        });
        assert.equal(
          maintenance.data.items.find((row) => row.trap_id === id).next_on,
          "2026-12-01",
        );
        const map = await request("/api/map", { client: clients.gestao });
        assert.equal(
          map.data.features.find((row) => row.id === id).quantity,
          3,
        );
        const boundary = await fetch(base + "/assets/recife.geojson");
        assert.equal(boundary.status, 200);
        assert.equal(
          (await boundary.json()).features[0].properties.codarea,
          "2611606",
        );
      },
    );
    await t.test(
      "conta com senha autentica e a troca revoga as sessões antigas",
      async () => {
        const credentials = {
          name: "Agente QA",
          email: "qa@argos.local",
          role: "campo",
          password: "Senha-Original-QA-2026",
        };
        assert.equal(
          (
            await request("/api/users", {
              client: clients.gestao,
              method: "POST",
              body: credentials,
            })
          ).status,
          201,
        );
        const login = await request("/api/login", {
          method: "POST",
          body: credentials,
        });
        assert.equal(login.status, 200);
        const client = { cookie: login.cookie, csrf: login.data.csrf };
        assert.equal(
          (await request("/api/state", { client })).data.state.collection
            .length,
          0,
        );
        const changed = await request("/api/password", {
          client,
          method: "POST",
          body: {
            current: credentials.password,
            password: "Senha-Alterada-QA-2026",
          },
        });
        assert.equal(changed.status, 200);
        assert.equal((await request("/api/state", { client })).status, 401);
        assert.equal(
          (await request("/api/login", { method: "POST", body: credentials }))
            .status,
          401,
        );
        assert.equal(
          (
            await request("/api/login", {
              method: "POST",
              body: { ...credentials, password: "Senha-Alterada-QA-2026" },
            })
          ).status,
          200,
        );
      },
    );
    await t.test(
      "estado e sessão sobrevivem à reabertura do banco",
      async () => {
        await new Promise((resolve) => app.server.close(resolve));
        app.db.close();
        app = createApplication({ dbPath });
        await new Promise((resolve) =>
          app.server.listen(0, "127.0.0.1", resolve),
        );
        base = "http://127.0.0.1:" + app.server.address().port;
        const result = await request("/api/state", { client: clients.campo });
        assert.equal(result.status, 200);
        assert.equal(result.data.state.reading[0].egg_count, 12);
        assert.equal(result.data.state.collection[0].id, collection.id);
        assert.equal(hash(HISTORICAL_DB), historyHash);
      },
    );
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
    app.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
