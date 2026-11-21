import { escapeHtml as esc, number, displayDate } from "./api.mjs";

export function heading(title, subtitle, actions = "") {
  return (
    '<header class="area-heading"><div><h2 tabindex="-1">' +
    esc(title) +
    "</h2><p>" +
    esc(subtitle) +
    "</p></div>" +
    actions +
    "</header>"
  );
}
export function cards(items) {
  return (
    '<div class="overview-cards">' +
    items
      .map(
        (item) =>
          "<article><span>" +
          esc(item.label) +
          "</span><strong>" +
          esc(item.value) +
          "</strong><small>" +
          esc(item.note || "") +
          "</small></article>",
      )
      .join("") +
    "</div>"
  );
}
export function sourceNote(data) {
  if (data.source === "operational") {
    return '<p class="data-note">Operação atual do servidor. Indicadores calculados apenas com leituras validadas pelo laboratório.</p>';
  }
  return (
    '<p class="data-note">Histórico GEVACZ de ' +
    displayDate(data.period.start) +
    " a " +
    displayDate(data.period.end) +
    ". " +
    (data.mode === "observed"
      ? "Leituras estimadas por média excluídas."
      : number(data.imputedInSource) +
        " leituras estimadas por média incluídas neste recorte.") +
    " Uma OVT pode contribuir com leituras em vários ciclos.</p>"
  );
}
export function indicatorCards(summary) {
  return cards([
    {
      label: "Ovos no recorte",
      value: number(summary.eggs),
      note: number(summary.records) + " registros de leitura",
    },
    {
      label: "Leituras examinadas",
      value: number(summary.examined),
      note: number(summary.positive) + " positivas",
    },
    {
      label: "IPO",
      value: number(summary.ipo, 2) + (summary.ipo === null ? "" : "%"),
      note: "Positivas ÷ examinadas",
    },
    {
      label: "IDV",
      value: number(summary.idv, 2),
      note: "Ovos por leitura examinada",
    },
  ]);
}
export function bars(rows, key, label, limit = 12) {
  if (!rows.length)
    return '<p class="empty-state">Ainda não há leituras neste recorte.</p>';
  const selected = rows.slice(0, limit);
  const max = Math.max(1, ...selected.map((row) => row[key] || 0));
  return (
    '<section class="chart-panel"><h3>' +
    esc(label) +
    '</h3><div class="comparison-bars">' +
    selected
      .map(
        (row) =>
          '<div class="comparison-row"><span>' +
          esc(row.name) +
          '</span><div class="bar-track"><i style="width:' +
          ((100 * (row[key] || 0)) / max).toFixed(2) +
          '%"></i></div><strong>' +
          number(row[key], key === "idv" ? 2 : 0) +
          "</strong></div>",
      )
      .join("") +
    "</div></section>"
  );
}
export function indicatorTable(rows) {
  if (!rows.length)
    return '<p class="empty-state">Nenhum registro neste recorte.</p>';
  return (
    '<div class="table-wrap" tabindex="0" role="region" aria-label="Indicadores por território"><table><thead><tr>' +
    "<th>Território</th><th>OVTs distintas</th><th>Leituras</th><th>Ovos</th><th>IPO</th><th>IDO</th><th>IDV</th>" +
    "</tr></thead><tbody>" +
    rows
      .map(
        (row) =>
          "<tr><td>" +
          esc(row.name) +
          "</td><td>" +
          number(row.traps) +
          "</td><td>" +
          number(row.examined) +
          "</td><td>" +
          number(row.eggs) +
          "</td><td>" +
          number(row.ipo, 2) +
          "%</td><td>" +
          number(row.ido, 2) +
          "</td><td>" +
          number(row.idv, 2) +
          "</td></tr>",
      )
      .join("") +
    "</tbody></table></div>"
  );
}
export function qualityCard(data) {
  const q = data.dataQuality;
  return (
    '<section class="chart-panel"><h3>Qualidade da base espacial</h3><dl class="quality-list">' +
    [
      ["Locais de EDL", q.edlLocations],
      ["Estações nesses locais", q.edlStations],
      ["Posições estimadas por endereço", q.estimatedPositions],
      ["Locais sem posição", q.missingPositions],
      ["Instalação conhecida só pelo mês", q.monthOnlyDates],
      ["Locais sem data de instalação", q.missingDates],
    ]
      .map(
        ([label, value]) =>
          "<div><dt>" +
          esc(label) +
          "</dt><dd>" +
          number(value) +
          "</dd></div>",
      )
      .join("") +
    '</dl><p class="muted">As coordenadas estimadas e as datas incompletas exigem conferência em campo.</p></section>'
  );
}
export function filtersMarkup(filters, areas, options = {}) {
  const districts = [...new Set(areas.map((row) => row.district))];
  const neighborhoods = areas.filter(
    (row) => !filters.district || row.district === filters.district,
  );
  const option = (value, label, selected) =>
    '<option value="' +
    esc(value) +
    '"' +
    (selected ? " selected" : "") +
    ">" +
    esc(label) +
    "</option>";
  return (
    '<div class="area-filters">' +
    (options.source
      ? '<label>Fonte<select data-filter="source">' +
        option(
          "historical",
          "Histórico 2026",
          filters.source !== "operational",
        ) +
        option(
          "operational",
          "Operação atual",
          filters.source === "operational",
        ) +
        "</select></label>"
      : "") +
    '<label>Distrito<select data-filter="district">' +
    option("", "Todos os distritos", !filters.district) +
    districts
      .map((d) => option(d, "DS " + d, filters.district === d))
      .join("") +
    "</select></label>" +
    (options.neighborhood === false
      ? ""
      : '<label>Bairro<select data-filter="neighborhood">' +
        option("", "Todos os bairros", !filters.neighborhood) +
        neighborhoods
          .map((row) =>
            option(row.name, row.name, filters.neighborhood === row.name),
          )
          .join("") +
        "</select></label>") +
    (options.cycle
      ? '<label>Ciclo<select data-filter="cycle">' +
        option("", "Todos os ciclos", !filters.cycle) +
        (options.cycleValues || Array.from({ length: 12 }, (_, i) => i + 1))
          .map((cycle) =>
            option(
              String(cycle),
              "Ciclo " + cycle,
              filters.cycle === String(cycle),
            ),
          )
          .join("") +
        "</select></label>"
      : "") +
    '<label>Regra dos dados<select data-filter="mode">' +
    option("consolidated", "Consolidado da main", filters.mode !== "observed") +
    option(
      "observed",
      "Somente contagens observadas",
      filters.mode === "observed",
    ) +
    "</select></label>" +
    '<button class="button secondary" type="button" id="area-refresh">Atualizar</button></div>'
  );
}
