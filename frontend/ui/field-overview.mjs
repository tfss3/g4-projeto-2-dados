import { escapeHtml as esc, number } from "./api.mjs";
import { bars } from "./panels.mjs";

// The minimum denominator prevents a small sample from driving the field summary.
export function fieldTrend(rows) {
  const series = rows
    .filter((row) => row.examined >= 10 && Number.isFinite(row.idv))
    .sort((a, b) => Number(a.name) - Number(b.name))
    .slice(-6);
  const previous = series.at(-2);
  const current = series.at(-1);
  const change =
    previous &&
    current &&
    previous.idv > 0 &&
    Number(current.name) === Number(previous.name) + 1
      ? (current.idv / previous.idv - 1) * 100
      : null;
  return { series, change };
}

export function fieldOverview(data, filters) {
  if (!filters.neighborhood || data.source !== "historical") {
    return '<section class="chart-panel"><h3>Histórico do bairro para a visita</h3><p>Escolha a fonte Histórico 2026, o distrito e o bairro nos filtros acima para consultar a atividade das ovitrampas na área. A seleção é manual e não define uma área de atuação do agente.</p></section>';
  }
  const { series, change } = fieldTrend(data.byCycle);
  const latest = series.at(-1);
  const summary = latest
    ? "No ciclo " +
      esc(latest.name) +
      ", o bairro registrou " +
      number(latest.eggs) +
      " ovos em " +
      number(latest.examined) +
      " leituras examinadas: média de " +
      number(latest.idv, 2) +
      " ovos por leitura."
    : "Não há ciclos com pelo menos 10 leituras examinadas neste recorte.";
  const variation =
    change === null
      ? "A variação só é exibida quando os dois últimos ciclos elegíveis são consecutivos e a média anterior é maior que zero."
      : "A média " +
        (change < 0 ? "diminuiu " : "aumentou ") +
        number(Math.abs(change), 1) +
        "% entre os dois últimos ciclos exibidos. Essa variação descreve a atividade observada nas ovitrampas.";
  return (
    '<section class="chart-panel"><h3>Para a visita · ' +
    esc(filters.neighborhood) +
    "</h3><p>" +
    summary +
    "</p><p>" +
    variation +
    '</p><p class="muted">Até seis ciclos, com no mínimo dez leituras examinadas por ciclo. Esse histórico não representa as coletas recém-enviadas.</p></section>' +
    bars(series, "idv", "Média de ovos por leitura no bairro", 6)
  );
}
