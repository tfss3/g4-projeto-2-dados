import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { HttpError } from "./auth.mjs";
import { isDate, today, nextCollectionDate } from "../model.mjs";

export function distanceMeters(a, b) {
  const rad = (value) => (value * Math.PI) / 180;
  const lat = rad(b.latitude - a.latitude);
  const lon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(lon / 2) ** 2;
  return (
    6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))
  );
}
export function indicators(rows) {
  const examined = rows.filter((row) => Number.isFinite(row.eggs));
  const eggs = examined.reduce((sum, row) => sum + row.eggs, 0);
  const positive = examined.filter((row) => row.eggs > 0).length;
  return {
    records: rows.length,
    examined: examined.length,
    positive,
    eggs,
    imputed: rows.filter((row) => row.imputed).length,
    ipo: examined.length ? (100 * positive) / examined.length : null,
    ido: positive ? eggs / positive : null,
    idv: examined.length ? eggs / examined.length : null,
  };
}
function grouped(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const label = String(row[key] || "Sem informação");
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(row);
  }
  return [...groups].map(([name, items]) => ({
    name,
    ...indicators(items),
    traps: new Set(items.map((row) => row.ovtCode)).size,
  }));
}
function hasCoordinates(row) {
  return (
    Number.isFinite(row.latitude) &&
    Number.isFinite(row.longitude) &&
    row.latitude >= -8.2 &&
    row.latitude <= -7.8 &&
    row.longitude >= -35.1 &&
    row.longitude <= -34.8
  );
}
export function loadHistorical(path) {
  if (!existsSync(path))
    throw new Error("Banco histórico não encontrado: " + path);
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const readings = db
      .prepare(
        "SELECT id,id_ovt,ds,bairro,ciclos,dt_coleta,n_ovos,n_ovos_imputado FROM ovt",
      )
      .all()
      .map((row) => ({
        id: "historical-reading-" + row.id,
        ovtCode: row.id_ovt,
        district: row.ds,
        neighborhood: row.bairro,
        cycle: row.ciclos,
        collected_on: row.dt_coleta,
        eggs: row.n_ovos,
        imputed: !!row.n_ovos_imputado,
      }));
    const last = new Map();
    for (const reading of readings) {
      if (
        isDate(reading.collected_on) &&
        reading.collected_on > (last.get(reading.ovtCode) || "")
      ) {
        last.set(reading.ovtCode, reading.collected_on);
      }
    }
    const ovts = db
      .prepare(
        "SELECT id_ovt,ds,bairro,endereco,lat,lon,fonte_coord,status_coord,dt_instalacao_ovt FROM ovt_cadastro",
      )
      .all()
      .map((row) => ({
        id: "historical-ovt-" + row.id_ovt,
        kind: "ovt",
        code: row.id_ovt,
        district: row.ds,
        neighborhood: row.bairro,
        address: row.endereco || "",
        latitude: row.lat,
        longitude: row.lon,
        coordinate_source: row.fonte_coord,
        coordinate_status: row.status_coord,
        installed_on: row.dt_instalacao_ovt,
        last_collected_on: last.get(row.id_ovt),
        status: "Ativa",
        source: "historical",
        responsible: "Cadastro histórico GEVACZ",
        createdAt: "",
        notes: "",
      }));
    const edls = db
      .prepare(
        "SELECT id_edl,ds,nome,logradouro,bairro,lat,lon,fonte_coord,precisao_local,qtd_edl,dt_instalacao,precisao_data FROM edl_local",
      )
      .all()
      .map((row) => ({
        id: "historical-edl-" + row.id_edl,
        kind: "edl",
        code: String(row.id_edl),
        name: row.nome,
        district: row.ds,
        neighborhood: row.bairro || "",
        address: row.logradouro || "",
        latitude: row.lat,
        longitude: row.lon,
        coordinate_source: row.fonte_coord,
        coordinate_status: row.precisao_local,
        quantity: row.qtd_edl || 0,
        installed_on: row.dt_instalacao,
        date_precision: row.precisao_data,
        status: "Ativa",
        source: "historical",
        responsible: "Cadastro histórico GEVACZ",
        createdAt: "",
        notes: "",
      }));
    const proximity = db
      .prepare(
        "SELECT id_ovt,dist_m,id_edl_proxima,faixa_dist FROM ovt_proximidade",
      )
      .all();
    const prox = new Map(proximity.map((row) => [row.id_ovt, row]));
    for (const reading of readings) {
      const item = prox.get(reading.ovtCode);
      reading.distance = item?.dist_m ?? null;
      reading.nearestEdl = item?.id_edl_proxima;
    }
    return { readings, ovts, edls };
  } finally {
    db.close();
  }
}

