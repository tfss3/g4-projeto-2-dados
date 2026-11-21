import {
  TYPES,
  emptyState,
  today,
  isDate,
  makeRecord,
  csvCell,
  nextCollectionDate,
  isPlannedCollectionDate,
} from "../model.mjs";
import { api } from "./api.mjs";
import { config, option, formMarkup } from "./forms.mjs";
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
import { icon, hydrate } from "./icons.mjs";
const titleCase = (s) =>
  s
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|[ -])\p{L}/gu, (l) => l.toLocaleUpperCase("pt-BR"));
const dateLabel = (value) =>
  value ? value.slice(0, 10).split("-").reverse().join("/") : "—";
const names = {
  ovt: "OVT",
  edl: "EDL",
  collection: "Coleta",
  reading: "Leitura",
};
let state = emptyState();
let active = "ovt";
let areas = [];
let user;
let context;
let readingEditId = null;
let catalogPage = 0;
const notify = (message) => context.notify(message);
function renderForms() {
  $("#form-panels").innerHTML = TYPES.map(
    (type) =>
      '<section id="panel-' +
      type +
      '" class="panel form-panel" aria-labelledby="form-title-' +
      type +
      '" ' +
      (type === "ovt" ? "" : "hidden") +
      '><header class="form-heading"><span class="heading-icon">' +
      icon(config[type].icon) +
      '</span><div><h2 id="form-title-' +
      type +
      '" tabindex="-1">' +
      config[type].title +
      "</h2><p>" +
      config[type].subtitle +
      "</p></div>" +
      (type === "collection"
        ? '<button class="button secondary calendar-shortcut" type="button" data-view="calendar">' +
          icon("calendar") +
          "Ver calendário</button>"
        : '<span class="required-note"><b>*</b> Campos obrigatórios</span>') +
      '</header><form id="form-' +
      type +
      '" data-type="' +
      type +
      '" novalidate><div class="form-body"><div class="form-error" role="alert" tabindex="-1" hidden></div>' +
      formMarkup(type, areas) +
      '</div><div class="form-footer"><span>' +
      icon("device") +
      'Salvo no banco do servidor</span><div><button class="button secondary" type="reset">Limpar</button><button class="button primary" type="submit">' +
      icon("save") +
      config[type].button +
      "</button></div></div></form></section>",
  ).join("");
  for (const type of TYPES) {
    const form = $("#form-" + type);
    form.addEventListener("input", () => {
      clearErrors(form);
      updateSummary();
      updateConditional();
    });
    form.addEventListener("change", (e) => {
      if (e.target.name === "district") setNeighborhood(form);
      clearErrors(form);
      updateConditional();
      updateSummary();
    });
    form.addEventListener("reset", () =>
      setTimeout(() => {
        if (type === "reading") {
          readingEditId = null;
          updateOptions();
        }
        setResponsibles();
        clearErrors(form);
        if (["ovt", "edl"].includes(type)) setNeighborhood(form);
        updateConditional();
        updateSummary();
      }, 0),
    );
    form.addEventListener(
      "invalid",
      (event) => event.target.setAttribute("aria-invalid", "true"),
      true,
    );
    form.addEventListener("submit", (e) => submit(e, type));
  }
}
function setNeighborhood(form) {
  const control = form.elements.neighborhood,
    district = form.elements.district.value;
  control.innerHTML =
    option("", district ? "Selecione o bairro" : "Selecione o distrito") +
    areas
      .filter((a) => a.district === district)
      .map((a) => option(a.name, titleCase(a.name)))
      .join("");
  control.disabled = !district;
}
function updateOptions() {
  const ovtSelect = $("#form-collection").elements.ovt_id,
    previousOvt = ovtSelect.value;
  const search = ($("#ovt-lookup")?.value || "")
    .trim()
    .toLocaleLowerCase("pt-BR");
  const activeTraps = state.ovt.filter(
    (r) =>
      r.status === "Ativa" &&
      (!search ||
        (r.code + " " + r.neighborhood + " " + r.district)
          .toLocaleLowerCase("pt-BR")
          .includes(search)),
  );
  ovtSelect.innerHTML =
    option("", "Selecione a OVT") +
    activeTraps
      .map((r) => option(r.id, r.code + " · " + titleCase(r.neighborhood)))
      .join("");
  if (activeTraps.some((r) => r.id === previousOvt))
    ovtSelect.value = previousOvt;
  ovtSelect.disabled = !activeTraps.length;
  $("#collection-prerequisite").hidden = !!activeTraps.length;
  const pending = state.collection.filter((c) =>
    readingEditId
      ? state.reading.some(
          (r) => r.collection_id === c.id && r.id === readingEditId,
        )
      : !state.reading.some((r) => r.collection_id === c.id),
  );
  const readSelect = $("#form-reading").elements.collection_id,
    previousCollection = readSelect.value;
  readSelect.innerHTML =
    option("", "Selecione uma coleta pendente") +
    pending
      .map((c) =>
        option(
          c.id,
          c.sample_code +
            " · " +
            state.ovt.find((t) => t.id === c.ovt_id)?.code +
            " · ciclo " +
            c.cycle,
        ),
      )
      .join("");
  if (pending.some((c) => c.id === previousCollection))
    readSelect.value = previousCollection;
  readSelect.disabled = !pending.length;
  $("#reading-prerequisite").hidden = !!pending.length;
}
function updateConditional() {
  const form = $("#form-reading"),
    examined = form.elements.examination.value === "Examinada";
  form.elements.egg_count.disabled = !examined;
  form.elements.egg_count.required = examined;
  form.elements.reason.disabled = examined;
  form.elements.reason.required = !examined;
  $("#reason-field").hidden = examined;
  $("#high-count").hidden = !(
    examined && Number(form.elements.egg_count.value) > 300
  );
}
function clearErrors(form) {
  $$("input,select,textarea", form).forEach((c) => {
    c.setCustomValidity("");
    c.removeAttribute("aria-invalid");
  });
  $(".form-error", form).hidden = true;
}

