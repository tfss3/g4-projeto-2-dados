const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const iconPaths = {
  dashboard:
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/>',
  chart: '<path d="M4 3v18h17M8 16v-5m5 5V7m5 9V4"/>',
  analysis:
    '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M6 12l3-4 3 2 2-4"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  settings:
    '<circle cx="12" cy="12" r="4"/><path d="m10 2-1 3-3 1-3-1-2 4 2 2v3l-2 2 2 4 3-1 3 1 1 3h4l1-3 3-1 3 1 2-4-2-2v-3l2-2-2-4-3 1-3-1-1-3Z"/>',
  pin: '<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  ovitrap:
    '<path d="M4 9h16M6 9l1.4 10.4A2 2 0 0 0 9.4 21h5.2a2 2 0 0 0 2-1.6L18 9M11 9V4a1 1 0 0 1 2 0v5M9 15c1.1-1 2-1 3 0s2 1 3 0"/>',
  station:
    '<path d="M9 4h6M10 4v4l-4 4v7a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-7l-4-4V4M6 13h12M9 16h6M9 18.5h6M4 7h.01M20 7h.01M6 3h.01M18 3h.01"/>',
  field:
    '<rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m8 13 2 2 5-5M8 18h6"/>',
  microscope:
    '<path d="m10 3 5 2-2 5-5-2 2-5Zm0 6-1 2m7-3a6 6 0 0 1 2 8c-1.2 2-3.3 3-6 3H5m1 2h14M6 15h7m-6 0v4M11 2l3 1"/>',
  layers: '<path d="m12 3 10 6-10 6L2 9l10-6ZM3 14l9 5 9-5M5 19l7 4 7-4"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  clipboard:
    '<rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>',
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3Zm-2 2 5 5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  device:
    '<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M12 16v5M8 21h8"/>',
  search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
  save: '<path d="M4 3h13l4 4v14H3V3h1ZM7 3v6h9V3M7 21v-8h10v8"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m-11 5 2 2 4-4"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
};
export const icon = (name) =>
  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' +
  (iconPaths[name] || iconPaths.info) +
  "</svg>";
export function hydrate(root = document) {
  $$("[data-icon]", root).forEach(
    (el) => (el.innerHTML = icon(el.dataset.icon)),
  );
}