export function operationalRows(state) {
  const collections = new Map(state.collection.map((row) => [row.id, row]));
  const traps = new Map(state.ovt.map((row) => [row.id, row]));
  const stations = state.edl.filter(hasCoordinates);
  return state.reading
    .filter((row) => row.review_status === "Validado")
    .map((row) => {
      const collection = collections.get(row.collection_id);
      const trap = traps.get(collection.ovt_id);
      const distances = hasCoordinates(trap)
        ? stations.map((edl) => distanceMeters(trap, edl))
        : [];
      return {
        ovtCode: trap.code,
        district: trap.district,
        neighborhood: trap.neighborhood,
        cycle: collection.cycle,
        collected_on: collection.collected_on,
        imputed: false,
        distance: distances.length ? Math.min(...distances) : null,
        eggs: row.examination === "Examinada" ? row.egg_count : null,
      };
    });
}

export function buildAnalytics(history, state, params) {
  const source =
    params.get("source") === "operational" ? "operational" : "historical";
  const mode = params.get("mode") === "observed" ? "observed" : "consolidated";
  const district = params.get("district") || "";
  const neighborhood = params.get("neighborhood") || "";
  const cycle = params.get("cycle") || "";
  let rows =
    source === "operational" ? operationalRows(state) : history.readings;
  rows = rows.filter(
    (row) =>
      (!district || row.district === district) &&
      (!neighborhood || row.neighborhood === neighborhood) &&
      (!cycle || String(row.cycle) === cycle),
  );
  const beforeExclusion = indicators(rows);
  if (mode === "observed") rows = rows.filter((row) => !row.imputed);
  const summary = indicators(rows);
  const dates = rows
    .map((row) => row.collected_on)
    .filter(isDate)
    .sort();
  const byDistrict = grouped(rows, "district").sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const byNeighborhood = grouped(rows, "neighborhood").sort(
    (a, b) => (b.idv ?? -1) - (a.idv ?? -1),
  );
  return {
    source,
    mode,
    summary,
    imputedInSource: beforeExclusion.imputed,
    period: { start: dates[0] || null, end: dates.at(-1) || null },
    byDistrict,
    byNeighborhood,
    byCycle: grouped(rows, "cycle").sort(
      (a, b) => Number(a.name) - Number(b.name),
    ),
    dataQuality: {
      edlLocations: history.edls.length,
      edlStations: history.edls.reduce((sum, row) => sum + row.quantity, 0),
      estimatedPositions: history.edls.filter(
        (row) => row.coordinate_source === "endereco",
      ).length,
      missingPositions: history.edls.filter((row) => !hasCoordinates(row))
        .length,
      missingDates: history.edls.filter((row) => !row.installed_on).length,
      monthOnlyDates: history.edls.filter((row) => row.date_precision === "mes")
        .length,
    },
    operational: {
      ovts: state.ovt.filter((row) => row.source !== "historical").length,
      edls: state.edl.filter((row) => row.source !== "historical").length,
      collections: state.collection.length,
      readings: state.reading.length,
      pending: state.collection.filter(
        (c) =>
          !state.reading.some(
            (r) => r.collection_id === c.id && r.review_status === "Validado",
          ),
      ).length,
      validated: state.reading.filter((r) => r.review_status === "Validado")
        .length,
      review: state.reading.filter((r) => r.review_status === "Em revisão")
        .length,
    },
  };
}

export function mapFeatures(history, state, params) {
  const district = params.get("district");
  const neighborhood = params.get("neighborhood");
  const mode = params.get("mode");
  const readings = history.readings.filter(
    (row) => mode !== "observed" || !row.imputed,
  );
  const counts = new Map();
  for (const row of readings) {
    if (!counts.has(row.ovtCode)) counts.set(row.ovtCode, []);
    counts.get(row.ovtCode).push(row);
  }
  const currentReadings = operationalRows(state);
  const inside = (row) =>
    (!district || row.district === district) &&
    (!neighborhood || row.neighborhood === neighborhood);
  return [...state.ovt, ...state.edl]
    .filter((row) => inside(row) && hasCoordinates(row))
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      code: row.code,
      name: row.name || row.code,
      district: row.district,
      neighborhood: row.neighborhood,
      latitude: row.latitude,
      longitude: row.longitude,
      source: row.source,
      coordinate_source: row.coordinate_source || "campo",
      installed_on: row.installed_on,
      date_precision: row.date_precision || "dia",
      quantity: row.quantity || 1,
      summary:
        row.kind === "ovt" ? indicators(counts.get(row.code) || []) : null,
      operationalSummary:
        row.kind === "ovt"
          ? indicators(
              currentReadings.filter((reading) => reading.ovtCode === row.code),
            )
          : null,
    }));
}