export function showOperationView(view) {
  if (active !== view) catalogPage = 0;
  active = view;
  for (const type of TYPES) $("#panel-" + type).hidden = type !== view;
  renderCatalog();
  updateConditional();
  updateSummary();
  renderCollectionCalendar();
}

function trapFor(type, record) {
  if (["ovt", "edl"].includes(type)) return record;
  const collection =
    type === "collection"
      ? record
      : state.collection.find((c) => c.id === record.collection_id);
  return state.ovt.find((t) => t.id === collection?.ovt_id);
}
function updateSummary() {
  const f = $("#form-" + active);
  if (!f) return;
  const data = Object.fromEntries(new FormData(f));
  let code = data.code?.toUpperCase() || "Nova " + names[active],
    subtitle = "Preencha os dados para começar",
    rows = [];
  if (["ovt", "edl"].includes(active)) {
    rows = [
      ["Distrito", data.district ? "DS " + data.district : "—"],
      ["Bairro", data.neighborhood ? titleCase(data.neighborhood) : "—"],
      ["Instalação", dateLabel(data.installed_on)],
      ["Responsável", data.responsible || "—"],
    ];
  } else {
    const collection =
      active === "reading"
        ? state.collection.find((c) => c.id === data.collection_id)
        : null;
    const trap = state.ovt.find(
      (t) => t.id === (collection?.ovt_id || data.ovt_id),
    );
    code =
      collection?.sample_code ||
      data.sample_code?.toUpperCase() ||
      (active === "reading" ? "Nova leitura" : "Nova coleta");
    subtitle = trap?.code || "Selecione a OVT de origem";
    rows = [
      ["OVT", trap?.code || "—"],
      ["Bairro", trap ? titleCase(trap.neighborhood) : "—"],
      ["Ciclo", collection?.cycle || data.cycle || "—"],
      [
        active === "reading" ? "Leitura" : "Coleta",
        dateLabel(active === "reading" ? data.read_on : data.collected_on),
      ],
    ];
    if (active === "reading")
      rows.push([
        "Ovos",
        data.examination === "Não examinada"
          ? "Não examinada"
          : data.egg_count !== undefined && data.egg_count !== ""
            ? Number(data.egg_count).toLocaleString("pt-BR")
            : "—",
      ]);
  }
  $("#summary-type").textContent = {
    ovt: "Ovitrampa",
    edl: "Estação disseminadora",
    collection: "Coleta de campo",
    reading: "Leitura laboratorial",
  }[active];
  $("#summary-code").textContent = code;
  $("#summary-subtitle").textContent = subtitle;
  $("#summary-fields").innerHTML = rows
    .map(
      ([k, v]) => "<div><dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd></div>",
    )
    .join("");
}
async function submit(event, type) {
  event.preventDefault();
  const form = event.currentTarget;
  clearErrors(form);
  if (!form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form));
  for (const key of ["latitude", "longitude"])
    if (typeof data[key] === "string") data[key] = data[key].replace(",", ".");
  const validationState =
    readingEditId && type === "reading"
      ? {
          ...state,
          reading: state.reading.filter((row) => row.id !== readingEditId),
        }
      : state;
  const result = makeRecord(
    type,
    data,
    validationState,
    areas,
    crypto.randomUUID(),
    new Date().toISOString(),
  );
  if (result.errors) {
    showFormErrors(form, result.errors);
    return;
  }
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const path =
      readingEditId && type === "reading"
        ? "/api/readings/" + encodeURIComponent(readingEditId)
        : "/api/records/" + type;
    const response = await api(path, {
      method: readingEditId && type === "reading" ? "PUT" : "POST",
      body: data,
    });
    if (type === "collection") calendarTrapId = response.record.ovt_id;
    form.reset();
    await context.refresh();
    setResponsibles();
    notify(
      {
        ovt: "OVT cadastrada no banco.",
        edl: "Local de EDL cadastrado no banco.",
        collection: "Coleta enviada ao laboratório.",
        reading: "Leitura salva. Confira e valide para concluir a coleta.",
      }[type],
    );
  } catch (error) {
    if (error.errors) showFormErrors(form, error.errors);
    else {
      const box = $(".form-error", form);
      box.textContent = error.message;
      box.hidden = false;
      box.focus();
    }
  } finally {
    submit.disabled = false;
  }
}
function showFormErrors(form, errors) {
  for (const [name, message] of Object.entries(errors))
    if (form.elements[name]) {
      form.elements[name].setCustomValidity(message);
      form.elements[name].setAttribute("aria-invalid", "true");
    }
  const box = $(".form-error", form);
  box.textContent = Object.values(errors)[0];
  box.hidden = false;
  form.reportValidity();
}
function recordInfo(type, row) {
  const trap = trapFor(type, row);
  const collection =
    type === "reading"
      ? state.collection.find((c) => c.id === row.collection_id)
      : type === "collection"
        ? row
        : null;
  let status =
    type === "edl"
      ? row.status === "Ativa"
        ? "Em operação"
        : "Inativa"
      : row.status;
  if (type === "collection")
    status =
      state.reading.find((r) => r.collection_id === row.id)?.review_status ||
      "Aguardando leitura";
  if (type === "reading") status = row.review_status || "Pendente";
  return {
    trap,
    collection,
    code:
      type === "reading" || type === "collection"
        ? collection.sample_code
        : row.code,
    date: row.installed_on || row.collected_on || row.read_on,
    status,
    secondary:
      type === "reading" || type === "collection"
        ? trap.code + " · ciclo " + collection.cycle
        : row.responsible,
  };
}
function allRows() {
  return TYPES.flatMap((type) =>
    state[type]
      .filter((row) => row.source !== "historical")
      .map((row) => ({ type, row })),
  ).sort((a, b) => b.row.createdAt.localeCompare(a.row.createdAt));
}
function renderRecords() {
  const query = $("#search").value.trim().toLocaleLowerCase("pt-BR"),
    filter = $("#record-filter").value;
  const all = allRows(),
    rows = all.filter(({ type, row }) => {
      const info = recordInfo(type, row);
      return (
        (filter === "all" || type === filter) &&
        [
          info.code,
          info.trap?.code,
          info.trap?.neighborhood,
          row.responsible,
        ].some((v) => v?.toLocaleLowerCase("pt-BR").includes(query))
      );
    });
  $("#records-count").textContent = all.length;
  $("#records-body").innerHTML = rows
    .map(({ type, row }) => {
      const i = recordInfo(type, row),
        pending = i.status === "Aguardando leitura",
        muted = ["Inativa", "Não examinada"].includes(i.status);
      return (
        "<tr><td><strong>" +
        esc(i.code) +
        "</strong><small>" +
        esc(i.secondary) +
        "</small></td><td>" +
        names[type] +
        "</td><td>" +
        esc(titleCase(i.trap.neighborhood)) +
        "<small>DS " +
        esc(i.trap.district) +
        "</small></td><td>" +
        dateLabel(i.date) +
        '</td><td><span class="badge ' +
        (pending ? "pending" : muted ? "muted" : "") +
        '">' +
        esc(i.status) +
        '</span></td><td><button class="row-link" data-detail="' +
        esc(row.id) +
        '" data-kind="' +
        type +
        '" aria-label="Ver detalhes de ' +
        esc(i.code) +
        '">' +
        icon("arrow") +
        "</button>" +
        readingActions(type, row) +
        "</td></tr>"
      );
    })
    .join("");
  $("#empty").hidden = rows.length > 0;
  $("#empty h4").textContent = all.length
    ? "Nenhum registro encontrado"
    : "Nenhum registro por aqui ainda";
  $("#empty p").textContent = all.length
    ? "Tente outro código, bairro ou tipo de registro."
    : "Comece cadastrando uma OVT ou uma EDL. Seus registros aparecerão nesta lista.";
  $("#records-footer").textContent = all.length
    ? rows.length + " de " + all.length + " registros"
    : "Nenhum registro salvo";
}
function showDetails(type, id) {
  const row = state[type].find((r) => r.id === id);
  if (!row) return;
  const info = recordInfo(type, row);
  const details = [
    ["Código", info.code],
    ["Distrito", "DS " + info.trap.district],
    ["Bairro", titleCase(info.trap.neighborhood)],
    ["Responsável", row.responsible],
    ["Situação", info.status],
  ];
  if (["ovt", "edl"].includes(type))
    details.push(
      ["Instalação", dateLabel(row.installed_on)],
      ["Latitude", row.latitude],
      ["Longitude", row.longitude],
      ["Endereço / referência", row.address || "—"],
    );
  if (type === "edl")
    details.push(["Próxima manutenção", dateLabel(row.maintenance_on)]);
  if (info.collection)
    details.push(
      ["OVT de origem", info.trap.code],
      ["Ciclo", info.collection.cycle],
      ["Data da coleta", dateLabel(info.collection.collected_on)],
      ["Entrega ao laboratório", dateLabel(info.collection.delivered_on)],
    );
  if (type === "reading")
    details.push(
      ["Data da leitura", dateLabel(row.read_on)],
      ["Condição", row.examination],
      [
        "Quantidade de ovos",
        row.egg_count === null ? "Não examinada" : row.egg_count,
      ],
      ["Motivo", row.reason || "—"],
    );
  if (type === "reading")
    details.push(
      ["Condição", row.examination],
      ["Validação", row.review_status || "Pendente"],
      ["Retorno do laboratório", row.review_note || "—"],
    );
  details.push(
    [
      "Origem",
      row.source === "historical"
        ? "Cadastro histórico da main"
        : "Operação do servidor",
    ],
    ["Observações", row.notes || "—"],
  );
  $("#detail-title").textContent = info.code;
  $("#detail-type").textContent = names[type];
  $("#detail-fields").innerHTML = details
    .map(
      ([k, v]) => "<div><dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd></div>",
    )
    .join("");
  $("#detail-actions").innerHTML = readingActions(type, row);
  $("#details-dialog").showModal();
}
function exportRecords() {
  const all = allRows();
  if (!all.length) {
    notify("Cadastre um registro antes de exportar.");
    return;
  }
  const header = [
    "id",
    "tipo",
    "codigo",
    "ovt",
    "distrito",
    "bairro",
    "responsavel",
    "data_instalacao",
    "latitude",
    "longitude",
    "endereco",
    "proxima_manutencao",
    "ciclo",
    "data_coleta",
    "entrega_laboratorio",
    "data_leitura",
    "condicao_leitura",
    "quantidade_ovos",
    "motivo",
    "situacao",
    "observacoes",
    "criado_em",
  ];
  const lines = all.map(({ type, row }) => {
    const i = recordInfo(type, row);
    return [
      row.id,
      names[type],
      i.code,
      type === "edl" ? "" : i.trap.code,
      i.trap.district,
      i.trap.neighborhood,
      row.responsible,
      row.installed_on,
      i.trap.latitude,
      i.trap.longitude,
      i.trap.address,
      row.maintenance_on,
      i.collection?.cycle,
      i.collection?.collected_on,
      i.collection?.delivered_on,
      row.read_on,
      row.examination,
      row.egg_count,
      row.reason,
      i.status,
      row.notes,
      row.createdAt,
    ]
      .map(csvCell)
      .join(";");
  });
  const url = URL.createObjectURL(
    new Blob(
      ["\uFEFF" + [header.map(csvCell).join(";"), ...lines].join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "argos-registros-" + today() + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify("Exportação dos registros operacionais gerada.");
}

const monthLabel = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
let calendarTrapId = "";
let calendarMonth = "";
let calendarReferenceKey = "";

function renderCollectionCalendar() {
  if (active !== "collection" && active !== "calendar") return;

  const form = $("#form-collection");
  const enteredDate = form.elements.collected_on.value;
  const currentDate = today();
  const previewing = isDate(enteredDate) && enteredDate <= currentDate;
  const savedCollections = [...state.collection].sort((a, b) =>
    b.collected_on.localeCompare(a.collected_on),
  );
  calendarTrapId ||= savedCollections[0]?.ovt_id ?? "";
  calendarTrapId ||= state.ovt.find((row) => row.last_collected_on)?.id || "";
  const saved = savedCollections.find((row) => row.ovt_id === calendarTrapId);
  const historicalDate = state.ovt.find(
    (row) => row.id === calendarTrapId,
  )?.last_collected_on;
  const reference = previewing
    ? enteredDate
    : saved?.collected_on || historicalDate;
  const ovtSelect = $("#calendar-ovt");

  $("#calendar-ovt-field").hidden = state.ovt.length === 0;
  ovtSelect.disabled = previewing;
  ovtSelect.innerHTML =
    option("", "Selecione a OVT") +
    state.ovt.map((ovt) => option(ovt.id, ovt.code)).join("");
  ovtSelect.value = calendarTrapId;
  $("#calendar-next").hidden = !reference;
  $("#calendar-month").hidden = !reference;
  $("#collection-date-hint").hidden = !previewing;

  if (!reference) {
    $("#calendar-description").textContent =
      "Informe uma data em Coleta de campo para gerar as previsões.";
    calendarReferenceKey = "";
    return;
  }

  const next = nextCollectionDate(
    reference,
    previewing ? reference : currentDate,
  );
  $("#calendar-description").textContent =
    (previewing
      ? "Prévia a partir de "
      : saved
        ? "Última coleta registrada em "
        : "Última coleta histórica em ") +
    dateLabel(reference) +
    ".";
  $("#calendar-next-label").textContent = previewing
    ? "Primeira coleta prevista"
    : "Próxima coleta prevista";
  $("#calendar-next-date").textContent = dateLabel(next);
  $("#collection-next-hint").textContent = dateLabel(
    nextCollectionDate(reference),
  );

  const referenceKey = [calendarTrapId, reference, previewing].join("/");
  if (referenceKey !== calendarReferenceKey) {
    calendarMonth = next.slice(0, 7);
    calendarReferenceKey = referenceKey;
  }
  renderCalendarMonth(reference, currentDate);
}

function renderCalendarMonth(reference, currentDate) {
  const start = new Date(calendarMonth + "-01T00:00:00Z");
  const firstWeekday = start.getUTCDay();
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  const lastDay = end.getUTCDate();
  const weeks = [];

  for (let offset = 0; offset < firstWeekday + lastDay; offset += 7) {
    const cells = [];
    for (let weekday = 0; weekday < 7; weekday++) {
      const day = offset + weekday - firstWeekday + 1;
      if (day < 1 || day > lastDay) {
        cells.push("<td></td>");
        continue;
      }
      const date = calendarMonth + "-" + String(day).padStart(2, "0");
      const isReference = date === reference;
      const planned = isPlannedCollectionDate(reference, date);
      const statusClass = isReference
        ? " calendar-reference"
        : planned
          ? " calendar-planned"
          : "";
      const statusLabel = isReference
        ? ", data de referência"
        : planned
          ? ", coleta prevista"
          : "";
      const current = date === currentDate ? ' aria-current="date"' : "";
      cells.push(
        '<td><span class="calendar-day' +
          statusClass +
          '"' +
          current +
          '><span aria-hidden="true">' +
          day +
          '</span><span class="sr-only">' +
          dateLabel(date) +
          statusLabel +
          "</span></span></td>",
      );
    }
    weeks.push("<tr>" + cells.join("") + "</tr>");
  }

  $("#calendar-month-title").textContent = monthLabel.format(start);
  $("#calendar-days").innerHTML = weeks.join("");
  $("#calendar-prev").disabled = calendarMonth <= reference.slice(0, 7);
  $("#calendar-forward").disabled = calendarMonth === "9999-12";
}

function moveCalendarMonth(offset) {
  const date = new Date(calendarMonth + "-01T00:00:00Z");
  date.setUTCMonth(date.getUTCMonth() + offset);
  calendarMonth = date.toISOString().slice(0, 7);
  renderCollectionCalendar();
}

function initCollectionCalendar() {
  const form = $("#form-collection");
  function updateFromForm(event) {
    if (event.target.name === "ovt_id") calendarTrapId = event.target.value;
    if (
      event.target.name === "ovt_id" ||
      event.target.name === "collected_on"
    ) {
      renderCollectionCalendar();
    }
  }
  form.addEventListener("input", updateFromForm);
  form.addEventListener("change", updateFromForm);
  form.addEventListener("reset", () =>
    queueMicrotask(renderCollectionCalendar),
  );

  $("#calendar-ovt").addEventListener("change", (event) => {
    calendarTrapId = event.target.value;
    renderCollectionCalendar();
  });
  $("#calendar-prev").addEventListener("click", () => moveCalendarMonth(-1));
  $("#calendar-forward").addEventListener("click", () => moveCalendarMonth(1));
}

function setResponsibles() {
  for (const type of TYPES) {
    const input = $("#form-" + type)?.elements.responsible;
    if (input && !input.value) input.value = user.name;
    if (input && user.role === "campo") input.readOnly = true;
  }
}
function readingActions(type, row) {
  if (type !== "reading" || !["gestao", "laboratorio"].includes(user.role))
    return "";
  return (
    '<div class="inline-actions">' +
    (row.review_status !== "Validado"
      ? '<button type="button" class="button secondary" data-review="' +
        esc(row.id) +
        '" data-status="Validado">Validar</button>'
      : "") +
    '<button type="button" class="button secondary" data-review="' +
    esc(row.id) +
    '" data-status="Em revisão">Revisar</button>' +
    '<button type="button" class="button secondary" data-correct="' +
    esc(row.id) +
    '">Corrigir</button></div>'
  );
}
export async function handleOperationAction(target) {
  const detail = target.closest("[data-detail]");
  if (detail) {
    showDetails(detail.dataset.kind, detail.dataset.detail);
    return;
  }
  const review = target.closest("[data-review]");
  if (review) {
    $("#details-dialog").close();
    if (review.dataset.status === "Em revisão") {
      $("#review-form").dataset.reading = review.dataset.review;
      $("#review-form").reset();
      $("#review-dialog").showModal();
      return;
    }
    try {
      await api("/api/readings/" + review.dataset.review + "/review", {
        method: "POST",
        body: { status: "Validado" },
      });
      await context.refresh();
      notify("Leitura validada. A coleta foi concluída.");
    } catch (error) {
      notify(error.message);
    }
    return;
  }
  const correction = target.closest("[data-correct]");
  if (correction) {
    const row = state.reading.find(
      (item) => item.id === correction.dataset.correct,
    );
    if (!row) return;
    $("#details-dialog").close();
    context.navigate("reading");
    readingEditId = row.id;
    updateOptions();
    const form = $("#form-reading");
    for (const [name, value] of Object.entries(row))
      if (form.elements[name]) form.elements[name].value = value ?? "";
    updateConditional();
    updateSummary();
    form.scrollIntoView({ block: "start" });
  }
}
function renderCatalog() {
  const section = $("#catalog-section");
  section.hidden = !["ovt", "edl"].includes(active);
  if (section.hidden) return;
  const search = $("#catalog-filter").value.trim().toLocaleLowerCase("pt-BR");
  const rows = state[active].filter((row) =>
    (row.code + " " + row.neighborhood + " " + (row.name || ""))
      .toLocaleLowerCase("pt-BR")
      .includes(search),
  );
  const page = rows.slice(catalogPage * 30, catalogPage * 30 + 30);
  $("#catalog-title").textContent =
    (active === "ovt"
      ? "Catálogo de ovitrampas"
      : "Catálogo de locais de EDL") +
    " · " +
    rows.length;
  $("#catalog-list").innerHTML =
    "<table><thead><tr><th>Código</th><th>Território</th><th>Origem</th><th>Detalhes</th></tr></thead><tbody>" +
    page
      .map(
        (row) =>
          "<tr><td>" +
          esc(row.code) +
          "</td><td>DS " +
          esc(row.district) +
          " · " +
          esc(row.neighborhood) +
          "</td><td>" +
          (row.source === "historical"
            ? "Histórico da main"
            : "Operação atual") +
          '</td><td><button class="button secondary" type="button" data-detail="' +
          esc(row.id) +
          '" data-kind="' +
          active +
          '">Ver</button></td></tr>',
      )
      .join("") +
    "</tbody></table>";
  $("#catalog-page").textContent =
    "Página " +
    (catalogPage + 1) +
    " de " +
    Math.max(1, Math.ceil(rows.length / 30));
  $("#catalog-prev").disabled = catalogPage === 0;
  $("#catalog-next").disabled = (catalogPage + 1) * 30 >= rows.length;
}
export function getOperationState() {
  return state;
}
export function updateOperationData(data) {
  state = data.state;
  areas = data.areas;
  updateOptions();
  renderRecords();
  renderCatalog();
  renderCollectionCalendar();
}
export function initializeOperations(options) {
  context = options;
  user = options.user;
  state = options.data.state;
  areas = options.data.areas;
  renderForms();
  hydrate();
  initCollectionCalendar();
  updateOptions();
  updateConditional();
  updateSummary();
  renderRecords();
  setResponsibles();
  renderCatalog();
  $("#ovt-lookup").addEventListener("input", updateOptions);
  $("#search").addEventListener("input", renderRecords);
  $("#record-filter").addEventListener("change", renderRecords);
  $("#export").addEventListener("click", exportRecords);
  $("#close-dialog").onclick = $("#dialog-done").onclick = () =>
    $("#details-dialog").close();
  $("#catalog-filter").oninput = () => {
    catalogPage = 0;
    renderCatalog();
  };
  $("#catalog-prev").onclick = () => {
    catalogPage--;
    renderCatalog();
  };
  $("#catalog-next").onclick = () => {
    catalogPage++;
    renderCatalog();
  };
  $("#review-cancel").onclick = () => $("#review-dialog").close();
  $("#review-form").onsubmit = async (event) => {
    event.preventDefault();
    try {
      await api(
        "/api/readings/" + event.currentTarget.dataset.reading + "/review",
        {
          method: "POST",
          body: {
            status: "Em revisão",
            note: event.currentTarget.elements.note.value,
          },
        },
      );
      $("#review-dialog").close();
      await context.refresh();
      notify("Solicitação de revisão enviada ao agente.");
    } catch (error) {
      $("#review-error").textContent = error.message;
    }
  };
}
