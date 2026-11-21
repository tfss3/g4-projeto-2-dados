import { today } from "../model.mjs";
import { escapeHtml as esc } from "./api.mjs";
import { icon } from "./icons.mjs";
export const config = {
  ovt: {
    title: "Cadastrar ovitrampa",
    subtitle: "Identifique a OVT e o seu ponto de instalação.",
    icon: "ovitrap",
    button: "Cadastrar OVT",
  },
  edl: {
    title: "Cadastrar estação disseminadora",
    subtitle: "Registre a EDL e o início da sua operação em campo.",
    icon: "station",
    button: "Cadastrar EDL",
  },
  collection: {
    title: "Registrar coleta de campo",
    subtitle: "Identifique a amostra retirada e a OVT de origem.",
    icon: "field",
    button: "Registrar coleta",
  },
  reading: {
    title: "Registrar contagem de ovos",
    subtitle: "Selecione uma coleta e registre a leitura do laboratório.",
    icon: "microscope",
    button: "Salvar leitura",
  },
};
function field(name, label, control, hint = "", full = false) {
  return (
    '<label class="field' +
    (full ? " full" : "") +
    '"><span>' +
    label +
    "</span>" +
    control +
    (hint ? '<small class="hint">' + hint + "</small>" : "") +
    "</label>"
  );
}
function input(name, placeholder = "", extra = "") {
  return (
    '<input name="' +
    name +
    '" placeholder="' +
    placeholder +
    '" ' +
    extra +
    ">"
  );
}
function dateInput(name, required = true, future = false) {
  return input(
    name,
    "",
    'type="date" ' +
      (required ? "required " : "") +
      (future ? "" : 'max="' + today() + '"'),
  );
}
function select(name, content, extra = "") {
  return '<select name="' + name + '" ' + extra + ">" + content + "</select>";
}
export const option = (value, label = value) =>
  '<option value="' + esc(value) + '">' + esc(label) + "</option>";
const required = " <b>*</b>";
const section = (name, ico) =>
  '<h3 class="section-title">' + icon(ico) + " " + name + "</h3>";