export function stationComparison(history, state, params) {
  const id = params.get("edl");
  const edl = state.edl.find((row) => row.id === id);
  if (!edl) throw new HttpError(404, "Selecione um local de EDL.");
  const radius = Number(params.get("radius") || 400);
  if (![300, 400].includes(radius))
    throw new HttpError(400, "Use um raio de 300 ou 400 metros.");
  const mode = params.get("mode") === "observed" ? "observed" : "consolidated";
  const source =
    params.get("source") === "operational" ? "operational" : "historical";
  const base = { edl, radius, mode, source, windowDays: 28 };
  if (!hasCoordinates(edl))
    return {
      ...base,
      available: false,
      reason: "Este local ainda precisa de coordenadas válidas.",
    };
  if (
    !isDate(edl.installed_on) ||
    (edl.date_precision && edl.date_precision !== "dia")
  ) {
    return {
      ...base,
      available: false,
      reason:
        "A comparação de quatro semanas exige a data de instalação com dia exato.",
    };
  }
  const stationDay = Date.parse(edl.installed_on + "T00:00:00Z");
  const distances = new Map(
    state.ovt
      .filter(hasCoordinates)
      .map((ovt) => [ovt.code, distanceMeters(edl, ovt)]),
  );
  const periods = {
    insideBefore: [],
    insideAfter: [],
    outsideBefore: [],
    outsideAfter: [],
  };
  const weeks = Array.from({ length: 8 }, (_, index) => ({
    week: index < 4 ? index - 4 : index - 3,
    inside: [],
    outside: [],
  }));
  const readingSource =
    source === "operational" ? operationalRows(state) : history.readings;
  for (const row of readingSource) {
    if (
      (mode === "observed" && row.imputed) ||
      !isDate(row.collected_on) ||
      !distances.has(row.ovtCode)
    )
      continue;
    const day = Math.round(
      (Date.parse(row.collected_on + "T00:00:00Z") - stationDay) / 86400000,
    );
    if (day === 0 || day < -28 || day > 28) continue;
    const inside = distances.get(row.ovtCode) <= radius;
    const period =
      (inside ? "inside" : "outside") + (day < 0 ? "Before" : "After");
    periods[period].push(row);
    const index =
      day < 0 ? Math.floor((day + 28) / 7) : 4 + Math.floor((day - 1) / 7);
    weeks[index][inside ? "inside" : "outside"].push(row);
  }
  const groups = Object.fromEntries(
    Object.entries(periods).map(([key, rows]) => [key, indicators(rows)]),
  );
  const change = (before, after) =>
    before.idv > 0 && after.idv !== null
      ? 100 * (after.idv / before.idv - 1)
      : null;
  return {
    ...base,
    available: true,
    groups,
    insideChange: change(groups.insideBefore, groups.insideAfter),
    outsideChange: change(groups.outsideBefore, groups.outsideAfter),
    weeks: weeks.map((week) => ({
      week: week.week,
      inside: indicators(week.inside),
      outside: indicators(week.outside),
    })),
    note: "Janela de 28 dias de cada lado, pela data real da coleta. O dia da instalação é excluído. O grupo externo inclui as demais OVTs do Recife. Comparação descritiva, sujeita a sazonalidade e precisão das coordenadas.",
  };
}

export function operationalAlerts(db, state) {
  const alerts = [];
  for (const collection of state.collection) {
    const reading = state.reading.find(
      (row) => row.collection_id === collection.id,
    );
    const trap = state.ovt.find((row) => row.id === collection.ovt_id);
    if (!reading)
      alerts.push({
        level: "warning",
        title: "Amostra aguardando leitura",
        detail: collection.sample_code + " · " + trap.code,
        view: "reading",
      });
    if (reading?.review_status === "Em revisão")
      alerts.push({
        level: "warning",
        title: "Laboratório solicitou revisão",
        detail: collection.sample_code + " · " + reading.review_note,
        view: "reading",
      });
  }
  const latest = new Map();
  for (const collection of state.collection) {
    if (collection.collected_on > (latest.get(collection.ovt_id) || ""))
      latest.set(collection.ovt_id, collection.collected_on);
  }
  for (const [id, date] of latest) {
    const next = nextCollectionDate(date);
    if (next < today())
      alerts.push({
        level: "warning",
        title: "Coleta prevista em atraso",
        detail:
          state.ovt.find((row) => row.id === id).code +
          " · previsão " +
          next.split("-").reverse().join("/"),
        view: "calendar",
      });
  }
  for (const maintenance of db
    .prepare("SELECT * FROM maintenance WHERE next_on<?")
    .all(today())) {
    const edl = state.edl.find((row) => row.id === maintenance.trap_id);
    if (edl)
      alerts.push({
        level: "warning",
        title: "Manutenção prevista em atraso",
        detail: edl.code + " · " + maintenance.next_on,
        view: "priority",
      });
  }
  return alerts;
}
