import { api, escapeHtml as esc, number, displayDate } from "./api.mjs";
import {
  heading,
  cards,
  indicatorCards,
  sourceNote,
  bars,
  indicatorTable,
  qualityCard,
  filtersMarkup,
} from "./panels.mjs";
import { drawMap, destroyMap } from "./map.mjs";
import { fieldOverview } from "./field-overview.mjs";

const filters = {
  district: "",
  neighborhood: "",
  cycle: "",
  source: "historical",
  mode: "consolidated",
};
let visibleView = "";
let selectedStation = "";
let selectedRadius = "400";
let renderGeneration = 0;
const $ = (selector) => document.querySelector(selector);
const table = (headers, rows) =>
  '<div class="table-wrap" tabindex="0"><table><thead><tr>' +
  headers.map((label) => "<th>" + esc(label) + "</th>").join("") +
  "</tr></thead><tbody>" +
  rows
    .map(
      (row) =>
        "<tr>" + row.map((cell) => "<td>" + cell + "</td>").join("") + "</tr>",
    )
    .join("") +
  "</tbody></table></div>";

export async function renderWorkspace(view, context) {
  visibleView = view;
  const generation = ++renderGeneration;
  context = { ...context, isCurrent: () => generation === renderGeneration };
  destroyMap();
  const container = $("#workspace-panel");
  container.innerHTML =
    '<p class="empty-state" role="status">Carregando os dados do ARGOS…</p>';
  const state = context.getState();
  try {
    if (view === "settings") return await settings(container, context);
    if (view === "alerts") return await alerts(container, context);
    if (view === "analysis") return await station(container, context);
    const data = await api("/api/analytics?" + new URLSearchParams(filters));
    if (generation !== renderGeneration) return;
    const names = {
      dashboard: [
        "Visão geral",
        "Histórico da GEVACZ e acompanhamento da operação.",
      ],
      map: [
        "Mapa de OVTs e EDLs",
        "Posições da base da main e novos cadastros do servidor.",
      ],
      reports: [
        "Relatórios e gráficos",
        "Visualizações e arquivos analíticos da equipe, integrados ao ARGOS.",
      ],
      priority: [
        "Priorização e manutenção",
        "Triagem territorial pelos indicadores e agenda das estações.",
      ],
    };
    const [title, subtitle] = names[view];
    const relevant = ["map", "priority"].includes(view)
      ? { neighborhood: true, source: view === "priority" }
      : { source: true, cycle: true };
    relevant.cycleValues = [
      ...new Set([
        ...Array.from({ length: 12 }, (_, i) => i + 1),
        ...state.collection.map((row) => row.cycle),
      ]),
    ].sort((a, b) => a - b);
    container.innerHTML =
      heading(title, subtitle) +
      filtersMarkup(filters, context.areas, relevant);
    container.querySelectorAll("[data-filter]").forEach((control) =>
      control.addEventListener("change", () => {
        filters[control.dataset.filter] = control.value;
        if (control.dataset.filter === "district") filters.neighborhood = "";
        renderWorkspace(view, context);
      }),
    );
    $("#area-refresh").onclick = async () => {
      await context.refresh();
      renderWorkspace(view, context);
    };
    if (view === "dashboard") {
      const op = data.operational;
      container.insertAdjacentHTML(
        "beforeend",
        sourceNote(data) +
          indicatorCards(data.summary) +
          '<section class="operation-strip"><div><span class="section-kicker">Operação do servidor</span><h3>Do campo ao laboratório</h3></div>' +
          "<p><strong>" +
          number(op.collections) +
          "</strong> coletas</p><p><strong>" +
          number(op.pending) +
          "</strong> aguardando validação</p><p><strong>" +
          number(op.validated) +
          "</strong> leituras validadas</p><p><strong>" +
          number(op.review) +
          "</strong> em revisão</p>" +
          '<button type="button" class="button secondary" data-view="' +
          (context.user.views.includes("reading")
            ? "reading"
            : context.user.views.includes("collection")
              ? "collection"
              : "reports") +
          '">Abrir operação</button></section>' +
          '<div class="chart-columns">' +
          bars(data.byCycle, "idv", "Evolução de ovos por leitura examinada") +
          qualityCard(data) +
          "</div>",
      );
      if (context.user.role === "campo") {
        container.insertAdjacentHTML("beforeend", fieldOverview(data, filters));
      }
    }
    if (view === "map") {
      container.insertAdjacentHTML(
        "beforeend",
        '<div class="map-layout"><div id="geographic-map" aria-label="Mapa interativo de Recife"></div>' +
          '<aside class="map-explainer"><h3>Leitura do mapa</h3><p><i class="legend-ovt"></i> Ovitrampas</p>' +
          '<p><i class="legend-edl"></i> Locais de EDL</p><p>Clique em uma EDL para ver os círculos de 300 e 400 metros e abrir a análise por estação.</p>' +
          "<p>O contorno municipal do IBGE está disponível offline. As ruas online podem ser ativadas no controle de camadas. As posições estimadas são identificadas nos pontos.</p></aside></div>" +
          '<p id="map-status" class="data-note" role="status">Carregando os pontos…</p>',
      );
      await drawMap("geographic-map", filters, (id) => {
        selectedStation = id;
        context.navigate("analysis");
      });
    }
    if (view === "reports") {
      container.insertAdjacentHTML(
        "beforeend",
        sourceNote(data) +
          indicatorCards(data.summary) +
          '<div class="chart-columns">' +
          bars(
            data.byNeighborhood,
            "eggs",
            "Ovos por bairro · até 12 bairros",
          ) +
          bars(data.byNeighborhood, "examined", "Leituras nos mesmos bairros") +
          "</div>" +
          '<section class="chart-panel"><h3>Indicadores por território</h3>' +
          indicatorTable(
            filters.district ? data.byNeighborhood : data.byDistrict,
          ) +
          "</section>" +
          '<section class="chart-panel main-charts"><header><div><h3>Painel consolidado da main</h3><p>As seis visualizações originais da equipe, com seus próprios filtros.</p></div>' +
          '<a class="button secondary" href="/analysis-files/graficos/barras_com_filtros.html" target="_blank" rel="noopener">Abrir painel completo</a></header>' +
          '<p class="data-note">Este painel mantém o consolidado da main, incluindo 1.011 leituras preenchidas por média. ' +
          "Os filtros desta seção são independentes dos filtros acima.</p>" +
          '<iframe title="Seis gráficos da análise histórica da main" src="/analysis-files/graficos/barras_com_filtros.html" loading="lazy"></iframe></section>' +
          '<section class="chart-panel"><h3>Arquivos da análise</h3><div id="analysis-downloads">Carregando arquivos…</div></section>' +
          '<details class="chart-panel"><summary>Figuras Python da equipe</summary><div id="python-gallery" class="python-gallery"></div></details>',
      );
      const { files } = await api("/api/files");
      if (view !== visibleView) return;
      $("#analysis-downloads").innerHTML = files
        .filter((name) => !name.endsWith(".png"))
        .map(
          (name) =>
            '<a class="download-item" href="/analysis-files/' +
            esc(name) +
            '?download=1">' +
            esc(name) +
            "</a>",
        )
        .join("");
      $("#python-gallery").innerHTML = files
        .filter((name) => name.endsWith(".png"))
        .map(
          (name) =>
            '<figure><img loading="lazy" src="/analysis-files/' +
            esc(name) +
            '" alt="' +
            esc(
              name
                .replace("graficos/", "")
                .replace(".png", "")
                .replaceAll("_", " "),
            ) +
            '"><figcaption>' +
            esc(name) +
            "</figcaption></figure>",
        )
        .join("");
    }
    if (view === "priority") {
      container.insertAdjacentHTML(
        "beforeend",
        '<p class="data-note">Triagem descritiva por IDV. A coluna de leituras mostra o esforço de coleta. A seleção de novas instalações exige avaliar cobertura, população e a qualidade da base.</p>' +
          bars(
            data.byNeighborhood,
            "idv",
            "Bairros com maior IDV no recorte",
            10,
          ) +
          '<section class="chart-panel"><h3>Agenda de manutenção</h3><div id="maintenance-content"></div></section>',
      );
      const { items } = await api("/api/maintenance");
      const edls = state.edl;
      $("#maintenance-content").innerHTML =
        (context.user.role === "gestao"
          ? '<form id="maintenance-form" class="inline-form"><label>Local de EDL<select name="trap_id" required>' +
            edls
              .map(
                (row) =>
                  '<option value="' +
                  esc(row.id) +
                  '">' +
                  esc(row.code + " · " + (row.name || row.neighborhood)) +
                  "</option>",
              )
              .join("") +
            '</select></label><label>Próxima visita<input type="date" name="next_on" required></label><label>Orientação<input name="note" maxlength="500"></label>' +
            '<button class="button primary">Agendar manutenção</button></form>'
          : "") +
        (items.length
          ? table(
              ["Local", "Data prevista", "Orientação"],
              items.map((item) => [
                esc(
                  edls.find((row) => row.id === item.trap_id)?.code ||
                    item.trap_id,
                ),
                displayDate(item.next_on),
                esc(item.note),
              ]),
            )
          : '<p class="empty-state">Nenhuma manutenção agendada.</p>');
      $("#maintenance-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        await act(async () => {
          await api("/api/maintenance", {
            method: "POST",
            body: Object.fromEntries(new FormData(event.currentTarget)),
          });
          context.notify("Manutenção agendada no banco.");
          await renderWorkspace(view, context);
        }, context);
      });
    }
  } catch (error) {
    if (generation === renderGeneration)
      container.innerHTML = heading(
        "Não foi possível carregar esta área",
        error.message,
      );
  }
}
async function station(container, context) {
  const state = context.getState();
  selectedStation ||=
    state.edl.find(
      (row) =>
        row.date_precision === "dia" &&
        row.installed_on >= "2026-03-01" &&
        row.installed_on < "2026-06-01",
    )?.id || state.edl[0]?.id;
  container.innerHTML =
    heading(
      "Análise por EDL",
      "Comparação em quatro semanas antes e quatro semanas depois da instalação.",
    ) +
    '<div class="area-filters"><label class="wide-filter">Local de EDL<select id="station-select">' +
    state.edl
      .map(
        (row) =>
          '<option value="' +
          esc(row.id) +
          '"' +
          (row.id === selectedStation ? " selected" : "") +
          ">" +
          esc(
            row.code +
              " · " +
              (row.name || row.neighborhood) +
              " · DS " +
              row.district,
          ) +
          "</option>",
      )
      .join("") +
    '</select></label><label>Fonte<select id="station-source"><option value="historical">Histórico da main</option><option value="operational"' +
    (filters.source === "operational" ? " selected" : "") +
    '>Operação atual</option></select></label><label>Raio<select id="station-radius"><option value="300">300 metros</option><option value="400"' +
    (selectedRadius === "400" ? " selected" : "") +
    ">400 metros</option></select></label>" +
    '<label>Regra dos dados<select id="station-mode"><option value="consolidated">Consolidado da main</option><option value="observed"' +
    (filters.mode === "observed" ? " selected" : "") +
    '>Somente contagens observadas</option></select></label></div><div id="station-result"></div>';
  async function update() {
    selectedStation = $("#station-select").value;
    selectedRadius = $("#station-radius").value;
    filters.mode = $("#station-mode").value;
    filters.source = $("#station-source").value;
    const data = await api(
      "/api/station?" +
        new URLSearchParams({
          edl: selectedStation,
          radius: selectedRadius,
          mode: filters.mode,
          source: filters.source,
        }),
    );
    if (!context.isCurrent()) return;
    const target = $("#station-result");
    if (!target) return;
    if (!data.available) {
      target.innerHTML = '<p class="empty-state">' + esc(data.reason) + "</p>";
      return;
    }
    const g = data.groups;
    target.innerHTML =
      '<p class="data-note">Instalação em ' +
      displayDate(data.edl.installed_on) +
      ". " +
      (data.edl.coordinate_source === "endereco"
        ? "Posição estimada por endereço. "
        : "") +
      esc(data.note) +
      "</p>" +
      cards([
        {
          label: "IDV dentro · antes",
          value: number(g.insideBefore.idv, 2),
          note: number(g.insideBefore.examined) + " leituras",
        },
        {
          label: "IDV dentro · depois",
          value: number(g.insideAfter.idv, 2),
          note: number(g.insideAfter.examined) + " leituras",
        },
        {
          label: "Variação dentro",
          value:
            number(data.insideChange, 2) +
            (data.insideChange === null ? "" : "%"),
          note: "Comparação descritiva",
        },
        {
          label: "Variação fora",
          value:
            number(data.outsideChange, 2) +
            (data.outsideChange === null ? "" : "%"),
          note: "OVTs fora do raio",
        },
      ]) +
      '<div class="chart-columns">' +
      bars(
        data.weeks.map((row) => ({
          name: "Semana " + row.week,
          idv: row.inside.idv,
        })),
        "idv",
        "Dentro do raio · ovos por leitura",
        8,
      ) +
      bars(
        data.weeks.map((row) => ({
          name: "Semana " + row.week,
          idv: row.outside.idv,
        })),
        "idv",
        "Fora do raio · ovos por leitura",
        8,
      ) +
      "</div>" +
      '<p class="data-note">As duas colunas usam escalas próprias. Consulte os valores e os denominadores abaixo.</p>' +
      table(
        [
          "Grupo",
          "Período",
          "Leituras examinadas",
          "Leituras estimadas",
          "Ovos",
          "IPO",
          "IDO",
          "IDV",
        ],
        [
          ["Dentro", "Antes", g.insideBefore],
          ["Dentro", "Depois", g.insideAfter],
          ["Fora", "Antes", g.outsideBefore],
          ["Fora", "Depois", g.outsideAfter],
        ].map(([group, period, s]) => [
          group,
          period,
          number(s.examined),
          number(s.imputed),
          number(s.eggs),
          number(s.ipo, 2),
          number(s.ido, 2),
          number(s.idv, 2),
        ]),
      );
  }
  for (const id of [
    "station-select",
    "station-radius",
    "station-mode",
    "station-source",
  ]) {
    $("#" + id).onchange = () => act(update, context);
  }
  await update();
}
async function alerts(container, context) {
  const { alerts: items } = await api("/api/alerts");
  if (!context.isCurrent()) return;
  container.innerHTML =
    heading(
      "Alertas e devolutivas",
      "Pendências das coletas, revisão do laboratório e agenda.",
    ) +
    '<div class="alerts-list">' +
    (items.length
      ? items
          .map(
            (item) =>
              '<article class="alert-item"><span class="alert-symbol">!</span><div><h3>' +
              esc(item.title) +
              "</h3><p>" +
              esc(item.detail) +
              "</p></div>" +
              (context.user.views.includes(item.view)
                ? '<button type="button" class="button secondary" data-view="' +
                  esc(item.view) +
                  '">Abrir</button>'
                : "") +
              "</article>",
          )
          .join("")
      : '<p class="empty-state">As coletas e a agenda estão sem pendências registradas.</p>') +
    "</div>";
}
async function settings(container, context) {
  const user = context.user;
  let users = [];
  if (user.role === "gestao") users = (await api("/api/users")).users;
  if (!context.isCurrent()) return;
  let legacyAvailable = false;
  try {
    legacyAvailable = !!localStorage.getItem("argos.operacional.v1");
  } catch {}
  container.innerHTML =
    heading(
      "Configurações e acesso",
      "Contas, perfis e importação dos registros anteriores.",
    ) +
    '<section class="chart-panel"><h3>Seu acesso</h3><p>' +
    esc(user.name) +
    " · " +
    esc(user.roleLabel) +
    "</p>" +
    (user.demo
      ? '<p class="data-note">Você está usando uma conta de demonstração local. As operações são persistidas no banco do servidor.</p>'
      : '<form id="password-form" class="inline-form"><label>Senha atual<input type="password" name="current" autocomplete="current-password" required></label>' +
        '<label>Nova senha<input type="password" name="password" minlength="12" maxlength="128" autocomplete="new-password" required></label><button class="button primary">Alterar senha</button></form>') +
    "</section>" +
    (user.role === "gestao"
      ? '<section class="chart-panel"><h3>Usuários e permissões</h3>' +
        '<form id="user-form" class="inline-form"><label>Nome<input name="name" maxlength="100" required></label>' +
        '<label>E-mail<input type="email" name="email" required></label><label>Perfil<select name="role"><option value="campo">Agente de Campo</option>' +
        '<option value="laboratorio">Laboratório</option><option value="diretoria">Diretoria</option><option value="gestao">Gestão</option></select></label>' +
        '<label>Senha inicial<input type="password" name="password" minlength="12" maxlength="128" autocomplete="new-password" required></label><button class="button primary">Criar usuário</button></form>' +
        table(
          ["Nome", "E-mail", "Perfil"],
          users.map((item) => [
            esc(item.name),
            esc(item.email),
            esc(item.roleLabel),
          ]),
        ) +
        "</section>" +
        (legacyAvailable
          ? '<section class="chart-panel"><h3>Registros anteriores deste navegador</h3><p>Importe os cadastros e coletas da versão local para o banco do servidor.</p>' +
            '<button class="button secondary" id="legacy-import">Importar registros do navegador</button></section>'
          : "")
      : "");
  $("#user-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    act(async () => {
      await api("/api/users", { method: "POST", body: data });
      context.notify("Usuário cadastrado.");
      await renderWorkspace("settings", context);
    }, context);
  });
  $("#password-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    act(async () => {
      await api("/api/password", { method: "POST", body: data });
      context.notify("Senha alterada. Entre novamente.");
      context.logout();
    }, context);
  });
  $("#legacy-import")?.addEventListener("click", () =>
    act(async () => {
      const data = JSON.parse(localStorage.getItem("argos.operacional.v1"));
      const result = await api("/api/import", { method: "POST", body: data });
      context.notify(number(result.imported) + " registros importados.");
      await context.refresh();
    }, context),
  );
}
async function act(action, context) {
  try {
    await action();
  } catch (error) {
    context.notify(error.message);
  }
}