function territoryFields(areas) {
  return (
    field(
      "district",
      "Distrito sanitário" + required,
      select(
        "district",
        option("", "Selecione o distrito") +
          [...new Set(areas.map((a) => a.district))]
            .map((d) => option(d, "DS " + d))
            .join(""),
        "required",
      ),
    ) +
    field(
      "neighborhood",
      "Bairro" + required,
      select(
        "neighborhood",
        option("", "Selecione o distrito"),
        "required disabled",
      ),
    ) +
    field(
      "address",
      "Endereço ou ponto de referência",
      input("address", "Ex.: próximo à unidade de saúde", 'maxlength="200"'),
      "",
      true,
    ) +
    field(
      "latitude",
      "Latitude" + required,
      input(
        "latitude",
        "Ex.: -8,0476",
        'type="text" inputmode="decimal" required maxlength="18"',
      ),
      "Coordenada decimal no território do Recife.",
    ) +
    field(
      "longitude",
      "Longitude" + required,
      input(
        "longitude",
        "Ex.: -34,8770",
        'type="text" inputmode="decimal" required maxlength="18"',
      ),
    )
  );
}
function trapForm(type, areas) {
  return (
    section("Identificação e instalação", config[type].icon) +
    '<div class="form-grid">' +
    field(
      "code",
      "Código da " + type.toUpperCase() + required,
      input(
        "code",
        type === "ovt" ? "Ex.: SAM1001 ou OVT-00123" : "Ex.: EDL-00456",
        'required maxlength="40" autocomplete="off" spellcheck="false"',
      ),
      "Identificador único da armadilha.",
    ) +
    field(
      "installed_on",
      "Data de instalação" + required,
      dateInput("installed_on"),
    ) +
    field(
      "responsible",
      "Responsável pela instalação" + required,
      input(
        "responsible",
        "Nome do responsável",
        'required maxlength="100" autocomplete="name"',
      ),
    ) +
    field(
      "status",
      "Situação" + required,
      select(
        "status",
        option("Ativa", type === "edl" ? "Em operação" : "Ativa") +
          option("Inativa"),
        "required",
      ),
    ) +
    "</div>" +
    section("Localização no território", "pin") +
    '<div class="form-grid">' +
    territoryFields(areas) +
    "</div>" +
    section(
      type === "edl" ? "Acompanhamento da estação" : "Informações adicionais",
      "clipboard",
    ) +
    '<div class="form-grid">' +
    (type === "edl"
      ? field(
          "quantity",
          "Estações neste local" + required,
          input(
            "quantity",
            "",
            'type="number" min="1" max="10000" step="1" value="1" required',
          ),
        ) +
        field(
          "maintenance_on",
          "Próxima manutenção",
          dateInput("maintenance_on", false, true),
          "Opcional. Informe a data planejada pela equipe.",
          true,
        )
      : "") +
    field(
      "notes",
      "Observações",
      '<textarea name="notes" maxlength="500" placeholder="Condições do ponto, acesso ou informações para a equipe…"></textarea>',
      "Até 500 caracteres.",
      true,
    ) +
    "</div>"
  );
}
function collectionForm() {
  return (
    '<div class="inline-info">' +
    icon("info") +
    "<p>Este é o registro da coleta. A contagem de ovos é feita posteriormente pelo laboratório.</p></div>" +
    '<div id="collection-prerequisite" class="inline-info" hidden>' +
    icon("pin") +
    '<p>Cadastre uma OVT ativa para registrar a primeira coleta. <button type="button" data-view="ovt">Cadastrar OVT</button></p></div>' +
    section("Origem da amostra", "pin") +
    '<div class="form-grid">' +
    field(
      "lookup",
      "Buscar no cadastro",
      '<input id="ovt-lookup" type="search" placeholder="Código, bairro ou distrito">',
      "",
      true,
    ) +
    field(
      "ovt_id",
      "OVT de origem" + required,
      select("ovt_id", option("", "Selecione a OVT"), "required"),
      "",
      true,
    ) +
    field(
      "sample_code",
      "Código da amostra / palheta" + required,
      input(
        "sample_code",
        "Ex.: AM-00123-C01",
        'required maxlength="60" autocomplete="off" spellcheck="false"',
      ),
      "Identificador único para rastrear a amostra.",
    ) +
    field(
      "cycle",
      "Ciclo de coleta" + required,
      input(
        "cycle",
        "Ex.: 1",
        'type="number" min="1" step="1" inputmode="numeric" required',
      ),
      "O ciclo é informado conforme o planejamento da equipe.",
    ) +
    "</div>" +
    section("Dados da coleta", "calendar") +
    '<div class="form-grid">' +
    field(
      "collected_on",
      "Data da coleta" + required,
      dateInput("collected_on"),
    ) +
    field(
      "delivered_on",
      "Entrega ao laboratório",
      dateInput("delivered_on", false),
      "Preencha somente quando a entrega já ocorreu.",
    ) +
    '<p class="collection-date-hint" id="collection-date-hint" aria-live="polite" hidden>Primeira coleta prevista em <strong id="collection-next-hint"></strong>. <button type="button" data-view="calendar">Ver calendário</button></p>' +
    field(
      "responsible",
      "Agente responsável" + required,
      input(
        "responsible",
        "Nome do agente",
        'required maxlength="100" autocomplete="name"',
      ),
      "",
      true,
    ) +
    field(
      "notes",
      "Observações de campo",
      '<textarea name="notes" maxlength="500" placeholder="Condição da armadilha ou da amostra, dificuldade de acesso…"></textarea>',
      "Até 500 caracteres.",
      true,
    ) +
    "</div>"
  );
}
function readingForm() {
  return (
    '<div id="reading-prerequisite" class="inline-info" hidden>' +
    icon("field") +
    '<p>Não há coletas aguardando leitura. <button type="button" data-view="collection">Registrar coleta de campo</button></p></div>' +
    section("Identificação da coleta", "field") +
    '<div class="form-grid">' +
    field(
      "collection_id",
      "Amostra / OVT" + required,
      select(
        "collection_id",
        option("", "Selecione uma coleta pendente"),
        "required",
      ),
      "",
      true,
    ) +
    field("read_on", "Data da leitura" + required, dateInput("read_on")) +
    field(
      "responsible",
      "Responsável pela leitura" + required,
      input(
        "responsible",
        "Nome do profissional",
        'required maxlength="100" autocomplete="name"',
      ),
    ) +
    "</div>" +
    section("Resultado laboratorial", "microscope") +
    '<div class="form-grid">' +
    field(
      "examination",
      "Condição da leitura" + required,
      select(
        "examination",
        option("Examinada") + option("Não examinada"),
        "required",
      ),
    ) +
    field(
      "egg_count",
      "Quantidade de ovos" + required,
      '<div class="input-prefix">' +
        input(
          "egg_count",
          "Informe a contagem",
          'type="number" min="0" step="1" max="9007199254740991" inputmode="numeric" required',
        ) +
        "<span>ovos</span></div>",
      "Aceita zero. Apenas números inteiros.",
    ) +
    '<div class="field full" id="reason-field" hidden>' +
    field(
      "reason",
      "Motivo da não realização" + required,
      select(
        "reason",
        option("", "Selecione o motivo") +
          ["Amostra danificada", "Amostra não recebida", "Outro"]
            .map((x) => option(x))
            .join(""),
        "disabled",
      ),
    ) +
    "</div>" +
    field(
      "notes",
      "Observações do laboratório",
      '<textarea name="notes" maxlength="500" placeholder="Condição da amostra ou informação complementar da leitura…"></textarea>',
      "Até 500 caracteres.",
      true,
    ) +
    "</div>" +
    '<div class="inline-info warning" id="high-count" hidden>' +
    icon("info") +
    "<p>Contagem acima de 300 ovos. Confira o valor antes de salvar. Uma contagem alta pode ser válida.</p></div>"
  );
}

export function formMarkup(type, areas) {
  if (type === "ovt" || type === "edl") return trapForm(type, areas);
  if (type === "collection") return collectionForm();
  return readingForm();
}
