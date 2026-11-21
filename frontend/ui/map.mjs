import { api, escapeHtml as esc, number, displayDate } from "./api.mjs";

let currentMap;
export function destroyMap() {
  currentMap?.remove();
  currentMap = null;
}
export async function drawMap(container, filters, onSelectStation) {
  destroyMap();
  if (!window.L)
    throw new Error("O componente de mapa não carregou. Atualize a página.");
  const mapElement = document.getElementById(container);
  const boundaryData = await api("/assets/recife.geojson");
  const { features } = await api("/api/map?" + new URLSearchParams(filters));
  if (!mapElement?.isConnected) return;
  const map = window.L.map(mapElement, { preferCanvas: true }).setView(
    [-8.055, -34.92],
    12,
  );
  currentMap = map;
  const boundary = window.L.geoJSON(boundaryData, {
    style: {
      color: "#568a9b",
      weight: 2,
      fillColor: "#e2f0ea",
      fillOpacity: 0.9,
    },
    interactive: false,
  }).addTo(map);
  map.attributionControl.addAttribution(
    'Contorno municipal <a href="https://servicodados.ibge.gov.br/api/v3/malhas/municipios/2611606?formato=application/vnd.geo+json&qualidade=minima" target="_blank" rel="noopener">IBGE</a>',
  );
  const tiles = window.L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    },
  );
  let tileErrors = 0;
  tiles.on("tileerror", () => {
    if (tileErrors > 2) {
      map.removeLayer(tiles);
      boundary.addTo(map);
    }
    if (++tileErrors > 2)
      document.getElementById("map-status").textContent =
        "Os pontos estão disponíveis. O mapa de fundo precisa de acesso à internet.";
  });

  const stations = window.L.layerGroup();
  const ovts = window.L.layerGroup();
  const influence = window.L.layerGroup().addTo(map);
  for (const item of features) {
    const station = item.kind === "edl";
    const marker = window.L.circleMarker([item.latitude, item.longitude], {
      radius: station ? 6 : 3.5,
      weight: station ? 2 : 1,
      color: station ? "#f6b85c" : "#0c756f",
      fillColor: station ? "#f6b85c" : "#22c7b5",
      fillOpacity: station ? 0.9 : 0.7,
    });
    const popup = document.createElement("div");
    popup.className = "map-popup";
    popup.innerHTML =
      "<strong>" +
      esc(item.code) +
      "</strong><p>" +
      esc(item.name) +
      "</p><p>DS " +
      esc(item.district) +
      " · " +
      esc(item.neighborhood) +
      "</p><p>" +
      (station
        ? number(item.quantity) + " estações neste local"
        : "IDV histórico " +
          number(item.summary.idv, 2) +
          " · IDV da operação " +
          number(item.operationalSummary.idv, 2)) +
      "</p><p>Coordenada " +
      (item.coordinate_source === "endereco"
        ? "estimada por endereço"
        : esc(item.coordinate_source)) +
      "</p><p>Instalação " +
      displayDate(item.installed_on) +
      "</p>";
    if (station) {
      const button = document.createElement("button");
      button.textContent = "Analisar esta EDL";
      button.type = "button";
      button.onclick = () => onSelectStation(item.id);
      popup.append(button);
    }
    marker.bindPopup(popup);
    marker.on("click", () => {
      if (!station) return;
      influence.clearLayers();
      for (const [radius, color] of [
        [400, "#e8aa48"],
        [300, "#208d83"],
      ]) {
        window.L.circle([item.latitude, item.longitude], {
          radius,
          color,
          weight: 2,
          fillOpacity: 0.06,
        }).addTo(influence);
      }
    });
    marker.addTo(station ? stations : ovts);
  }
  stations.addTo(map);
  ovts.addTo(map);
  window.L.control
    .layers(
      { "Recife · contorno IBGE": boundary, "Ruas · OpenStreetMap": tiles },
      {
        "Locais de EDL": stations,
        Ovitrampas: ovts,
        "Raios de 300 e 400 m": influence,
      },
    )
    .addTo(map);
  document.getElementById("map-status").textContent =
    number(features.filter((row) => row.kind === "ovt").length) +
    " OVTs e " +
    number(features.filter((row) => row.kind === "edl").length) +
    " locais de EDL com posição neste recorte.";
  const points = features.map((row) => [row.latitude, row.longitude]);
  if (points.length)
    map.fitBounds(window.L.latLngBounds(points), {
      padding: [20, 20],
      maxZoom: 15,
    });
  setTimeout(() => map.invalidateSize(), 0);
}
